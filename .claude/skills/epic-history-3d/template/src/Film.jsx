// The film: scenes from film.json laid end to end on the voice timeline, game-style transitions
// between them (cloud pass, dip, whip), the film finish, and the mixed soundtrack.
import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import filmRaw from "./film.json";
import timing from "./timing.json";

const film = { ...filmRaw, duration: filmRaw.duration ?? timing.duration };
import { T, FPS, clamp, smooth, rng, useFontsReady } from "./lib/core";
import { Finish } from "./lib/Stage";
import { MapScene } from "./scenes/MapScene";
import { BattleScene } from "./scenes/BattleScene";
import { TitleScene } from "./scenes/TitleScene";
import { WorldScene } from "./scenes/WorldScene";
import { PortraitScene } from "./scenes/PortraitScene";

const TYPES = { map: MapScene, battle: BattleScene, title: TitleScene, world: WorldScene, portrait: PortraitScene };

export function filmDuration() { return Math.ceil((film.duration || 10) * FPS); }

export const Film = () => {
  const ready = useFontsReady();
  if (!ready) return null;
  const scenes = film.scenes.map((s) => ({ ...s, from: T(s.from), to: T(s.to) }));
  return (
    <AbsoluteFill style={{ background: "#0d0a07" }}>
      {scenes.map((s, i) => {
        const C = TYPES[s.type];
        if (!C) throw new Error("Unknown scene type " + s.type);
        const f0 = Math.round(s.from * FPS), f1 = Math.round((i === scenes.length - 1 ? Math.max(s.to, film.duration) : s.to) * FPS);
        return (
          <Sequence key={i} from={f0} durationInFrames={Math.max(1, f1 - f0)} name={`${i + 1} ${s.type}`}>
            <Whip scene={s} next={scenes[i + 1]}><C cfg={s} film={film} from={s.from} /></Whip>
          </Sequence>
        );
      })}
      <Transitions scenes={scenes} />
      <Finish {...(film.finish || {})} />
      <EndFade />
      {film.audio && <Audio src={staticFile(film.audio)} />}
    </AbsoluteFill>
  );
};

// whip pan: blur + slide at the start (incoming) or end (outgoing) of a scene
function Whip({ scene, next, children }) {
  const frame = useCurrentFrame();
  const t = scene.from + frame / FPS;
  let k = 0, dir = 1;
  if ((scene.in || "") === "whip") k = Math.max(k, 1 - clamp((t - scene.from) / 0.3));
  if (next && (next.in || "") === "whip") { const kk = clamp((t - (scene.to - 0.3)) / 0.3); if (kk > k) { k = kk; dir = -1; } }
  if (k <= 0) return children;
  const e = smooth(k);
  return <AbsoluteFill style={{ filter: `blur(${e * 26}px)`, transform: `translateX(${dir * e * 140}px) scale(${1 + e * 0.04})` }}>{children}</AbsoluteFill>;
}

function Transitions({ scenes }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / FPS;
  const out = [];
  scenes.forEach((s, i) => {
    if (i === 0) {
      // opening fade from black
      const k = 1 - smooth(t / 0.8);
      if (k > 0) out.push(<AbsoluteFill key="open" style={{ background: "#000", opacity: k }} />);
      return;
    }
    const b = s.from, kind = s.in || "clouds";
    if (kind === "dip" || kind === "dipLight") {
      const k = 1 - smooth(Math.abs(t - b) / 0.35);
      if (k > 0) out.push(<AbsoluteFill key={i} style={{ background: kind === "dip" ? "#070504" : "#f3e7cc", opacity: k }} />);
    } else if (kind === "clouds") {
      const u = (t - b) / 0.7; // -1..1 covers the cut
      if (u > -1 && u < 1) out.push(<CloudWipe key={i} u={u} seed={i} w={width} h={height} />);
    } else if (kind === "flash") {
      const k = 1 - smooth(Math.abs(t - b) / 0.2);
      if (k > 0) out.push(<AbsoluteFill key={i} style={{ background: "#fff6e0", opacity: k * 0.85 }} />);
    }
  });
  return <>{out}</>;
}

// Painted clouds sweep across the lens; fully covered at u = 0 (the cut).
function CloudWipe({ u, seed, w, h }) {
  const r = rng(seed + 100);
  const puffs = [];
  for (let i = 0; i < 46; i++) puffs.push({ x: r(), y: r(), s: 0.25 + r() * 0.35, d: 0.6 + r() * 0.8, sh: r() });
  const cover = 1 - Math.abs(u); // 0..1..0
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "#eee7d8", opacity: smooth((cover - 0.55) / 0.3) }} />
      {puffs.map((p, i) => {
        const x = (p.x - 0.5) * 1.6 + 0.5 - u * p.d * 1.3;
        const size = p.s * w * (0.6 + cover * 0.9);
        const op = smooth(cover * 1.6 - p.sh * 0.4);
        return (
          <div key={i} style={{
            position: "absolute", left: x * w - size / 2, top: p.y * h - size / 2, width: size, height: size * 0.7, borderRadius: "50%",
            background: `radial-gradient(ellipse at 45% 40%, rgba(255,255,252,${0.95 * op}) 0%, rgba(236,230,218,${0.85 * op}) 45%, rgba(220,212,198,0) 72%)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
}

function EndFade() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const k = smooth((t - (film.duration - 1.2)) / 1.2);
  return k > 0 ? <AbsoluteFill style={{ background: "#000", opacity: k }} /> : null;
}
