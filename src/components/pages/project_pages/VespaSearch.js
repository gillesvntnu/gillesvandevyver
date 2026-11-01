import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CommonStyles.css';
import './VespaSearch.css';
import { bestPassage, highlight } from '../../../rag/retriever';
import {
  DEFAULT_ENDPOINT,
  ENDPOINT_STORAGE,
  MODES,
  MODE_ORDER,
  PROFILES,
  TOKEN_STORAGE,
  describeCorpus,
  describeGroup,
  loadArticles,
  search,
} from '../../../vespa/client';

// Picked so that the four rank profiles visibly disagree. "Presta" is a rare
// string only BM25 reliably finds; "stay upright" shares no word with
// "self-stability", the article that answers it, so only the vector half gets
// there; the two-part questions are where ColBERT's token-level matching has
// something to do that a single passage vector cannot.
const SUGGESTIONS = [
  'Why does a moving bicycle stay upright on its own?',
  'What is a Presta valve?',
  'How do rim brakes differ from disc brakes?',
  'What is trail in bicycle steering geometry?',
  'How does an internal hub gear work?',
  'Are segregated cycle lanes safer at junctions?',
];

/** sessionStorage is unavailable in some privacy modes; never let that break the page. */
function readSession(key, fallback = '') {
  try {
    return window.sessionStorage.getItem(key) ?? fallback;
  } catch (err) {
    return fallback;
  }
}

function writeSession(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch (err) { /* ignore: the value simply won't survive a reload */ }
}

function Highlighted({ text, query }) {
  return (
    <>
      {highlight(text, query).map((run, i) => (
        run.highlight
          ? <mark key={i} className="vs-mark">{run.text}</mark>
          : <React.Fragment key={i}>{run.text}</React.Fragment>
      ))}
    </>
  );
}

const number = (value, digits = 3) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null
);

/**
 * Turns the rank profile's match-features into chips.
 *
 * Each profile exposes a different set, because each one computes a different
 * thing, and showing the same two numbers for all four would hide exactly the
 * difference the page exists to demonstrate. The value in the chip is the
 * feature as Vespa computed it for that document, not a reconstruction.
 */
function chipsFor(profile, features, relevance) {
  const f = features || {};
  const chips = [];
  // A feature that is absent is not a feature that is zero, so a missing one is
  // left out rather than rendered as "0.00". match-features do go missing: a
  // profile that never computes bm25 does not report it.
  const push = (kind, name, value, title) => {
    if (value === null) return;
    chips.push({ kind, label: `${name} ${value}`, title });
  };

  if (profile === 'keyword') {
    push('score', 'bm25', number(relevance, 2),
      'The final score: bm25(text) + 2·bm25(title) + 2·bm25(section).');
    push('lexical', 'text', number(f['bm25(text)'], 2),
      'BM25 over the passage body alone.');
    push('lexical', 'title', number(f['bm25(title)'], 2),
      'BM25 over the article title, which the final score weights 2×.');
  } else if (profile === 'semantic') {
    push('score', 'closeness', number(relevance, 3),
      'closeness = 1 / (1 + angular distance). 1 is identical, 0 is far.');
    push('semantic', 'distance', number(f['distance(field, embedding)'], 3),
      'The raw angular distance between the question vector and this passage vector.');
  } else if (profile === 'hybrid') {
    push('score', 'rrf', number(relevance, 4),
      'Reciprocal rank fusion of the two orderings, computed in the global phase.');
    push('lexical', 'bm25', number(f.bm25_score, 2),
      'What the keyword half scored this passage.');
    push('semantic', 'vec', number(f.vector_score, 3),
      'What the vector half scored this passage.');
  } else if (profile === 'colbert') {
    push('score', 'maxsim', number(relevance, 2),
      'Sum over query tokens of the best-matching document token. The second-phase score.');
    push('lexical', 'bm25', number(f.bm25_score, 2),
      'From the first phase, which decided whether this passage reached reranking at all.');
    push('semantic', 'vec', number(f.vector_score, 3),
      'Also from the first phase.');
  }
  return chips;
}

function ResultCard({ hit, index, query, profile, onCluster }) {
  const [expanded, setExpanded] = useState(false);
  const passage = useMemo(() => bestPassage(hit, query), [hit, query]);
  const chips = chipsFor(profile, hit.features, hit.relevance);

  const href = hit.document.url && hit.anchor
    ? `${hit.document.url}#${hit.anchor}`
    : hit.document.url;

  // Where in the article this is. A section heading alone is not a locator when
  // the section was long enough to be cut into several passages, so say which
  // part - but only when there is in fact more than one.
  const where = [];
  const ofParts = hit.sectionParts > 1 ? ` (${hit.sectionPart} of ${hit.sectionParts})` : '';
  if (hit.section) where.push(`${hit.section}${ofParts}`);
  else if (ofParts) where.push(`passage ${hit.sectionPart} of ${hit.sectionParts}`);

  return (
    <li className="vs-result">
      <div className="vs-result-head">
        <span className="vs-result-number">{index + 1}</span>
        <div className="vs-result-meta">
          <span className="vs-result-title">
            {href
              ? <a href={href} target="_blank" rel="noopener noreferrer">{hit.document.title}</a>
              : hit.document.title}
          </span>
          <span className="vs-result-sub">{['Wikipedia', ...where].join(' · ')}</span>
        </div>
      </div>

      <blockquote className="vs-quote">
        {passage.truncatedStart && <span className="vs-ellipsis">… </span>}
        <Highlighted text={expanded ? hit.text : passage.text} query={query} />
        {passage.truncatedEnd && !expanded && <span className="vs-ellipsis"> …</span>}
      </blockquote>

      <div className="vs-result-foot">
        <button type="button" className="vs-link-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show full passage'}
        </button>
        <span className="vs-chips">
          {hit.clusterName && (
            <button
              type="button"
              className="vs-chip vs-chip-cluster"
              title="Narrow the search to this semantic cluster"
              onClick={() => onCluster(hit.clusterName)}
            >
              {hit.clusterName}
            </button>
          )}
          {chips.map((chip, i) => (
            <span key={i} className={`vs-chip vs-chip-${chip.kind}`} title={chip.title}>
              {chip.label}
            </span>
          ))}
        </span>
      </div>
    </li>
  );
}

const VespaSearch = () => {
  const abortRef = useRef(null);

  const [endpoint, setEndpoint] = useState(() => readSession(ENDPOINT_STORAGE, DEFAULT_ENDPOINT));
  const [token, setToken] = useState(() => readSession(TOKEN_STORAGE, ''));
  const [connection, setConnection] = useState({ status: 'loading', error: null, passages: 0 });

  const [articles, setArticles] = useState([]);
  const [excluded, setExcluded] = useState(() => new Set());
  const [articleQuery, setArticleQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const [profile, setProfile] = useState('hybrid');
  const [mode, setMode] = useState('indexed');
  const [group, setGroup] = useState('');
  const [groupSize, setGroupSize] = useState(null);
  const [cluster, setCluster] = useState('');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const modeSpec = MODES[mode];
  const profileOrder = modeSpec.profiles;

  useEffect(() => {
    document.title = 'Vespa search · gillesvandevyver.com';
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadArticles()
      .then((list) => { if (!cancelled) setArticles(list); })
      .catch(() => { /* the scope control is optional; the search works without it */ });
    return () => { cancelled = true; };
  }, []);

  // Probe the cluster whenever the endpoint changes. This is also what fills in
  // the passage count in the status bar, so a successful probe and a useful
  // statistic are the same request.
  useEffect(() => {
    let cancelled = false;
    setConnection({ status: 'loading', error: null, passages: 0 });

    const timer = setTimeout(() => {
      describeCorpus(endpoint, token)
        .then(({ passages }) => {
          if (cancelled) return;
          setConnection(passages > 0
            ? { status: 'ready', error: null, passages }
            : {
              status: 'error',
              passages: 0,
              error: 'The cluster is up but holds no documents. Has the feed finished?',
            });
        })
        .catch((err) => {
          if (!cancelled) setConnection({ status: 'error', error: err.message, passages: 0 });
        });
      // Debounced, because the endpoint box fires this on every keystroke
      // otherwise and each failed probe is a console error.
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [endpoint, token]);

  const docFilter = useMemo(() => {
    if (!articles.length || excluded.size === 0) return null;
    return articles.map((a) => a.id).filter((id) => !excluded.has(id));
  }, [articles, excluded]);

  const run = useCallback(async (raw, options = {}) => {
    const query = (raw ?? '').trim();
    if (!query || connection.status !== 'ready') return;

    const useProfile = options.profile ?? profile;
    const useCluster = options.cluster !== undefined ? options.cluster : cluster;
    const useMode = options.mode ?? mode;
    const useGroup = options.group !== undefined ? options.group : group;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setBusy(true);
    setError(null);
    setComparison(null);
    setAsked(query);

    try {
      const response = await search({
        endpoint,
        token,
        query,
        profile: useProfile,
        mode: useMode,
        group: useGroup,
        hits: 6,
        docFilter,
        cluster: useCluster,
        signal: abortRef.current.signal,
      });
      setResult(response);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setResult(null);
      }
    } finally {
      setBusy(false);
    }
  }, [cluster, connection.status, docFilter, endpoint, group, mode, profile, token]);

  /**
   * The same query against all four rank profiles, one after another.
   *
   * Sequential rather than parallel on purpose: four concurrent requests would
   * contend for the same embedder threads and the timings would measure the
   * contention rather than the profiles. The point of this button is the
   * timings, so they have to be honest.
   */
  const compare = useCallback(async (raw) => {
    const query = (raw ?? '').trim();
    if (!query || connection.status !== 'ready') return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setBusy(true);
    setError(null);
    setAsked(query);
    setComparison({ running: true, rows: [] });

    const rows = [];
    try {
      for (const id of profileOrder) {
        // eslint-disable-next-line no-await-in-loop
        const response = await search({
          endpoint,
          token,
          query,
          profile: id,
          mode,
          group,
          hits: 6,
          docFilter,
          cluster,
          grouping: false,
          signal,
        });
        rows.push({ id, response });
        setComparison({ running: true, rows: [...rows] });
        if (id === profile) setResult(response);
      }
      setComparison({ running: false, rows });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setComparison(null);
      }
    } finally {
      setBusy(false);
    }
  }, [cluster, connection.status, docFilter, endpoint, group, mode, profile, profileOrder, token]);

  // Switching profile with a question already asked re-runs it, because the
  // whole point of the switch is to see the same question answered differently.
  const switchProfile = (id) => {
    setProfile(id);
    if (asked) run(asked, { profile: id });
  };

  /**
   * Switching between the indexed and streaming clusters.
   *
   * Streaming needs a group, so one is chosen if none is set. The best choice
   * is the article that just answered the question in indexed mode: switching
   * then means "now search only inside that", which is the comparison worth
   * seeing. Failing that, any article will do.
   */
  const switchMode = (id) => {
    if (id === mode) return;
    setMode(id);
    setComparison(null);

    let nextProfile = profile;
    if (!MODES[id].profiles.includes(profile)) {
      nextProfile = 'hybrid';
      setProfile(nextProfile);
    }

    if (id !== 'streaming') {
      if (asked) run(asked, { mode: id, profile: nextProfile });
      return;
    }

    const suggested = group
      || result?.hits?.[0]?.docId
      || articles[0]?.id
      || '';
    setGroup(suggested);
    if (asked && suggested) run(asked, { mode: id, profile: nextProfile, group: suggested });
  };

  const switchGroup = (id) => {
    setGroup(id);
    setComparison(null);
    if (asked && id) run(asked, { group: id });
  };

  const applyCluster = (name) => {
    const next = cluster === name ? '' : name;
    setCluster(next);
    if (asked) run(asked, { cluster: next });
  };

  const visibleArticles = useMemo(() => {
    const needle = articleQuery.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter((a) => a.title.toLowerCase().includes(needle));
  }, [articles, articleQuery]);

  // How many passages the selected group holds. This is the number of
  // documents a streaming query will read, so it is the honest cost of the
  // query, and it is worth showing next to the control that sets it.
  //
  // There is no way to ask the streaming cluster how big it is in total: that
  // would mean streaming every group, which is the one thing the mode exists
  // to avoid. One group at a time is the only question available, and it is
  // also the only one worth asking.
  useEffect(() => {
    if (mode !== 'streaming' || !group || connection.status !== 'ready') {
      setGroupSize(null);
      return undefined;
    }
    let cancelled = false;
    describeGroup(endpoint, token, group)
      .then(({ passages }) => { if (!cancelled) setGroupSize(passages); })
      .catch(() => { if (!cancelled) setGroupSize(null); });
    return () => { cancelled = true; };
  }, [connection.status, endpoint, group, mode, token]);

  const included = articles.length - excluded.size;
  const maxClusterCount = result?.clusters?.[0]?.count || 1;
  const groupTitle = articles.find((a) => a.id === group)?.title || group;

  return (
    <div className="project-page-container">
      <h1>The same search, in a search engine</h1>

      <div className="vs-hero">
        <p>
          This asks questions of 255 Wikipedia articles about bicycles, the same 3,365
          passages my in-browser search covers. The difference is where the work happens.
          Here there is a real search engine behind it: <a href="https://vespa.ai" target="_blank" rel="noopener noreferrer">Vespa</a>,
          running the retrieval, the embedding, the ranking and the faceting on a server.
        </p>
        <p>
          The browser sends a question and gets passages back. It holds no index, no model
          and no scoring code. Everything below — which retriever ran, how the two were
          merged, how the passages are stored in the first place, what each phase cost — is
          configuration in an application package, not JavaScript, and the page shows you the
          numbers the engine reports rather than numbers it computed itself.
        </p>
        <p className="vs-hero-note">
          It talks to a cluster you run yourself. One command starts it; the status bar
          below says whether it found one. There is no recorded fallback, on purpose: a
          search page that serves canned answers when its engine is down is lying about
          what it is.
        </p>
      </div>

      <div className="vertical-card vs-card">
        <div className="vs-statusbar">
          <div className="vs-status-left">
            <span className={`vs-dot vs-dot-${connection.status}`} />
            {connection.status === 'loading' && <span>Looking for a cluster at {endpoint}…</span>}
            {connection.status === 'error' && <span>No cluster at {endpoint}</span>}
            {connection.status === 'ready' && (
              <span>
                {connection.passages.toLocaleString()} passages indexed · {endpoint}
              </span>
            )}
          </div>
          <button type="button" className="vs-link-button" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
        </div>

        {connection.status === 'error' && (
          <div className="vs-setup">
            <p className="vs-setup-lead">{connection.error}</p>
            <p>
              Start one from a checkout of this site. It pulls the Vespa container, deploys the
              application package in <code>vespa/app</code>, and feeds the corpus:
            </p>
            <pre className="vs-code">./vespa/scripts/run_local.sh</pre>
            <p className="vs-setup-foot">
              The feed is the slow step, fifteen to forty minutes, because Vespa embeds every
              passage on the way in — twice for the indexed cluster, once with e5 and once with
              ColBERT, both on CPU. The streaming cluster is fed after it and is quicker;
              pass <code>--no-streaming</code> to skip it and lose only the storage-mode
              comparison. If the cluster is somewhere other
              than <code>localhost:8080</code>, set the endpoint under Settings.
            </p>
          </div>
        )}

        {showSettings && (
          <div className="vs-settings">
            <div className="vs-setting-block">
              <h4>Cluster</h4>
              <p className="vs-setting-help">
                Where to send queries. A local <code>run_local.sh</code> cluster needs no token.
                A Vespa Cloud endpoint secured with a token needs one, and it is sent as a bearer
                header; it stays in this tab and disappears when you close it.
              </p>
              <div className="vs-setting-row">
                <input
                  type="text"
                  className="vs-text-input"
                  value={endpoint}
                  placeholder={DEFAULT_ENDPOINT}
                  onChange={(event) => {
                    setEndpoint(event.target.value);
                    writeSession(ENDPOINT_STORAGE, event.target.value);
                  }}
                  aria-label="Vespa endpoint"
                />
                <input
                  type="password"
                  className="vs-text-input vs-token-input"
                  value={token}
                  placeholder="Bearer token (optional)"
                  autoComplete="off"
                  onChange={(event) => {
                    setToken(event.target.value);
                    writeSession(TOKEN_STORAGE, event.target.value);
                  }}
                  aria-label="Bearer token"
                />
                <button
                  type="button"
                  className="vs-link-button"
                  onClick={() => {
                    setEndpoint(DEFAULT_ENDPOINT);
                    writeSession(ENDPOINT_STORAGE, '');
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="vs-setting-block">
              <h4>Search in</h4>
              <p className="vs-setting-help">
                {included} of {articles.length} articles included. Unticking articles sends a
                <code> doc_id in (…)</code> clause with the query, so the excluded passages are
                removed by an attribute lookup before ranking — the ranker never sees them.
                Narrow it hard and a good question honestly returns nothing, instead of
                promoting the nearest irrelevant passage.
              </p>
              {mode === 'streaming' && (
                <p className="vs-setting-help vs-setting-muted">
                  This list does nothing in streaming mode. There the article is not a filter
                  applied to a search of everything — it is the only thing read, and it is
                  chosen with the control above. Switch back to indexed mode to use these.
                </p>
              )}
              <div className="vs-article-controls">
                <input
                  type="text"
                  className="vs-text-input"
                  value={articleQuery}
                  placeholder="Filter articles by title…"
                  onChange={(event) => setArticleQuery(event.target.value)}
                  aria-label="Filter articles by title"
                />
                <button type="button" className="vs-link-button" onClick={() => setExcluded(new Set())}>
                  All
                </button>
                <button
                  type="button"
                  className="vs-link-button"
                  onClick={() => setExcluded(new Set(articles.map((a) => a.id)))}
                >
                  None
                </button>
              </div>
              <div className="vs-article-toggles">
                {visibleArticles.map((article) => (
                  <label key={article.id} className="vs-article-toggle">
                    <input
                      type="checkbox"
                      checked={!excluded.has(article.id)}
                      onChange={() => setExcluded((prev) => {
                        const next = new Set(prev);
                        if (next.has(article.id)) next.delete(article.id);
                        else next.add(article.id);
                        return next;
                      })}
                    />
                    <span>{article.title}</span>
                  </label>
                ))}
                {visibleArticles.length === 0 && (
                  <p className="vs-setting-help">No article title contains that.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="vs-control-row">
          <span className="vs-control-label">Stored as</span>
          <div className="vs-modes" role="group" aria-label="Storage mode">
            {MODE_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`vs-mode${mode === id ? ' vs-mode-active' : ''}`}
                disabled={connection.status !== 'ready' || busy}
                onClick={() => switchMode(id)}
                title={`${MODES[id].label}: searches ${MODES[id].scope}`}
              >
                {MODES[id].label}
              </button>
            ))}
          </div>

          {mode === 'streaming' && (
            <>
              <label className="vs-control-label" htmlFor="vs-group">in</label>
              <select
                id="vs-group"
                className="vs-group-select"
                value={group}
                disabled={connection.status !== 'ready' || busy || !articles.length}
                onChange={(event) => switchGroup(event.target.value)}
              >
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>{article.title}</option>
                ))}
              </select>
            </>
          )}
        </div>

        <p className="vs-profile-blurb">
          {mode === 'indexed'
            ? 'One content cluster with everything built in advance: an HNSW graph over the '
              + 'passage vectors, BM25 posting lists, in-memory attributes. A query touches a '
              + 'small part of a large structure.'
            : 'A second content cluster holding the same passages with nothing built at all. '
              + 'The selected article is read and matched document by document, and the '
              + 'nearest-neighbour search over it is exact rather than approximate.'}
          {mode === 'streaming' && groupSize !== null && (
            groupSize > 0
              ? ` This group is ${groupSize} passages, and a query reads all of them.`
              : ' This group holds nothing — the streaming cluster has not been fed.'
          )}
        </p>

        <div className="vs-control-row">
          <span className="vs-control-label">Ranked by</span>
          <div className="vs-profiles" role="group" aria-label="Rank profile">
            {profileOrder.map((id) => (
              <button
                key={id}
                type="button"
                className={`vs-profile${profile === id ? ' vs-profile-active' : ''}`}
                disabled={connection.status !== 'ready' || busy}
                onClick={() => switchProfile(id)}
                title={PROFILES[id].blurb}
              >
                {PROFILES[id].label}
              </button>
            ))}
            {mode === 'streaming' && (
              <span
                className="vs-profile vs-profile-absent"
                title="The streaming schema stores no per-token vectors, so there is nothing for MaxSim to read."
              >
                {PROFILES.colbert.label} — not available here
              </span>
            )}
          </div>
        </div>
        <p className="vs-profile-blurb">{PROFILES[profile].blurb}</p>

        <form
          className="vs-composer"
          onSubmit={(event) => { event.preventDefault(); run(question); }}
        >
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={connection.status === 'ready'
              ? 'Ask a question about bicycles…'
              : 'Waiting for a cluster…'}
            disabled={connection.status !== 'ready' || busy}
            aria-label="Your question"
          />
          <button type="submit" disabled={connection.status !== 'ready' || busy || !question.trim()}>
            {busy ? 'Searching…' : 'Search'}
          </button>
          <button
            type="button"
            className="vs-compare-button"
            disabled={connection.status !== 'ready' || busy || !(question.trim() || asked)}
            onClick={() => compare(question.trim() || asked)}
            title="Run this question through every rank profile available in this mode and compare them"
          >
            {`Compare all ${profileOrder.length}`}
          </button>
        </form>

        {cluster && (
          <div className="vs-active-filter">
            Restricted to the <strong>{cluster}</strong> cluster.{' '}
            <button type="button" className="vs-link-button" onClick={() => applyCluster(cluster)}>
              Clear
            </button>
          </div>
        )}

        <div className="vs-results-area">
          {!asked && !error && (
            <div className="vs-empty">
              <p>
                Ask anything about bicycles: how they are built, how they handle, how they are
                raced, how they are planned for.
              </p>
              <div className="vs-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="vs-suggestion"
                    disabled={connection.status !== 'ready' || busy}
                    onClick={() => { setQuestion(suggestion); run(suggestion); }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="vs-error">{error}</p>}

          {comparison && (
            <div className="vs-comparison">
              <h4 className="vs-section-heading">
                {`${profileOrder.length} rank profiles, one question`}
                <span className="vs-section-note">
                  {` · ${MODES[mode].label.toLowerCase()} mode`}
                  {mode === 'streaming' && `, inside ${groupTitle}`}
                </span>
                {comparison.running && <span className="vs-section-note"> · running…</span>}
              </h4>
              <table className="vs-table">
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Vespa search time</th>
                    <th>Top passage</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.id} className={row.id === profile ? 'vs-row-active' : undefined}>
                      <td>{PROFILES[row.id].label}</td>
                      <td className="vs-numeric">
                        {row.response.timing.search != null
                          ? `${(row.response.timing.search * 1000).toFixed(0)} ms`
                          : '—'}
                      </td>
                      <td>
                        {row.response.hits[0]
                          ? <>
                            {row.response.hits[0].document.title}
                            {row.response.hits[0].section && (
                              <span className="vs-table-sub"> · {row.response.hits[0].section}</span>
                            )}
                          </>
                          : 'nothing matched'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="vs-section-note">
                The times are Vespa's own measurement of the search, not the round trip. The
                first query after a deploy is much slower than the rest in every profile,
                because it pays for loading the ONNX model; run it twice. The passages below
                are the <strong>{PROFILES[profile].label}</strong> result.
              </p>
            </div>
          )}

          {result && !busy && result.hits.length === 0 && (
            <p className="vs-empty-result">
              {result.mode === 'streaming' && groupSize === 0
                ? <>Nothing matched, because this group is empty. The streaming cluster has not
                  been fed — run <code>./vespa/scripts/run_local.sh</code> without
                  <code> --no-streaming</code>, or switch back to indexed mode.</>
                : <>Nothing matched. With the scope this narrow that is the honest answer rather
                  than a failure — there was no passage left that could have answered it.</>}
            </p>
          )}

          {result && result.hits.length > 0 && (
            <div className="vs-results">
              <div className="vs-results-main">
                <h4 className="vs-section-heading">
                  Top {result.hits.length} of {result.matched.toLocaleString()} matched
                  <span className="vs-section-note">
                    {' · '}{MODES[result.mode].label}
                    {result.mode === 'streaming' && `, inside ${groupTitle}`}
                    {' · '}{PROFILES[result.profile].label}
                    {result.timing.search != null
                      && ` · ${(result.timing.search * 1000).toFixed(0)} ms in Vespa`}
                    {` · ${(result.timing.wall * 1000).toFixed(0)} ms round trip`}
                  </span>
                </h4>
                <ol className="vs-result-list">
                  {result.hits.map((hit, i) => (
                    <ResultCard
                      key={hit.id}
                      hit={hit}
                      index={i}
                      query={asked}
                      profile={result.profile}
                      onCluster={applyCluster}
                    />
                  ))}
                </ol>
              </div>

              {result.clusters.length > 0 && (
                <aside className="vs-facets">
                  <h4 className="vs-section-heading">Where the matches live</h4>
                  <p className="vs-facet-help">
                    Every passage that matched, grouped by semantic cluster, from the same pass
                    that produced the ranking above. Click one to search only inside it.
                    {result.mode === 'streaming'
                      && ' In streaming mode this covers one article, which is usually one or two'
                        + ' clusters — an article is a coherent subject, and the facets say so.'}
                  </p>
                  <ul className="vs-facet-list">
                    {result.clusters.map((bucket) => (
                      <li key={bucket.value}>
                        <button
                          type="button"
                          className={`vs-facet${cluster === bucket.value ? ' vs-facet-active' : ''}`}
                          onClick={() => applyCluster(bucket.value)}
                        >
                          <span className="vs-facet-bar" style={{ width: `${(bucket.count / maxClusterCount) * 100}%` }} />
                          <span className="vs-facet-label">{bucket.value}</span>
                          <span className="vs-facet-count">{bucket.count}</span>
                        </button>
                        {bucket.nested?.title_facet?.length > 0 && (
                          <ul className="vs-facet-sub">
                            {bucket.nested.title_facet.map((inner) => (
                              <li key={inner.value}>
                                <span className="vs-facet-sub-label">{inner.value}</span>
                                <span className="vs-facet-count">{inner.count}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="vertical-card">
        <div className="vs-prose">
          <h2>What the engine is doing</h2>
          <p>
            The two rows of buttons above are two different choices. <em>Stored as</em> picks
            which content cluster answers, and the clusters differ in what Vespa built before
            the question arrived. <em>Ranked by</em> picks a <em>rank profile</em> within that
            cluster's schema, which changes which retrievers run and what happens to their
            output. Either way the page re-asks the same question, so the difference is visible
            rather than described. There is a longer, gentler write-up of all of this in{' '}
            <a
              href="https://github.com/gillesvntnu/gillesvandevyver/blob/main/vespa/FEATURES-EXPLAINED.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              FEATURES-EXPLAINED.md
            </a>.
          </p>

          <h3>Hybrid retrieval and phased ranking</h3>
          <p>
            Ranking in Vespa happens in stages, and the stages run in different places. The
            first phase runs on the content node over everything that matched, so it has to be
            cheap; it only decides who survives. The hybrid profile then fuses the two rankings
            in the <em>global phase</em>, on the stateless container, after every content node
            has reported in — which is the only place where a document's position relative to
            the whole result set is knowable, and position is exactly what reciprocal rank
            fusion needs. BM25 is unbounded and corpus-dependent, cosine lives in a fixed range;
            adding them directly means retuning a weight every time the corpus changes. Fusing
            their positions never needs that weight.
          </p>

          <h3>ColBERT late interaction</h3>
          <p>
            The fourth profile keeps that retrieval and adds a second phase that compares the
            question and the passage token by token instead of as two single vectors. For each
            word of the question it finds the word of the passage that matches it best, and adds
            those up. A passage that answers every part of a two-part question scores above one
            that answers half of it emphatically, which a single passage vector cannot tell
            apart. It runs on the content nodes, not the container, because the per-token
            vectors are attributes and attributes live where the documents do — and it is capped
            at the top 200 per node, because running it over everything that matched is exactly
            what phased ranking exists to avoid. The comparison table shows what it costs.
          </p>

          <h3>Grouping and faceting</h3>
          <p>
            The panel beside the results is not a second query. A grouping expression rides on
            the same request, and Vespa walks the matched set once to produce both the ranked
            passages and the full breakdown — so the counts describe exactly the set that
            produced the hits next to them, which two separate requests could not promise. The
            clusters themselves are k-means over the passage embeddings, assigned at feed time,
            and their names are derived from the terms most over-represented inside each one
            rather than written by hand.
          </p>

          <h3>Filtering in the engine</h3>
          <p>
            Unticking articles under Settings sends a <code>doc_id in (…)</code> clause along
            with the query. Because that field is an in-memory attribute with a B-tree over it,
            a couple of hundred ids resolve by lookup, and the excluded passages are gone before
            ranking starts. Filtering is the cheap part of the query, not an afterthought
            applied to results. The same mechanism is what would let one index serve many users
            without any of them being able to see the others' documents.
          </p>

          <h3>Streaming mode, and when filtering is the wrong answer</h3>
          <p>
            That last sentence is the standard answer to multi-tenancy, and past a certain
            shape of data it stops being a good one. Think of a mail search: every query belongs
            to exactly one mailbox, no query ever crosses mailboxes, and the index you have
            built across all of them is structure no query will ever use — paid for in memory,
            in feed time, and again every time a message arrives. Filtering it down to one user
            is doing the expensive thing and then throwing most of it away.
          </p>
          <p>
            Vespa's other storage mode inverts that. In streaming mode nothing is built ahead of
            a query: the documents of the named group are read and matched one at a time, and
            the nearest-neighbour search over them is exact, because with a few dozen vectors
            there is nothing an approximate graph could save. The group is part of the document
            id rather than a field you filter on, and the query names it with one parameter.
            The cost moves from per-document to per-query, which is the right way round when
            the groups are small and there are an enormous number of them.
          </p>
          <p>
            The <strong>Stored as</strong> switch above runs the same question against both. The
            two clusters hold the same passages; the indexed one is the whole corpus, the
            streaming one is grouped by article, an article standing in for a mailbox because
            it is the same shape of thing and can be put on a public page. Three differences are
            worth watching for. Streaming has no ColBERT profile, because that schema stores no
            per-token vectors and the saving is most of why you would choose the mode. Its BM25
            needs the average field length written into the schema by hand, since there are no
            corpus-wide term statistics to derive it from — get that wrong and the same text
            scores differently in the two clusters. And inside one article the question is
            easier, so the profiles agree with each other far more than they do across 255.
          </p>

          <h3>What this version does not do</h3>
          <p>
            There is no written answer here. The in-browser version will synthesise one from the
            retrieved passages if you give it an API key; this page stops at retrieval,
            deliberately, because retrieval is the half this is about. And ColBERT indexes the
            first 256 tokens of a passage, so the tail of a long one is not represented in that
            profile — a real limitation, not a rounding error.
          </p>

          <h3>Attribution</h3>
          <p>
            The passages are text from Wikipedia, used under{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
              CC BY-SA 4.0
            </a>. Every passage links back to the article it came from. The code is my own.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VespaSearch;
