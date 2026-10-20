#!/usr/bin/env python3
"""Optional step 3: render the carousel tile for the RAG project page.

Projects the real chunk embeddings down to two dimensions with PCA and draws
them as a glowing scatter, coloured per source document. The tile is therefore
an actual picture of the index the page searches, not a stock illustration.

Usage:  python3 scripts/build_rag_tile.py
"""

import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAG_DIR = os.path.join(ROOT, "public", "rag")
# JPEG rather than PNG: the tile is a smooth gradient plus soft glows, which
# PNG stores very inefficiently (315 kB vs ~70 kB for visually identical JPEG).
OUT_PATH = os.path.join(ROOT, "src", "images", "rag", "embedding_space.jpg")

SIZE = 1000
MARGIN = 110
BG_TOP = (22, 25, 48)
BG_BOTTOM = (37, 41, 71)

# One colour per document, ordered as in rag_corpus.py.
PALETTE = {
    "gcn": (96, 190, 255),
    "quality-umb": (122, 240, 200),
    "quality-arxiv": (86, 206, 178),
    "diffusion": (255, 150, 120),
    "pipeline": (255, 206, 110),
    "lightweight": (196, 158, 255),
    "thesis": (232, 238, 255),
}
DEFAULT_COLOUR = (180, 190, 220)


def gradient_background():
    base = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(base)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        draw.line(
            [(0, y), (SIZE, y)],
            fill=tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)),
        )
    return base


def pca_2d(matrix):
    centred = matrix - matrix.mean(axis=0, keepdims=True)
    # Economy SVD: the first two right-singular vectors are the PCA axes.
    _, _, vt = np.linalg.svd(centred, full_matrices=False)
    coords = centred @ vt[:2].T
    lo, hi = np.percentile(coords, 1, axis=0), np.percentile(coords, 99, axis=0)
    coords = (coords - lo) / np.maximum(hi - lo, 1e-9)
    return np.clip(coords, 0.0, 1.0)


def main():
    corpus = json.load(open(os.path.join(RAG_DIR, "corpus.json"), encoding="utf-8"))
    dims = corpus.get("dims", 384)
    raw = np.fromfile(os.path.join(RAG_DIR, "embeddings.bin"), dtype=np.int8)
    vectors = raw.reshape(-1, dims).astype(np.float32) / 127.0

    coords = pca_2d(vectors)
    xs = MARGIN + coords[:, 0] * (SIZE - 2 * MARGIN)
    ys = MARGIN + coords[:, 1] * (SIZE - 2 * MARGIN)
    doc_ids = [c["d"] for c in corpus["chunks"]]

    canvas = gradient_background()

    # Glow pass: oversized translucent discs, blurred, screened onto the canvas.
    glow = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for x, y, doc in zip(xs, ys, doc_ids):
        colour = PALETTE.get(doc, DEFAULT_COLOUR)
        r = 26
        glow_draw.ellipse([x - r, y - r, x + r, y + r],
                          fill=tuple(int(c * 0.40) for c in colour))
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    canvas = Image.fromarray(
        np.clip(np.asarray(canvas, dtype=np.int16) + np.asarray(glow, dtype=np.int16), 0, 255)
        .astype(np.uint8)
    )

    # Core pass: crisp points on top of the glow.
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x, y, doc in zip(xs, ys, doc_ids):
        colour = PALETTE.get(doc, DEFAULT_COLOUR)
        draw.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(*colour, 70))
        draw.ellipse([x - 3.2, y - 3.2, x + 3.2, y + 3.2], fill=(*colour, 245))

    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    canvas.save(OUT_PATH, quality=90, optimize=True, progressive=True)
    print(f"  {len(doc_ids)} points -> {OUT_PATH} ({os.path.getsize(OUT_PATH)/1024:.0f} kB)")


if __name__ == "__main__":
    main()
