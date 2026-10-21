// Shared setup for the retrieval tests: serve public/rag/ to the browser code
// over a stubbed fetch, and encode queries with the same model and prefix the
// browser uses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@xenova/transformers';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const RAG_DIR = path.join(ROOT, 'public', 'rag');

env.allowLocalModels = false;

/**
 * retriever.js fetches its index from a URL. Point that at the built files on
 * disk so the test reads exactly the bytes the site will serve.
 */
export function stubFetch() {
  globalThis.fetch = async (url) => {
    const file = path.join(RAG_DIR, path.basename(String(url)));
    if (!fs.existsSync(file)) return { ok: false };
    const buffer = fs.readFileSync(file);
    return {
      ok: true,
      json: async () => JSON.parse(buffer.toString('utf8')),
      arrayBuffer: async () => buffer.buffer.slice(
        buffer.byteOffset, buffer.byteOffset + buffer.byteLength,
      ),
    };
  };
}

/**
 * Builds a query encoder equivalent to the browser's. Deliberately reads
 * MODEL_ID and QUERY_PREFIX from the shipped module rather than restating
 * them, so a model swap that forgets one of the two files fails here.
 */
export async function makeEncoder() {
  const { MODEL_ID, QUERY_PREFIX } = await import(path.join(ROOT, 'src/rag/embedder.js'));
  const extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
  return async (text) => {
    const output = await extractor(QUERY_PREFIX + text, { pooling: 'mean', normalize: true });
    return Float32Array.from(output.data);
  };
}
