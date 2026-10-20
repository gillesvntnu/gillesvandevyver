// Query encoder: all-MiniLM-L6-v2 running in the visitor's browser.
//
// The chunk vectors are precomputed at build time by scripts/build_rag_embeddings.mjs
// with this exact model and quantisation, so the only thing that has to run
// client-side is encoding the question.
//
// transformers.js is pulled from a CDN rather than bundled. Bundling it into
// create-react-app means fighting webpack over the node-only `sharp` and
// `onnxruntime-node` imports, which cannot be configured away without ejecting.
// Loading it on demand also keeps it out of the main bundle entirely: visitors
// who never open this page never pay for it.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const DIMS = 384;

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

    const encode = async (text) => {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
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
