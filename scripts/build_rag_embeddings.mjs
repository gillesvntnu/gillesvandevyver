/**
 * Step 2 of the RAG index build: text chunks -> sentence embeddings.
 *
 * Embeds every chunk with the same model the browser uses for the query
 * (Xenova/e5-small-v2, int8-quantised ONNX), so index vectors and query
 * vectors live in exactly the same space.  Vectors are themselves quantised to
 * int8 before being written, which cuts the payload ~4x at a negligible cost
 * in ranking quality (the vectors are unit-norm, so every component is in
 * [-1, 1] and maps cleanly onto [-127, 127]).
 *
 * Outputs, both into public/rag/:
 *   corpus.json     document metadata + chunk text/page/section
 *   embeddings.bin  nChunks x 384 int8 matrix, row-major
 *
 * Usage:  node scripts/build_rag_embeddings.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@xenova/transformers';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHUNKS_PATH = path.join(ROOT, 'scripts', 'rag_chunks.json');
const OUT_DIR = path.join(ROOT, 'public', 'rag');

// Must match MODEL_ID in src/rag/embedder.js. The corpus records the model it
// was built with and the retriever refuses to run against a mismatch, so a
// stale index fails loudly instead of quietly returning nonsense.
export const MODEL_ID = 'Xenova/e5-small-v2';
export const DIMS = 384;

/** e5 is asymmetric. Counterpart of QUERY_PREFIX in src/rag/embedder.js. */
const PASSAGE_PREFIX = 'passage: ';

env.allowLocalModels = false;

/** Mirror of the browser-side text preparation. Keep the two in sync. */
function embedText(chunk, docTitle) {
  const section = chunk.section ? `${chunk.section}. ` : '';
  return `${PASSAGE_PREFIX}${docTitle}. ${section}${chunk.text}`;
}

async function main() {
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error('Run `python3 scripts/build_rag_chunks.py` first.');
    process.exit(1);
  }
  const { documents, chunks, attribution } = JSON.parse(fs.readFileSync(CHUNKS_PATH, 'utf8'));
  const titleById = Object.fromEntries(documents.map((d) => [d.id, d.title]));

  console.log(`Loading ${MODEL_ID} ...`);
  const extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });

  const matrix = new Int8Array(chunks.length * DIMS);
  const batchSize = 16;
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const texts = batch.map((c) => embedText(c, titleById[c.doc] ?? ''));
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = output.data;
    for (let i = 0; i < batch.length; i += 1) {
      for (let d = 0; d < DIMS; d += 1) {
        const v = data[i * DIMS + d];
        matrix[(start + i) * DIMS + d] = Math.max(-127, Math.min(127, Math.round(v * 127)));
      }
    }
    process.stdout.write(`\r  embedded ${Math.min(start + batchSize, chunks.length)}/${chunks.length}`);
  }
  process.stdout.write('\n');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'embeddings.bin'), Buffer.from(matrix.buffer));

  // Strip the fields the browser does not need, keep the payload lean.
  // PDF chunks carry page numbers; web-article chunks carry a part ordinal and
  // a heading anchor instead. Both are emitted so one index format serves both
  // corpora, and the reader treats whichever is absent as absent rather than
  // printing "p. undefined".
  const corpus = {
    model: MODEL_ID,
    dims: DIMS,
    builtAt: new Date().toISOString().slice(0, 10),
    attribution: attribution ?? undefined,
    documents: documents.map(({ chunks: _c, ...rest }) => rest),
    chunks: chunks.map((c) => ({
      d: c.doc,
      p: c.page,
      e: c.page !== undefined && c.pageEnd !== c.page ? c.pageEnd : undefined,
      n: c.part,
      a: c.anchor || undefined,
      s: c.section || undefined,
      t: c.text,
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'corpus.json'), JSON.stringify(corpus));

  const kb = (f) => (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0);
  console.log(`\n  public/rag/corpus.json     ${kb('corpus.json')} kB`);
  console.log(`  public/rag/embeddings.bin  ${kb('embeddings.bin')} kB`);
  console.log(`  ${chunks.length} chunks across ${documents.length} documents`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
