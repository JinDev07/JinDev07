#!/usr/bin/env python3
"""Zip the finished project for the user (no node_modules, no out/).

    python3 package.py <project> <dest-dir> [name]
"""
import hashlib
import json
import pathlib
import sys
import zipfile

proj = pathlib.Path(sys.argv[1]).resolve()
dest = pathlib.Path(sys.argv[2]).resolve()
name = sys.argv[3] if len(sys.argv) > 3 else proj.name
dest.mkdir(parents=True, exist_ok=True)
# the voice must still be the user's file, byte for byte
chk = json.loads((proj / "voice_check.json").read_text())
h = hashlib.sha256((proj / "public" / "voice.mp3").read_bytes()).hexdigest()
if h != chk["sha256"]:
    sys.exit("voice.mp3 changed since ingest. Stop.")
for need in ["render.bat", "test_render.bat", "public/final_audio.wav", "src/film.json", "src/timing.json", "src/geo.json"]:
    if not (proj / need).exists():
        sys.exit(f"missing {need}")
out = dest / f"{name}.zip"
skip = {"node_modules", "out", ".cache"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(proj.rglob("*")):
        rel = p.relative_to(proj)
        if any(part in skip for part in rel.parts) or p.is_dir():
            continue
        z.write(p, f"{name}/{rel.as_posix()}")
print(f"wrote {out} ({out.stat().st_size // 1024} KB); voice checksum OK")
