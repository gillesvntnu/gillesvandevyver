// The retrieval half of the RAG demo: loads the prebuilt index and ranks
// chunks against a question using BM25, cosine similarity, or both.

import { BM25Index } from './bm25';
import { tokenize } from './tokenizer';
import { DIMS } from './embedder';

const RRF_K = 60;           // reciprocal-rank-fusion damping constant
const DUPLICATE_THRESHOLD = 0.55; // trigram Jaccard above which two chunks are "the same"

const asset = (file) => `${process.env.PUBLIC_URL || ''}/rag/${file}`;

/** Loads corpus.json + embeddings.bin and builds the lexical index. */
export async function loadIndex() {
  const [corpusResponse, vectorResponse] = await Promise.all([
    fetch(asset('corpus.json')),
    fetch(asset('embeddings.bin')),
  ]);
  if (!corpusResponse.ok || !vectorResponse.ok) {
    throw new Error('Could not load the search index.');
  }

  const corpus = await corpusResponse.json();
  const vectors = new Int8Array(await vectorResponse.arrayBuffer());

  const documents = new Map(corpus.documents.map((doc) => [doc.id, doc]));
  const chunks = corpus.chunks.map((chunk, index) => ({
    index,
    docId: chunk.d,
    page: chunk.p,
    pageEnd: chunk.e || chunk.p,
    section: chunk.s || '',
    text: chunk.t,
  }));

  const bm25 = new BM25Index(
    chunks.map((chunk) => {
      const title = documents.get(chunk.docId)?.title || '';
      return `${title}. ${chunk.section}. ${chunk.text}`;
    }),
  );

  return {
    meta: { model: corpus.model, builtAt: corpus.builtAt, dims: corpus.dims || DIMS },
    documents,
    documentList: corpus.documents,
    chunks,
    vectors,
    bm25,
  };
}

function cosineScores(vectors, query, count, dims) {
  const scores = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let dot = 0;
    const offset = i * dims;
    for (let d = 0; d < dims; d += 1) dot += query[d] * vectors[offset + d];
    scores[i] = dot / 127; // undo the int8 scaling applied at build time
  }
  return scores;
}

function topRanks(scores, limit) {
  const ranked = [];
  for (let i = 0; i < scores.length; i += 1) {
    if (scores[i] > 0) ranked.push([scores[i], i]);
  }
  ranked.sort((a, b) => b[0] - a[0]);
  return ranked.slice(0, limit);
}

function trigrams(text) {
  const normalised = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i + 3 <= normalised.length; i += 1) set.add(normalised.slice(i, i + 3));
  return set;
}

function jaccard(a, b) {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

/**
 * Ranks chunks for a question.
 *
 * Lexical and semantic rankings are combined with reciprocal rank fusion
 * rather than a weighted sum of raw scores: BM25 scores are unbounded and
 * corpus-dependent while cosine scores sit in [-1, 1], so blending the two
 * directly would need constant re-tuning. RRF only looks at positions.
 *
 * @param {object} index          result of loadIndex()
 * @param {string} question
 * @param {Float32Array|null} queryVector  null falls back to lexical-only
 * @param {{limit?: number, docFilter?: string[]}} options
 */
export function retrieve(index, question, queryVector, options = {}) {
  const { limit = 6, docFilter = null } = options;
  const { chunks, vectors, bm25, documents, meta } = index;

  const allowed = docFilter && docFilter.length
    ? new Set(docFilter)
    : null;

  const lexical = bm25.score(question);
  const pool = Math.min(chunks.length, 60);
  const lexicalRanks = topRanks(lexical, pool);

  const fused = new Map(); // chunk index -> { score, lexicalRank, semanticRank }
  const add = (chunkIndex, rank, key, weight) => {
    let entry = fused.get(chunkIndex);
    if (!entry) {
      entry = { score: 0, lexicalRank: null, semanticRank: null };
      fused.set(chunkIndex, entry);
    }
    entry.score += weight / (RRF_K + rank + 1);
    entry[key] = rank + 1;
  };

  lexicalRanks.forEach(([, chunkIndex], rank) => add(chunkIndex, rank, 'lexicalRank', 1));

  let semanticScores = null;
  if (queryVector) {
    semanticScores = cosineScores(vectors, queryVector, chunks.length, meta.dims);
    topRanks(semanticScores, pool).forEach(([, chunkIndex], rank) => add(chunkIndex, rank, 'semanticRank', 1));
  }

  const candidates = [...fused.entries()]
    .map(([chunkIndex, entry]) => ({
      ...chunks[chunkIndex],
      document: documents.get(chunks[chunkIndex].docId),
      fusedScore: entry.score,
      lexicalRank: entry.lexicalRank,
      semanticRank: entry.semanticRank,
      similarity: semanticScores ? semanticScores[chunkIndex] : null,
      lexicalScore: lexical[chunkIndex],
    }))
    .filter((candidate) => !allowed || allowed.has(candidate.docId))
    .sort((a, b) => b.fusedScore - a.fusedScore);

  // Drop near-duplicates. The arXiv preprint and the published version of the
  // regional-quality paper share most of their text, so without this step a
  // single answer can be four restatements of one paragraph.
  const selected = [];
  const fingerprints = [];
  for (const candidate of candidates) {
    const fingerprint = trigrams(candidate.text);
    const duplicateOf = fingerprints.findIndex((other) => jaccard(fingerprint, other) > DUPLICATE_THRESHOLD);
    if (duplicateOf !== -1) {
      selected[duplicateOf].alsoIn = selected[duplicateOf].alsoIn || [];
      if (!selected[duplicateOf].alsoIn.some((d) => d.id === candidate.document?.id)) {
        selected[duplicateOf].alsoIn.push(candidate.document);
      }
      continue;
    }
    fingerprints.push(fingerprint);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  return selected;
}

/**
 * Picks the sentences inside a chunk that best answer the question, so the
 * no-API-key mode can show a tight excerpt instead of the whole chunk.
 */
export function bestPassage(chunk, question, maxChars = 420) {
  const queryTerms = new Set(tokenize(question));
  const sentences = chunk.text.match(/[^.!?]+[.!?]*/g) || [chunk.text];

  const scored = sentences.map((sentence, position) => {
    const terms = tokenize(sentence);
    const hits = terms.filter((term) => queryTerms.has(term)).length;
    return { sentence: sentence.trim(), position, density: hits / Math.max(terms.length, 1), hits };
  });

  let best = scored[0];
  for (const candidate of scored) {
    if (candidate.hits > (best.hits || 0)
      || (candidate.hits === best.hits && candidate.density > best.density)) {
      best = candidate;
    }
  }

  // Grow outwards from the best sentence until the budget is used up.
  let start = best.position;
  let end = best.position;
  let text = sentences[best.position].trim();
  while (text.length < maxChars && (start > 0 || end < sentences.length - 1)) {
    const takeNext = end < sentences.length - 1
      && (start === 0 || sentences[end + 1].length <= sentences[start - 1].length);
    if (takeNext) {
      end += 1;
      text = `${text} ${sentences[end].trim()}`;
    } else if (start > 0) {
      start -= 1;
      text = `${sentences[start].trim()} ${text}`;
    } else {
      break;
    }
  }

  return {
    text: text.length > maxChars + 160 ? `${text.slice(0, maxChars + 160).trim()}…` : text,
    truncatedStart: start > 0,
    truncatedEnd: end < sentences.length - 1,
  };
}

/** Splits text into [{ text, highlight }] runs for rendering. */
export function highlight(text, question) {
  const terms = [...new Set(tokenize(question))].filter((term) => term.length > 2);
  if (!terms.length) return [{ text, highlight: false }];

  const words = text.split(/(\s+)/);
  const runs = [];
  for (const word of words) {
    const bare = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const isMatch = bare.length > 2
      && terms.some((term) => bare === term || bare.startsWith(term) || term.startsWith(bare));
    const previous = runs[runs.length - 1];
    if (previous && previous.highlight === isMatch) previous.text += word;
    else runs.push({ text: word, highlight: isMatch });
  }
  return runs;
}

export function formatCitation(chunk) {
  const pages = chunk.pageEnd > chunk.page ? `pp. ${chunk.page}-${chunk.pageEnd}` : `p. ${chunk.page}`;
  return `${chunk.document?.title || chunk.docId}, ${pages}`;
}
