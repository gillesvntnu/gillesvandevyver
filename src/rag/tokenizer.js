// Shared tokenizer for the lexical half of the retriever.
//
// Domain terms in this corpus are full of internal punctuation and casing
// ("V-brake", "e-bike", "700c", "29er", "650b", "11-speed"). A naive \w+ split
// destroys exactly the terms that carry the most signal, so hyphenated and
// alphanumeric compounds are kept whole *and* also emitted as their parts,
// letting a query for "ebike", "e-bike" or "bike" all find the same chunk.

const STOPWORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'may', 'me', 'might', 'more', 'most',
  'much', 'must', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'to', 'use', 'used', 'using', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would',
  'you', 'your',
]);

// Light suffix stripping. A real stemmer is overkill for 400 chunks and tends
// to mangle domain vocabulary, so this only folds the endings that actually
// cause misses in practice.
function stem(token) {
  if (token.length <= 4) return token;
  for (const suffix of ['ations', 'ation', 'ingly', 'ings', 'ing', 'edly', 'ies', 'ied', 'es', 'ed', 's']) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      let base = token.slice(0, token.length - suffix.length);
      if (suffix === 'ies' || suffix === 'ied') base += 'y';
      return base;
    }
  }
  return token;
}

// Unicode decomposition handles accents that are a letter plus a combining
// mark ("å" -> "a" + U+030A), but Nordic and Central European alphabets have
// letters that are atomic and survive NFD untouched. Without this table
// "Måsøy" tokenizes to "mas", which loses half the name — and this corpus is
// full of Norwegian authors and place names.
const LETTER_FOLDS = [
  [/ø/g, 'o'], [/æ/g, 'ae'], [/œ/g, 'oe'], [/ß/g, 'ss'],
  [/đ/g, 'd'], [/ð/g, 'd'], [/þ/g, 'th'], [/ł/g, 'l'], [/ı/g, 'i'],
];

export function tokenize(text, { keepStopwords = false } = {}) {
  let lowered = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // "måsøy" -> "masøy"
  for (const [pattern, replacement] of LETTER_FOLDS) {
    lowered = lowered.replace(pattern, replacement); // "masøy" -> "masoy"
  }

  const raw = lowered.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) || [];
  const tokens = [];

  for (const term of raw) {
    if (!keepStopwords && STOPWORDS.has(term)) continue;
    if (term.length < 2 && !/\d/.test(term)) continue;

    tokens.push(stem(term));

    if (term.includes('-') || term.includes("'")) {
      // "nnu-net" also indexes as "nnunet", "nnu" and "net".
      const glued = term.replace(/[-']/g, '');
      if (glued.length >= 2) tokens.push(glued);
      for (const part of term.split(/[-']/)) {
        if (part.length >= 2 && !STOPWORDS.has(part)) tokens.push(stem(part));
      }
    }
  }
  return tokens;
}

export { STOPWORDS };
