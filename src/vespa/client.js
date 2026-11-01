/**
 * A thin client for the Vespa application in /vespa.
 *
 * Everything that makes the search work - tokenising, embedding, the HNSW
 * lookup, BM25, fusion, ColBERT reranking, grouping - happens inside Vespa.
 * This file builds a YQL string, posts it, and reshapes the answer. That is the
 * whole point of the exercise: the in-browser version of this project ships a
 * 1.3 MB index and a 30 MB embedding model to the tab, and this one ships a
 * query.
 *
 * There is deliberately no fallback to a recorded response. If the cluster is
 * not running, the page says so. A search page that quietly serves canned
 * answers when the engine is down is lying about what it is.
 */

/**
 * Where the cluster is.
 *
 * Baked in at build time from the environment when there is one, so a deploy
 * can point at a real cluster without a code change, and overridable at runtime
 * from the page's settings panel so a visitor can point it at their own.
 *
 * Under `npm start` the default is the empty string, meaning "same origin".
 * That is not a missing value: the dev server proxies /search/ through to
 * localhost:8080 (the "proxy" field in package.json), so the request never
 * crosses an origin and the browser never sends a CORS preflight. Naming
 * localhost:8080 directly here would reintroduce exactly the cross-origin call
 * the proxy exists to avoid, since :3000 and :8080 are different origins.
 *
 * A production build has no dev server to proxy through, so it names the
 * cluster and does need CORS configured on it.
 */
export const DEFAULT_ENDPOINT = process.env.REACT_APP_VESPA_ENDPOINT
  || (process.env.NODE_ENV === 'development' ? '' : 'http://localhost:8080');

export const ENDPOINT_STORAGE = 'vespa-endpoint';
export const TOKEN_STORAGE = 'vespa-token';

/** How many passages the nearest-neighbour operator is asked for per query. */
const TARGET_HITS = 100;

/**
 * The four rank profiles in passage.sd, described for the UI.
 *
 * `needsVector` and `needsColbert` decide which embedders get invoked, which is
 * most of the latency difference between these, so they are not cosmetic.
 */
export const PROFILES = {
  keyword: {
    id: 'keyword',
    label: 'Keyword',
    blurb: 'BM25 only. The baseline, and very hard to beat on rare exact strings.',
    needsVector: false,
    needsColbert: false,
  },
  semantic: {
    id: 'semantic',
    label: 'Vector',
    blurb: 'Approximate nearest neighbour over e5 embeddings. Finds paraphrase, misses rare strings.',
    needsVector: true,
    needsColbert: false,
  },
  hybrid: {
    id: 'hybrid',
    label: 'Hybrid',
    blurb: 'Both retrievers, merged by reciprocal rank fusion in the global phase.',
    needsVector: true,
    needsColbert: false,
  },
  colbert: {
    id: 'colbert',
    label: 'Hybrid + ColBERT',
    blurb: 'Hybrid retrieval, then token-level late interaction reranks the top 200 per node.',
    needsVector: true,
    needsColbert: true,
  },
};

export const PROFILE_ORDER = ['keyword', 'semantic', 'hybrid', 'colbert'];

/**
 * The two content clusters, which hold the same passages in Vespa's two
 * storage modes.
 *
 * `indexed` searches the whole corpus and has everything built in advance: the
 * HNSW graph, the BM25 posting lists, the attributes. `streaming` searches one
 * group - here one article - and has nothing built at all; the group is read
 * and matched document by document, and its nearest-neighbour search is exact
 * rather than approximate.
 *
 * `type` is the document type, which is how a query picks between them: a
 * document type lives in exactly one content cluster, so naming the type in
 * the YQL `from` clause routes the query. There is no cluster parameter.
 */
export const MODES = {
  indexed: {
    id: 'indexed',
    type: 'passage',
    label: 'Indexed',
    scope: 'the whole corpus',
    profiles: PROFILE_ORDER,
  },
  streaming: {
    id: 'streaming',
    type: 'article_passage',
    label: 'Streaming',
    scope: 'one article at a time',
    // No ColBERT: that schema deliberately stores no per-token vectors, so
    // offering the profile would be offering something that cannot run.
    profiles: ['keyword', 'semantic', 'hybrid'],
  },
};

export const MODE_ORDER = ['indexed', 'streaming'];

/** Fields the page actually renders. Asking for fewer keeps the response small. */
const SUMMARY_FIELDS = [
  'doc_id', 'title', 'url', 'section', 'anchor',
  'part', 'section_part', 'section_parts',
  'cluster', 'cluster_name', 'text',
].join(', ');

/**
 * YQL is a query language, so anything interpolated into it has to be escaped.
 *
 * The user's question never gets interpolated - it rides in the `query`
 * parameter and `userQuery()` refers to it - so the only strings that reach
 * here are article slugs and cluster labels that this project generated itself.
 * Escaping them anyway costs nothing and means a future corpus with an
 * apostrophe in a label does not produce a baffling parse error.
 */
function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The retrieval clause: which documents are even considered.
 *
 * This is the half of the query that decides cost. nearestNeighbor walks the
 * HNSW graph and returns roughly TARGET_HITS candidates per node; userQuery()
 * walks the BM25 posting lists. `or` between them is not a logical nicety - it
 * is how Vespa is told to run both retrievers and union the candidates, so that
 * the rank profile has both populations to score.
 */
function retrievalClause(profile, mode) {
  // In streaming mode the candidate pool is one article, a few dozen passages,
  // and the search is exact however many targetHits are asked for. Asking for
  // 100 out of 40 is not wrong, just noise; asking for a group-sized number
  // says what is actually happening.
  const targetHits = mode === 'streaming' ? 40 : TARGET_HITS;
  const vector = `({targetHits:${targetHits}}nearestNeighbor(embedding, q))`;
  if (profile === 'keyword') return 'userQuery()';
  if (profile === 'semantic') return vector;
  return `${vector} or userQuery()`;
}

/**
 * Filters, as a list of YQL fragments.
 *
 * Both of these are attribute lookups against fields declared `fast-search` and
 * `rank: filter` in the schema, which means they are resolved by a B-tree
 * lookup before ranking rather than by scoring and discarding. The ranker never
 * sees an excluded passage. That is the difference between filtering in the
 * engine and filtering the results afterwards, and it is why narrowing the
 * scope here makes the search faster rather than slower.
 */
function filterClauses({ docFilter, cluster }) {
  const clauses = [];
  if (docFilter && docFilter.length) {
    clauses.push(`doc_id in (${docFilter.map(quote).join(', ')})`);
  }
  if (cluster) {
    clauses.push(`cluster_name contains ${quote(cluster)}`);
  }
  return clauses;
}

/**
 * Walks the response tree collecting real hits, in order.
 *
 * Vespa's result tree is not flat, and its exact shape depends on whether
 * grouping was asked for and how many content clusters answered. Rather than
 * assume a shape, recurse and treat any node carrying a doc_id as a hit. This
 * survives the tree gaining a level, which it does the moment a second content
 * cluster is added.
 */
function collectHits(node, out = []) {
  if (!node) return out;
  if (node.fields && typeof node.fields.doc_id === 'string') {
    out.push(node);
    return out;
  }
  for (const child of node.children || []) collectHits(child, out);
  return out;
}

/** One bucket of a grouping result, plus any grouping nested inside it. */
function readBucket(node) {
  const nested = {};
  for (const child of node.children || []) {
    if (!String(child.id || '').startsWith('grouplist:')) continue;
    const label = child.label || String(child.id).slice('grouplist:'.length);
    nested[label] = (child.children || []).map(readBucket);
  }
  return {
    value: node.value,
    count: node.fields?.['count()'] ?? 0,
    nested,
  };
}

/** Finds every grouplist in the tree and returns it keyed by the grouped field. */
function collectGroups(node, out = {}) {
  if (!node) return out;
  const id = String(node.id || '');
  if (id.startsWith('grouplist:')) {
    const label = node.label || id.slice('grouplist:'.length);
    // readBucket descends on its own, so stop here rather than also walking
    // these children and recording the nested lists a second time at top level.
    if (!out[label]) out[label] = (node.children || []).map(readBucket);
    return out;
  }
  for (const child of node.children || []) collectGroups(child, out);
  return out;
}

/**
 * Reshapes one Vespa hit into the shape the page renders.
 *
 * Vespa field names are snake_case because that is the convention in a schema;
 * the React side is camelCase. The translation happens once, here, so that
 * neither side has to hold its nose.
 */
function normaliseHit(hit, position) {
  const f = hit.fields || {};
  return {
    id: hit.id || `${f.doc_id}-${f.part}`,
    rank: position + 1,
    relevance: hit.relevance,
    text: f.text || '',
    docId: f.doc_id,
    document: { id: f.doc_id, title: f.title, url: f.url },
    section: f.section || '',
    anchor: f.anchor || '',
    part: f.part,
    sectionPart: f.section_part,
    sectionParts: f.section_parts,
    cluster: f.cluster,
    clusterName: f.cluster_name || '',
    // match-features are the rank profile showing its working: the individual
    // terms that went into the score, as computed for this document.
    features: f.matchfeatures || {},
  };
}

async function post(endpoint, token, body, signal) {
  const base = String(endpoint).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  // Vespa Cloud token endpoints want a bearer token. A self-hosted cluster on
  // localhost wants nothing, and sending an empty Authorization header to one
  // is a good way to get a confusing 401.
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${base}/search/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // fetch rejects with the same opaque TypeError for a refused connection, a
    // DNS failure and a blocked CORS preflight, because telling them apart
    // would leak information about the network to the page. So the message has
    // to cover all three rather than guess.
    throw new Error(
      base
        ? `Could not reach ${base}. The cluster may not be running, or it may be `
          + 'running without the CORS configuration that lets a browser on another '
          + 'origin call it.'
        : 'Could not reach the cluster through the dev-server proxy. It is probably '
          + 'not running yet: start it with ./vespa/scripts/run_local.sh',
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Vespa returned ${response.status}. ${summariseError(detail)}`.trim());
  }

  return response.json();
}

/** Vespa errors arrive as a JSON envelope; pull the human part out of it. */
function summariseError(body) {
  try {
    const parsed = JSON.parse(body);
    const errors = parsed?.root?.errors;
    if (Array.isArray(errors) && errors.length) {
      return errors.map((e) => e.message || e.summary).filter(Boolean).join(' ');
    }
  } catch (err) { /* not JSON; fall through to the raw text */ }
  return body.slice(0, 300);
}

/**
 * Asks the cluster how many passages it holds.
 *
 * Doubles as the connection check. `where true` matches everything and
 * `limit 0` asks for none of it, so the only thing that comes back is
 * totalCount - which is both the statistic the page wants to display and proof
 * that the endpoint is up, reachable and has been fed.
 *
 * The obvious alternative, /state/v1/health, is not usable from the browser:
 * the CORS filters in services.xml are bound to /search/ only, deliberately, so
 * a health probe from another origin would be blocked by the browser and look
 * exactly like the cluster being down.
 */
export async function describeCorpus(endpoint, token, signal) {
  const response = await post(endpoint, token, {
    yql: 'select doc_id from passage where true limit 0',
    ranking: { profile: 'keyword' },
    hits: 0,
    timeout: '5s',
  }, signal);

  return { passages: response?.root?.fields?.totalCount ?? 0 };
}

/**
 * How many passages the streaming cluster holds for one article.
 *
 * There is no equivalent of describeCorpus for a streaming cluster, and that
 * is the mode working rather than an omission: counting the whole of it would
 * mean streaming every group, which is the one thing this storage mode is
 * built never to do. So the question has to be asked one group at a time, and
 * the answer is also the useful one - this is the number of documents a query
 * against this article will read.
 *
 * A group that was never fed answers 0 rather than failing, which is correct
 * (an empty mailbox is empty, not broken) and is why the page treats 0 as
 * "the streaming cluster has not been fed" only in combination with the
 * indexed cluster being up.
 */
export async function describeGroup(endpoint, token, group, signal) {
  const response = await post(endpoint, token, {
    yql: 'select doc_id from article_passage where true limit 0',
    'streaming.groupname': group,
    ranking: { profile: 'keyword' },
    hits: 0,
    timeout: '5s',
  }, signal);

  return { passages: response?.root?.fields?.totalCount ?? 0 };
}

/**
 * Runs one search.
 *
 * Grouping rides along on the same request rather than going out as a second
 * one. Vespa walks the matched set once and produces both the ranked hits and
 * the full cluster breakdown from that single pass, so the facet counts are
 * free and - more importantly - they describe exactly the set that produced the
 * hits beside them. Two requests could not promise that.
 */
export async function search({
  endpoint = DEFAULT_ENDPOINT,
  token = '',
  query,
  profile = 'hybrid',
  mode = 'indexed',
  group = '',
  hits = 6,
  docFilter = null,
  cluster = '',
  grouping = true,
  signal,
}) {
  const modeSpec = MODES[mode] || MODES.indexed;
  const spec = modeSpec.profiles.includes(profile)
    ? PROFILES[profile]
    : PROFILES[modeSpec.profiles[modeSpec.profiles.length - 1]];

  if (modeSpec.id === 'streaming' && !group) {
    // Not a network error, so it should not be reported as one. A streaming
    // query without a group has nothing to stream.
    throw new Error('Streaming mode searches one article at a time; pick one first.');
  }

  // In streaming mode the group has already narrowed the search to one
  // article, so an article allow-list on top of it is redundant at best and
  // contradictory at worst. The group is the filter.
  const clauses = filterClauses({
    docFilter: modeSpec.id === 'streaming' ? null : docFilter,
    cluster,
  });
  const retrieval = retrievalClause(spec.id, modeSpec.id);
  const where = clauses.length
    ? [`(${retrieval})`, ...clauses].join(' and ')
    : retrieval;

  // Grouped by cluster first, then by article inside each cluster. max(5)
  // keeps the nesting readable; without it a single cluster can contribute
  // sixty article buckets and the facet panel becomes a wall.
  //
  // This works identically in both modes, which is worth saying out loud:
  // grouping is a pass over whatever matched, and streaming mode has a matched
  // set like any other. It is just a much smaller one.
  const groupBy = grouping
    ? ' | all(group(cluster_name) order(-count()) each(output(count())'
      + ' all(group(title_facet) max(5) order(-count()) each(output(count())))))'
    : '';

  const body = {
    yql: `select ${SUMMARY_FIELDS} from ${modeSpec.type} where ${where}${groupBy}`,
    query,
    hits,
    ranking: { profile: spec.id },
    // weakAnd rather than the strict all-terms default: a typed question has
    // words in it that no passage contains ("does", "actually", "really"), and
    // requiring every one of them turns a good question into zero results.
    model: { type: 'weakAnd' },
    presentation: { timing: true },
  };

  // The whole of streaming mode's addressing, in one parameter. It names the
  // group to read, and Vespa reads that group and nothing else - not as an
  // optimisation applied to a corpus-wide search, but because in this mode
  // there is no corpus-wide anything to search.
  if (modeSpec.id === 'streaming') {
    body['streaming.groupname'] = group;
  }

  // `embed(e5, @query)` is evaluated by Vespa, not here. The @query refers to
  // the `query` field above, so the question is embedded server-side with the
  // same model and the same "query:" prefix that produced the stored vectors.
  const input = {};
  if (spec.needsVector) input['query(q)'] = 'embed(e5, @query)';
  if (spec.needsColbert) input['query(qt)'] = 'embed(colbert, @query)';
  if (Object.keys(input).length) body.input = input;

  const started = performance.now();
  const response = await post(endpoint, token, body, signal);
  const wall = (performance.now() - started) / 1000;

  const root = response?.root;
  if (root?.errors?.length) {
    throw new Error(summariseError(JSON.stringify(response)));
  }

  const groups = grouping ? collectGroups(root) : {};

  return {
    profile: spec.id,
    mode: modeSpec.id,
    group,
    hits: collectHits(root).map(normaliseHit),
    // totalCount is how many passages matched, not how many came back. With
    // weakAnd it is an estimate rather than an exact count, which is the price
    // of weakAnd not scoring everything it could have matched.
    matched: root?.fields?.totalCount ?? 0,
    clusters: groups.cluster_name || [],
    // searchtime is Vespa's own measurement of the search; wall includes the
    // network and JSON parsing. Showing both is honest about which part of the
    // delay is the engine and which part is the trip to it.
    timing: {
      search: response?.timing?.searchtime ?? null,
      summary: response?.timing?.summaryfetchtime ?? null,
      total: response?.timing?.querytime ?? null,
      wall,
    },
    coverage: root?.coverage || null,
  };
}

/**
 * The article list for the scope control, written by vespa/scripts/make_feed.py.
 *
 * Static on purpose: see the comment at the top of that script. The filtering
 * these names drive is done by Vespa; only the names are local.
 */
export async function loadArticles(signal) {
  const response = await fetch(`${process.env.PUBLIC_URL || ''}/vespa/articles.json`, { signal });
  if (!response.ok) throw new Error(`articles.json: HTTP ${response.status}`);
  const data = await response.json();
  return data.articles || [];
}
