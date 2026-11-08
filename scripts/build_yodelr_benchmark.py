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

    python3 scripts/build_yodelr_benchmark.py                  # re-parse the capture
    python3 scripts/build_yodelr_benchmark.py --run            # re-measure, then parse
    python3 scripts/build_yodelr_benchmark.py --run --impl v2  # the same, for v2
    python3 scripts/build_yodelr_benchmark.py --run --impl v3  # the same, for v3
    python3 scripts/build_yodelr_benchmark.py --run --impl cpp # the same, for C++
    python3 scripts/build_yodelr_benchmark.py --run --impl cpp_v3  # C++, v3

--run needs the challenge repo and the downloaded dataset; the default path
needs neither, so the site builds anywhere.

There is one capture per implementation, all of them written and parsed by
this one script rather than by a copy of it with the filenames changed. v1
keeps the unsuffixed names it already had. The capture says which
implementation it came from, and the run refuses to parse a capture whose
marker disagrees with --impl -- otherwise the one mistake nobody would notice
is a v1 run quietly being written into benchmark_v2.json, and the page would
report a 68x speedup of v1 over itself.

cpp is measured by a different program -- cpp/benchmark, a port of
benchmark.py -- but deliberately not by a different parser. The port prints
the same format strings, so the capture it produces reads here exactly like a
Python one, and the three cards on the page are built by one piece of code
rather than three that have to be kept in agreement.

Outputs:
    public/yodelr/benchmark.json      parsed rows, all times in nanoseconds
    public/yodelr/benchmark_v2.json   the same, for yodelr_v2.py
    public/yodelr/benchmark_v3.json   the same, for yodelr_v3.py
    public/yodelr/benchmark_cpp.json  the same, for the C++ port
    public/yodelr/benchmark_cpp_v3.json  the same, for the C++ port of v3

A capture stays here once it is taken, whether or not a card still draws it.
They are measurements, and the cost of keeping one is a 3 KB file; the cost of
deleting one is that the version it measured can never be compared against
again without re-running every other capture on the same machine.
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


def paths_for(impl):
    """Capture and JSON for one implementation.

    v1 is unsuffixed because its capture is already committed under that name
    and the page already fetches it; renaming both to benchmark_v1.* would be
    more symmetrical and would invalidate the receipt for no gain.
    """
    suffix = "" if impl == "v1" else "_" + impl
    return (OUT_DIR / "benchmark{}.txt".format(suffix),
            OUT_DIR / "benchmark{}.json".format(suffix))

DEFAULT_SRC_REPO = REPO_ROOT.parent / "yodelr-coding-challenge"
HARNESS_REL = "yodelr_twitter_test/yodelr_twitter_test"
CPP_REL = "yodelr_twitter_test/cpp"

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
        # None means a capture taken before benchmark.py printed the marker,
        # which can only be a v1 run: v2 did not exist then.
        "implementation": None,
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
            # "implementation: v2 (YodelrV2)" -- matched before the generic
            # key/value rule below, which only accepts numeric values and
            # would otherwise drop this line silently.
            m = re.match(r"^implementation:\s*(\S+)", stripped)
            if m:
                out["implementation"] = m.group(1)
                continue

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


def run_cpp_benchmark(src_repo, limit, impl):
    """Re-measure with the C++ harness, building it first.

    cpp/benchmark.cpp is a port of benchmark.py: same corpus, same random
    draws, same statistics, same output format. So the only thing that changes
    here is which process produces the text -- everything downstream, the
    parser included, is shared. That is the point. A second parser for a
    second harness is a second thing to keep in step, and the one that is
    wrong is always the one nobody looked at.

    `make` rather than a g++ command line, so the compiler flags live in one
    place next to the code they build, and so the generated entity table gets
    regenerated if it is missing.
    """
    cpp_dir = src_repo / CPP_REL
    source = cpp_dir / "benchmark.cpp"
    if not source.exists():
        sys.exit("build_yodelr_benchmark: no benchmark.cpp at {}".format(source))

    print("building the C++ benchmark")
    built = subprocess.run(["make", "benchmark"], cwd=str(cpp_dir),
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True)
    if built.returncode != 0:
        sys.stderr.write(built.stdout)
        sys.exit("build_yodelr_benchmark: make failed")

    # Run from the harness directory, not from cpp/, because the binary looks
    # for the dataset at the same relative path benchmark.py does. Measuring a
    # different file than the Python runs measured would be the one difference
    # that invalidates the whole comparison.
    harness = src_repo / HARNESS_REL
    # The binary spells its implementations the way this script does, so the
    # name is passed through rather than translated. One vocabulary across the
    # two harnesses and this script is one fewer table to get wrong.
    print("running cpp/benchmark --impl {} --limit {} (this takes minutes)"
          .format(impl, limit))
    done = subprocess.run(
        [str((cpp_dir / "benchmark").resolve()),
         "--impl", impl, "--limit", str(limit)],
        cwd=str(harness), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True,
    )
    if done.returncode != 0:
        sys.stderr.write(done.stdout)
        sys.exit("build_yodelr_benchmark: cpp/benchmark failed")
    return done.stdout


def run_benchmark(src_repo, limit, impl):
    """Re-measure. Only used with --run; the committed capture is the default."""
    if impl.startswith("cpp"):
        return run_cpp_benchmark(src_repo, limit, impl)

    harness = src_repo / HARNESS_REL
    script = harness / "benchmark.py"
    if not script.exists():
        sys.exit("build_yodelr_benchmark: no benchmark.py at {}".format(script))
    print("running benchmark.py --impl {} --limit {} (this takes minutes)"
          .format(impl, limit))
    # Merged, not captured separately. benchmark.py writes its corpus-loading
    # lines to stderr -- including "skipped N rows", which is where skippedRows
    # is parsed from -- so taking stdout alone would produce a capture missing
    # fields that the hand-made one has, and nothing would complain.
    done = subprocess.run(
        [sys.executable, "benchmark.py", "--impl", impl, "--limit", str(limit)],
        cwd=str(harness), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True,
    )
    if done.returncode != 0:
        sys.stderr.write(done.stdout)
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
    ap.add_argument("--impl", choices=("v1", "v2", "v3", "cpp", "cpp_v3"),
                    default="v1",
                    help="which implementation's capture to build (default: v1)")
    args = ap.parse_args()

    capture, out_json = paths_for(args.impl)

    if args.run:
        text = run_benchmark(args.src, args.limit, args.impl)
        capture.write_text(text, encoding="utf-8")
        print("wrote {}".format(capture.relative_to(REPO_ROOT)))
    else:
        if not capture.exists():
            sys.exit("build_yodelr_benchmark: no capture at {}".format(capture))
        text = capture.read_text(encoding="utf-8")

    data = parse(text)

    # A silent partial parse would put an empty chart on the page and look
    # like a styling bug, so fail loudly instead.
    for key in ("writes", "reads", "deletes", "scaling"):
        if not data[key]:
            sys.exit("build_yodelr_benchmark: parsed no rows for '{}' -- has "
                     "benchmark.py's output format changed?".format(key))

    # The capture has to agree with --impl. Getting this wrong is not a
    # crash, it is a page that confidently reports the wrong thing, so it is
    # checked rather than assumed. An unmarked capture predates --impl and is
    # therefore v1; claiming it is v2 is the exact mistake being guarded.
    marked = data["implementation"] or "v1"
    if marked != args.impl:
        sys.exit(
            "build_yodelr_benchmark: {} is a {} capture but --impl is {}.\n"
            "       re-run with --run, or parse it as {}.".format(
                capture.name, marked, args.impl, marked)
        )
    data["implementation"] = args.impl

    # The capture names its source ("sentiment140") but carries no link, and
    # the page wants one. Rather than type the URL a second time, lift it off
    # corpus.json, which the corpus builder already wrote from the dataset it
    # actually downloaded. One source, so the two tabs cannot disagree about
    # where the tweets came from.
    meta_path = OUT_DIR / "corpus.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("datasetUrl"):
            data["corpus"]["datasetUrl"] = meta["datasetUrl"]
            data["corpus"]["datasetName"] = meta.get("dataset", "")

    data["capturedFrom"] = capture.name
    data["builtAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("wrote {} ({} write, {} read, {} delete, {} scaling rows)".format(
        out_json.relative_to(REPO_ROOT), len(data["writes"]), len(data["reads"]),
        len(data["deletes"]), len(data["scaling"])))


if __name__ == "__main__":
    main()
