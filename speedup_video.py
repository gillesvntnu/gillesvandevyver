"""
Double the playback speed of a video file using ffmpeg.
Auto-detects whether the file has an audio track.
"""

import json
import subprocess
from pathlib import Path

INPUT_PATH = Path("/home/gillesv/PrivateProjects/gillesvandevyver/src/vidoes/agentic_ai/deepecho_agentic_demo.webm")
SPEED_FACTOR = 2.0


def has_audio(path: Path) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=index", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    return bool(json.loads(out).get("streams"))


def speed_up_video(input_path: Path, speed: float = 2.0) -> Path:
    if not input_path.exists():
        raise FileNotFoundError(input_path)

    output_path = input_path.with_name(f"{input_path.stem}_{speed:g}x{input_path.suffix}")

    if has_audio(input_path):
        filter_complex = f"[0:v]setpts=PTS/{speed}[v];[0:a]atempo={speed}[a]"
        maps = ["-map", "[v]", "-map", "[a]"]
    else:
        filter_complex = f"[0:v]setpts=PTS/{speed}[v]"
        maps = ["-map", "[v]"]

    cmd = ["ffmpeg", "-y", "-i", str(input_path),
           "-filter_complex", filter_complex, *maps, str(output_path)]

    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"\nDone -> {output_path}")
    return output_path


if __name__ == "__main__":
    speed_up_video(INPUT_PATH, SPEED_FACTOR)
