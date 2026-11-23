#!/usr/bin/env python3
"""Ingest the user's voice MP3 and SRT into a film project.

    python3 ingest.py <project> --voice voice.mp3 --srt voice.srt

- Copies the MP3 byte for byte to <project>/public/voice.mp3 and checks the SHA-256 matches.
- Reads the duration with ffprobe.
- Parses the SRT (any encoding: utf-8, utf-8-sig, utf-16) into cues, and estimates when each word
  is spoken inside its cue (by character weight, with small pauses at punctuation). Works for
  Bangla and English.
- Writes <project>/src/timing.json  {voice_duration, duration, cues:[{i,start,end,text,words:[{w,t}]}]}
  and <project>/voice_check.json   {sha256, bytes, duration}
- Prints the cue list (index, start, end, text) so you can plan scenes and time references
  like "c12:word".
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def read_text(p):
    raw = pathlib.Path(p).read_bytes()
    for enc in ("utf-8-sig", "utf-16", "utf-8", "cp1252"):
        try:
            s = raw.decode(enc)
            if "-->" in s:
                return s
        except UnicodeDecodeError:
            continue
    raise SystemExit("Could not read the SRT file's text encoding")


def ts(s):
    h, m, rest = s.strip().replace(".", ",").split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms[:3].ljust(3, "0")) / 1000


def parse_srt(text):
    blocks = re.split(r"\r?\n\s*\r?\n", text.strip())
    cues = []
    for b in blocks:
        lines = [l.strip() for l in b.strip().splitlines() if l.strip()]
        if not lines:
            continue
        k = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if k is None:
            continue
        a, z = lines[k].split("-->")
        body = " ".join(lines[k + 1:])
        body = re.sub(r"<[^>]+>", "", body).strip()
        cues.append({"start": round(ts(a), 3), "end": round(ts(z.split()[0]), 3), "text": body})
    cues.sort(key=lambda c: c["start"])
    for i, c in enumerate(cues):
        c["i"] = i + 1
    return cues


def word_times(c):
    words = c["text"].split()
    if not words:
        return []
    weights = []
    for w in words:
        core = re.sub(r"[^\wঀ-৿]", "", w)
        wt = max(1.0, len(core)) + 1.2
        if re.search(r"[,;:—–]$", w):
            wt += 2.0
        if re.search(r"[.!?।]$", w):
            wt += 3.0
        weights.append(wt)
    total = sum(weights)
    dur = max(0.05, c["end"] - c["start"])
    t, out = c["start"], []
    for w, wt in zip(words, weights):
        out.append({"w": re.sub(r"[^\wঀ-৿'’-]", "", w), "t": round(t, 3)})
        t += dur * wt / total
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--voice", required=True)
    ap.add_argument("--srt", required=True)
    ap.add_argument("--tail", type=float, default=1.5)
    a = ap.parse_args()
    proj = pathlib.Path(a.project)
    (proj / "public").mkdir(parents=True, exist_ok=True)
    dst = proj / "public" / "voice.mp3"
    shutil.copyfile(a.voice, dst)
    s0, s1 = sha(a.voice), sha(dst)
    if s0 != s1:
        raise SystemExit("Checksum mismatch after copying the voice. Stop.")
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dst)]).decode().strip())
    cues = parse_srt(read_text(a.srt))
    for c in cues:
        c["words"] = word_times(c)
    timing = {"voice_duration": round(dur, 3), "duration": round(dur + a.tail, 3), "cues": cues}
    (proj / "src").mkdir(exist_ok=True)
    (proj / "src" / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=1), encoding="utf-8")
    (proj / "voice_check.json").write_text(json.dumps({"sha256": s0, "bytes": dst.stat().st_size, "duration": dur}, indent=1), encoding="utf-8")
    print(f"voice: {dur:.2f} s, sha256 {s0[:16]}… copied unchanged")
    print(f"film duration: {dur + a.tail:.2f} s, {len(cues)} cues")
    if cues and cues[-1]["end"] > dur + 0.5:
        print(f"WARNING: SRT runs to {cues[-1]['end']:.2f} s but the voice is {dur:.2f} s. Check the files match.")
    for c in cues:
        print(f"c{c['i']:<3} {c['start']:7.2f}-{c['end']:7.2f}  {c['text']}")


if __name__ == "__main__":
    main()
