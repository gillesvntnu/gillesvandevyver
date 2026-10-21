// Lets plain Node run the retrieval modules out of src/ unchanged.
//
// Two things stop `node scripts/rag_test/run.mjs` from importing src/rag/*.js
// directly, and both are artefacts of the bundler rather than of the code:
//
//   1. The sources use extensionless specifiers ("./bm25"), which webpack
//      resolves and Node does not.
//   2. package.json has no "type": "module", so Node reads every .js file as
//      CommonJS and chokes on the `export` keyword.
//
// Rewriting the imports to satisfy Node would mean the tests exercise a
// different file from the one the site ships. Teaching Node to read them
// the way webpack does keeps the test honest.

const RAG_SOURCE = '/src/rag/';

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && !/\.[a-z0-9]+$/i.test(specifier)) {
    return next(`${specifier}.js`, context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.includes(RAG_SOURCE)) {
    return next(url, { ...context, format: 'module' });
  }
  return next(url, context);
}
