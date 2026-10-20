#!/usr/bin/env python3
"""Step 1 of the RAG index build: PDF -> cleaned, page-tagged text chunks.

Reads every PDF listed in scripts/rag_corpus.py, extracts the text, repairs the
usual PDF artefacts (hyphenation, ligatures, running headers), drops reference
lists, and splits what is left into overlapping chunks that each remember which
document and which page they came from.

Output: scripts/rag_chunks.json  (consumed by build_rag_embeddings.mjs)

Usage:  python3 scripts/build_rag_chunks.py
"""

import json
import os
import re
import sys
import unicodedata

import pymupdf

from rag_corpus import CORPUS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, "papers_pdf")
OUT_PATH = os.path.join(ROOT, "scripts", "rag_chunks.json")

TARGET_CHARS = 1100   # aim for chunks of roughly this size
MAX_CHARS = 1600      # hard ceiling before a paragraph is split mid-sentence
OVERLAP_CHARS = 220   # tail of each chunk repeated at the head of the next
MIN_CHARS = 260       # chunks shorter than this are merged away or dropped

LIGATURES = {
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi",
    "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st",
}

REFERENCE_HEADING = re.compile(
    r"^\s*(?:\d+\.?\s*)?(references|bibliography|acknowledg(e)?ments?|"
    r"declaration of competing interest|funding|supplementary (information|material))\s*:?\s*$",
    re.IGNORECASE,
)

# A line that is nothing but a citation entry, e.g. "[12] A. Author, ..."
CITATION_LINE = re.compile(r"^\s*\[\d{1,3}\]\s")

HEADING_PATTERNS = [
    re.compile(r"^(?:[IVXLC]+\.|\d+(?:\.\d+)+\.?)\s+[A-Z][^.]{2,60}$"),   # 3.2 Methods
    re.compile(r"^[A-Z]\.\s+[A-Z][A-Z \-/&0-9]{3,60}$"),                  # B. GENERAL STRUCTURE
    re.compile(r"^[A-Z][A-Z \-/&0-9]{4,60}$"),                            # METHODS
    re.compile(r"^(Abstract|Introduction|Background|Methods?|Materials and methods|"
               r"Results?|Discussion|Conclusions?|Related work|Experimental setup|"
               r"Limitations|Future work|Datasets?)\s*$", re.IGNORECASE),
]

# Fingerprints of a bibliography entry.  Used both to find where a reference
# list starts and as a safety net that drops reference-dense chunks.
REF_MARKERS = [
    re.compile(r"\bpp\.\s*\d"), re.compile(r"\bvol\.\s*\d"), re.compile(r"\bno\.\s*\d"),
    re.compile(r"\bet al\.,"), re.compile(r"arXiv preprint"), re.compile(r'," '),
    re.compile(r"\b(?:Proceedings|Conference|Springer|IEEE Transactions|Journal of)\b"),
    re.compile(r"\b[A-Z]\.\s[A-Z][a-z]+,"),   # "A. Author,"
]


# Acronyms that .title() would mangle when a heading is set in all caps.
ACRONYMS = ["GCN", "CNN", "U-Net", "nnU-Net", "HUNT4", "CAMUS", "LV", "MYO", "LA",
            "AI", "ROI", "EF", "GLS", "DDPM", "MRI", "2D", "3D", "gCNR", "VLCD"]


def tidy_heading(raw: str) -> str:
    """Normalise an ALL-CAPS or spaced-out PDF heading into readable text."""
    h = re.sub(r"^(?:[IVXLC]+\.|[A-Z]\.|\d+(?:\.\d+)*\.?)\s*", "", raw).strip()
    # "A B S T R A C T" -> "ABSTRACT"
    if re.fullmatch(r"(?:[A-Z]\s){2,}[A-Z]", h):
        h = h.replace(" ", "")
    if h.isupper():
        h = h.title()
    for acr in ACRONYMS:
        h = re.sub(rf"\b{re.escape(acr)}\b", acr, h, flags=re.IGNORECASE)
    return h


def reference_density(text: str) -> float:
    """Reference markers per 100 characters."""
    hits = sum(len(p.findall(text)) for p in REF_MARKERS)
    return 100.0 * hits / max(len(text), 1)


def normalise(text: str) -> str:
    for src, dst in LIGATURES.items():
        text = text.replace(src, dst)
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\u00ad", "")          # soft hyphen
    text = re.sub(r"[\u2010\u2011\u2012\u2013]", "-", text)
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u00a0", " ")
    return text


def is_heading(line: str) -> bool:
    line = line.strip()
    if not (3 <= len(line) <= 70):
        return False
    # Numbered list items ("3. If the majority of the ROIs ...") and author
    # lists look like numbered headings, so reject anything with a comma or
    # too many words.
    if "," in line or ";" in line:
        return False
    if len(line.split()) > 9:
        return False
    if line.endswith((",", ";", ":")):
        return False
    return any(p.match(line) for p in HEADING_PATTERNS)


def looks_like_noise(line: str) -> bool:
    """Running headers, page numbers, figure/table captions, formula debris."""
    s = line.strip()
    if not s:
        return True
    if len(s) <= 3 and not s.isalpha():
        return True
    if re.fullmatch(r"(page\s*)?\d{1,4}", s, re.IGNORECASE):
        return True
    if re.match(r"^(fig(ure)?\.?|table|algorithm)\s*\d+", s, re.IGNORECASE):
        return True
    if re.match(r"^(downloaded from|https?://|www\.|doi:|ISSN|©|Copyright|Licensed under)", s, re.IGNORECASE):
        return True
    if CITATION_LINE.match(s):
        return True
    # Lines that are overwhelmingly symbols/digits (equations, table rows).
    letters = sum(c.isalpha() for c in s)
    if letters < max(4, len(s) * 0.45):
        return True
    return False


def page_to_paragraphs(raw: str, header_counts: dict):
    """Turn one page of raw PDF text into (heading, paragraph) pairs."""
    raw = normalise(raw)
    lines = raw.split("\n")

    cleaned = []
    for line in lines:
        s = line.rstrip()
        key = s.strip().lower()
        # Repeated across many pages -> running header/footer.
        if key and header_counts.get(key, 0) >= 4 and len(key) < 120:
            continue
        cleaned.append(s)

    paragraphs = []
    heading = None
    buf = []

    def flush():
        nonlocal buf
        if not buf:
            return
        text = " ".join(buf)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) >= 80:
            paragraphs.append((heading, text))
        buf = []

    for line in cleaned:
        s = line.strip()
        if not s:
            flush()
            continue
        if is_heading(s):
            flush()
            heading = tidy_heading(s)
            continue
        if looks_like_noise(s):
            continue
        # De-hyphenate across line breaks.
        if buf and buf[-1].endswith("-") and not buf[-1].endswith("--"):
            buf[-1] = buf[-1][:-1] + s
        else:
            buf.append(s)
    flush()
    return paragraphs


def split_long(text: str):
    """Split an over-long paragraph on sentence boundaries."""
    if len(text) <= MAX_CHARS:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out, cur = [], ""
    for sent in sentences:
        if cur and len(cur) + len(sent) + 1 > TARGET_CHARS:
            out.append(cur.strip())
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    if cur:
        out.append(cur.strip())
    return out


def chunk_document(doc_cfg):
    path = os.path.join(PDF_DIR, doc_cfg["file"])
    pdf = pymupdf.open(path)
    first, last = doc_cfg.get("pages", (1, len(pdf)))
    last = min(last, len(pdf))

    pages_raw = [normalise(pdf[i].get_text()) for i in range(first - 1, last)]

    # Count line frequency to identify running headers/footers.
    header_counts = {}
    for raw in pages_raw:
        for line in set(l.strip().lower() for l in raw.split("\n")[:3] + raw.split("\n")[-3:]):
            if line:
                header_counts[line] = header_counts.get(line, 0) + 1

    units = []  # (page_no, heading, paragraph)
    in_references = False
    for offset, raw in enumerate(pages_raw):
        page_no = first + offset

        # A page is "reference territory" from the line where a References /
        # Bibliography heading appears until a normal section heading resumes.
        # The thesis has a per-chapter bibliography, so this has to be able to
        # switch back off rather than stopping at the first occurrence.
        page_is_refs = in_references
        for line in raw.split("\n"):
            s = line.strip()
            if REFERENCE_HEADING.match(s):
                in_references = True
                page_is_refs = True
            elif in_references and is_heading(s) and reference_density(s) == 0:
                in_references = False

        for heading, para in page_to_paragraphs(raw, header_counts):
            if REFERENCE_HEADING.match(heading or ""):
                continue
            # Drop anything that reads like a bibliography entry, whether or
            # not the heading was detected.
            if reference_density(para) >= 0.9:
                continue
            if page_is_refs and in_references and reference_density(para) >= 0.3:
                continue
            units.append((page_no, heading, para))

    # Build chunks by greedily packing paragraphs that share a page neighbourhood.
    chunks = []
    cur_text, cur_pages, cur_heading = "", set(), None
    for page_no, heading, para in units:
        for piece in split_long(para):
            if cur_text and len(cur_text) + len(piece) + 1 > TARGET_CHARS:
                chunks.append((cur_text.strip(), sorted(cur_pages), cur_heading))
                tail = cur_text[-OVERLAP_CHARS:]
                tail = tail[tail.find(" ") + 1:] if " " in tail else ""
                cur_text = f"{tail} {piece}".strip()
                cur_pages = {page_no}
                cur_heading = heading or cur_heading
            else:
                cur_text = f"{cur_text} {piece}".strip()
                cur_pages.add(page_no)
                cur_heading = cur_heading or heading
    if cur_text.strip():
        chunks.append((cur_text.strip(), sorted(cur_pages), cur_heading))

    out = []
    for i, (text, pages, heading) in enumerate(chunks):
        if len(text) < MIN_CHARS:
            continue
        if reference_density(text) >= 0.8:  # final safety net
            continue
        out.append({
            "id": f"{doc_cfg['id']}#{i}",
            "doc": doc_cfg["id"],
            "page": pages[0],
            "pageEnd": pages[-1],
            "section": heading or "",
            "text": text,
        })
    return out


def main():
    documents, chunks = [], []
    for cfg in CORPUS:
        path = os.path.join(PDF_DIR, cfg["file"])
        if not os.path.exists(path):
            print(f"  !! missing {cfg['file']}, skipping", file=sys.stderr)
            continue
        doc_chunks = chunk_document(cfg)
        chunks.extend(doc_chunks)
        documents.append({
            "id": cfg["id"],
            "title": cfg["title"],
            "authors": cfg["authors"],
            "venue": cfg["venue"],
            "year": cfg["year"],
            "kind": cfg["kind"],
            "url": cfg.get("url"),
            "topics": cfg.get("topics", []),
            "chunks": len(doc_chunks),
        })
        chars = sum(len(c["text"]) for c in doc_chunks)
        print(f"  {cfg['id']:<14} {len(doc_chunks):>4} chunks  {chars/1000:>7.1f} kB text")

    payload = {"documents": documents, "chunks": chunks}
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    total = sum(len(c["text"]) for c in chunks)
    print(f"\n  total: {len(chunks)} chunks, {total/1000:.1f} kB of text -> {OUT_PATH}")


if __name__ == "__main__":
    main()
