// Regression suite for the RAG demo.
//
// Runs the real src/rag modules against the real built index in public/rag,
// so it fails on a stale index, a model/prefix mismatch, or a corpus rebuilt
// with a regression in the PDF extraction — not just on a logic bug.
//
// Usage:  npm run rag:test
//
// Most of these checks exist because the thing they test was once broken.
// The comments say which, so nobody "simplifies" a guard back out.

import path from 'node:path';
import { ROOT, stubFetch, makeEncoder } from './harness.mjs';
import { QUERIES } from './evalset.mjs';

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
// Case is folded before stemming, so the acronym and the lowercase word in a
// question land on the same stem ("camu") and therefore match.
check('tokenizer folds case onto the same stem',
  tokenize('CAMUS')[0] === tokenize('camus')[0], `${tokenize('CAMUS')} vs ${tokenize('camus')}`);
check('tokenizer survives empty input', tokenize('').length === 0);
check('tokenizer survives punctuation only', tokenize('!!! ... ???').length === 0);

// ── Index integrity ────────────────────────────────────────
const index = await loadIndex();
const { chunks, vectors, documentList, meta } = index;

check('index loaded chunks', chunks.length > 100, `${chunks.length}`);
check('index model matches embedder', meta.model === MODEL_ID, `${meta.model} vs ${MODEL_ID}`);
check('vector matrix matches chunk count',
  vectors.length === chunks.length * DIMS, `${vectors.length} vs ${chunks.length * DIMS}`);
check('all seven documents present', documentList.length === 7, `${documentList.length}`);
check('every chunk has a document', chunks.every((c) => index.documents.has(c.docId)));
check('every chunk has a page number', chunks.every((c) => Number.isInteger(c.page) && c.page > 0));
check('page ranges are ordered', chunks.every((c) => c.pageEnd >= c.page));
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
// Reference lists and journal furniture used to dominate results: BM25 scores
// IDF per chunk, so an author's name appearing in two "Author contributions"
// blocks looked like the rarest, most informative term in the corpus.
const corpusText = chunks.map((c) => `${c.section} ${c.text}`).join('\n').toLowerCase();
// "supplementary material" is deliberately NOT in this list: the papers refer
// to their own supplements in ordinary body sentences ("the supplementary
// material contains more details on the network"), which is real content.
for (const phrase of [
  'author contributions', 'creative commons', 'index terms', 'competing interests',
  'conflict of interest', 'all rights reserved', 'declaration of', 'acknowledgment',
]) {
  check(`back matter removed: "${phrase}"`, !corpusText.includes(phrase));
}
// Journal masthead. This block is contiguous but spread over several lines, so
// the line-at-a-time furniture rules miss it; it once rode into an Introduction
// chunk whole, ISSN and publisher and all.
for (const phrase of [
  'corresponding author', 'e-mail address', 'journal homepage', 'contents lists available',
  'published by elsevier', 'published by oxford university press',
]) {
  check(`masthead removed: "${phrase}"`, !corpusText.includes(phrase));
}
check('no reference-list headings survive',
  !chunks.some((c) => /^(references|bibliography|acknowledge?ments)$/i.test(c.section.trim())),
  chunks.filter((c) => /^(references|bibliography)/i.test(c.section.trim())).map((c) => c.section).join(','));
// A paragraph that is mostly "[12] A. Author, Title, Journal, 2019." is a
// reference list that escaped the region cut.
const citationHeavy = chunks.filter((c) => {
  const lines = c.text.split('\n').filter((l) => l.trim());
  if (lines.length < 3) return false;
  const cites = lines.filter((l) => /^\s*(\[\d+\]|\d+\.)\s+[A-Z]/.test(l)).length;
  return cites / lines.length >= 0.5;
});
check('no citation-dense chunks', citationHeavy.length === 0, `${citationHeavy.length} chunks`);
check('chunks are substantial', chunks.filter((c) => c.text.length < 120).length < chunks.length * 0.05,
  `${chunks.filter((c) => c.text.length < 120).length} short chunks`);
check('every document has a title', documentList.every((d) => d.title));
// The unpublished report and the thesis have no public URL, and the UI renders
// those titles as plain text. Pin the count so a dropped link is still noticed.
check('exactly two documents lack a public URL',
  documentList.filter((d) => !d.url).length === 2,
  documentList.filter((d) => !d.url).map((d) => d.id).join(','));

// ── Retrieval quality on the labelled set ──────────────────
const encode = await makeEncoder();

let rank1 = 0;
let inTop5 = 0;
let factFound = 0;
const misses = [];

for (const item of QUERIES) {
  const results = retrieve(index, item.q, await encode(item.q), { limit: 6 });
  if (!results.length) { misses.push(`no results: ${item.q}`); continue; }
  if (item.docs.includes(results[0].docId)) rank1 += 1;
  if (results.slice(0, 5).some((r) => item.docs.includes(r.docId))) inTop5 += 1;
  else misses.push(`gold doc not in top 5: ${item.q}`);
  if (results.some((r) => item.must.test(r.text))) factFound += 1;
  else misses.push(`fact not retrieved: ${item.q}`);
}

const n = QUERIES.length;
check('document precision@1 >= 0.80', rank1 / n >= 0.8, `${(rank1 / n).toFixed(2)}`);
check('document recall@5 == 1.00', inTop5 === n, `${(inTop5 / n).toFixed(2)}`);
check('fact present in top 6 >= 0.95', factFound / n >= 0.95, `${(factFound / n).toFixed(2)}`);

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

const unanswerable = [
  'What is the most used model in gilles work?',
  'How many papers are there in total?',
  'What is the capital of France?',
  'asdfgh qwerty zxcvb',
];
const unanswerableConfidence = [];
for (const question of unanswerable) {
  unanswerableConfidence.push(confidenceOf(retrieve(index, question, await encode(question), { limit: 6 })));
}
check('aggregate and nonsense questions are labelled weak',
  unanswerableConfidence.every((c) => c === 'weak'),
  unanswerableConfidence.join(','));
check('empty result set is "none"', confidenceOf([]) === 'none');

// ── Lexical-only fallback ──────────────────────────────────
// The page stays usable if the model download fails, so retrieve() must accept
// a null query vector rather than throwing.
const lexicalOnly = retrieve(index, 'What is the HUNT4 study?', null, { limit: 6 });
check('lexical-only returns results', lexicalOnly.length > 0);
check('lexical-only finds HUNT4', lexicalOnly.some((r) => /hunt4/i.test(r.text)));
check('lexical-only reports null similarity', lexicalOnly.every((r) => r.similarity === null));
check('lexical-only confidence is never strong',
  ['ok', 'weak'].includes(confidenceOf(lexicalOnly)), confidenceOf(lexicalOnly));

// ── Diversity, filtering, dedup ────────────────────────────
const broad = retrieve(index, 'Which datasets were used in this research?', await encode('Which datasets were used in this research?'), { limit: 6 });
check('broad question spans multiple documents',
  new Set(broad.map((r) => r.docId)).size >= 3, `${new Set(broad.map((r) => r.docId)).size} documents`);
check('no document monopolises the results',
  Math.max(...[...broad.reduce((m, r) => m.set(r.docId, (m.get(r.docId) || 0) + 1), new Map()).values()]) <= 2);

const filtered = retrieve(index, 'segmentation', await encode('segmentation'), { limit: 6, docFilter: ['gcn'] });
check('document filter is respected', filtered.every((r) => r.docId === 'gcn'));
check('document filter still returns results', filtered.length > 0);
const emptyFilter = retrieve(index, 'segmentation', await encode('segmentation'), { limit: 6, docFilter: [] });
check('empty filter means no filter', emptyFilter.length > 0 && new Set(emptyFilter.map((r) => r.docId)).size > 1);

// The arXiv preprint and the journal version of the quality paper share most
// of their text; without dedup one answer became four restatements.
const duplicated = retrieve(index, 'What is gCNR and what does it measure?', await encode('What is gCNR and what does it measure?'), { limit: 6 });
check('near-duplicates are merged, not repeated',
  !duplicated.some((r, i) => duplicated.slice(0, i).some((other) => other.text === r.text)));
check('merged duplicates are credited via alsoIn',
  duplicated.every((r) => !r.alsoIn || Array.isArray(r.alsoIn)));

check('limit is honoured', retrieve(index, 'segmentation', await encode('segmentation'), { limit: 3 }).length <= 3);
check('results are sorted by fused score',
  broad.every((r, i) => i === 0 || broad[i - 1].fusedScore >= r.fusedScore));
check('every result carries its document', broad.every((r) => r.document && r.document.title));

// ── Section boost ──────────────────────────────────────────
// Deliberately selective: it fires when the question explains most of a
// heading, and stays out of the way otherwise. Gating it on term rarity
// instead made results worse, because "research" is rare here and useless
// while "dataset" is common and is exactly what the question is about.
const datasetHit = retrieve(index, 'Which datasets were used in this research?', await encode('Which datasets were used in this research?'), { limit: 6 });
check('section boost fires on a matching heading',
  datasetHit.some((r) => r.sectionHit && /data/i.test(r.section)),
  datasetHit.map((r) => `${r.section}:${r.sectionHit}`).join(' | '));
const vagueHit = retrieve(index, 'Tell me about the work', await encode('Tell me about the work'), { limit: 6 });
check('section boost does not fire on a vague question',
  vagueHit.filter((r) => r.sectionHit).length <= 1,
  vagueHit.filter((r) => r.sectionHit).map((r) => r.section).join(' | '));

// ── Passage selection, highlighting, citations ─────────────
const sample = broad[0];
const passage = bestPassage(sample, 'Which datasets were used in this research?');
check('bestPassage returns text', passage.text.length > 0);
check('bestPassage respects its budget', passage.text.length <= 420 + 161, `${passage.text.length}`);
check('bestPassage text comes from the chunk',
  sample.text.includes(passage.text.replace(/…$/, '').trim().slice(0, 40)));
check('bestPassage flags truncation', typeof passage.truncatedStart === 'boolean');
const tiny = bestPassage({ text: 'One short sentence.' }, 'sentence');
check('bestPassage handles a one-sentence chunk', tiny.text === 'One short sentence.');

const runs = highlight('The CAMUS dataset was used for training.', 'Which datasets were used?');
check('highlight marks query terms', runs.some((r) => r.highlight && /dataset/i.test(r.text)));
check('highlight leaves other text alone', runs.some((r) => !r.highlight));
check('highlight is lossless',
  runs.map((r) => r.text).join('') === 'The CAMUS dataset was used for training.');
check('highlight with no usable terms returns one run',
  highlight('Some text here.', 'a an the').length === 1);
check('highlight ignores very short terms',
  !highlight('We do it.', 'do').some((r) => r.highlight));

check('citation formats a single page', /p\. \d+/.test(formatCitation({ page: 4, pageEnd: 4, document: { title: 'T' } })));
check('citation formats a page range', /pp\. 4-6/.test(formatCitation({ page: 4, pageEnd: 6, document: { title: 'T' } })));
check('citation falls back to the id', /fallback/.test(formatCitation({ page: 1, pageEnd: 1, docId: 'fallback' })));

// ── Degenerate queries ─────────────────────────────────────
check('empty query does not throw', Array.isArray(retrieve(index, '', null, { limit: 6 })));
check('stopword-only query does not throw', Array.isArray(retrieve(index, 'the and of', null, { limit: 6 })));
check('punctuation query does not throw', Array.isArray(retrieve(index, '???', null, { limit: 6 })));
const longQuery = 'segmentation '.repeat(400);
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
