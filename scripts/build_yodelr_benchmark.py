#!/usr/bin/env python3
"""Turn a benchmark.py run into the JSON the Timing tab draws.

The Timing tab shows latency and scaling numbers that the page cannot
produce itself. benchmark.py runs for minutes, holds 157 MB and disables the
garbage collector to get clean samples -- none of which is something to do
inside a browser tab, and Pyodide's clock is too coarse to resolve a 254 ns
add_user anyway. So the numbers are measured natively, once, and shipped.

That makes drift the thing to guard against, exactly as it is for yodelr.py
itself. The guard is that nothing here is typed by hand:

    benchmark.py  ->  benchmark.txt (verbatim stdout)  ->  benchmark.json

benchmark.txt is committed as the receipt. Every number the page shows can
be found in it by eye, and the page links to it. If the two ever disagree,
the text wins and this parser is wrong.

    python3 scripts/build_yodelr_benchmark.py            # re-parse the capture
    python3 scripts/build_yodelr_benchmark.py --run      # re-measure, then parse

--run needs the challenge repo and the downloaded dataset; the default path
needs neither, so the site builds anywhere.

Outputs:
    public/yodelr/benchmark.json   parsed rows, all times in nanoseconds
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "yodelr"
CAPTURE = OUT_DIR / "benchmark.txt"
OUT_JSON = OUT_DIR / "benchmark.json"

DEFAULT_SRC_REPO = REPO_ROOT.parent / "yodelr-coding-challenge"
HARNESS_REL = "yodelr_twitter_test/yodelr_twitter_test"

# benchmark.py prints every duration through its _unit() helper, which picks
# one of three suffixes by magnitude. Parse all three back to nanoseconds so
# the page compares like with like and can put them on one axis.
UNITS = {"ns": 1.0, "us": 1e3, "ms": 1e6, "s": 1e9}


def duration(name):
    """A number-and-suffix pair, named so the groups stay readable when six
    of them sit in one pattern."""
    return r"(?P<{0}_n>[0-9.]+)\s*(?P<{0}_u>ns|us|ms|s)".format(name)


# "label  count  mean X  median X  p95 X  p99 X  max X  trailing note"
ROW = re.compile(
    r"^(?P<label>.*?)\s{2,}(?P<count>\d+)\s+"
    r"mean\s+" + duration("mean") + r"\s+"
    r"median\s+" + duration("median") + r"\s+"
    r"p95\s+" + duration("p95") + r"\s+"
    r"p99\s+" + duration("p99") + r"\s+"
    r"max\s+" + duration("max") + r"\s*(?P<note>.*?)\s*$"
)

# The Scaling table: posts, then three durations.
SWEEP = re.compile(
    r"^\s*(?P<posts>[\d,]+)\s+" + duration("add") + r"\s+"
    + duration("trend") + r"\s+" + duration("delete") + r"\s*$"
)


def ns(match, name):
    """One named duration from a match, in nanoseconds."""
    return float(match.group(name + "_n")) * UNITS[match.group(name + "_u")]


def parse(text):
    """Read the whole report into a dict. Section-aware, because a row's
    meaning depends on the heading above it -- 'delete_user' under Deletes
    is a latency row, the same word in the Scaling table is a column."""
    out = {
        "corpus": {},
        "writes": [],
        "reads": [],
        "deletes": [],
        "memory": {},
        "scaling": [],
        "clockOverheadNs": None,
        "skippedRows": None,
    }
    section = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or set(stripped) == {"-"}:
            continue

        if stripped in ("Corpus", "Writes", "Reads", "Deletes", "Memory", "Scaling"):
            section = stripped.lower()
            continue

        m = re.match(r"^skipped\s+([\d,]+)\s+rows", stripped)
        if m:
            out["skippedRows"] = int(m.group(1).replace(",", ""))
            continue

        m = re.match(r"^clock overhead per measurement:\s+([\d.]+)\s+ns", stripped)
        if m:
            out["clockOverheadNs"] = float(m.group(1))
            continue

        if section == "corpus":
            m = re.match(r"^source:\s*(\S+)$", stripped)
            if m:
                out["corpus"]["source"] = m.group(1)
                continue
            m = re.match(r"^([a-z_]+):\s+([\d,.]+)$", stripped)
            if m:
                out["corpus"][m.group(1)] = float(m.group(2).replace(",", ""))
                continue

        if section == "memory":
            m = re.match(r"^([\d,.]+)\s+(.*)$", stripped)
            if m:
                value = float(m.group(1).replace(",", ""))
                rest = m.group(2)
                key = {
                    "posts": "posts",
                    "MB held after loading": "heldMb",
                    "MB peak during loading": "peakMb",
                    "entries in the topic index": "topicIndexEntries",
                }.get(rest)
                if key is None and rest.startswith("bytes per post"):
                    key = "bytesPerPost"
                if key:
                    out["memory"][key] = value
                continue

        if section == "scaling":
            m = SWEEP.match(line)
            if m:
                out["scaling"].append({
                    "posts": int(m.group("posts").replace(",", "")),
                    "addPostNs": ns(m, "add"),
                    "trendingDayNs": ns(m, "trend"),
                    "deleteUserNs": ns(m, "delete"),
                })
                continue

        if section in ("writes", "reads", "deletes"):
            m = ROW.match(line)
            if m:
                label = m.group("label").strip()
                out[section].append({
                    "label": label,
                    # Two rows are indented in the report because they are the
                    # worst case of the row above, not a separate operation.
                    # Keep that relationship rather than flattening it.
                    "detail": line.startswith("  "),
                    "count": int(m.group("count")),
                    "meanNs": ns(m, "mean"),
                    "medianNs": ns(m, "median"),
                    "p95Ns": ns(m, "p95"),
                    "p99Ns": ns(m, "p99"),
                    "maxNs": ns(m, "max"),
                    "note": m.group("note"),
                })
                continue

    return out


def run_benchmark(src_repo, limit):
    """Re-measure. Only used with --run; the committed capture is the default."""
    harness = src_repo / HARNESS_REL
    script = harness / "benchmark.py"
    if not script.exists():
        sys.exit("build_yodelr_benchmark: no benchmark.py at {}".format(script))
    print("running benchmark.py --limit {} (this takes minutes)".format(limit))
    done = subprocess.run(
        [sys.executable, "benchmark.py", "--limit", str(limit)],
        cwd=str(harness), capture_output=True, text=True,
    )
    if done.returncode != 0:
        sys.stderr.write(done.stderr)
        sys.exit("build_yodelr_benchmark: benchmark.py failed")
    return done.stdout


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", action="store_true",
                    help="re-run benchmark.py and overwrite the capture")
    ap.add_argument("--limit", type=int, default=400_000,
                    help="posts to measure, when --run is given")
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC_REPO,
                    help="path to the yodelr challenge repo")
    args = ap.parse_args()

    if args.run:
        text = run_benchmark(args.src, args.limit)
        CAPTURE.write_text(text, encoding="utf-8")
        print("wrote {}".format(CAPTURE.relative_to(REPO_ROOT)))
    else:
        if not CAPTURE.exists():
            sys.exit("build_yodelr_benchmark: no capture at {}".format(CAPTURE))
        text = CAPTURE.read_text(encoding="utf-8")

    data = parse(text)

    # A silent partial parse would put an empty chart on the page and look
    # like a styling bug, so fail loudly instead.
    for key in ("writes", "reads", "deletes", "scaling"):
        if not data[key]:
            sys.exit("build_yodelr_benchmark: parsed no rows for '{}' -- has "
                     "benchmark.py's output format changed?".format(key))

    data["capturedFrom"] = CAPTURE.name
    data["builtAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("wrote {} ({} write, {} read, {} delete, {} scaling rows)".format(
        OUT_JSON.relative_to(REPO_ROOT), len(data["writes"]), len(data["reads"]),
        len(data["deletes"]), len(data["scaling"])))


if __name__ == "__main__":
    main()
