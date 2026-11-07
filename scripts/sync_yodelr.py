#!/usr/bin/env python3
"""Copy the Yodelr implementations out of the coding-challenge repo into public/.

The Yodelr playground page runs the real submitted implementation in the
browser under Pyodide. For that to be true rather than merely claimed, the
Python has to arrive here by being copied, never by being retyped: a
hand-maintained second copy drifts away from the original the first time the
original is touched, and then the page is demonstrating something that no
longer exists.

So this script is the only thing allowed to put Yodelr source into this repo.
It reads the challenge repo, never writes to it, and records where each file
came from so the page can show it.

Two files, because there are two implementations. yodelr.py is the submission.
yodelr_v2.py is the faster revision of get_trending_topics, and it does
`from yodelr import ...` rather than restating the Post type and the topic
regex -- so the pair has to travel together and out of the same directory, or
the import resolves against a yodelr.py of a different vintage. Taking both
from the directory the first one was chosen from is what guarantees that.

    python3 scripts/sync_yodelr.py            # default source, see below
    YODELR_SRC=/path/to/repo npm run yodelr:sync
    python3 scripts/sync_yodelr.py --check    # verify, change nothing

Outputs:
    public/yodelr/yodelr.py         byte-for-byte copy
    public/yodelr/yodelr_v2.py      byte-for-byte copy
    public/yodelr/provenance.json   hash, source path, size, sync time, per file
"""

import argparse
import hashlib
import json
import os
import py_compile
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "yodelr"

# The challenge repo sits next to this one. Override with YODELR_SRC when it
# does not, e.g. on a machine that keeps it somewhere else.
DEFAULT_SRC_REPO = REPO_ROOT.parent / "yodelr-coding-challenge"

# Which yodelr.py to take when the repo holds more than one. The benchmark
# directory is the copy that gets packaged into yodelr-benchmark.zip, so it is
# the submitted one; the top-level file has been an older draft before now.
# Ordered best first. See the drift check below, which shouts when they differ.
CANDIDATES = (
    "yodelr_twitter_test/yodelr.py",
    "yodelr.py",
)

# Everything the page calls. If the submission is ever refactored such that one
# of these disappears, that is worth failing the build over rather than
# shipping a page whose buttons throw AttributeError.
REQUIRED_METHODS = (
    "add_user",
    "add_post",
    "delete_user",
    "get_posts_for_user",
    "get_posts_for_topic",
    "get_trending_topics",
)

# The second implementation, taken from whichever directory yodelr.py was
# chosen from. Its class name is checked for the same reason YodelrImpl's is:
# a file of the right name holding the wrong thing is the failure that would
# otherwise reach the browser.
V2_NAME = "yodelr_v2.py"
V2_CLASS = "class YodelrV2"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_all_impls(src_repo):
    """Every yodelr.py in the challenge repo that actually holds the impl."""
    found = []
    for path in sorted(src_repo.rglob("yodelr.py")):
        if "__pycache__" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if "class YodelrImpl" in text:
            found.append(path)
    return found


def pick_source(src_repo):
    """The preferred copy, plus any others, so drift can be reported."""
    all_impls = find_all_impls(src_repo)
    if not all_impls:
        die(
            "no yodelr.py containing 'class YodelrImpl' under {}\n"
            "       set YODELR_SRC to the challenge repo".format(src_repo)
        )

    for rel in CANDIDATES:
        candidate = src_repo / rel
        if candidate in all_impls:
            return candidate, all_impls
    return all_impls[0], all_impls


def validate(path, expect_class):
    """Refuse to ship something that is not the implementation we expect.

    Both files get the same six-method check. v2 overrides only three of the
    six and could in principle inherit the rest, but it does not -- it
    subclasses the abstract base and implements all six -- and if that ever
    changes, the page calling an inherited method is fine while this check
    failing would be a false alarm. Worth knowing before relaxing it.
    """
    text = path.read_text(encoding="utf-8")

    missing = [m for m in REQUIRED_METHODS if not re.search(r"def\s+" + m + r"\s*\(", text)]
    if missing:
        die("{} is missing: {}".format(path, ", ".join(missing)))

    if expect_class not in text:
        die("{} has no {}".format(path, expect_class.replace("class ", "")))

    # Syntax-check without importing: importing would run module-level code,
    # and compiling is enough to catch a half-saved file.
    tmp = Path(tempfile.gettempdir()) / "yodelr_syncheck.pyc"
    try:
        py_compile.compile(str(path), cfile=str(tmp), doraise=True)
    except py_compile.PyCompileError as err:
        die("{} does not compile:\n{}".format(path, err))
    finally:
        tmp.unlink(missing_ok=True)

    return text


def describe(source_file, src_root):
    """The provenance record for one copied file."""
    text = source_file.read_text(encoding="utf-8")
    return {
        # Deliberately relative. This file is committed, and an absolute path
        # would bake one machine's home directory into the repo and show up on
        # the live page.
        "sourceRelative": (
            str(source_file.relative_to(src_root))
            if src_root.is_dir() and source_file.is_relative_to(src_root)
            else source_file.name
        ),
        "sha256": sha256(source_file),
        "bytes": source_file.stat().st_size,
        "lines": text.count("\n") + 1,
    }


def report_drift(chosen, all_impls):
    """Warn when the repo holds copies of yodelr.py that disagree.

    Not fatal: which copy is canonical is the author's call, not this
    script's. But silently picking one of two different files is exactly how
    the page ends up demonstrating the wrong code, so it gets said out loud.
    """
    chosen_hash = sha256(chosen)
    divergent = [p for p in all_impls if p != chosen and sha256(p) != chosen_hash]
    if not divergent:
        return
    print("  !  other copies of yodelr.py in the challenge repo differ from the one taken:")
    for path in divergent:
        print("       {}".format(path))
    print("     Taking: {}".format(chosen))
    print("     If that is the wrong one, set YODELR_SRC or reorder CANDIDATES.")


def die(message):
    print("sync_yodelr: error: {}".format(message), file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=os.environ.get("YODELR_SRC", str(DEFAULT_SRC_REPO)),
        help="challenge repo, or a yodelr.py directly (env: YODELR_SRC)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the copy in public/ is stale; write nothing",
    )
    args = parser.parse_args()

    src = Path(args.source).expanduser().resolve()
    if not src.exists():
        # --check runs as part of `npm run build`, which has to keep working on
        # a machine that has this repo but not the private challenge repo: CI,
        # a fresh clone, a deploy box. Nothing to compare against is not the
        # same as a mismatch, so say so and let the build continue.
        if args.check:
            print(
                "sync_yodelr: challenge repo not found at {}; skipping the drift check.\n"
                "             Using the committed copy in public/yodelr/.".format(src)
            )
            return
        die("source not found: {}\n       set YODELR_SRC to the challenge repo".format(src))

    if src.is_file():
        source_file, all_impls = src, [src]
    else:
        source_file, all_impls = pick_source(src)

    # Beside yodelr.py, not searched for independently. v2 imports v1 by bare
    # module name, so the only pairing that is certainly coherent is the one
    # that shares a directory.
    v2_file = source_file.parent / V2_NAME
    if not v2_file.exists():
        die(
            "{} not found beside {}\n"
            "       the playground runs v2; without it the page has nothing "
            "to load".format(V2_NAME, source_file)
        )

    validate(source_file, "class YodelrImpl")
    validate(v2_file, V2_CLASS)

    # (source, destination name) pairs, so the copy, the staleness check and
    # the provenance record all walk the same list and cannot disagree about
    # which files are involved.
    pairs = ((source_file, "yodelr.py"), (v2_file, V2_NAME))
    provenance_path = OUT_DIR / "provenance.json"

    if args.check:
        for src_path, name in pairs:
            dest = OUT_DIR / name
            if not dest.exists():
                die("public/yodelr/{} is missing; run: npm run yodelr:sync".format(name))
            if sha256(dest) != sha256(src_path):
                die(
                    "public/yodelr/{} is stale.\n"
                    "       source: {}\n"
                    "       run: npm run yodelr:sync".format(name, src_path)
                )
        print("sync_yodelr: up to date ({} + {})".format(
            sha256(source_file)[:12], sha256(v2_file)[:12]))
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for src_path, name in pairs:
        shutil.copyfile(src_path, OUT_DIR / name)

    # The v1 keys stay at the top level rather than moving into files["yodelr.py"].
    # Flattening them would be tidier and would also silently change the shape
    # of a file the page already reads; the nesting is additive instead.
    provenance = dict(describe(source_file, src))
    provenance["files"] = {
        name: describe(src_path, src) for src_path, name in pairs
    }
    provenance["syncedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")

    for src_path, name in pairs:
        record = provenance["files"][name]
        print("sync_yodelr: {} -> public/yodelr/{}".format(src_path, name))
        print("             {} bytes, sha256 {}".format(
            record["bytes"], record["sha256"][:12]))
    report_drift(source_file, all_impls)


if __name__ == "__main__":
    main()
