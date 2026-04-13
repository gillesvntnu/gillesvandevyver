#!/usr/bin/env python3
"""
Compress videos in src/vidoes/ so they fit under GitHub's 100 MB per-file limit.

Strategy:
  1. Scale down resolution (default: max 720p on long edge).
  2. Reduce frame rate (default: 24 fps).
  3. Re-encode with H.264 (libx264), CRF 28 for mp4, or VP9 for webm.
  4. If the result is still >= TARGET_MB, retry with more aggressive settings
     (smaller resolution, lower fps, higher CRF) up to a few passes.

Requires: ffmpeg on PATH.

Usage:
    python compress_videos.py                 # compress in place (keeps .bak copy)
    python compress_videos.py --dry-run       # show what would be done
    python compress_videos.py --target-mb 90  # aim for <90 MB
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# Files larger than this will be compressed.
SIZE_THRESHOLD_MB = 95        # GitHub's hard limit is 100 MB; leave margin.
DEFAULT_TARGET_MB = 90        # Target output size.
SEARCH_DIR = Path(__file__).parent / "src" / "vidoes"
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}

# Successive attempts: (max_long_edge_px, fps, crf_or_quality)
# Each attempt is more aggressive than the last.
PASSES = [
    (1280, 24, 28),   # 720p-ish, 24 fps, decent quality
    (960,  24, 30),
    (854,  20, 32),   # ~480p
    (640,  20, 34),   # ~360p
    (480,  15, 36),
]


def mb(path: Path) -> float:
    return path.stat().st_size / (1024 * 1024)


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit("ERROR: ffmpeg not found on PATH. Install it first "
                 "(e.g. `sudo apt install ffmpeg` or `brew install ffmpeg`).")


def probe_dimensions(path: Path) -> tuple[int, int] | None:
    """Return (width, height) or None if probing fails."""
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height",
             "-of", "csv=s=x:p=0", str(path)],
            text=True,
        ).strip()
        w, h = out.split("x")
        return int(w), int(h)
    except Exception:
        return None


def build_scale_filter(src: Path, max_edge: int) -> str:
    """Scale so the longer edge is at most `max_edge`, preserving aspect."""
    dims = probe_dimensions(src)
    if dims is None:
        # Fallback: clamp width.
        return f"scale='min({max_edge},iw)':-2"
    w, h = dims
    if max(w, h) <= max_edge:
        return "scale=iw:ih"   # no upscale
    if w >= h:
        return f"scale={max_edge}:-2"
    else:
        return f"scale=-2:{max_edge}"


def compress_once(src: Path, dst: Path, max_edge: int, fps: int, crf: int) -> None:
    scale = build_scale_filter(src, max_edge)
    vf = f"{scale},fps={fps}"

    if src.suffix.lower() == ".webm":
        # VP9 for webm. -b:v 0 + -crf enables constant-quality mode.
        cmd = [
            "ffmpeg", "-y", "-i", str(src),
            "-vf", vf,
            "-c:v", "libvpx-vp9", "-crf", str(crf + 4), "-b:v", "0",
            "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
            "-c:a", "libopus", "-b:a", "96k",
            str(dst),
        ]
    else:
        # H.264 for mp4/mov/mkv/etc. Output always .mp4.
        cmd = [
            "ffmpeg", "-y", "-i", str(src),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "96k",
            str(dst),
        ]

    subprocess.run(cmd, check=True)


def compress_file(src: Path, target_mb: float, dry_run: bool) -> None:
    original_mb = mb(src)
    print(f"\n>>> {src.relative_to(SEARCH_DIR.parent)}  ({original_mb:.1f} MB)")

    if original_mb < SIZE_THRESHOLD_MB:
        print(f"    under {SIZE_THRESHOLD_MB} MB — skipping.")
        return

    if dry_run:
        print("    [dry-run] would compress.")
        return

    # Backup once.
    backup = src.with_suffix(src.suffix + ".bak")
    if not backup.exists():
        shutil.copy2(src, backup)
        print(f"    backed up -> {backup.name}")

    # Temp output; .webm keeps webm, everything else becomes .mp4.
    out_ext = ".webm" if src.suffix.lower() == ".webm" else ".mp4"
    tmp = src.with_suffix(".compressed" + out_ext)

    for i, (edge, fps, crf) in enumerate(PASSES, 1):
        print(f"    pass {i}: max_edge={edge}px, fps={fps}, crf={crf}")
        try:
            compress_once(backup, tmp, edge, fps, crf)
        except subprocess.CalledProcessError as e:
            print(f"    ffmpeg failed: {e}")
            tmp.unlink(missing_ok=True)
            continue

        new_mb = mb(tmp)
        print(f"      -> {new_mb:.1f} MB")
        if new_mb < target_mb:
            # Replace original. If extension changed (e.g. .mov -> .mp4), move to new name.
            final = src.with_suffix(out_ext)
            if final != src and src.exists():
                src.unlink()
            tmp.replace(final)
            print(f"    OK: wrote {final.name} ({new_mb:.1f} MB)")
            if final != src:
                print(f"    NOTE: extension changed ({src.suffix} -> {out_ext}). "
                      f"Update any code references.")
            return
        else:
            tmp.unlink(missing_ok=True)

    print(f"    WARNING: could not get below {target_mb} MB after all passes. "
          f"Consider external hosting or Git LFS for this file.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target-mb", type=float, default=DEFAULT_TARGET_MB,
                    help=f"Target max size in MB (default {DEFAULT_TARGET_MB}).")
    ap.add_argument("--dry-run", action="store_true",
                    help="List what would be compressed without running ffmpeg.")
    ap.add_argument("--dir", type=Path, default=SEARCH_DIR,
                    help=f"Directory to scan (default {SEARCH_DIR}).")
    args = ap.parse_args()

    if not args.dry_run:
        check_ffmpeg()

    root: Path = args.dir
    if not root.exists():
        sys.exit(f"Directory not found: {root}")

    videos = sorted(p for p in root.rglob("*")
                    if p.is_file() and p.suffix.lower() in VIDEO_EXTS
                    and ".bak" not in p.suffixes)

    if not videos:
        print(f"No videos found under {root}")
        return

    print(f"Scanning {len(videos)} video file(s) under {root}")
    for v in videos:
        compress_file(v, args.target_mb, args.dry_run)

    print("\nDone.")
    print("If everything looks good, you can remove the .bak files with:")
    print(f"    find {root} -name '*.bak' -delete")
    print("\nThen amend / recommit. Because the old large files are still in "
          "your previous commits, you will also need to rewrite history "
          "(interactive rebase or git filter-repo) before GitHub will accept "
          "the push.")


if __name__ == "__main__":
    main()
