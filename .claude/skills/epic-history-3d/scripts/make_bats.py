#!/usr/bin/env python3
"""Write render.bat and test_render.bat (Windows, CRLF) for the user's own computer.

    python3 make_bats.py <project>

Long films render in ~60 s parts so a crash never loses everything; parts are joined at the end.
The composition already carries final_audio.wav, so each part has sound; the join copies streams.
"""
import json
import math
import pathlib
import sys

proj = pathlib.Path(sys.argv[1]).resolve()
timing = json.loads((proj / "src" / "timing.json").read_text(encoding="utf-8"))
film = json.loads((proj / "src" / "film.json").read_text(encoding="utf-8"))
dur = film.get("duration") or timing["duration"]
frames = math.ceil(dur * 30)
flags = "--gl=angle --concurrency=4 --image-format=jpeg --jpeg-quality=92 --crf=17 --audio-codec=aac --audio-bitrate=256k"
L = ["@echo off", "cd /d \"%~dp0\"", "echo Installing (first time only)...", "call npm install --no-audit --no-fund", "if not exist out mkdir out"]
part = 1800  # 60 s
if frames <= 3 * part + 300:
    L.append(f"call npx remotion render src/index.jsx Film out\\final.mp4 {flags}")
else:
    names = []
    for i, a in enumerate(range(0, frames, part)):
        b = min(frames - 1, a + part - 1)
        name = f"out\\part{i + 1:02d}.mp4"
        names.append(name)
        L.append(f"if not exist {name} call npx remotion render src/index.jsx Film {name} --frames={a}-{b} {flags}")
    L.append("(" + " & ".join(f"echo file '{n.split(chr(92))[-1]}'" for n in names) + ") > out\\parts.txt")
    L.append("call npx remotion ffmpeg -y -f concat -safe 0 -i out\\parts.txt -c copy out\\final.mp4")
L += ["echo.", "echo Done: out\\final.mp4", "pause"]
(proj / "render.bat").write_bytes(("\r\n".join(L) + "\r\n").encode("utf-8"))
T = ["@echo off", "cd /d \"%~dp0\"", "call npm install --no-audit --no-fund", "if not exist out mkdir out",
     f"call npx remotion render src/index.jsx Film out\\test.mp4 --frames=0-29 {flags}", "echo Test done: out\\test.mp4", "pause"]
(proj / "test_render.bat").write_bytes(("\r\n".join(T) + "\r\n").encode("utf-8"))
print(f"render.bat ({frames} frames, {dur:.1f} s) and test_render.bat written")
