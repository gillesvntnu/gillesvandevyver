#!/usr/bin/env python3
"""Optional step 3: render the carousel tile for the RAG project page.

Projects the real chunk embeddings down to two dimensions with PCA and draws
them as a glowing scatter. The tile is therefore an actual picture of the index
the page searches, not a stock illustration.

Colour is per semantic cluster rather than per source article. With seven
research PDFs a colour each was informative; with 255 encyclopedia articles it
would be 255 indistinguishable colours, and the interesting structure is not
which article a passage came from anyway - it is that passages about braking sit
together regardless of which of the eleven articles mentioning brakes they came
from. So the colours come from k-means over the embeddings, and the script
prints each cluster's dominant articles so the grouping can be checked for
meaning rather than taken on trust.

Usage:  python3 scripts/build_rag_tile.py
"""

import collections
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

CLUSTERS = 8
SEED = 20251021

# One colour per cluster. Hues are spread far enough apart to stay separable
# after the glow pass blurs them into each other.
PALETTE = [
    (96, 190, 255),
    (122, 240, 200),
    (255, 150, 120),
    (255, 206, 110),
    (196, 158, 255),
    (130, 255, 168),
    (255, 128, 190),
    (232, 238, 255),
]

# Point geometry scales with the number of points: the research corpus had 343
# and these radii were 26/7/3.2, which at 3365 points fills the frame solid.
GLOW_RADIUS = 11
HALO_RADIUS = 3.4
CORE_RADIUS = 1.6


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
    # Normalise against near-extremes rather than the true min and max, so one
    # far-flung passage cannot compress everything else into the middle.
    #
    # Deliberately not clipped to [0, 1]. Clipping at the 1st and 99th
    # percentiles stacked 4% of 3365 points exactly on the boundary, which drew
    # as hard straight lines along three edges of the tile — invisible at 343
    # points and obvious at ten times that. At the 0.1st and 99.9th only 16
    # points fall outside and they overflow by at most 0.06, which MARGIN
    # absorbs, so the outliers land in the border instead of forming a wall and
    # no point has to be dropped from a picture that claims to be the index.
    lo, hi = np.percentile(coords, 0.1, axis=0), np.percentile(coords, 99.9, axis=0)
    return (coords - lo) / np.maximum(hi - lo, 1e-9)


def kmeans(matrix, k, seed, iterations=60):
    """Plain Lloyd's algorithm with k-means++ seeding.

    Written out rather than imported because scikit-learn would otherwise be a
    build dependency for this one call. The vectors are unit-norm, so squared
    Euclidean distance is a monotone function of cosine distance and ordinary
    k-means is already clustering by the same similarity the retriever uses.
    """
    rng = np.random.default_rng(seed)
    n = matrix.shape[0]

    centres = [matrix[rng.integers(n)]]
    for _ in range(k - 1):
        d2 = np.min(
            ((matrix[:, None, :] - np.asarray(centres)[None, :, :]) ** 2).sum(axis=2),
            axis=1,
        )
        total = d2.sum()
        # Degenerate case: every point already sits on a centre.
        probs = d2 / total if total > 0 else np.full(n, 1.0 / n)
        centres.append(matrix[rng.choice(n, p=probs)])
    centres = np.asarray(centres)

    labels = np.zeros(n, dtype=np.int32)
    for _ in range(iterations):
        d2 = ((matrix[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2)
        new_labels = d2.argmin(axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for j in range(k):
            members = matrix[labels == j]
            if len(members):
                centres[j] = members.mean(axis=0)
    return labels


def main():
    corpus = json.load(open(os.path.join(RAG_DIR, "corpus.json"), encoding="utf-8"))
    dims = corpus.get("dims", 384)
    raw = np.fromfile(os.path.join(RAG_DIR, "embeddings.bin"), dtype=np.int8)
    vectors = raw.reshape(-1, dims).astype(np.float32) / 127.0

    coords = pca_2d(vectors)
    xs = MARGIN + coords[:, 0] * (SIZE - 2 * MARGIN)
    ys = MARGIN + coords[:, 1] * (SIZE - 2 * MARGIN)

    labels = kmeans(vectors, CLUSTERS, SEED)

    titles = {d["id"]: d["title"] for d in corpus["documents"]}
    doc_ids = [c["d"] for c in corpus["chunks"]]

    canvas = gradient_background()

    # Glow pass: oversized translucent discs, blurred, screened onto the canvas.
    glow = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for x, y, label in zip(xs, ys, labels):
        colour = PALETTE[label % len(PALETTE)]
        glow_draw.ellipse(
            [x - GLOW_RADIUS, y - GLOW_RADIUS, x + GLOW_RADIUS, y + GLOW_RADIUS],
            fill=tuple(int(c * 0.26) for c in colour),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    canvas = Image.fromarray(
        np.clip(np.asarray(canvas, dtype=np.int16) + np.asarray(glow, dtype=np.int16), 0, 255)
        .astype(np.uint8)
    )

    # Core pass: crisp points on top of the glow.
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x, y, label in zip(xs, ys, labels):
        colour = PALETTE[label % len(PALETTE)]
        draw.ellipse([x - HALO_RADIUS, y - HALO_RADIUS, x + HALO_RADIUS, y + HALO_RADIUS],
                     fill=(*colour, 58))
        draw.ellipse([x - CORE_RADIUS, y - CORE_RADIUS, x + CORE_RADIUS, y + CORE_RADIUS],
                     fill=(*colour, 235))

    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    canvas.save(OUT_PATH, quality=90, optimize=True, progressive=True)

    # The grouping is only worth colouring by if it means something, so say what
    # each cluster actually contains.
    print(f"  {len(doc_ids)} points -> {OUT_PATH} "
          f"({os.path.getsize(OUT_PATH) / 1024:.0f} kB)\n")
    for j in range(CLUSTERS):
        members = [doc_ids[i] for i in range(len(doc_ids)) if labels[i] == j]
        top = collections.Counter(members).most_common(4)
        names = ", ".join(titles.get(d, d) for d, _ in top)
        print(f"  cluster {j}  {len(members):>4} chunks  {names}")


if __name__ == "__main__":
    main()
