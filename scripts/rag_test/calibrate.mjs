// Prints the top-1 cosine distribution for answerable vs unanswerable
// questions, which is the evidence the thresholds in confidenceOf() are set
// from. Re-run this after any model change; the thresholds are not portable
// between encoders.
//
// Usage: node --import ./scripts/rag_test/register.mjs scripts/rag_test/calibrate.mjs

import path from 'node:path';
import { ROOT, stubFetch, makeEncoder } from './harness.mjs';
// Both sides of the distribution come from evalset.mjs rather than being
// restated here, so the queries the floor is measured against are the same ones
// the regression suite scores.
import { QUERIES, UNANSWERABLE } from './evalset.mjs';

stubFetch();
const { loadIndex, retrieve } = await import(path.join(ROOT, 'src/rag/retriever.js'));

const encode = await makeEncoder();
const index = await loadIndex();

async function topSimilarities(questions) {
  const rows = [];
  for (const question of questions) {
    const results = retrieve(index, question, await encode(question), { limit: 6 });
    rows.push({
      question,
      top: results.length ? results[0].similarity : 0,
      tail: results.length ? results[results.length - 1].similarity : 0,
    });
  }
  return rows;
}

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const good = await topSimilarities(QUERIES.map((item) => item.q));
const bad = await topSimilarities(UNANSWERABLE);

for (const [label, rows] of [['ANSWERABLE', good], ['UNANSWERABLE', bad]]) {
  console.log(`\n${label}`);
  for (const row of rows.sort((a, b) => a.top - b.top)) {
    console.log(`  top=${row.top.toFixed(3)} spread=${(row.top - row.tail).toFixed(3)}  ${row.question}`);
  }
  const tops = rows.map((r) => r.top);
  console.log(`  min=${Math.min(...tops).toFixed(3)} p10=${quantile(tops, 0.1).toFixed(3)} `
    + `median=${quantile(tops, 0.5).toFixed(3)} max=${Math.max(...tops).toFixed(3)}`);
}
