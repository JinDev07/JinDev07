// WORLD scene: an establishing location in the 3D world. Presets:
//   fortress  - walled castle on a rise, banners, a road
//   city      - walls, gate towers, domes and minarets or roofs, dense houses
//   camp      - tents in rows, fires, banners, soldiers
//   fleet     - open sea, ships with sails, a distant coast
//   march     - a long column of soldiers on a road through the landscape
// Camera: keys [{t, pos:[x,y,z], look:[x,y,z], fov}] or a preset move (reveal | crane | orbit | track).
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { Stage } from "../lib/Stage";
import { T, camAt, clamp, smooth, noise1, rng, lerp } from "../lib/core";
import { terrain, skyDome, banner, particles, castle, tent, ship, tree, formation, water, cloudField, mesh, outlined, labelSprite, town, scatter } from "../lib/models";
import { BIOMES } from "./BattleScene";

const SKY = {
  day: { top: "#5b86ab", mid: "#b8cdd6", hor: "#efdcb5", sun: "#fff1d8", fog: "#cfc8b0", k: 2.4, h: 0.8, dir: [-0.6, 0.8, -0.4] },
  dawn: { top: "#4a5f86", mid: "#d6a98a", hor: "#f5c28d", sun: "#ffc98f", fog: "#d9b496", k: 2.1, h: 0.6, dir: [-0.9, 0.35, -0.7] },
  dusk: { top: "#2c3655", mid: "#a8707a", hor: "#e89a6a", sun: "#ff9f6a", fog: "#9c7470", k: 2.0, h: 0.5, dir: [0.9, 0.3, -0.7] },
  storm: { top: "#3b4450", mid: "#7d8689", hor: "#a9a596", sun: "#e6e2d6", fog: "#8e8f88", k: 1.2, h: 0.7, dir: [-0.3, 0.9, -0.2] },
  night: { top: "#0d1424", mid: "#1f2c45", hor: "#3b4660", sun: "#9fb3dd", fog: "#1d2638", k: 0.7, h: 0.35, dir: [0.4, 0.7, -0.5] },
};

function buildWorld(cfg) {
  const root = new THREE.Group();
  const sky = SKY[cfg.sky || "day"];
  const preset = cfg.preset || "fortress";
  const r = rng(cfg.seed ?? 7);
  const isSea = preset === "fleet";
  const ground = terrain({ w: 160, d: 120, seg: 220, hills: isSea ? 3 : cfg.hills ?? 1.4, seed: cfg.seed ?? 7, colors: BIOMES[cfg.biome || "grass"], flat: isSea ? [] : [[0, 0, 16]] });
  if (isSea) { ground.position.z = -70; ground.position.y = -1.5; }
  root.add(ground);
  const hAt = isSea ? () => 0 : ground.userData.heightAt;
  root.add(skyDome({ top: sky.top, mid: sky.mid, horizon: sky.hor, sun: sky.dir, sunColor: sky.sun, radius: 600 }));
  root.add(new THREE.HemisphereLight("#e6eeff", "#5d4f37", sky.h));
  const sun = new THREE.DirectionalLight(sky.sun, sky.k);
  sun.position.set(...sky.dir.map((v) => v * 70)); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 250 }); sun.shadow.bias = -0.0005;
  root.add(sun);
  const animated = [];
  const accent = cfg.color || "#8b2f2f";

  if (isSea) {
    const wt = water({ w: 600, d: 600, color: "#3c7487", deep: "#1d4352", y: 0 }); root.add(wt); animated.push(wt);
    const n = cfg.ships ?? 14;
    for (let i = 0; i < n; i++) {
      const s = ship({ size: 1.6 + r() * 0.5, emblemColor: i % 5 === 0 ? (cfg.color2 || "#2f5c8b") : accent });
      const row = Math.floor(i / 5), col = i % 5;
      s.position.set((col - 2) * 6 + (r() - 0.5) * 2, 0, -row * 7 + (r() - 0.5) * 2);
      s.rotation.y = Math.PI + (r() - 0.5) * 0.15; root.add(s);
      const ph = r() * 10; animated.push({ userData: { update: (t) => s.userData.update(t + ph) } });
    }
  } else {
    // scattered trees
    for (let i = 0; i < (cfg.trees ?? 120); i++) {
      const x = (r() - 0.5) * 150, z = (r() - 0.5) * 110;
      if (Math.hypot(x, z) < 20) continue;
      const tr = tree({ size: 1.8 + r(), kind: cfg.biome === "desert" ? "palm" : r() < 0.6 ? "pine" : "oak", seed: i });
      tr.position.set(x, hAt(x, z), z); root.add(tr);
    }
  }
  if (preset === "fortress" || preset === "city") {
    const big = castle({ size: preset === "city" ? 9 : 7, domes: !!cfg.domes, color: cfg.wall || "#d8cdb5", roof: cfg.roof || "#8b3a2e", seed: 4 });
    big.position.set(0, hAt(0, 0), 0); root.add(big);
    if (preset === "city") root.add(town({ count: 220, inner: 7, outer: 24, domes: !!cfg.domes, roof: cfg.roof || "#9b4a35", seed: 5, hAt, wallColor: cfg.wall || "#cbbd9c" }));
    for (let i = 0; i < 6; i++) { const b = banner({ color: accent, emblem: cfg.emblem || "star", height: 3, width: 0.9 }); const a = (i / 6) * Math.PI * 2; b.position.set(Math.cos(a) * 5.2, hAt(0, 0) + 3.6, Math.sin(a) * 5.2); root.add(b); animated.push(b); }
  }
  if (preset === "camp") {
    for (let i = 0; i < 48; i++) {
      const row = Math.floor(i / 8), col = i % 8;
      const x = (col - 3.5) * 4.2 + (r() - 0.5), z = (row - 2.5) * 4.6 + (r() - 0.5);
      const tn = tent({ size: 1.4 + r() * 0.5, stripe: i % 7 === 0 ? "#e7dcc0" : accent }); tn.position.set(x, hAt(x, z), z); tn.rotation.y = r() * 6; root.add(tn);
    }
    for (let i = 0; i < 8; i++) {
      const x = (r() - 0.5) * 30, z = (r() - 0.5) * 24;
      const f = particles({ count: 50, area: [0.5, 1.4, 0.5], color: "#ffaa44", size: 0.28, seed: i + 50, rise: 1.2 }); f.position.set(x, hAt(x, z), z); root.add(f); animated.push(f);
      const L = new THREE.PointLight("#ff9a4a", 12, 9, 2); L.position.set(x, hAt(x, z) + 1, z); root.add(L);
    }
    for (let i = 0; i < 5; i++) { const b = banner({ color: accent, emblem: cfg.emblem || "star", height: 4, width: 1 }); const x = (i - 2) * 7, z = -14; b.position.set(x, hAt(x, z), z); root.add(b); animated.push(b); }
  }
  if (preset === "march") {
    for (let i = 0; i < 6; i++) {
      const f = formation({ rows: 8, cols: 6, color: accent, spacing: 0.55, seed: i + 1, kind: i % 3 === 2 ? "cavalry" : "infantry" });
      f.userData.z0 = 20 - i * 7; root.add(f);
      const b = banner({ color: accent, emblem: cfg.emblem || "star", height: 2.8, width: 0.8 }); b.position.set(0, 0, -2.6); f.add(b);
      animated.push({ userData: { update: (t) => { const z = f.userData.z0 - t * 1.1; f.position.set(Math.sin(z * 0.05) * 3, hAt(Math.sin(z * 0.05) * 3, z), z); f.rotation.y = Math.PI; f.userData.update(t, { moving: 1 }); b.userData.update(t); } } });
    }
  }
  if (cfg.label) { const l = labelSprite(cfg.label.text, { height: cfg.label.height ?? 1.6 }); l.position.set(...(cfg.label.at || [0, 12, 0])); root.add(l); l.userData.tin = T(cfg.label.t_in ?? cfg.from); animated.push({ userData: { update: (t) => { l.material.opacity = smooth((t - l.userData.tin) / 0.6); } } }); }

  if (!isSea) root.add(scatter({ hAt, area: [150, 110], count: cfg.scatter ?? 1500, seed: (cfg.seed ?? 7) + 1, clear: preset === 'city' || preset === 'fortress' ? [[0, 0, 30]] : [[0, 0, 4]] }));
  const dust = particles({ count: 500, area: [80, 12, 60], color: cfg.biome === "desert" ? "#f0d9a8" : "#fff4dc", size: 0.08, seed: 6, rise: 0.1, drift: [0.4, 0.1] });
  root.add(dust); animated.push(dust);
  const birds = particles({ count: 14, area: [60, 6, 30], color: "#2a2520", size: 0.4, seed: 9, rise: 0.05, drift: [1.5, 0] });
  birds.material.blending = THREE.NormalBlending; birds.position.y = 16; root.add(birds); animated.push(birds);
  const clouds = cloudField({ count: 30, area: [200, 150], height: [18, 30], size: [14, 24], opacity: 0.6, seed: 10 });
  root.add(clouds);
  const fog = new THREE.Fog(sky.fog, 40, 180);

  const t0 = T(cfg.from), t1 = T(cfg.to);
  const P = {
    reveal: [{ t: t0, pos: [-34, 9, 52], look: [0, 4, 0] }, { t: t1, pos: [-18, 14, 38], look: [0, 4, 0] }],
    crane: [{ t: t0, pos: [0, 2.5, 34], look: [0, 3, 0] }, { t: t1, pos: [6, 22, 30], look: [0, 1, 0] }],
    orbit: [{ t: t0, pos: [-28, 12, 24] , look: [0, 3, 0] }, { t: (t0 + t1) / 2, pos: [0, 13, 34], look: [0, 3, 0] }, { t: t1, pos: [28, 12, 24], look: [0, 3, 0] }],
    track: [{ t: t0, pos: [-30, 4, 18], look: [-8, 3, 0] }, { t: t1, pos: [24, 5, 18], look: [8, 3, 0] }],
  };
  const raw = cfg.camera || P[cfg.move || (isSea ? "track" : "reveal")];
  const keys = raw.map((k) => ({ t: T(k.t), x: k.pos[0], y: k.pos[1], z: k.pos[2], lx: k.look[0], ly: k.look[1], lz: k.look[2], fov: k.fov ?? 42 }));
  return {
    root, fog, background: sky.fog,
    update(t, camera) {
      const k = camAt(keys, t, ["x", "y", "z", "lx", "ly", "lz", "fov"]);
      camera.position.set(k.x + noise1(t * 0.45, 1) * 0.08, Math.max(k.y + noise1(t * 0.45, 2) * 0.06, hAt(k.x, k.z) + 1), k.z);
      camera.fov = k.fov; camera.near = 0.1; camera.far = 1500;
      camera.lookAt(k.lx, k.ly, k.lz);
      for (const a of animated) a.userData.update?.(t);
      clouds.userData.update(t, camera.position);
    },
  };
}

export function WorldScene({ cfg, film, from }) {
  return <AbsoluteFill><Stage build={buildWorld} cfg={cfg} film={film} from={from} grade={cfg.grade || film.grade} /></AbsoluteFill>;
}
