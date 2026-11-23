#!/usr/bin/env python3
"""Check film.json before rendering anything.

    python3 validate.py <project>

- every time reference resolves (cue exists, the word is in that cue)
- scenes tile the timeline: first starts at 0, no gaps or overlaps, the last reaches the duration
- scene types and transitions are known; scenes are 1.5-14 s; not more than 3 maps in a row
- map coordinates sit inside the bbox; cameras on maps have at least two keys
Prints a scene table with resolved times. Exit code 1 on errors.
"""
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from stills import make_T  # noqa: E402

TIME_KEYS = {"t", "t_in", "t_out", "from", "to", "defeat", "rout"}
TYPES = {"map", "battle", "title", "world", "portrait"}
INS = {"clouds", "whip", "dip", "dipLight", "flash", "cut", None}


def walk(o, path, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in TIME_KEYS and isinstance(v, (str, int, float)):
                out.append((f"{path}.{k}", v))
            elif k == "move" and isinstance(v, list):
                out += [(f"{path}.move[{i}]", x) for i, x in enumerate(v)]
            else:
                walk(v, f"{path}.{k}", out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            walk(v, f"{path}[{i}]", out)


def coords(o, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("at", "from") and isinstance(v, list) and len(v) == 2 and all(isinstance(x, (int, float)) for x in v):
                out.append(v)
            elif k in ("path", "poly"):
                out += [p for p in v if isinstance(p, list) and len(p) == 2]
            elif k == "polys":
                for r in v:
                    out += r
            else:
                coords(v, out)
    elif isinstance(o, list):
        for v in o:
            coords(v, out)


def main():
    proj = pathlib.Path(sys.argv[1]).resolve()
    film = json.loads((proj / "src" / "film.json").read_text(encoding="utf-8"))
    timing = json.loads((proj / "src" / "timing.json").read_text(encoding="utf-8"))
    T = make_T(timing)
    dur = film.get("duration") or timing["duration"]
    errs, warns = [], []
    refs = []
    walk(film["scenes"], "scenes", refs)
    walk(film.get("sound", {}), "sound", refs)
    for where, ref in refs:
        try:
            v = T(ref)
            if not (-0.01 <= v <= dur + 0.01):
                warns.append(f"{where} = {ref} -> {v:.2f}s is outside the film (0-{dur:.2f})")
        except (SystemExit, StopIteration, IndexError, AttributeError) as e:
            errs.append(f"{where} = {ref!r}: {e or 'cannot resolve'}")
    prev_end, maps_run = 0.0, 0
    print(f"{'#':>3} {'type':8} {'from':>7} {'to':>7} {'len':>5}  in")
    for i, s in enumerate(film["scenes"]):
        if s.get("type") not in TYPES:
            errs.append(f"scene {i + 1}: unknown type {s.get('type')}")
            continue
        if s.get("in") not in INS:
            errs.append(f"scene {i + 1}: unknown transition {s.get('in')}")
        try:
            a, b = T(s["from"]), T(s["to"])
        except Exception:
            continue
        print(f"{i + 1:>3} {s['type']:8} {a:7.2f} {b:7.2f} {b - a:5.1f}  {s.get('in', '')}")
        if abs(a - prev_end) > 0.02:
            errs.append(f"scene {i + 1} starts at {a:.2f}s but the previous ends at {prev_end:.2f}s (gap/overlap)")
        if b - a < 1.5:
            warns.append(f"scene {i + 1} is only {b - a:.1f}s")
        if b - a > 14:
            warns.append(f"scene {i + 1} runs {b - a:.1f}s; consider splitting")
        maps_run = maps_run + 1 if s["type"] == "map" else 0
        if maps_run > 3:
            warns.append(f"scene {i + 1}: more than 3 map scenes in a row")
        if s["type"] == "map" and len(s.get("camera", [])) < 2:
            warns.append(f"scene {i + 1}: map camera needs 2+ keys for movement")
        prev_end = b
    if abs(prev_end - dur) > 0.05:
        errs.append(f"last scene ends at {prev_end:.2f}s but the film is {dur:.2f}s")
    bb = film.get("map", {}).get("bbox")
    if bb:
        pts = []
        for s in film["scenes"]:
            if s.get("type") == "map":
                coords(s, pts)
        bad = [p for p in pts if not (bb[0] <= p[0] <= bb[2] and bb[1] <= p[1] <= bb[3])]
        if bad:
            warns.append(f"{len(bad)} map points outside the bbox, e.g. {bad[:3]} (fine for polygons running into the sea, not for cities or cameras)")
    for w in warns:
        print("WARN ", w)
    for e in errs:
        print("ERROR", e)
    print("OK" if not errs else f"{len(errs)} error(s)")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
