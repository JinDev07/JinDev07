#!/usr/bin/env python3
"""Original synthesised score, ambience and sound effects, mixed under the untouched voice.

    python3 sound.py <project>            # writes public/final_audio.wav and out/sound_report.json

Reads src/film.json and src/timing.json. Everything is generated with numpy/scipy here, so there
is nothing to license. The voice samples are added unchanged (no gain, EQ or compression); only
the music/effects bed is ducked and limited around it.

film.json may carry a "sound" block (all optional):
  "sound": {
    "key": "D", "colour": "eastern" | "western",           # scale colour of the score
    "music": [{"from": "c1", "to": "c9", "mood": "solemn"}, ...],   # moods: solemn tension epic triumph sorrow outro
    "sfx": [{"t": "c12:marched", "kind": "horn", "gain": 0.8, "pan": -0.3}, ...],
    "music_gap_db": -9, "music_under_voice_db": -20, "sfx_db": -8
  }
Without "music", moods come from each scene's "mood" or a default per scene type.
Automatic cues: a whoosh on every cut, a boom on titles, a horn when an army appears, a riser into
battles, drums under marching armies, clash and crowd in battles, and an ambience bed per scene.
"""
import json
import pathlib
import re
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(7)


# ---------------------------------------------------------------- time refs (same rules as the film)
def make_T(timing):
    def strip(s):
        return re.sub(r"[^\wঀ-৿]", "", s.lower())

    def T(ref):
        if isinstance(ref, (int, float)):
            return float(ref)
        m = re.match(r"^c(\d+)(e)?(?::([^#+\-]+?)(?:#(\d+))?)?\s*([+-]\s*[\d.]+)?$", str(ref).strip())
        cue = next(c for c in timing["cues"] if c["i"] == int(m.group(1)))
        t = cue["end"] if m.group(2) else cue["start"]
        if m.group(3):
            hits = [w for w in cue["words"] if strip(w["w"]) == strip(m.group(3))]
            t = hits[int(m.group(4) or 1) - 1]["t"]
        if m.group(5):
            t += float(m.group(5).replace(" ", ""))
        return t
    return T


# ---------------------------------------------------------------- primitives
def n(sec):
    return max(1, int(sec * SR))


def env_adsr(N, a=0.01, d=0.1, s=0.7, r=0.3):
    e = np.ones(N) * s
    A, D, R = min(N, n(a)), min(N, n(d)), min(N, n(r))
    e[:A] = np.linspace(0, 1, A)
    e[A:A + D] = np.linspace(1, s, len(e[A:A + D]))
    if R > 0:
        e[-R:] *= np.linspace(1, 0, R)
    return e


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(0.99, fc / (SR / 2)), "low")
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, max(1e-4, fc / (SR / 2)), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [max(1e-4, lo / (SR / 2)), min(0.99, hi / (SR / 2))], "band")
    return signal.lfilter(b, a, x)


def noise(N):
    return RNG.standard_normal(N)


def saw(f, N, detune=0.0, phase=0.0):
    t = np.arange(N) / SR
    ph = (f * (1 + detune)) * t + phase
    return 2 * (ph - np.floor(ph + 0.5))


def harmonic(f, N, partials, vib=0.0, vibf=5.0):
    t = np.arange(N) / SR
    fm = f * (1 + vib * np.sin(2 * np.pi * vibf * t))
    ph = 2 * np.pi * np.cumsum(fm) / SR
    out = np.zeros(N)
    for k, a in enumerate(partials, 1):
        if f * k > SR / 2.2:
            break
        out += a * np.sin(ph * k)
    return out


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(semi_from_a4):
    return 440.0 * 2 ** (semi_from_a4 / 12)


# ---------------------------------------------------------------- instruments
def pad(freqs, dur, bright=0.5, amp=0.18):
    N = n(dur)
    out = np.zeros(N)
    for f in freqs:
        for dt in (-0.004, 0.0, 0.0045):
            out += saw(f, N, dt, RNG.random())
    out = lp(out, 600 + 2400 * bright)
    return out * env_adsr(N, a=min(1.5, dur * 0.3), d=0.5, s=0.85, r=min(1.5, dur * 0.3)) * amp / max(1, len(freqs))


def choir(freqs, dur, amp=0.12):
    N = n(dur)
    out = np.zeros(N)
    for f in freqs:
        partials = []
        for k in range(1, 30):
            fk = f * k
            w = sum(g * np.exp(-((fk - F) ** 2) / (2 * bw ** 2)) for F, bw, g in ((730, 90, 1.0), (1090, 110, 0.5), (2440, 160, 0.25)))
            partials.append(w / k ** 0.3)
        out += harmonic(f, N, partials, vib=0.004, vibf=4.8 + RNG.random())
    return out * env_adsr(N, a=min(2.0, dur * 0.35), d=0.5, s=0.9, r=min(1.8, dur * 0.35)) * amp / max(1, len(freqs))


def strings_ostinato(f, dur, bpm, amp=0.14, pattern=(1, 0.6, 0.8, 0.6)):
    N = n(dur)
    out = np.zeros(N)
    step = 60 / bpm / 2
    i, t = 0, 0.0
    while t < dur:
        L = min(step * 0.95, dur - t)
        nn = n(L)
        tone = saw(f, nn, 0, 0) + 0.5 * saw(f * 2, nn, 0.002, 0.3)
        tone = lp(tone, 1400) * env_adsr(nn, a=0.02, d=0.08, s=0.6, r=0.06) * pattern[i % len(pattern)]
        s0 = n(t)
        out[s0:s0 + nn] += tone[: len(out[s0:s0 + nn])]
        t += step
        i += 1
    return out * amp


def brass(freqs, dur, amp=0.16):
    N = n(dur)
    out = np.zeros(N)
    bright = np.linspace(0.2, 1, N) ** 0.7
    for f in freqs:
        raw = saw(f, N, 0.0015, RNG.random()) + saw(f, N, -0.002, RNG.random())
        out += lp(raw, 900) * (0.5 + 0.5 * bright) + hp(lp(raw, 2600), 900) * bright * 0.5
    return out * env_adsr(N, a=0.35, d=0.3, s=0.85, r=0.6) * amp / max(1, len(freqs))


def pluck(f, dur=1.2, amp=0.2):
    """Karplus-Strong string (oud-like colour)."""
    N = n(dur)
    L = max(2, int(SR / f))
    buf = RNG.uniform(-1, 1, L)
    out = np.zeros(N)
    for i in range(N):
        out[i] = buf[i % L]
        buf[i % L] = 0.996 * 0.5 * (buf[i % L] + buf[(i + 1) % L])
    return lp(out, 3500) * amp


def drum(kind="taiko", amp=0.6):
    if kind == "taiko":
        N = n(1.2)
        t = np.arange(N) / SR
        f = 55 + 60 * np.exp(-t * 18)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
        skin = lp(noise(N), 900) * np.exp(-t * 30) * 0.4
        return (body + skin) * amp
    if kind == "frame":
        N = n(0.5)
        t = np.arange(N) / SR
        body = np.sin(2 * np.pi * np.cumsum(120 + 80 * np.exp(-t * 40)) / SR) * np.exp(-t * 14)
        return (body + bp(noise(N), 700, 4000) * np.exp(-t * 35) * 0.5) * amp * 0.6
    N = n(0.25)
    t = np.arange(N) / SR
    return bp(noise(N), 1500, 7000) * np.exp(-t * 40) * amp * 0.3


# ---------------------------------------------------------------- score
MOODS = {
    #           progression (scale degrees, minor key)   bpm  layers
    "solemn":  ([0, 5, 3, 4], 70, {"pad": 1, "choir": 0.8, "strings": 0, "drums": 0, "brass": 0, "pluck": 0.4}),
    "tension": ([0, 0, 1, 0], 84, {"pad": 0.8, "choir": 0.3, "strings": 1, "drums": 0.5, "brass": 0, "pluck": 0.2}),
    "epic":    ([0, 5, 2, 6], 84, {"pad": 1, "choir": 1, "strings": 1, "drums": 1, "brass": 1, "pluck": 0}),
    "triumph": ([2, 6, 0, 4], 84, {"pad": 1, "choir": 1, "strings": 0.8, "drums": 0.8, "brass": 1, "pluck": 0}),
    "sorrow":  ([0, 3, 5, 4], 64, {"pad": 1, "choir": 0.9, "strings": 0, "drums": 0, "brass": 0, "pluck": 0.6}),
    "outro":   ([0, 5, 3, 0], 66, {"pad": 1, "choir": 0.7, "strings": 0, "drums": 0.2, "brass": 0.3, "pluck": 0.3}),
}
TYPE_MOOD = {"title": "epic", "map": "tension", "battle": "epic", "world": "solemn", "portrait": "solemn"}


def scale(key, colour):
    root = NOTE[key] - 9  # semitones from A
    steps = [0, 1, 4, 5, 7, 8, 10] if colour == "eastern" else [0, 2, 3, 5, 7, 8, 10]
    return root, steps


def chord(root, steps, degree, octave=-1):
    tones = []
    for k in (0, 2, 4):
        d = degree + k
        tones.append(hz(root + steps[d % 7] + 12 * (d // 7) + 12 * octave))
    return tones


def render_music(segments, total, key, colour):
    out = np.zeros(n(total) + n(4))
    root, steps = scale(key, colour)
    for seg in segments:
        a, b, mood = seg["a"], seg["b"], seg["mood"]
        prog, bpm, lay = MOODS.get(mood, MOODS["solemn"])
        bar = 60 / bpm * 4
        t, i = a, 0
        while t < b - 0.2:
            L = min(bar * 2, b - t) + 1.2  # overlap tails between chords
            deg = prog[i % len(prog)]
            ch = chord(root, steps, deg, -1)
            s0 = n(t)
            parts = []
            if lay["pad"]:
                parts.append(pad(ch, L, bright=0.35 if mood in ("solemn", "sorrow") else 0.6) * lay["pad"])
            if lay["choir"]:
                parts.append(choir([c * 2 for c in ch[:2]], L) * lay["choir"])
            if lay["brass"] and i % 2 == 1:
                parts.append(brass([ch[0], ch[2]], L * 0.9) * lay["brass"])
            if lay["strings"]:
                parts.append(strings_ostinato(ch[0] / 2, L - 1.2, bpm) * lay["strings"])
            for p in parts:
                seg_end = min(len(out), s0 + len(p))
                out[s0:seg_end] += p[: seg_end - s0]
            if lay["drums"]:
                beat = 60 / bpm
                pat = [(0, "taiko", 1.0), (2, "taiko", 0.6), (2.5, "frame", 0.7), (3, "frame", 0.6), (3.5, "taiko", 0.8)] if mood != "tension" else [(0, "taiko", 0.8), (1.5, "frame", 0.5), (3, "frame", 0.5)]
                for rep in range(2):
                    for pos, kind, g in pat:
                        tt = t + rep * bar + pos * beat
                        if tt < b:
                            d = drum(kind, 0.5 * g * lay["drums"])
                            s1 = n(tt)
                            e1 = min(len(out), s1 + len(d))
                            out[s1:e1] += d[: e1 - s1]
            if lay["pluck"]:
                beat = 60 / bpm
                for k2, pos in enumerate((0, 1.5, 2, 3, 5, 5.5, 6)):
                    tt = t + pos * beat
                    if tt < b and RNG.random() < 0.8 * lay["pluck"] + 0.2:
                        d = int(pos * 2 + k2) % 7
                        f = hz(root + steps[(deg + d) % 7] + 12 * ((deg + d) // 7))
                        p = pluck(f, 1.0, 0.16 * lay["pluck"])
                        s1 = n(tt)
                        e1 = min(len(out), s1 + len(p))
                        out[s1:e1] += p[: e1 - s1]
            t += bar * 2
            i += 1
    # gentle hall reverb (convolution with a decaying noise tail)
    ir_n = n(2.2)
    ir = noise(ir_n) * np.exp(-np.arange(ir_n) / SR * 3.2)
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(out, ir)[: len(out)] * 0.35
    return out + wet


# ---------------------------------------------------------------- effects
def sfx(kind, dur=None):
    if kind == "whoosh":
        N = n(dur or 0.9)
        t = np.linspace(0, 1, N)
        x = noise(N)
        e = np.sin(np.pi * t) ** 2
        fc = 300 + 2500 * np.sin(np.pi * t)
        y = np.zeros(N)
        for i0 in range(0, N, 2048):
            seg = x[i0:i0 + 2048]
            y[i0:i0 + len(seg)] = bp(seg, fc[i0] * 0.5, fc[i0] * 1.6)
        return y * e * 0.8
    if kind == "boom":
        N = n(dur or 3.0)
        t = np.arange(N) / SR
        sub = np.sin(2 * np.pi * np.cumsum(45 * np.exp(-t * 0.7) + 25) / SR) * np.exp(-t * 1.3)
        hit = lp(noise(N), 400) * np.exp(-t * 9) * 0.8
        return (sub + hit) * 0.9
    if kind == "impact":
        N = n(1.2)
        t = np.arange(N) / SR
        return (np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 6) + 40) / SR) * np.exp(-t * 6) + lp(noise(N), 1200) * np.exp(-t * 18) * 0.6) * 0.8
    if kind == "riser":
        N = n(dur or 2.0)
        t = np.linspace(0, 1, N)
        x = hp(noise(N), 500) * t ** 2.2 * 0.5
        tone = np.sin(2 * np.pi * np.cumsum(200 + 600 * t ** 2) / SR) * t ** 2 * 0.3
        return x + tone
    if kind == "horn":
        N = n(dur or 2.4)
        t = np.arange(N) / SR
        f = 110 * (1 + 0.012 * np.sin(2 * np.pi * 5 * t)) * (1 + 0.03 * (1 - np.exp(-t * 6)))
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum((1 / k ** 0.8) * np.sin(ph * k) for k in range(1, 18))
        x = lp(x, 1600)
        return x * env_adsr(N, a=0.25, d=0.2, s=0.85, r=0.7) * 0.5
    if kind == "clash":
        N = n(0.9)
        t = np.arange(N) / SR
        parts = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * (6 + k * 2)) for k, f in enumerate((1870, 2630, 3410, 4720, 5980)))
        return (parts * 0.25 + hp(noise(N), 3000) * np.exp(-t * 40) * 0.6) * 0.7
    if kind == "crowd":
        N = n(dur or 4)
        t = np.arange(N) / SR
        x = bp(noise(N), 250, 1800) * (0.6 + 0.4 * lp(np.abs(noise(N)), 3) * 3)
        return x * env_adsr(N, a=0.8, d=0.2, s=1, r=1.0) * 0.35
    if kind == "march":
        N = n(dur or 4)
        out = np.zeros(N)
        step = 0.5
        for k in range(int((dur or 4) / step)):
            d = drum("frame", 0.35 if k % 2 else 0.5)
            s0 = n(k * step)
            e0 = min(N, s0 + len(d))
            out[s0:e0] += d[: e0 - s0]
            st = lp(noise(n(0.12)), 600) * np.exp(-np.arange(n(0.12)) / SR * 30) * 0.4
            s1 = n(k * step + 0.25)
            e1 = min(N, s1 + len(st))
            out[s1:e1] += st[: e1 - s1]
        return out
    if kind == "hooves":
        N = n(dur or 3)
        out = np.zeros(N)
        t = 0.0
        while t < (dur or 3) - 0.1:
            for off in (0, 0.07, 0.16):
                h = lp(noise(n(0.05)), 900) * np.exp(-np.arange(n(0.05)) / SR * 70) * 0.5
                s0 = n(t + off)
                e0 = min(N, s0 + len(h))
                out[s0:e0] += h[: e0 - s0]
            t += 0.36
        return out
    if kind == "wind":
        N = n(dur or 6)
        x = noise(N)
        mod = 0.5 + 0.5 * lp(noise(N), 0.4) * 20
        return bp(x, 150, 900) * np.clip(mod, 0.1, 1.5) * 0.25
    if kind == "sea":
        N = n(dur or 6)
        t = np.arange(N) / SR
        swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 5.5) ** 2
        return lp(noise(N), 1100) * swell * 0.3
    if kind == "fire":
        N = n(dur or 6)
        base = lp(noise(N), 500) * 0.12
        crack = np.zeros(N)
        for _ in range(int((dur or 6) * 14)):
            p = int(RNG.random() * (N - 400))
            crack[p:p + 300] += hp(noise(300), 2000) * np.exp(-np.arange(300) / 40) * RNG.random() * 0.6
        return base + crack
    if kind == "city":
        N = n(dur or 6)
        return bp(noise(N), 300, 2500) * 0.08 + sfx("wind", dur) * 0.4
    if kind == "paper":
        N = n(0.35)
        t = np.arange(N) / SR
        return hp(noise(N), 1500) * np.exp(-t * 14) * 0.25
    if kind == "bell":
        N = n(4)
        t = np.arange(N) / SR
        return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in ((220, 1, 0.8), (440 * 1.19, 0.6, 1.2), (660 * 1.33, 0.4, 1.8), (880 * 1.5, 0.3, 2.5))) * 0.3
    if kind == "stamp":
        return sfx("impact") * 0.7 + sfx("paper") * 0.6
    raise ValueError("unknown sfx " + kind)


# ---------------------------------------------------------------- build plan
def plan(film, timing, T):
    snd = film.get("sound", {})
    scenes = []
    for s in film["scenes"]:
        scenes.append({**s, "a": T(s["from"]), "b": T(s["to"])})
    total = film.get("duration") or timing["duration"]
    # music segments
    if snd.get("music"):
        music = [{"a": T(m["from"]), "b": T(m["to"]), "mood": m["mood"]} for m in snd["music"]]
    else:
        music = []
        for s in scenes:
            mood = s.get("mood_music") or TYPE_MOOD.get(s["type"], "solemn")
            if music and music[-1]["mood"] == mood:
                music[-1]["b"] = s["b"]
            else:
                music.append({"a": s["a"], "b": s["b"], "mood": mood})
        last = scenes[-1]
        if len(scenes) > 2 and last["type"] in ("title", "world", "portrait") and not last.get("mood_music"):
            if music[-1]["a"] < last["a"]:
                music[-1]["b"] = last["a"]
                music.append({"a": last["a"], "b": last["b"], "mood": "outro"})
            else:
                music[-1]["mood"] = "outro"
    music[-1]["b"] = max(music[-1]["b"], total)
    cues, beds = [], []
    for i, s in enumerate(scenes):
        if i > 0:
            cues.append({"t": s["a"] - 0.45, "kind": "whoosh", "gain": 0.55, "pan": 0})
        if s["type"] == "title":
            cues.append({"t": s["a"] + 0.25, "kind": "boom", "gain": 0.9, "pan": 0})
        if s["type"] == "map":
            beds.append((s["a"], s["b"], "wind", 0.35))
            for lb in s.get("labels", []) + s.get("cities", []):
                if lb.get("t_in") not in (None, 0):
                    cues.append({"t": T(lb["t_in"]), "kind": "paper", "gain": 0.5, "pan": 0})
            for ar in s.get("arrows", []):
                cues.append({"t": T(ar["t_in"]), "kind": "whoosh", "gain": 0.45, "pan": 0, "dur": 1.4})
            for a in s.get("armies", []):
                if a.get("t_in") is not None:
                    cues.append({"t": T(a["t_in"]), "kind": "horn", "gain": 0.6, "pan": 0})
                if a.get("move"):
                    m0, m1 = T(a["move"][0]), T(a["move"][1])
                    cues.append({"t": m0, "kind": "hooves" if a.get("kind") == "cavalry" else "march", "gain": 0.5, "pan": 0, "dur": m1 - m0})
            for b in s.get("battles", []):
                cues.append({"t": T(b["t_in"]), "kind": "clash", "gain": 0.6, "pan": 0})
            for ter in s.get("territories", []):
                if ter.get("from") and ter.get("t_in") not in (None, 0):
                    cues.append({"t": T(ter["t_in"]), "kind": "impact", "gain": 0.35, "pan": 0})
        if s["type"] == "battle":
            cues.append({"t": s["a"] - 1.6, "kind": "riser", "gain": 0.45, "pan": 0, "dur": 1.6})
            beds.append((s["a"], s["b"], "crowd", 0.45))
            beds.append((s["a"], s["b"], "wind", 0.3))
            for k in range(int((s["b"] - s["a"]) / 1.7)):
                cues.append({"t": s["a"] + 0.8 + k * 1.7 + RNG.random() * 0.6, "kind": "clash", "gain": 0.25 + RNG.random() * 0.2, "pan": RNG.uniform(-0.6, 0.6)})
            for ar in s.get("arrows", []):
                cues.append({"t": T(ar["t_in"]), "kind": "horn", "gain": 0.55, "pan": 0})
        if s["type"] == "world":
            p = s.get("preset", "fortress")
            beds.append((s["a"], s["b"], {"fleet": "sea", "camp": "fire", "city": "city", "march": "wind"}.get(p, "wind"), 0.45))
            if p == "march":
                cues.append({"t": s["a"], "kind": "march", "gain": 0.5, "pan": 0, "dur": s["b"] - s["a"]})
            if p in ("city", "fortress"):
                cues.append({"t": s["a"] + 0.6, "kind": "bell", "gain": 0.3, "pan": 0.3})
        if s["type"] == "portrait":
            beds.append((s["a"], s["b"], "fire", 0.25))
    for c in snd.get("sfx", []):
        cues.append({"t": T(c["t"]), "kind": c["kind"], "gain": c.get("gain", 0.6), "pan": c.get("pan", 0), "dur": c.get("dur")})
    return music, cues, beds, total


def place(buf, x, t, gain, pan=0.0):
    s0 = n(max(0, t))
    e0 = min(buf.shape[0], s0 + len(x))
    if e0 <= s0:
        return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[s0:e0, 0] += x[: e0 - s0] * gain * l * 1.414
    buf[s0:e0, 1] += x[: e0 - s0] * gain * r * 1.414


def db(x):
    return 10 ** (x / 20)


def main():
    proj = pathlib.Path(sys.argv[1]).resolve()
    film = json.loads((proj / "src" / "film.json").read_text(encoding="utf-8"))
    timing = json.loads((proj / "src" / "timing.json").read_text(encoding="utf-8"))
    T = make_T(timing)
    snd = film.get("sound", {})
    music, cues, beds, total = plan(film, timing, T)
    N = n(total)

    # voice, decoded only (not processed)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(proj / "public" / "voice.mp3"), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"])
    voice = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    V = np.zeros((N, 2))
    V[: min(N, len(voice))] = voice[:N]

    # loudness of speech (RMS over active 50 ms windows)
    mono = V.mean(1)
    win = n(0.05)
    frames = mono[: len(mono) // win * win].reshape(-1, win)
    rms = np.sqrt((frames ** 2).mean(1) + 1e-12)
    active = rms > max(1e-4, np.percentile(rms, 60) * 0.25)
    speech_rms = np.sqrt((rms[active] ** 2).mean()) if active.any() else 0.05

    # music
    print("music:", ", ".join(f"{m['mood']} {m['a']:.1f}-{m['b']:.1f}" for m in music))
    mus = render_music(music, total, snd.get("key", "D"), snd.get("colour", "eastern"))[:N]
    mus = np.stack([mus, np.roll(mus, n(0.012))], 1)  # a little stereo width
    # beds and cues
    fx = np.zeros((N, 2))
    for a, b, kind, g in beds:
        x = sfx(kind, b - a + 1.0)
        x *= env_adsr(len(x), a=0.6, d=0.1, s=1, r=0.8)
        place(fx, x, a - 0.3, g * 0.5, 0)
    for c in cues:
        x = sfx(c["kind"], c.get("dur"))
        place(fx, x, c["t"], c["gain"], c.get("pan", 0))

    # levels relative to the speech
    def norm_rms(x):
        r = np.sqrt((x ** 2).mean() + 1e-12)
        return x / r
    mus = norm_rms(mus) * speech_rms
    fx = norm_rms(fx) * speech_rms if np.abs(fx).max() > 0 else fx
    # ducking envelope from the voice (attack 80 ms, release 450 ms)
    env = np.repeat(active.astype(float), win)
    env = np.pad(env, (0, N - len(env)))[:N]
    att, rel = 1 - np.exp(-1 / (0.08 * SR / 64)), 1 - np.exp(-1 / (0.45 * SR / 64))
    e_ds = env[::64]
    sm = np.zeros_like(e_ds)
    for i in range(1, len(e_ds)):
        k = att if e_ds[i] > sm[i - 1] else rel
        sm[i] = sm[i - 1] + k * (e_ds[i] - sm[i - 1])
    sm = np.interp(np.arange(N), np.arange(len(sm)) * 64, sm)
    gap_db, under_db = snd.get("music_gap_db", -9), snd.get("music_under_voice_db", -18)
    mus_gain = db(gap_db) * (1 - sm) + db(under_db) * sm
    fx_gain = db(snd.get("sfx_db", -8)) * (1 - 0.45 * sm)
    bed = mus * mus_gain[:, None] + fx * fx_gain[:, None]
    # fade music out at the end
    fade = np.clip((total - np.arange(N) / SR) / 2.5, 0, 1)
    bed *= fade[:, None]
    # limiter on the bed only: keep voice + bed under -1 dBFS
    ceiling = db(-1.2)
    m = (np.abs(V + bed).max(1) > ceiling)
    # simple robust gain-riding: min filter over 20 ms then smooth
    g = np.ones(N)
    if m.any():
        room = np.clip(ceiling - np.abs(V).max(1), 0, None)
        bmax = np.abs(bed).max(1) + 1e-9
        raw_g = np.clip(room / bmax, 0, 1)
        w = n(0.02)
        pad_ = np.pad(raw_g, (w, w), constant_values=1)
        from numpy.lib.stride_tricks import sliding_window_view
        g = sliding_window_view(pad_, 2 * w + 1).min(1)[:N]
        g = signal.filtfilt(*signal.butter(1, 30 / (SR / 2)), g)
        g = np.minimum(g, raw_g + 1e-3).clip(0, 1)
    bed *= g[:, None]
    final = V + bed
    peak = np.abs(final).max()
    out = proj / "public" / "final_audio.wav"
    pcm = np.clip(final, -1, 1).astype(np.float32).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s24le", str(out)], input=pcm, check=True)
    # verify: voice inside the mix is unchanged (residual equals the bed we added)
    check = {
        "duration_s": round(N / SR, 3), "film_duration_s": total, "peak_dbfs": round(20 * np.log10(peak + 1e-12), 2),
        "music_segments": music, "cues": len(cues), "beds": len(beds),
        "voice_gain_applied": 0, "speech_rms_dbfs": round(20 * np.log10(speech_rms), 2),
    }
    (proj / "out").mkdir(exist_ok=True)
    (proj / "out" / "sound_report.json").write_text(json.dumps(check, indent=1), encoding="utf-8")
    print(f"wrote {out}: {N / SR:.2f} s, peak {check['peak_dbfs']} dBFS, {len(cues)} cues, {len(beds)} beds")
    # point the film at the mix
    if film.get("audio") != "final_audio.wav":
        film["audio"] = "final_audio.wav"
        (proj / "src" / "film.json").write_text(json.dumps(film, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
