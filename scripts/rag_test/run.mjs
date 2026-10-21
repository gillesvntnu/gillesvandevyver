// Regression suite for the RAG demo.
//
// Runs the real src/rag modules against the real built index in public/rag,
// so it fails on a stale index, a model/prefix mismatch, or a corpus rebuilt
// with a regression in the Wikipedia extraction — not just on a logic bug.
//
// Usage:  npm run rag:test
//
// Most of these checks exist because the thing they test was once broken.
// The comments say which, so nobody "simplifies" a guard back out.

import path from 'node:path';
import { ROOT, stubFetch, makeEncoder } from './harness.mjs';
import { QUERIES, UNANSWERABLE } from './evalset.mjs';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

stubFetch();
const { tokenize } = await import(path.join(ROOT, 'src/rag/tokenizer.js'));
const { MODEL_ID, DIMS, QUERY_PREFIX } = await import(path.join(ROOT, 'src/rag/embedder.js'));
const {
  loadIndex, retrieve, confidenceOf, bestPassage, highlight, formatCitation,
} = await import(path.join(ROOT, 'src/rag/retriever.js'));

// ── Tokenizer ──────────────────────────────────────────────
// Nordic letters are atomic codepoints, so NFD leaves them in place and a
// naive combining-mark strip silently truncated "Måsøy" to "mas".
check('tokenizer folds o-slash', tokenize('Måsøy').includes('masoy'), tokenize('Måsøy').join(','));
check('tokenizer folds ae-ligature', tokenize('Ærø').includes('aero'), tokenize('Ærø').join(','));
check('tokenizer folds combining marks', tokenize('Trøndelag Hôpital').includes('hopital'));
check('tokenizer drops stopwords', !tokenize('what is the model').includes('the'));
check('tokenizer keeps stopwords on request',
  tokenize('what is the model', { keepStopwords: true }).includes('the'));
// Case is folded before stemming, so a word capitalised at the start of a
// heading and the same word mid-question land on the same stem and match.
check('tokenizer folds case onto the same stem',
  tokenize('Derailleur')[0] === tokenize('derailleur')[0],
  `${tokenize('Derailleur')} vs ${tokenize('derailleur')}`);
check('tokenizer survives empty input', tokenize('').length === 0);
check('tokenizer survives punctuation only', tokenize('!!! ... ???').length === 0);

// ── Index integrity ────────────────────────────────────────
const index = await loadIndex();
const { chunks, vectors, documentList, meta } = index;

check('index loaded chunks', chunks.length > 100, `${chunks.length}`);
check('index model matches embedder', meta.model === MODEL_ID, `${meta.model} vs ${MODEL_ID}`);
check('vector matrix matches chunk count',
  vectors.length === chunks.length * DIMS, `${vectors.length} vs ${chunks.length * DIMS}`);
check('whole article set present', documentList.length === 255, `${documentList.length}`);
check('every chunk has a document', chunks.every((c) => index.documents.has(c.docId)));
// Web articles have no pages, so `part` — the passage's ordinal inside its
// article — is the locator, and the page fields must be absent rather than
// zero. A chunk with page 0 would render as "p. 0" in a citation, which is how
// a half-finished corpus swap shows up in the UI.
check('every chunk has a part ordinal',
  chunks.every((c) => Number.isInteger(c.part) && c.part > 0),
  `${chunks.filter((c) => !Number.isInteger(c.part)).length} without`);
check('no chunk claims a page number',
  chunks.every((c) => c.page === undefined || c.page === null),
  `${chunks.filter((c) => c.page !== undefined && c.page !== null).length} with pages`);
// Part ordinals are per-article and start at 1, so a gap or a restart means the
// chunker emitted them from the wrong counter.
check('part ordinals are contiguous from 1 within each article', (() => {
  const byDoc = new Map();
  for (const c of chunks) {
    if (!byDoc.has(c.docId)) byDoc.set(c.docId, []);
    byDoc.get(c.docId).push(c.part);
  }
  for (const parts of byDoc.values()) {
    const sorted = [...parts].sort((a, b) => a - b);
    if (sorted[0] !== 1) return false;
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
})());
check('no empty chunks', chunks.every((c) => c.text.trim().length > 0));
check('no vector row is all zero', (() => {
  for (let i = 0; i < chunks.length; i += 1) {
    let any = false;
    for (let d = 0; d < DIMS; d += 1) if (vectors[i * DIMS + d] !== 0) { any = true; break; }
    if (!any) return false;
  }
  return true;
})());
check('every document contributes chunks',
  documentList.every((doc) => chunks.some((c) => c.docId === doc.id)),
  documentList.filter((doc) => !chunks.some((c) => c.docId === doc.id)).map((d) => d.id).join(','));

// The asymmetric prefixes are the easiest thing to get half-right in a model
// swap: index built with "passage: ", queries sent without "query: ".
check('query prefix is defined', typeof QUERY_PREFIX === 'string' && QUERY_PREFIX.length > 0);

// ── Corpus hygiene ─────────────────────────────────────────
// BM25 scores IDF per chunk, so anything that appears in a handful of chunks
// and nowhere else reads as the rarest and most informative term in the corpus.
// On a Wikipedia corpus that is apparatus text, not journal furniture.
const corpusText = chunks.map((c) => `${c.section} ${c.text}`).join('\n').toLowerCase();
for (const phrase of [
  'retrieved from', 'wikimedia commons', 'cite web', 'isbn', 'doi:',
  'archived from the original', 'this article needs', 'citation needed',
]) {
  check(`apparatus removed: "${phrase}"`, !corpusText.includes(phrase));
}
// Back matter arrives as named sections in an extract rather than as a
// contiguous region, and a heading has to kill everything nested under it too —
// "References > Cited works" has to disappear as a unit, not leave the child
// behind.
const BACK_MATTER = /^(references?|notes?|citations?|sources?|bibliography|further reading|external links?|see also|footnotes?|works cited|gallery)$/i;
check('no back-matter sections survive',
  !chunks.some((c) => c.section.split(' > ').some((part) => BACK_MATTER.test(part.trim()))),
  [...new Set(chunks.filter((c) => c.section.split(' > ').some((p) => BACK_MATTER.test(p.trim())))
    .map((c) => c.section))].join(' | '));

// explaintext renders every formula twice: a MathML fallback of one symbol per
// line, then the raw TeX. Left in, the first becomes "| - 6 pi eta r v |" soup
// once lines are joined into paragraphs and the second contributes
// "displaystyle" and "frac" — terms that occur nowhere else, which is exactly
// what BM25 treats as the strongest evidence available. Eleven articles carry
// maths, and they are the technical ones the corpus exists for.
for (const marker of ['displaystyle', 'mathrm', '\\frac', 'begin{aligned}']) {
  check(`math markup removed: "${marker}"`, !corpusText.includes(marker.toLowerCase()));
}
// The fallback rendering survives joining as a run of single characters
// separated by spaces, which no real sentence produces.
const symbolSoup = chunks.filter((c) => /(?:\s\S\s\S\s\S\s\S\s\S\s\S){2,}/.test(c.text));
check('no symbol-soup chunks', symbolSoup.length === 0,
  symbolSoup.slice(0, 3).map((c) => `${c.docId}#${c.part}`).join(','));

check('chunks are substantial', chunks.filter((c) => c.text.length < 120).length < chunks.length * 0.05,
  `${chunks.filter((c) => c.text.length < 120).length} short chunks`);
check('every document has a title', documentList.every((d) => d.title));
// Every article is a live Wikipedia page, and the URL is what the "read it in
// context" link and the CC BY-SA attribution both depend on. A missing one is
// an attribution failure, not just a dead link.
check('every document has a public URL',
  documentList.every((d) => d.url && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(d.url)),
  documentList.filter((d) => !d.url).map((d) => d.id).join(','));
check('corpus carries its licence',
  meta.attribution && /CC BY-SA/i.test(meta.attribution.license || ''),
  JSON.stringify(meta.attribution));

// ── Retrieval quality on the labelled set ──────────────────
const encode = await makeEncoder();

let rank1 = 0;
let inTop5 = 0;
let factFound = 0;
let shownResults = 0;
let sectionCollisions = 0;
let identicalCitations = 0;
const misses = [];

for (const item of QUERIES) {
  const results = retrieve(index, item.q, await encode(item.q), { limit: 6 });
  if (!results.length) { misses.push(`no results: ${item.q}`); continue; }
  if (item.docs.includes(results[0].docId)) rank1 += 1;
  if (results.slice(0, 5).some((r) => item.docs.includes(r.docId))) inTop5 += 1;
  else misses.push(`gold doc not in top 5: ${item.q}`);
  if (results.some((r) => item.must.test(r.text))) factFound += 1;
  else misses.push(`fact not retrieved: ${item.q}`);

  // How often two results in one answer come from the same section, and how
  // often that would print as the same citation twice. The second number is the
  // one that matters, and the part suffix is what holds it at zero.
  shownResults += results.length;
  const sections = results.map((r) => `${r.docId}|${r.section}`);
  sectionCollisions += sections.length - new Set(sections).size;
  const cites = results.map((r) => formatCitation(r));
  identicalCitations += cites.length - new Set(cites).size;
}

// Measured at docP@1 0.93, docR@5 1.00, fact@6 1.00 on the 30 labelled queries.
// The floors are set a query or two below that rather than at it, because
// retrieval here is deterministic — there is no run-to-run noise to absorb — so
// a floor pinned exactly at the current score would fail on any corpus refresh
// that moved one question, which is not the regression worth catching.
const n = QUERIES.length;
check('document precision@1 >= 0.87', rank1 / n >= 0.87, `${(rank1 / n).toFixed(2)}`);
check('document recall@5 == 1.00', inTop5 === n, `${(inTop5 / n).toFixed(2)}`);
check('fact present in top 6 >= 0.95', factFound / n >= 0.95, `${(factFound / n).toFixed(2)}`);

// The page claims keyword-only mode degrades gracefully rather than breaking,
// and quotes these numbers, so they are measured here rather than asserted
// there. Passing no query vector is exactly what the page does before the
// embedding model has loaded, or when it fails to load at all.
let kwRank1 = 0;
let kwInTop5 = 0;
for (const item of QUERIES) {
  const results = retrieve(index, item.q, null, { limit: 6 });
  if (item.docs.includes(results[0]?.docId)) kwRank1 += 1;
  if (results.slice(0, 5).some((r) => item.docs.includes(r.docId))) kwInTop5 += 1;
}
check('keyword-only still finds an answering article in the top 5 for every question',
  kwInTop5 === n, `${kwInTop5}/${n}`);
// Measured at 0.73. Floored low because the point is that the fallback is
// usable, not that it matches hybrid.
check('keyword-only precision@1 >= 0.65', kwRank1 / n >= 0.65, `${(kwRank1 / n).toFixed(2)}`);
// And the semantic half has to be earning its 33 MB. If a future change made
// hybrid no better than BM25 alone, that is worth knowing loudly.
check('the semantic half improves precision@1 by at least 4 questions',
  rank1 - kwRank1 >= 4, `hybrid ${rank1} vs keyword ${kwRank1}`);

// This is the check the section-part locator exists for. Same-section collisions
// are common and fine - two paragraphs of one section can both be relevant - but
// two results that cite identically are indistinguishable to the reader and to
// the generation model, which is asked to attribute each claim to one excerpt.
check('no two results in one answer cite identically',
  identicalCitations === 0, `${identicalCitations} of ${shownResults}`);
check('same-section collisions are common enough to be worth the locator',
  sectionCollisions > 0, `${sectionCollisions} of ${shownResults}`);

// ── Confidence calibration ─────────────────────────────────
// Thresholds are encoder-specific. If a model swap forgets to re-run
// calibrate.mjs these two checks are what notices.
const answerableConfidence = [];
for (const item of QUERIES.slice(0, 10)) {
  answerableConfidence.push(confidenceOf(retrieve(index, item.q, await encode(item.q), { limit: 6 })));
}
check('answerable questions are not labelled weak',
  answerableConfidence.every((c) => c === 'ok' || c === 'strong'),
  answerableConfidence.join(','));

const unanswerableConfidence = [];
for (const question of UNANSWERABLE) {
  unanswerableConfidence.push(confidenceOf(retrieve(index, question, await encode(question), { limit: 6 })));
}
check('off-topic and absent-fact questions are labelled weak',
  unanswerableConfidence.every((c) => c === 'weak'),
  UNANSWERABLE.map((q, i) => `${unanswerableConfidence[i]}:${q}`).join(' | '));
check('empty result set is "none"', confidenceOf([]) === 'none');

// ── Lexical-only fallback ──────────────────────────────────
// The page stays usable if the model download fails, so retrieve() must accept
// a null query vector rather than throwing.
const lexicalOnly = retrieve(index, 'What is a Presta valve?', null, { limit: 6 });
check('lexical-only returns results', lexicalOnly.length > 0);
check('lexical-only finds the term', lexicalOnly.some((r) => /presta/i.test(r.text)));
check('lexical-only reports null similarity', lexicalOnly.every((r) => r.similarity === null));
check('lexical-only confidence is never strong',
  ['ok', 'weak'].includes(confidenceOf(lexicalOnly)), confidenceOf(lexicalOnly));

// ── Diversity, filtering, dedup ────────────────────────────
const BROAD = 'How do bicycle brakes work?';
const broad = retrieve(index, BROAD, await encode(BROAD), { limit: 6 });
check('broad question spans multiple documents',
  new Set(broad.map((r) => r.docId)).size >= 3, `${new Set(broad.map((r) => r.docId)).size} documents`);
check('no document monopolises the results',
  Math.max(...[...broad.reduce((m, r) => m.set(r.docId, (m.get(r.docId) || 0) + 1), new Map()).values()]) <= 2);

const filtered = retrieve(index, 'gears', await encode('gears'), { limit: 6, docFilter: ['hub-gear'] });
check('document filter is respected', filtered.every((r) => r.docId === 'hub-gear'));
check('document filter still returns results', filtered.length > 0);
const emptyFilter = retrieve(index, 'gears', await encode('gears'), { limit: 6, docFilter: [] });
check('empty filter means no filter', emptyFilter.length > 0 && new Set(emptyFilter.map((r) => r.docId)).size > 1);

// The settings panel invites the visitor to try exactly this, so what it
// promises has to be what happens: scoped to the two frame articles, a braking
// question returns nothing at all rather than the nearest frame passage. If the
// floor ever drops low enough to let one through, the help text is a lie.
const SCOPED = 'How do disc brakes stop the wheel?';
const frameOnly = retrieve(index, SCOPED, await encode(SCOPED), {
  limit: 6,
  docFilter: ['bicycle-frame', 'lugged-steel-frame-construction'],
});
check('the frame articles the help text names are really in the corpus',
  ['bicycle-frame', 'lugged-steel-frame-construction']
    .every((id) => index.chunks.some((c) => c.docId === id)));
check('an off-topic scope returns nothing rather than a stretch',
  frameOnly.length === 0, `${frameOnly.length} results`);
check('an off-topic scope reports no confidence', confidenceOf(frameOnly) === 'none', confidenceOf(frameOnly));
check('the same question unscoped is answered confidently',
  confidenceOf(retrieve(index, SCOPED, await encode(SCOPED), { limit: 6 })) === 'strong');

// Consecutive chunks overlap by design (OVERLAP_CHARS), and several articles
// restate each other's definitions, so without dedup one answer became four
// restatements of the same paragraph.
const DUP = 'What is countersteering and why is it necessary to turn?';
const duplicated = retrieve(index, DUP, await encode(DUP), { limit: 6 });
check('near-duplicates are merged, not repeated',
  !duplicated.some((r, i) => duplicated.slice(0, i).some((other) => other.text === r.text)));
check('merged duplicates are credited via alsoIn',
  duplicated.every((r) => !r.alsoIn || Array.isArray(r.alsoIn)));

check('limit is honoured', retrieve(index, 'gears', await encode('gears'), { limit: 3 }).length <= 3);
check('results are sorted by fused score',
  broad.every((r, i) => i === 0 || broad[i - 1].fusedScore >= r.fusedScore));
check('every result carries its document', broad.every((r) => r.document && r.document.title));

// ── Section boost ──────────────────────────────────────────
// Deliberately selective: it fires when the question explains most of a
// heading, and stays out of the way otherwise. Gating it on term rarity
// instead made results worse, because rarity is not the same as relevance —
// the words a question is actually about tend to be common in the corpus.
// Section paths here are nested ("Lateral dynamics > Balance > Trail"), so
// coverage is measured over the whole path and a deep heading is harder to
// explain than a top-level one.
const BOOSTED = 'What is rolling resistance?';
const boosted = retrieve(index, BOOSTED, await encode(BOOSTED), { limit: 6 });
check('section boost fires on a matching heading',
  boosted.some((r) => r.sectionHit && /rolling resistance/i.test(r.section)),
  boosted.map((r) => `${r.section}:${r.sectionHit}`).join(' | '));
const vagueHit = retrieve(index, 'Tell me about bikes', await encode('Tell me about bikes'), { limit: 6 });
check('section boost does not fire on a vague question',
  vagueHit.filter((r) => r.sectionHit).length <= 1,
  vagueHit.filter((r) => r.sectionHit).map((r) => r.section).join(' | '));

// ── Passage selection, highlighting, citations ─────────────
const sample = broad[0];
const passage = bestPassage(sample, BROAD);
check('bestPassage returns text', passage.text.length > 0);
check('bestPassage respects its budget', passage.text.length <= 420 + 161, `${passage.text.length}`);
check('bestPassage text comes from the chunk',
  sample.text.includes(passage.text.replace(/…$/, '').trim().slice(0, 40)));
check('bestPassage flags truncation', typeof passage.truncatedStart === 'boolean');
const tiny = bestPassage({ text: 'One short sentence.' }, 'sentence');
check('bestPassage handles a one-sentence chunk', tiny.text === 'One short sentence.');

const HIGHLIGHTED = 'The rear derailleur moves the chain across the sprockets.';
const runs = highlight(HIGHLIGHTED, 'How does a derailleur move the chain?');
check('highlight marks query terms', runs.some((r) => r.highlight && /derailleur/i.test(r.text)));
check('highlight leaves other text alone', runs.some((r) => !r.highlight));
check('highlight is lossless', runs.map((r) => r.text).join('') === HIGHLIGHTED);
check('highlight with no usable terms returns one run',
  highlight('Some text here.', 'a an the').length === 1);
check('highlight ignores very short terms',
  !highlight('We do it.', 'do').some((r) => r.highlight));

// Citations have to work for both corpora. A page number is the right locator
// for a PDF and meaningless for a web article, so the page branch is kept alive
// by these three checks even though nothing in the current corpus exercises it,
// and the section branch is what the shipped index actually uses.
check('citation formats a single page', /p\. \d+/.test(formatCitation({ page: 4, pageEnd: 4, document: { title: 'T' } })));
check('citation formats a page range', /pp\. 4-6/.test(formatCitation({ page: 4, pageEnd: 6, document: { title: 'T' } })));
check('citation falls back to the id', /fallback/.test(formatCitation({ page: 1, pageEnd: 1, docId: 'fallback' })));
check('citation cites a section when there is no page',
  formatCitation({ section: 'Brakes > Rim brakes', document: { title: 'Bicycle' } })
    === 'Bicycle § Brakes > Rim brakes',
  formatCitation({ section: 'Brakes > Rim brakes', document: { title: 'Bicycle' } }));
check('citation is the title alone when there is neither',
  formatCitation({ document: { title: 'Bicycle' } }) === 'Bicycle',
  formatCitation({ document: { title: 'Bicycle' } }));
// "p. undefined" is what a half-finished corpus swap looks like in the UI.
check('no shipped citation mentions an undefined page',
  !chunks.slice(0, 200).some((c) => /undefined|NaN/.test(formatCitation({ ...c, document: index.documents.get(c.docId) }))));

// Two thirds of chunks share a section with a sibling, so "Article § Section"
// alone is not a locator: two neighbouring passages cite identically and read as
// the same passage listed twice. The part suffix appears only when the section
// really was cut up, so single-passage sections stay clean.
const sibCite = { section: 'Advantages', sectionPart: 2, sectionParts: 3, document: { title: 'Bicycle brake' } };
check('citation adds the part when a section has siblings',
  formatCitation(sibCite) === 'Bicycle brake § Advantages (2 of 3)', formatCitation(sibCite));
check('citation omits the part for a single-passage section',
  formatCitation({ section: 'Advantages', sectionPart: 1, sectionParts: 1, document: { title: 'Bicycle brake' } })
    === 'Bicycle brake § Advantages');
check('every shipped chunk carries a section-part locator',
  chunks.every((c) => c.sectionPart >= 1 && c.sectionParts >= c.sectionPart));
// The ordinals must be assigned in reading order, or "2 of 3" points at the
// wrong paragraph — worse than no locator, because it looks right.
check('section parts are assigned in reading order', (() => {
  const seen = new Map();
  return chunks.every((c) => {
    const key = `${c.docId}\u0000${c.section}`;
    const expected = (seen.get(key) || 0) + 1;
    seen.set(key, expected);
    return c.sectionPart === expected;
  });
})());
// Measured rather than assumed: this is the number the page prose quotes.
const siblinged = chunks.filter((c) => c.sectionParts > 1).length / chunks.length;
check('about two thirds of chunks share a section with a sibling',
  siblinged > 0.6 && siblinged < 0.75, siblinged.toFixed(2));

// The generation prompt builds its locators from formatCitation for exactly one
// reason: it used to build its own, and after the corpus lost its page numbers
// every excerpt went to the model labelled "page undefined".
const { buildUserPrompt } = await import(path.join(ROOT, 'src/rag/synthesize.js'));
const promptChunks = chunks.slice(0, 3).map((c) => ({ ...c, document: index.documents.get(c.docId) }));
const prompt = buildUserPrompt('How do disc brakes work?', promptChunks);
check('generation prompt names every excerpt', /\[1\].*\[2\].*\[3\]/s.test(prompt));
check('generation prompt has no undefined locator', !/undefined|NaN/.test(prompt), prompt.slice(0, 160));
check('generation prompt cites sections, not pages', !/\bpages?\s/.test(prompt));

// ── Degenerate queries ─────────────────────────────────────
check('empty query does not throw', Array.isArray(retrieve(index, '', null, { limit: 6 })));
check('stopword-only query does not throw', Array.isArray(retrieve(index, 'the and of', null, { limit: 6 })));
check('punctuation query does not throw', Array.isArray(retrieve(index, '???', null, { limit: 6 })));
const longQuery = 'derailleur '.repeat(400);
check('very long query does not throw', Array.isArray(retrieve(index, longQuery, null, { limit: 6 })));
check('nonsense query returns few or weak results',
  confidenceOf(retrieve(index, 'zzzz qqqq xxxx', await encode('zzzz qqqq xxxx'))) === 'weak');

// ── Report ─────────────────────────────────────────────────
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (misses.length) {
  console.log('\nretrieval notes:');
  for (const miss of misses) console.log(`  · ${miss}`);
}
console.log(`\nretrieval on ${n} labelled queries: `
  + `docP@1 ${(rank1 / n).toFixed(2)}  docR@5 ${(inTop5 / n).toFixed(2)}  fact@6 ${(factFound / n).toFixed(2)}`);

if (failures.length) {
  console.log('\nFAILED:');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
