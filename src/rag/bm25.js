// Okapi BM25 over the chunk texts, built client-side.
//
// The index is small enough (a few hundred chunks) that building the inverted
// index in the browser takes a couple of milliseconds, which is cheaper than
// shipping a prebuilt one and keeps the static payload to just the text.

import { tokenize } from './tokenizer';

const K1 = 1.2; // term-frequency saturation
const B = 0.75; // length normalisation

export class BM25Index {
  constructor(documents) {
    this.length = documents.length;
    this.postings = new Map(); // term -> [[docIndex, termFreq], ...]
    this.docLengths = new Float32Array(documents.length);

    let totalLength = 0;
    documents.forEach((text, docIndex) => {
      const tokens = tokenize(text);
      this.docLengths[docIndex] = tokens.length;
      totalLength += tokens.length;

      const counts = new Map();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      for (const [term, freq] of counts) {
        let list = this.postings.get(term);
        if (!list) {
          list = [];
          this.postings.set(term, list);
        }
        list.push([docIndex, freq]);
      }
    });

    this.averageLength = totalLength / Math.max(documents.length, 1) || 1;
  }

  /** @returns {Float32Array} one BM25 score per document. */
  score(query) {
    const scores = new Float32Array(this.length);
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return scores;

    const queryCounts = new Map();
    for (const token of queryTokens) queryCounts.set(token, (queryCounts.get(token) || 0) + 1);

    for (const [term, queryFreq] of queryCounts) {
      const postings = this.postings.get(term);
      if (!postings) continue;

      const idf = Math.log(
        1 + (this.length - postings.length + 0.5) / (postings.length + 0.5),
      );

      for (const [docIndex, freq] of postings) {
        const norm = 1 - B + (B * this.docLengths[docIndex]) / this.averageLength;
        scores[docIndex] += idf * queryFreq * ((freq * (K1 + 1)) / (freq + K1 * norm));
      }
    }
    return scores;
  }

  /** Query terms that actually exist in the corpus, for highlighting. */
  matchedTerms(query) {
    return [...new Set(tokenize(query))].filter((term) => this.postings.has(term));
  }

  /**
   * Fraction of chunks containing a term. Every corpus about one subject has a
   * word for that subject which is near-universal and carries almost no signal
   * even though it is not a stopword in general English; here it is "bicycle",
   * in 62% of chunks. The caller decides what to do about that - see
   * UBIQUITOUS_TERM_DF in retriever.js - because what counts as ubiquitous is a
   * property of the corpus, not of BM25.
   */
  documentFrequency(term) {
    const postings = this.postings.get(term);
    return postings ? postings.length / Math.max(this.length, 1) : 0;
  }
}
