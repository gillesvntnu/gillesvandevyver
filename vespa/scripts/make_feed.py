#!/usr/bin/env python3
"""Turn public/rag/corpus.json into Vespa feed files.

Two of them, because the application has two content clusters holding the same
text in Vespa's two storage modes:

    vespa/feed.json            -> passage, indexed mode
    vespa/feed-streaming.json  -> article_passage, streaming mode

They differ only in the document type and the id. A streaming id carries the
group it belongs to - `g=<article-slug>` - because streaming mode searches one
group at a time and the group is part of the id rather than a field you filter
on. Everything else in the two records is identical, which is the point: any
difference the page shows between the two clusters comes from how Vespa stores
them, not from what was fed.

The corpus is the one the in-browser version of this project already ships, so
all three searches cover the identical 3,365 passages and any difference between
them is a difference in retrieval rather than in the data.

What this script does NOT do is compute passage embeddings. Vespa does that
itself at feed time, from the `embed` statements in passage.sd. The existing
embeddings.bin is still read, but only to assign each passage a semantic
cluster for the faceting demo - and it uses the same k-means, with the same
seed, as scripts/build_rag_tile.py, so the facets on the Vespa page and the
colours in the scatter plot on the other page are the same partition.

It also writes public/vespa/articles.json: just the id and title of each
article, about 15 kB. The page uses it to draw the "search only in these
articles" checkboxes. Those could be read out of Vespa with a grouping query
instead, but then the control cannot be drawn until the cluster answers, and a
scope control that appears late is worse than one built from a 15 kB manifest.
The filtering itself still happens in Vespa; only the list of names is static.

It also prints the average field lengths at the end of a run. Indexed mode
counts those itself; streaming mode cannot, because it collects no corpus-wide
term statistics, and falls back to assuming 100 words for every field. Those
numbers belong in the rank-properties block of article_passage.sd, and this is
where they come from.

Usage:
    python3 vespa/scripts/make_feed.py                 # all 3,365 passages
    python3 vespa/scripts/make_feed.py --limit 200     # a quick smoke-test feed
    python3 vespa/scripts/make_feed.py -o /tmp/f.json
"""

import argparse
import collections
import json
import os
import re
import sys

try:
    import numpy as np
except ImportError:
    sys.exit("numpy is required: pip3 install numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAG_DIR = os.path.join(ROOT, "public", "rag")
DEFAULT_OUT = os.path.join(ROOT, "vespa", "feed.json")
DEFAULT_STREAMING_OUT = os.path.join(ROOT, "vespa", "feed-streaming.json")
DEFAULT_ARTICLES = os.path.join(ROOT, "public", "vespa", "articles.json")

# Must match scripts/build_rag_tile.py, or the facet labels here and the colours
# in the scatter plot on the in-browser page would describe different clusters
# while looking like they describe the same one.
CLUSTERS = 8
SEED = 20251021

# Words that are everywhere in a corpus about bicycles and therefore say nothing
# about which part of it a cluster is. "bicycle" is in roughly every second
# passage; a cluster labelled "bicycle, bike, cycling" is a label that failed.
STOPWORDS = set("""
a an and are as at be been but by can for from had has have in into is it its
of on or that the their there these they this to was were which while with
you your not no than then when where who whom how why all also may might must
more most other such some any each both few own same so only very s t
bicycle bicycles bike bikes cycling cyclist cyclists ride riding rider riders
used use using uses one two three first second new often usually generally
""".split())


def kmeans(matrix, k, seed, iterations=60):
    """Lloyd's algorithm with k-means++ seeding.

    Copied deliberately from scripts/build_rag_tile.py rather than imported:
    that file is a picture-drawing script that also imports PIL, and this one
    should not need an image library to produce a feed. The vectors are
    unit-norm, so squared Euclidean distance is monotone in cosine distance and
    plain k-means clusters by the same similarity the retriever uses.
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


def cluster_labels(texts, doc_ids, labels, k, terms_per_label=3, min_articles=3):
    """Name each cluster by the terms most over-represented inside it.

    A facet called "cluster 5" is useless in a dropdown, and naming the clusters
    by hand would go stale the moment the corpus is rebuilt. So each label is
    derived: compare how often a word appears in this cluster against how often
    it appears overall, and keep the words that lean hardest towards it.

    The comparison is on share-of-passages rather than raw counts, because the
    clusters are not the same size, and a ratio rather than a difference,
    because a word in 40% of one cluster and 10% overall is far more telling
    than one in 45% against 35%.

    min_articles is the rule that makes the labels readable rather than merely
    correct. Without it one cluster labelled itself "maratona, johannisberg,
    corridor": proper nouns from two long articles about specific rides, which
    are genuinely over-represented and genuinely useless as a facet name. A
    term has to span at least this many different articles before it is allowed
    to name a cluster, which keeps single-article jargon out and leaves the
    words that describe a subject rather than a page.
    """
    tokenised = [set(re.findall(r"[a-z]{3,}", t.lower())) - STOPWORDS for t in texts]

    overall = collections.Counter()
    articles_per_term = collections.defaultdict(set)
    for bag, doc_id in zip(tokenised, doc_ids):
        overall.update(bag)
        for term in bag:
            articles_per_term[term].add(doc_id)
    total = len(tokenised)

    names = []
    for j in range(k):
        members = [tokenised[i] for i in range(total) if labels[i] == j]
        if not members:
            names.append(f"cluster {j}")
            continue
        inside = collections.Counter()
        for bag in members:
            inside.update(bag)

        scored = []
        for term, count in inside.items():
            # Ignore the long tail: a word in three passages can have a
            # spectacular ratio and still be noise.
            if count < max(5, 0.08 * len(members)):
                continue
            if len(articles_per_term[term]) < min_articles:
                continue
            share_in = count / len(members)
            share_all = overall[term] / total
            scored.append((share_in / max(share_all, 1e-9), term))

        scored.sort(reverse=True)
        picked = [term for _, term in scored[:terms_per_label]]
        names.append(", ".join(picked) if picked else f"cluster {j}")
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-o", "--out", default=DEFAULT_OUT,
                        help=f"indexed-mode feed (default: {DEFAULT_OUT})")
    parser.add_argument("--streaming-out", default=DEFAULT_STREAMING_OUT,
                        help=f"streaming-mode feed (default: {DEFAULT_STREAMING_OUT})")
    parser.add_argument("--no-streaming", action="store_true",
                        help="only write the indexed-mode feed")
    parser.add_argument("--limit", type=int, default=0,
                        help="only emit the first N passages, for a fast smoke test")
    parser.add_argument("--articles", default=DEFAULT_ARTICLES,
                        help=f"article manifest for the page (default: {DEFAULT_ARTICLES})")
    args = parser.parse_args()

    corpus_path = os.path.join(RAG_DIR, "corpus.json")
    vectors_path = os.path.join(RAG_DIR, "embeddings.bin")
    for path in (corpus_path, vectors_path):
        if not os.path.exists(path):
            sys.exit(f"missing {path} - run `npm run build-rag-index` first")

    corpus = json.load(open(corpus_path, encoding="utf-8"))
    chunks = corpus["chunks"]
    documents = {d["id"]: d for d in corpus["documents"]}
    dims = corpus.get("dims", 384)

    raw = np.fromfile(vectors_path, dtype=np.int8)
    vectors = raw.reshape(-1, dims).astype(np.float32) / 127.0
    if len(vectors) != len(chunks):
        sys.exit(f"embeddings.bin has {len(vectors)} rows but corpus.json has "
                 f"{len(chunks)} chunks - rebuild the index")

    print(f"clustering {len(vectors)} passages into {CLUSTERS} groups...")
    labels = kmeans(vectors, CLUSTERS, SEED)
    names = cluster_labels([c["t"] for c in chunks], [c["d"] for c in chunks],
                           labels, CLUSTERS)

    # Section ordinals. A citation of "Article - Section" is not a locator when
    # the section was long enough to be cut into several passages, so each
    # passage carries both its position in the section and the section's size,
    # and the page only prints "2 of 5" when there is in fact more than one.
    section_sizes = collections.Counter()
    for chunk in chunks:
        section_sizes[(chunk["d"], chunk.get("s", ""))] += 1
    seen = collections.Counter()

    # Average field lengths, in words, for the streaming cluster's BM25. See
    # the rank-properties block in article_passage.sd for why these cannot be
    # left to Vespa there, and are printed at the end of this run.
    lengths = collections.defaultdict(int)

    indexed = open(args.out, "w", encoding="utf-8")
    streaming = (None if args.no_streaming
                 else open(args.streaming_out, "w", encoding="utf-8"))

    emitted = 0
    try:
        indexed.write("[\n")
        if streaming:
            streaming.write("[\n")

        for index, chunk in enumerate(chunks):
            if args.limit and emitted >= args.limit:
                break

            doc_id = chunk["d"]
            section = chunk.get("s", "")
            key = (doc_id, section)
            seen[key] += 1
            document = documents.get(doc_id, {})
            title = document.get("title", doc_id)

            fields = {
                "doc_id": doc_id,
                "title": title,
                "title_facet": title,
                "url": document.get("url", ""),
                "section": section,
                "anchor": chunk.get("a", ""),
                "part": chunk["n"],
                "section_part": seen[key],
                "section_parts": section_sizes[key],
                "cluster": int(labels[index]),
                "cluster_name": names[int(labels[index])],
                "text": chunk["t"],
            }

            lengths["text"] += len(chunk["t"].split())
            lengths["title"] += len(title.split())
            lengths["section"] += len(section.split())

            separator = "  " if emitted == 0 else ",\n  "

            # The :: is not a typo. A Vespa document id is
            # id:<namespace>:<type>:<modifier>:<user-id>, and the modifier slot
            # is empty for an ordinary indexed document.
            indexed.write(separator + json.dumps({
                "put": f"id:cycling:passage::{doc_id}-{chunk['n']}",
                "fields": fields,
            }, ensure_ascii=False))

            # In streaming mode that modifier slot carries the group, and it is
            # not decoration: it decides which bucket the document is stored in,
            # and a query that names the group reads only that bucket. Get it
            # wrong and the document is still searchable, just never by the
            # query that should find it.
            if streaming:
                streaming.write(separator + json.dumps({
                    "put": f"id:cycling:article_passage:g={doc_id}:{doc_id}-{chunk['n']}",
                    "fields": fields,
                }, ensure_ascii=False))

            emitted += 1

        indexed.write("\n]\n")
        if streaming:
            streaming.write("\n]\n")
    finally:
        indexed.close()
        if streaming:
            streaming.close()

    size_mb = os.path.getsize(args.out) / (1024 * 1024)
    print(f"wrote {emitted} documents to {args.out} ({size_mb:.1f} MB)")
    if streaming:
        size_mb = os.path.getsize(args.streaming_out) / (1024 * 1024)
        groups = len({c["d"] for c in chunks[:emitted or None]})
        print(f"wrote {emitted} documents to {args.streaming_out} "
              f"({size_mb:.1f} MB, {groups} groups)")

    # The article manifest. Sorted by title because it is rendered as a list a
    # human reads, and written whole even under --limit: the checkbox list
    # should describe the corpus, not whichever prefix of it was last fed.
    os.makedirs(os.path.dirname(args.articles), exist_ok=True)
    manifest = sorted(
        ({"id": d["id"], "title": d.get("title", d["id"])} for d in corpus["documents"]),
        key=lambda d: d["title"].lower(),
    )
    with open(args.articles, "w", encoding="utf-8") as handle:
        json.dump({"articles": manifest}, handle, ensure_ascii=False, indent=0)
    print(f"wrote {len(manifest)} article names to {args.articles} "
          f"({os.path.getsize(args.articles) / 1024:.0f} kB)\n")

    # Print what the clusters actually contain. A derived label is only worth
    # trusting if it can be checked, so show the dominant articles beside it.
    titles = {d["id"]: d["title"] for d in corpus["documents"]}
    doc_ids = [c["d"] for c in chunks]
    for j in range(CLUSTERS):
        members = [doc_ids[i] for i in range(len(doc_ids)) if labels[i] == j]
        top = collections.Counter(members).most_common(3)
        dominant = ", ".join(titles.get(d, d) for d, _ in top)
        print(f"  cluster {j}  {len(members):>4} passages  [{names[j]}]")
        print(f"             mostly: {dominant}")

    # The streaming cluster's BM25 needs these written into its schema by hand,
    # because nothing counts them for it at feed time. Printing them every run
    # is what keeps the schema from quietly going stale against the corpus.
    if emitted:
        print("\naverage field lengths, in words, over the passages just written:")
        for field in ("text", "title", "section"):
            print(f"  bm25({field}).averageFieldLength: {lengths[field] / emitted:.0f}")
        print("  -> these belong in the rank-properties block of "
              "vespa/app/schemas/article_passage.sd")


if __name__ == "__main__":
    main()
