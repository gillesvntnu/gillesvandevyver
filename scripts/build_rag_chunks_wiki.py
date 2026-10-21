"""Chunk the cached Wikipedia cycling corpus into retrieval passages.

Sibling of build_rag_chunks.py, not a replacement for it: that one still builds
the research corpus from PDFs, and keeping both means switching corpora is a
config change rather than an archaeology exercise.

The two differ in where the furniture problem lives. A journal PDF needs
mastheads, running headers and reference lists cut out with regexes because the
text arrives as undifferentiated page dumps. A Wikipedia extract arrives free of
infoboxes, navboxes, citation markers and image captions, but brings two
problems of its own: back matter as named sections, removed by name below, and
mathematics, which arrives rendered twice and is removed by strip_math.

Usage:  python3 scripts/build_rag_chunks_wiki.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / "wikipedia_cache" / "cycling.json"
OUT_PATH = ROOT / "rag_chunks.json"

TARGET_CHARS = 1100   # aim for chunks of roughly this size
MAX_CHARS = 1600      # hard ceiling before a paragraph is split mid-sentence
OVERLAP_CHARS = 220   # tail of each chunk repeated at the head of the next
MIN_CHARS = 260       # chunks shorter than this are dropped

# Sections that are apparatus rather than explanation. Same reasoning as the
# PDF pipeline's back matter: all proper nouns, no prose, and BM25 reads a name
# that appears only in a reference list as the rarest term in the corpus.
BACK_MATTER_SECTION = re.compile(
    r"^(references?|notes?|citations?|sources?|bibliography|further reading|"
    r"external links?|see also|footnotes?|general and cited references|"
    r"works cited|literature|gallery|media|image gallery)$",
    re.IGNORECASE,
)

# Section headings in a plaintext extract: "== Title ==", "=== Sub ===".
HEADING = re.compile(r"^(={2,6})\s*(.+?)\s*\1$")


# TeX commands worth keeping as words. A question is asked in prose ("how does
# air density affect drag"), so a formula earns its place in the index only
# through the vocabulary it shares with such a question: Greek letter names and
# function names. Everything else in a formula is markup.
TEX_WORDS = {
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma", "tau",
    "upsilon", "phi", "chi", "psi", "omega", "Gamma", "Delta", "Theta",
    "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega",
    "sin", "cos", "tan", "arctan", "log", "ln", "exp", "sqrt", "sum", "int",
    "max", "min", "approx", "propto",
}

# A fallback fragment is a line holding a single space-free token: "R", "w",
# ")", but also "tanh", "arctanh" and "displaystyle" - the fallback splits
# function names onto their own lines too. The first version of this capped the
# token at three characters, which stopped the walk dead at "arctanh" and left
# the whole formula before it in place, so the limit is what the longest
# function name needs rather than what a symbol needs.
#
# Allowing no whitespace at all is what keeps this safe: prose lines have
# spaces, and so does every section heading ("== Trail ==" and even "=== Rim
# brakes ==="), so the walk cannot cross a paragraph or a heading.
FRAGMENT = re.compile(r"^\S{0,12}$")

# Below this, a formula is a variable mentioned mid-sentence ("where R_w is
# wheel radius") and has to stay or the sentence loses its subject. Above it,
# the formula is displayed on its own line and the surrounding prose already
# says what it means, so it goes.
INLINE_MAX = 32


def _brace_end(text: str, start: int) -> int:
    """Index just past the brace group opening at text[start]."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    return -1


def tex_to_plain(tex: str) -> str:
    """Compact plain-text rendering of a TeX fragment."""
    s = re.sub(r"_\{([^{}]*)\}", r"_\1", tex)
    s = re.sub(r"\^\{([^{}]*)\}", r"^\1", s)
    s = re.sub(r"\\(?:cdot|times)\b", "*", s)
    s = re.sub(r"\\over\b", "/", s)
    s = re.sub(r"\\([a-zA-Z]+)",
               lambda m: f" {m.group(1)} " if m.group(1) in TEX_WORDS else " ", s)
    s = s.replace("{", " ").replace("}", " ").replace("\\", " ")
    return re.sub(r"\s+", " ", s).strip()


def strip_math(text: str) -> str:
    """Collapse each formula from two renderings down to at most one.

    explaintext emits every formula twice: first the MathML fallback, as a run
    of lines carrying one symbol each, then the raw TeX in {\\displaystyle ...}.
    Left alone, the first becomes "| - 6 pi eta r v |" soup once the chunker
    joins lines into paragraphs, and the second contributes "displaystyle",
    "frac" and "mathrm" - terms that occur nowhere else, which is precisely what
    BM25 scores as the most discriminating evidence in the corpus. Both
    renderings are therefore replaced by one compact inline form, or by nothing
    when the formula was displayed rather than inline.
    """
    out = text
    while True:
        i = out.find("{\\displaystyle")
        if i == -1:
            break
        end = _brace_end(out, i)
        if end == -1:
            # Unbalanced braces: drop the marker alone rather than run off the
            # end of the article.
            out = out[:i] + out[i + len("{\\displaystyle"):]
            continue
        plain = tex_to_plain(out[i + len("{\\displaystyle"):end - 1])

        lines = out[:i].split("\n")
        cut = len(lines)
        while cut > 0 and FRAGMENT.match(lines[cut - 1].strip()):
            cut -= 1

        replacement = f" {plain} " if len(plain) <= INLINE_MAX else " "
        out = "\n".join(lines[:cut]) + replacement + out[end:]
    return out


def clean(text: str) -> str:
    # Non-breaking spaces and thin spaces survive the extract and split tokens.
    text = text.replace("\u00a0", " ").replace("\u2009", " ").replace("\u202f", " ")
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    # Extracts occasionally leave bare "\n\n\n" runs where a template was cut.
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def split_long(text: str):
    """Split an over-long paragraph on sentence boundaries."""
    if len(text) <= MAX_CHARS:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out, cur = [], ""
    for sentence in sentences:
        if cur and len(cur) + len(sentence) + 1 > TARGET_CHARS:
            out.append(cur.strip())
            cur = sentence
        else:
            cur = f"{cur} {sentence}".strip()
    if cur:
        out.append(cur.strip())
    return out


def sectioned_paragraphs(extract: str):
    """Walk the extract, yielding (section_path, paragraph).

    Subsection headings are joined to their parent ("Brakes > Rim brakes") so a
    chunk labelled "Rim brakes" still carries the context that makes the label
    mean something when it appears alone under a search result.
    """
    stack = []
    skipping = False
    for block in extract.split("\n"):
        line = clean(block)
        if not line:
            continue

        match = HEADING.match(line)
        if match:
            depth = len(match.group(1)) - 2   # "==" is depth 0
            title = match.group(2).strip()
            stack = stack[:depth]
            stack.append(title)
            # A back-matter heading kills itself and everything nested under it,
            # which is how "References > Cited works" disappears as a unit.
            skipping = BACK_MATTER_SECTION.match(title) is not None
            continue

        if skipping:
            continue
        # Leading-section paragraphs have no heading at all.
        yield (" > ".join(stack) if stack else "", line)


def anchor_for(section: str) -> str:
    """Wikipedia fragment for the deepest heading in a section path."""
    if not section:
        return ""
    leaf = section.split(" > ")[-1]
    return leaf.replace(" ", "_")


def chunk_article(article, index):
    # Math goes before the line walk, not after: the fallback rendering is one
    # symbol per line, so once sectioned_paragraphs has joined lines there is no
    # longer anything to tell a symbol from a word.
    units = list(sectioned_paragraphs(strip_math(article["text"])))

    chunks = []
    cur_text, cur_section = "", None
    for section, paragraph in units:
        for piece in split_long(paragraph):
            if cur_text and len(cur_text) + len(piece) + 1 > TARGET_CHARS:
                chunks.append((cur_text.strip(), cur_section or ""))
                tail = cur_text[-OVERLAP_CHARS:]
                tail = tail[tail.find(" ") + 1:] if " " in tail else ""
                cur_text = f"{tail} {piece}".strip()
                cur_section = section
            else:
                cur_text = f"{cur_text} {piece}".strip()
                if cur_section is None:
                    cur_section = section
    if cur_text.strip():
        chunks.append((cur_text.strip(), cur_section or ""))

    # Numbered after the short-chunk filter, not before it. Numbering first
    # leaves gaps wherever a chunk was dropped, and since "part" is the locator
    # a citation prints, a gap means the eighth passage of an article is cited
    # as its ninth.
    kept = [(t, s) for t, s in chunks if len(t) >= MIN_CHARS]

    out = []
    for i, (text, section) in enumerate(kept):
        out.append({
            "id": f"{index}#{i}",
            "doc": index,
            # No pages in a web article. "part" is the ordinal of the passage
            # within its article, which is what page was really being used for:
            # a stable position for ordering and for citation text.
            "part": i + 1,
            "section": section,
            "anchor": anchor_for(section),
            "text": text,
        })
    return out


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "article"


def main():
    if not CACHE.exists():
        raise SystemExit(
            f"No cache at {CACHE}. Run scripts/fetch_wikipedia_cycling.py first."
        )
    snapshot = json.loads(CACHE.read_text())

    documents, chunks = [], []
    used = set()
    for article in snapshot["articles"]:
        index = slugify(article["title"])
        while index in used:
            index += "-x"
        used.add(index)

        article_chunks = chunk_article(article, index)
        if not article_chunks:
            continue
        chunks.extend(article_chunks)
        documents.append({
            "id": index,
            "title": article["title"],
            "authors": "Wikipedia contributors",
            "venue": "Wikipedia",
            "year": int(snapshot["fetched"][:4]),
            "kind": "encyclopedia article",
            "url": article["url"],
            "topics": [],
            "chunks": len(article_chunks),
        })

    payload = {
        "documents": documents,
        "chunks": chunks,
        "attribution": {
            "source": snapshot["source"],
            "license": snapshot["license"],
            "fetched": snapshot["fetched"],
        },
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False))

    total = sum(len(c["text"]) for c in chunks)
    biggest = sorted(documents, key=lambda d: -d["chunks"])[:5]
    for doc in biggest:
        print(f"  {doc['id']:<34} {doc['chunks']:>4} chunks")
    print(f"\n  {len(documents)} articles, {len(chunks)} chunks, "
          f"{total / 1000:.0f} kB of text -> {OUT_PATH}")


if __name__ == "__main__":
    main()
