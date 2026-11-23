// BATTLE scene: a painted 3D battlefield with instanced formations that advance, wheel, charge and
// break (Epic-History battle diagrams, lifted into a strategy-game 3D view). No gore: units fall
// back, banners drop, dust rises.
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { Stage } from "../lib/Stage";
import { T, camAt, clamp, smooth, easeInOut, noise1, lerp, rng } from "../lib/core";
import { formation, banner, terrain, skyDome, cloudField, particles, tree, labelSprite, tent, castle, scatter } from "../lib/models";
import { smoothPath, partialPath } from "../lib/mapPaint";

const SKIES = {
  day: { top: "#5b86ab", mid: "#b8cdd6", horizon: "#efdcb5", sun: "#fff1d8", fog: "#cfc8b0", hemi: 0.8, key: 2.4, sunDir: [-0.6, 0.8, -0.4] },
  dawn: { top: "#4a5f86", mid: "#d6a98a", horizon: "#f5c28d", sun: "#ffc98f", fog: "#d9b496", hemi: 0.6, key: 2.2, sunDir: [-0.9, 0.35, -0.6] },
  dusk: { top: "#2c3655", mid: "#a8707a", horizon: "#e89a6a", sun: "#ff9f6a", fog: "#9c7470", hemi: 0.5, key: 2.0, sunDir: [0.9, 0.3, -0.7] },
  storm: { top: "#3b4450", mid: "#7d8689", horizon: "#a9a596", sun: "#e6e2d6", fog: "#8e8f88", hemi: 0.7, key: 1.3, sunDir: [-0.3, 0.9, -0.2] },
  night: { top: "#0d1424", mid: "#1f2c45", horizon: "#3b4660", sun: "#9fb3dd", fog: "#1d2638", hemi: 0.35, key: 0.8, sunDir: [0.4, 0.7, -0.5] },
};
export const BIOMES = {
  grass: ["#8a9a52", "#a6a560", "#6c7d43"],
  steppe: ["#a39d68", "#b3aa78", "#87865a"],
  desert: ["#d2b47c", "#e0c896", "#b8945e"],
  snow: ["#e6e8ea", "#cfd6dc", "#b9c3c9"],
  autumn: ["#9a8a4a", "#b08a4a", "#7a7040"],
};

function buildBattle(cfg) {
  const root = new THREE.Group();
  const sky = SKIES[cfg.sky || "day"];
  const ground = terrain({ w: 120, d: 90, seg: 220, hills: cfg.hills ?? 1.2, seed: cfg.seed ?? 5, colors: BIOMES[cfg.biome || "grass"], flat: [[0, 0, 22]], river: cfg.river || null });
  root.add(ground);
  const hAt = ground.userData.heightAt;
  if (cfg.river) { const w = new THREE.Mesh(new THREE.PlaneGeometry(120, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#4f8293", roughness: 0.3, transparent: true, opacity: 0.92 })); w.position.y = -0.25; root.add(w); }
  root.add(skyDome({ top: sky.top, mid: sky.mid, horizon: sky.horizon, sun: sky.sunDir, sunColor: sky.sun, radius: 500 }));
  root.add(new THREE.HemisphereLight("#e6eeff", "#5d4f37", sky.hemi));
  const sun = new THREE.DirectionalLight(sky.sun, sky.key);
  sun.position.set(...sky.sunDir.map((v) => v * 60)); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 }); sun.shadow.bias = -0.0005;
  root.add(sun);

  // scenery: trees on the edges, optional camp or fortress in the distance
  const r = rng(cfg.seed ?? 5);
  for (let i = 0; i < (cfg.trees ?? 90); i++) {
    const x = (r() - 0.5) * 110, z = (r() - 0.5) * 80;
    if (Math.hypot(x, z) < 24) continue;
    const tr = tree({ size: 1.6 + r() * 1.2, kind: cfg.biome === "desert" ? "palm" : r() < 0.6 ? "pine" : "oak", seed: i });
    tr.position.set(x, hAt(x, z), z); root.add(tr);
  }
  for (const b of cfg.buildings || []) {
    const m = b.kind === "tent" ? tent({ size: b.size ?? 2, stripe: b.color || "#9b2b2b" }) : castle({ size: b.size ?? 5, domes: !!b.domes, roof: b.roof || "#8b3a2e" });
    m.position.set(b.x, hAt(b.x, b.z), b.z); m.rotation.y = b.rot ?? 0; root.add(m);
  }

  root.add(scatter({ hAt, area: [110, 80], count: cfg.scatter ?? 1200, seed: (cfg.seed ?? 5) + 1, clear: [[0, 0, 22]], colors: cfg.biome === 'desert' || cfg.biome === 'steppe' ? ['#8b8450', '#9b8a6a', '#a39a6a'] : undefined }));
  // units
  const units = (cfg.units || []).map((u, i) => {
    const f = formation({ rows: u.rows ?? 5, cols: u.cols ?? 14, kind: u.kind || "infantry", color: u.color || "#8b2f2f", spacing: u.spacing ?? 0.5, seed: i + 1, scale: 1 });
    const flags = [];
    const nb = u.banners ?? 2;
    for (let k = 0; k < nb; k++) {
      const b = banner({ color: u.color || "#8b2f2f", emblem: u.emblem || "star", accent: u.accent || "#f1d98a", height: 2.6, width: 0.8 });
      b.position.set(((k + 0.5) / nb - 0.5) * (u.cols ?? 14) * (u.spacing ?? 0.5) * 0.8, 0, -((u.rows ?? 5) * (u.spacing ?? 0.5)) / 2 - 0.3);
      f.add(b); flags.push(b);
    }
    let lbl = null;
    if (u.label) { lbl = labelSprite(u.label, { height: 2.0, accent: u.color }); lbl.position.y = 4.6; f.add(lbl); }
    const dust = particles({ count: 160, area: [(u.cols ?? 14) * 0.6, 1.4, (u.rows ?? 5) * 0.8], color: "#d9c9a3", size: 0.5, seed: i + 30, rise: 0.25 });
    dust.material.blending = THREE.NormalBlending; dust.material.opacity = 0.35;
    f.add(dust);
    root.add(f);
    // keys: [{t, x, z, rot}] in battlefield units, rot in degrees (0 faces +z)
    const keys = (u.keys || [{ t: 0, x: u.x ?? 0, z: u.z ?? 0, rot: u.rot ?? 0 }]).map((k) => ({ t: T(k.t), x: k.x, z: k.z, rot: k.rot ?? u.rot ?? 0 }));
    return { u, f, flags, keys, dust, lbl };
  });

  // big 3D arrows on the ground (attack directions)
  const arrows = (cfg.arrows || []).map((a) => {
    const mat = new THREE.MeshStandardMaterial({ color: a.color || "#c0392b", transparent: true, opacity: 0.9, roughness: 0.6, emissive: new THREE.Color(a.color || "#c0392b"), emissiveIntensity: 0.25, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = 3; root.add(m);
    return { a, m, path: smoothPath(a.path.map(([x, z]) => [x, z]), 12) };
  });

  const clouds = cloudField({ count: 26, area: [140, 110], height: [14, 22], size: [10, 18], opacity: 0.6, seed: 8 });
  root.add(clouds);
  const fog = new THREE.Fog(sky.fog, 35, 140);
  const camKeys = (cfg.camera || [{ t: 0, at: [0, 0], dist: 30, pitch: 35, yaw: 20 }]).map((k) => ({ t: T(k.t), x: k.at[0], z: k.at[1], dist: k.dist ?? 30, pitch: k.pitch ?? 35, yaw: k.yaw ?? 0, fov: k.fov ?? 40 }));
  if (camKeys.length === 1) camKeys.push({ ...camKeys[0], t: camKeys[0].t + 5, dist: camKeys[0].dist * 0.85 });

  return {
    root, fog, background: sky.fog,
    update(t, camera) {
      const k = camAt(camKeys, t, ["x", "z", "dist", "pitch", "yaw", "fov"]);
      const tgt = new THREE.Vector3(k.x, hAt(k.x, k.z) + 0.8, k.z);
      const pitch = THREE.MathUtils.degToRad(k.pitch), yaw = THREE.MathUtils.degToRad(k.yaw);
      camera.position.copy(tgt).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(k.dist));
      camera.position.y = Math.max(camera.position.y, hAt(camera.position.x, camera.position.z) + 1.2);
      camera.position.x += noise1(t * 0.5, 4) * 0.08; camera.position.y += noise1(t * 0.5, 5) * 0.05;
      camera.fov = k.fov; camera.near = 0.1; camera.far = 1200;
      camera.lookAt(tgt);
      camera.rotateZ(noise1(t * 0.4, 6) * 0.004);

      for (const { u, f, flags, keys, dust } of units) {
        const s = camAt(keys, t, ["x", "z", "rot"]);
        const prev = camAt(keys, t - 0.1, ["x", "z"]);
        const moving = clamp(Math.hypot(s.x - prev.x, s.z - prev.z) * 8);
        f.position.set(s.x, hAt(s.x, s.z), s.z);
        f.rotation.y = THREE.MathUtils.degToRad(s.rot);
        const tin = T(u.t_in ?? 0);
        f.visible = t >= tin;
        const broken = u.rout ? clamp((t - T(u.rout)) / 1.5) : 0;
        f.userData.update(t, { moving, fallen: broken * 0.6, charge: moving });
        flags.forEach((b, i) => { b.userData.update(t + i); b.rotation.z = broken * 1.2; });
        dust.userData.update(t); dust.material.opacity = 0.35 * moving;
      }
      for (const { a, m, path } of arrows) {
        const a0 = T(a.t_in), dur = a.dur ?? 1.6, b = a.t_out !== undefined ? T(a.t_out) : Infinity;
        const pr = easeInOut((t - a0) / dur);
        const fade = t > b ? 1 - smooth((t - b) / 0.5) : 1;
        m.visible = pr > 0.01 && fade > 0;
        if (!m.visible) continue;
        m.geometry.dispose();
        m.geometry = groundArrow(partialPath(path, pr), a.width ?? 2.4, hAt);
        m.material.opacity = 0.9 * fade;
      }
      clouds.userData.update(t, camera.position);
    },
  };
}

// a flat arrow ribbon that hugs the ground
function groundArrow(path, w, hAt) {
  const pts = path;
  const verts = [], idx = [];
  let total = 0; const acc = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(total); }
  const head = Math.min(total * 0.4, w * 1.6), bodyEnd = total - head;
  let iEnd = pts.length - 1; for (let i = 0; i < pts.length; i++) if (acc[i] > bodyEnd) { iEnd = Math.max(1, i); break; }
  const up = 0.25;
  for (let i = 0; i <= iEnd; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const ww = (w / 2) * (0.4 + 0.6 * smooth((acc[i] / Math.max(0.01, bodyEnd)) * 1.4));
    const l = [p[0] - dz * ww, p[1] + dx * ww], r = [p[0] + dz * ww, p[1] - dx * ww];
    verts.push(l[0], hAt(l[0], l[1]) + up, l[1], r[0], hAt(r[0], r[1]) + up, r[1]);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const tip = pts[pts.length - 1], base = pts[iEnd];
  let hx = tip[0] - base[0], hz = tip[1] - base[1]; const hd = Math.hypot(hx, hz) || 1; hx /= hd; hz /= hd;
  const b0 = verts.length / 3;
  const L = [base[0] - hz * w, base[1] + hx * w], R = [base[0] + hz * w, base[1] - hx * w];
  verts.push(L[0], hAt(L[0], L[1]) + up, L[1], R[0], hAt(R[0], R[1]) + up, R[1], tip[0], hAt(tip[0], tip[1]) + up, tip[1]);
  idx.push(b0, b0 + 1, b0 + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function BattleScene({ cfg, film, from }) {
  return (
    <AbsoluteFill>
      <Stage build={buildBattle} cfg={cfg} film={film} from={from} grade={cfg.grade || film.grade} />
    </AbsoluteFill>
  );
}
