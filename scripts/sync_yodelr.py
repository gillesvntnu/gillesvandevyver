#!/usr/bin/env python3
"""Copy yodelr.py out of the coding-challenge repo and into public/.

The Yodelr playground page runs the real submitted implementation in the
browser under Pyodide. For that to be true rather than merely claimed, the
Python has to arrive here by being copied, never by being retyped: a
hand-maintained second copy drifts away from the original the first time the
original is touched, and then the page is demonstrating something that no
longer exists.

So this script is the only thing allowed to put yodelr.py into this repo. It
reads the challenge repo, never writes to it, and records where the file came
from so the page can show it.

    python3 scripts/sync_yodelr.py            # default source, see below
    YODELR_SRC=/path/to/repo npm run yodelr:sync
    python3 scripts/sync_yodelr.py --check    # verify, change nothing

Outputs:
    public/yodelr/yodelr.py         byte-for-byte copy
    public/yodelr/provenance.json   hash, source path, size, sync time
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


def validate(path):
    """Refuse to ship something that is not the implementation we expect."""
    text = path.read_text(encoding="utf-8")

    missing = [m for m in REQUIRED_METHODS if not re.search(r"def\s+" + m + r"\s*\(", text)]
    if missing:
        die("{} is missing: {}".format(path, ", ".join(missing)))

    if "class YodelrImpl" not in text:
        die("{} has no YodelrImpl".format(path))

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

    validate(source_file)
    source_hash = sha256(source_file)

    dest = OUT_DIR / "yodelr.py"
    provenance_path = OUT_DIR / "provenance.json"

    if args.check:
        if not dest.exists():
            die("public/yodelr/yodelr.py is missing; run: npm run yodelr:sync")
        if sha256(dest) != source_hash:
            die(
                "public/yodelr/yodelr.py is stale.\n"
                "       source: {}\n"
                "       run: npm run yodelr:sync".format(source_file)
            )
        print("sync_yodelr: up to date ({})".format(source_hash[:12]))
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_file, dest)

    text = source_file.read_text(encoding="utf-8")
    provenance = {
        # Deliberately relative. This file is committed, and an absolute path
        # would bake one machine's home directory into the repo and show up on
        # the live page.
        "sourceRelative": (
            str(source_file.relative_to(src)) if src.is_dir() else source_file.name
        ),
        "sha256": source_hash,
        "bytes": source_file.stat().st_size,
        "lines": text.count("\n") + 1,
        "syncedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")

    print("sync_yodelr: {} -> public/yodelr/yodelr.py".format(source_file))
    print("             {} bytes, sha256 {}".format(provenance["bytes"], source_hash[:12]))
    report_drift(source_file, all_impls)


if __name__ == "__main__":
    main()
