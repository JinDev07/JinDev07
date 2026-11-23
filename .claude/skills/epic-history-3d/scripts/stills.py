#!/usr/bin/env python3
"""Render check stills at given film times (one at a time, half scale) and tile a contact sheet.

    python3 stills.py <project> 2.5 8 14.2 ...        # times in seconds
    python3 stills.py <project> --scenes              # one still at 40% and 85% of every scene
Writes <project>/out/check/s_<time>.jpg and <project>/out/check/sheet.jpg. Look at the sheet.
"""
import glob
import json
import pathlib
import re
import subprocess
import sys


def chrome():
    for p in ["/opt/pw-browsers/chromium-*/chrome-linux64/chrome", "/opt/pw-browsers/chromium-*/chrome-linux/chrome"]:
        g = sorted(glob.glob(p))
        if g:
            return g[-1]
    return None


def make_T(timing):
    def strip(s):
        return re.sub(r"[^\wঀ-৿]", "", s.lower())

    def T(ref):
        if isinstance(ref, (int, float)):
            return float(ref)
        m = re.match(r"^c(\d+)(e)?(?::([^#+\-]+?)(?:#(\d+))?)?\s*([+-]\s*[\d.]+)?$", str(ref).strip())
        if not m:
            raise SystemExit(f"bad time ref {ref}")
        cue = next(c for c in timing["cues"] if c["i"] == int(m.group(1)))
        t = cue["end"] if m.group(2) else cue["start"]
        if m.group(3):
            hits = [w for w in cue["words"] if strip(w["w"]) == strip(m.group(3))]
            if not hits:
                raise SystemExit(f'word "{m.group(3)}" not in cue {m.group(1)}: {cue["text"]}')
            t = hits[int(m.group(4) or 1) - 1]["t"]
        if m.group(5):
            t += float(m.group(5).replace(" ", ""))
        return t
    return T


def scene_times(proj):
    film = json.loads((proj / "src" / "film.json").read_text(encoding="utf-8"))
    T = make_T(json.loads((proj / "src" / "timing.json").read_text(encoding="utf-8")))
    out = []
    for s in film["scenes"]:
        a, b = T(s["from"]), T(s["to"])
        out += [round(a + (b - a) * 0.4, 2), round(a + (b - a) * 0.85, 2)]
    return out


def main():
    proj = pathlib.Path(sys.argv[1]).resolve()
    args = sys.argv[2:]
    times = scene_times(proj) if args == ["--scenes"] else [float(x) for x in args]
    out = proj / "out" / "check"
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for t in times:
        f = out / f"s_{t:07.2f}.jpg"
        cmd = ["npx", "remotion", "still", "src/index.jsx", "Film", str(f), f"--frame={int(round(t * 30))}", "--scale=0.5", "--gl=swangle", "--log=error"]
        c = chrome()
        if c:
            cmd.append(f"--browser-executable={c}")
        r = subprocess.run(cmd, cwd=proj, capture_output=True, text=True, timeout=900)
        if r.returncode != 0:
            print(r.stdout[-3000:], r.stderr[-3000:])
            sys.exit(f"still at {t}s failed")
        print("ok", f.name, flush=True)
        files.append(f)
    if not files:
        return
    cols = 3 if len(files) > 4 else 2
    inputs = []
    for f in files:
        inputs += ["-i", str(f)]
    if len(files) == 1:
        filt = "[0:v]scale=640:360[o]"
    else:
        filt = "".join(f"[{i}:v]scale=640:360,drawtext=text='{times[i]:.2f}s':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[v{i}];" for i in range(len(files)))
        filt += "".join(f"[v{i}]" for i in range(len(files)))
        filt += f"xstack=inputs={len(files)}:layout=" + "|".join(f"{(i % cols) * 640}_{(i // cols) * 360}" for i in range(len(files))) + ":fill=black[o]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", filt, "-map", "[o]", str(out / "sheet.jpg")], check=True)
    print("sheet:", out / "sheet.jpg")


if __name__ == "__main__":
    main()
