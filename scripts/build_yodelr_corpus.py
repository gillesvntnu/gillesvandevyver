#!/usr/bin/env python3
"""Turn the Sentiment140 dump into a corpus small enough to ship to a browser.

The Yodelr page has a tab that replays real tweets through the real
implementation. The dump behind it is 1.6 million rows and 238 MB, which is
not something to put on a web page, so this script reduces it once, here, and
commits the result. The page then only ever sees the reduced file.

Two reductions, and the second one is a judgement call worth stating:

  1. Only posts containing a #hashtag are kept. 2009 was early for hashtags,
     so just 2.24% of the dump carries one -- a straight slice would leave the
     topic index almost empty and make get_trending_topics look like it had
     nothing to do. Keeping only tagged posts is a filter, not a fabrication:
     every row below is a real tweet with its real author, text and time. The
     page says so.

  2. Nothing else is altered. Text, author and ordering are the dump's own.

The normalisation that Yodelr requires -- strictly increasing timestamps, and
users registered before they post -- is NOT reimplemented here. It is imported
from the challenge repo's own corpus.py, for the same reason sync_yodelr.py
copies rather than retypes yodelr.py: a second implementation of the cleaning
rules would drift from the one the benchmark uses, and then the page and the
benchmark would be describing different data.

    python3 scripts/build_yodelr_corpus.py
    YODELR_SRC=/path/to/repo npm run yodelr:corpus

Needs the dataset downloaded (yodelr_twitter_test/fetch_data.py). The output
is committed, so nobody else needs it to build the site.

Outputs:
    public/yodelr/corpus.tsv.gz    user \t timestamp \t text, one post per line
    public/yodelr/corpus.json      counts and span, for the page to show
"""

import argparse
import csv
import gzip
import hashlib
import html
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "yodelr"
DEFAULT_SRC_REPO = REPO_ROOT.parent / "yodelr-coding-challenge"

HARNESS_REL = "yodelr_twitter_test/yodelr_twitter_test"
CSV_REL = HARNESS_REL + "/data/training.1600000.processed.noemoticon.csv"

# Deliberately not imported from yodelr.py. This script only needs to know
# whether a row is worth keeping; it is not deciding what a topic is, so it
# does not need to agree with the implementation, and importing the
# implementation to filter its own input would be circular.
HAS_TOPIC = re.compile(r"#[0-9a-zA-Z_]+")

ENCODING = "latin-1"  # a 2009 export, as corpus.py notes


def die(message):
    print("build_yodelr_corpus: error: {}".format(message), file=sys.stderr)
    sys.exit(1)


def load_harness(src_repo):
    """Import the challenge repo's corpus.py so its cleaning rules are reused."""
    harness = src_repo / HARNESS_REL
    if not (harness / "corpus.py").exists():
        die(
            "corpus.py not found at {}\n"
            "       set YODELR_SRC to the challenge repo".format(harness)
        )
    sys.path.insert(0, str(harness))
    import corpus  # noqa: E402  (path has to be set first)

    return corpus


def escape(text):
    """Make one field safe for a tab-separated line.

    Four of the 35,813 kept tweets contain a tab or a newline. Dropping or
    trimming them would mean the shipped corpus is not quite the dump, so they
    are escaped and restored on the other side instead. Backslash first, or
    unescaping would turn a literal "\\n" in a tweet into a newline.
    """
    return (
        text.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def read_tagged(path, parse_date, max_length, limit):
    """Every tweet that carries a hashtag, as (when, author, text)."""
    rows = []
    scanned = 0
    too_long = 0

    with open(path, "r", encoding=ENCODING, newline="") as fh:
        for row in csv.reader(fh):
            if len(row) < 6:
                continue
            scanned += 1
            text = html.unescape(row[5]).strip()
            if not text or not HAS_TOPIC.search(text):
                continue
            # Unescaping can only shorten a post, but a few still come out over
            # the limit. Skipped rather than truncated: cutting the tail off a
            # post is exactly where its topics live.
            if len(text) > max_length:
                too_long += 1
                continue
            rows.append((parse_date(row[2]), row[4], text))
            if limit and len(rows) >= limit:
                break

    return rows, scanned, too_long


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=os.environ.get("YODELR_SRC", str(DEFAULT_SRC_REPO)),
        help="challenge repo (env: YODELR_SRC)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="stop after this many tagged posts (0 = all of them)",
    )
    args = parser.parse_args()

    src = Path(args.source).expanduser().resolve()
    csv_path = src / CSV_REL
    if not csv_path.exists():
        die(
            "dataset not found: {}\n"
            "       run fetch_data.py in the challenge repo first "
            "(~81 MB download)".format(csv_path)
        )

    corpus = load_harness(src)

    print("Reading Sentiment140, keeping only posts with a #hashtag ...")
    raw, scanned, too_long = read_tagged(
        csv_path, corpus._parse_date, corpus.MAX_POST_LENGTH, args.limit
    )
    if not raw:
        die("no tagged posts found; is {} the right file?".format(csv_path))

    # The challenge repo's own normalisation, not a copy of it.
    records = corpus.to_records(raw)
    users = corpus.distinct_users(records)
    stats = corpus.describe(records)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data_path = OUT_DIR / "corpus.tsv.gz"

    # mtime=0 so that rebuilding an unchanged corpus produces an identical file
    # rather than a one-byte diff that looks like a data change in git.
    with gzip.GzipFile(filename="", mode="wb", fileobj=open(data_path, "wb"),
                       compresslevel=9, mtime=0) as gz:
        for r in records:
            line = "{}\t{}\t{}\n".format(
                escape(r.user_name), r.timestamp, escape(r.text)
            )
            gz.write(line.encode("utf-8"))

    packed = data_path.stat().st_size
    meta = {
        "dataset": "Sentiment140",
        "datasetUrl": "https://huggingface.co/datasets/sentiment140",
        "filter": "posts containing a #hashtag",
        "scannedRows": scanned,
        "posts": len(records),
        "users": len(users),
        "distinctTopics": int(stats["distinct_topics"]),
        "skippedTooLong": too_long,
        "firstTimestamp": records[0].timestamp,
        "lastTimestamp": records[-1].timestamp,
        "spanDays": round((records[-1].timestamp - records[0].timestamp) / 86400, 1),
        "meanTextLength": round(stats["mean_text_len"], 1),
        "bytesGzipped": packed,
        "sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (OUT_DIR / "corpus.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )

    print("build_yodelr_corpus: {} posts from {} users, {} topics".format(
        meta["posts"], meta["users"], meta["distinctTopics"]))
    print("                     {} days, {:.1f} MB gzipped, sha256 {}".format(
        meta["spanDays"], packed / 1e6, meta["sha256"][:12]))
    print("                     scanned {} rows to find them".format(scanned))


if __name__ == "__main__":
    main()
