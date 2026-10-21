// Query encoder: e5-small-v2 running in the visitor's browser.
//
// The chunk vectors are precomputed at build time by scripts/build_rag_embeddings.mjs
// with this exact model and quantisation, so the only thing that has to run
// client-side is encoding the question.
//
// The model is chosen by measurement, not reputation. On a 26-query labelled
// set drawn from this corpus, semantic-only (BM25 disabled, so a weak encoder
// cannot hide behind keyword overlap), scoring the reciprocal rank of the first
// passage that both comes from a correct document and states the fact:
//
//     e5-small-v2                MRR 0.962    P@1 0.96
//     bge-small-en-v1.5          MRR 0.924    P@1 0.92
//     gte-small                  MRR 0.894    P@1 0.92
//     bge-base-en-v1.5 (768d)    MRR 0.891    P@1 0.85
//     multi-qa-MiniLM-L6-cos-v1  MRR 0.835    P@1 0.92
//     all-MiniLM-L6-v2           MRR 0.827    P@1 0.85   <- what this used to be
//
// e5 also spreads hits away from near-misses far more widely (mean top-1 cosine
// 0.87 against MiniLM's 0.46), which is what makes the confidence thresholds in
// retriever.js mean anything. The cost is an 11 MB larger download, once, then
// served from the browser cache.
//
// e5 is an asymmetric model: it was trained with "query: " on questions and
// "passage: " on documents, and it loses most of its advantage without them.
// QUERY_PREFIX is applied here; PASSAGE_PREFIX is applied by the build script.
// The two must stay in step, so retriever.js refuses to run if the model that
// built the index is not the model named below.
//
// transformers.js is pulled from a CDN rather than bundled. Bundling it into
// create-react-app means fighting webpack over the node-only `sharp` and
// `onnxruntime-node` imports, which cannot be configured away without ejecting.
// Loading it on demand also keeps it out of the main bundle entirely: visitors
// who never open this page never pay for it.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
export const MODEL_ID = 'Xenova/e5-small-v2';
export const DIMS = 384;

/** Keep in sync with PASSAGE_PREFIX in scripts/build_rag_embeddings.mjs. */
export const QUERY_PREFIX = 'query: ';

let loadPromise = null;

/**
 * Loads the model once and caches the promise.
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<(text: string) => Promise<Float32Array>>}
 */
export function loadEmbedder(onProgress) {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.('Fetching the embedding model…');

    // The webpackIgnore comment leaves this as a native dynamic import so the
    // bundler does not try to resolve the remote URL at build time.
    const transformers = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

    transformers.env.allowLocalModels = false;
    transformers.env.useBrowserCache = true;

    let lastPercent = -1;
    const extractor = await transformers.pipeline('feature-extraction', MODEL_ID, {
      quantized: true,
      progress_callback: (event) => {
        if (event.status === 'progress' && typeof event.progress === 'number') {
          const percent = Math.round(event.progress);
          if (percent !== lastPercent && percent % 5 === 0) {
            lastPercent = percent;
            onProgress?.(`Downloading the embedding model… ${percent}%`);
          }
        } else if (event.status === 'ready') {
          onProgress?.('Warming up…');
        }
      },
    });

    // Callers pass a bare question; the asymmetric prefix is added here so no
    // call site can forget it.
    const encode = async (text) => {
      const output = await extractor(QUERY_PREFIX + text, { pooling: 'mean', normalize: true });
      return Float32Array.from(output.data);
    };

    await encode('warm up'); // first inference compiles the wasm kernels
    onProgress?.('ready');
    return encode;
  })();

  loadPromise.catch(() => {
    loadPromise = null; // allow a retry after a network failure
  });

  return loadPromise;
}

export { TRANSFORMERS_URL };
