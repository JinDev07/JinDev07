// TITLE scene: a chapter title or a date carved into a standing stone in a dark landscape,
// banners on both sides, embers rising, a slow push-in. Works for Bangla (canvas-shaped text).
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { Stage } from "../lib/Stage";
import { T, camAt, clamp, smooth, easeOut, noise1, font, rng } from "../lib/core";
import { terrain, skyDome, banner, particles, canvasTex, mesh, cloudField } from "../lib/models";

function carvedStone(title, sub, opts = {}) {
  const W = 2048, H = 1152;
  return canvasTex(W, H, (c) => {
    // stone body with strata and chips
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, opts.stone || "#6d665b"); g.addColorStop(1, shadeHex(opts.stone || "#6d665b", -0.25));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = rng(12);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${r() < 0.5 ? "255,250,235" : "20,16,12"},${r() * 0.06})`; c.fillRect(r() * W, r() * H, 2 + r() * 6, 1 + r() * 3); }
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(30,24,18,${0.1 + r() * 0.15})`; c.lineWidth = 1 + r() * 2; c.beginPath(); let x = r() * W, y = r() * H; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 80; y += r() * 40; c.lineTo(x, y); } c.stroke(); }
    // border frame carved
    c.strokeStyle = "rgba(25,20,15,0.55)"; c.lineWidth = 14; c.strokeRect(60, 60, W - 120, H - 120);
    c.strokeStyle = "rgba(255,245,225,0.18)"; c.lineWidth = 4; c.strokeRect(70, 70, W - 140, H - 140);
    // carved text: dark recess + light lower lip + gold infill
    const draw = (txt, size, y, weight = 900) => {
      if (!txt) return;
      let s = size; c.font = font(txt, s, weight);
      while (c.measureText(txt).width > W - 280 && s > 40) { s -= 6; c.font = font(txt, s, weight); }
      c.textAlign = "center"; c.textBaseline = "middle";
      if ("letterSpacing" in c && !/[ঀ-৿]/.test(txt)) c.letterSpacing = `${s * 0.06}px`;
      c.fillStyle = "rgba(255,245,220,0.35)"; c.fillText(txt, W / 2 + 3, y + 4);
      c.fillStyle = "rgba(15,10,6,0.85)"; c.fillText(txt, W / 2 - 3, y - 3);
      const gg = c.createLinearGradient(0, y - s / 2, 0, y + s / 2); gg.addColorStop(0, opts.ink || "#ffe3a0"); gg.addColorStop(1, shadeHex(opts.ink || "#ffe3a0", -0.35));
      c.fillStyle = gg; c.fillText(txt, W / 2, y);
    };
    draw(title, sub ? 400 : 480, sub ? H * 0.42 : H * 0.5);
    if (sub) draw(sub, 165, H * 0.76, 700);
  });
}
let _flame = null;
function flameTex() {
  if (_flame) return _flame;
  _flame = canvasTex(128, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h * 0.72, 4, w / 2, h * 0.6, h * 0.5);
    g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.25, "rgba(255,190,90,0.9)"); g.addColorStop(0.6, "rgba(230,90,30,0.45)"); g.addColorStop(1, "rgba(120,30,10,0)");
    c.fillStyle = g; c.beginPath(); c.moveTo(w / 2, 0); c.bezierCurveTo(w * 0.95, h * 0.45, w, h * 0.95, w / 2, h); c.bezierCurveTo(0, h * 0.95, w * 0.05, h * 0.45, w / 2, 0); c.fill();
  });
  return _flame;
}
function shadeHex(h, k) { const n = parseInt(h.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)); return `rgb(${f(r)},${f(g)},${f(b)})`; }

function buildTitle(cfg) {
  const root = new THREE.Group();
  const mood = cfg.mood || "dusk";
  const sky = mood === "night" ? { top: "#0c1322", mid: "#1d2840", hor: "#47506a", fog: "#1a2232", sun: "#9fb3dd", k: 0.9 } : mood === "dawn" ? { top: "#40557a", mid: "#c99c80", hor: "#f3c08c", fog: "#cfa88c", sun: "#ffc890", k: 2.0 } : { top: "#2a3150", mid: "#8f6670", hor: "#e19468", fog: "#7d5a55", sun: "#ff9a62", k: 2.2 };
  const ground = terrain({ w: 90, d: 90, seg: 160, hills: 1.6, seed: cfg.seed ?? 9, colors: ["#5f5a40", "#776d4c", "#4a4a33"], flat: [[0, 0, 10]] });
  root.add(ground);
  root.add(skyDome({ top: sky.top, mid: sky.mid, horizon: sky.hor, sun: [0.2, 0.12, -1], sunColor: sky.sun }));
  root.add(new THREE.HemisphereLight("#c9d2ff", "#3d3426", 0.55));
  const key = new THREE.DirectionalLight(sky.sun, sky.k); key.position.set(4, 8, -10); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 }); root.add(key);
  const front = new THREE.DirectionalLight("#ffd9a8", 1.1); front.position.set(-3, 4, 10); root.add(front);
  const fire1 = new THREE.PointLight("#ff9a4a", 30, 14, 2); fire1.position.set(-4.2, 2.2, 2); root.add(fire1);
  const fire2 = new THREE.PointLight("#ff9a4a", 30, 14, 2); fire2.position.set(4.2, 2.2, 2); root.add(fire2);

  // the stone
  const tex = carvedStone(cfg.title, cfg.subtitle, { ink: cfg.ink, stone: cfg.stone });
  const stoneGeo = new THREE.BoxGeometry(8, 4.5, 0.7, 1, 1, 1);
  const mats = [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial({ color: i === 4 ? "#ffffff" : "#6e675a", map: i === 4 ? tex : null, roughness: 0.95 }));
  const stone = new THREE.Mesh(stoneGeo, mats); stone.castShadow = true; stone.receiveShadow = true;
  stone.position.set(0, 2.45 + ground.userData.heightAt(0, 0), 0); root.add(stone);
  const plinth = mesh(new THREE.BoxGeometry(9.2, 0.5, 1.6), "#5e574b"); plinth.position.set(0, 0.25 + ground.userData.heightAt(0, 0), 0); root.add(plinth);
  // braziers and banners
  const flames = [];
  for (const s of [-1, 1]) {
    const br = mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.5, 10), "#3d2f22"); br.position.set(s * 4.2, 1.5, 2); root.add(br);
    const st = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.3, 6), "#3d2f22"); st.position.set(s * 4.2, 0.65, 2); root.add(st);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.scale.set(1.0, 1.6, 1); flame.position.set(s * 4.2, 2.35, 2); root.add(flame);
    flames.push({ userData: { update: (t) => { const k = 1 + Math.sin(t * 13 + s) * 0.08 + Math.sin(t * 7.1) * 0.06; flame.scale.set(1.0 * k, 1.6 * (2 - k), 1); } } });
    const sp = particles({ count: 30, area: [0.5, 2.5, 0.5], color: "#ffb24a", size: 0.08, seed: s + 5, rise: 1.1 }); sp.position.set(s * 4.2, 2.0, 2); root.add(sp); flames.push(sp);
    const b = banner({ color: cfg.bannerColor || "#7d1f1f", emblem: cfg.emblem || "star", height: 6, width: 1.3 }); b.position.set(s * 6.2, 0, -0.6); root.add(b); flames.push(b);
  }
  const embers = particles({ count: 400, area: [26, 10, 16], color: "#ffb15a", size: 0.07, seed: 3, rise: 0.5, drift: [0.15, 0] });
  root.add(embers);
  const clouds = cloudField({ count: 18, area: [120, 60], height: [14, 24], size: [12, 20], opacity: 0.45, color: "#e4c1a8", seed: 3 });
  clouds.position.z = -40; root.add(clouds);
  const fog = new THREE.Fog(sky.fog, 18, 95);
  const t0 = T(cfg.from), t1 = T(cfg.to);
  const keys = cfg.camera ? cfg.camera.map((k) => ({ t: T(k.t), x: k.pos[0], y: k.pos[1], z: k.pos[2], fov: k.fov ?? 40 })) : [
    { t: t0, x: -3.5, y: 2.4, z: 19, fov: 40 },
    { t: t1, x: 1.2, y: 3.0, z: 12.5, fov: 40 },
  ];
  return {
    root, fog, background: sky.fog,
    update(t, camera) {
      const k = camAt(keys, t, ["x", "y", "z", "fov"]);
      camera.position.set(k.x + noise1(t * 0.4, 1) * 0.05, k.y + noise1(t * 0.4, 2) * 0.04, k.z);
      camera.fov = k.fov; camera.lookAt(0, 2.5, 0);
      // light sweep "carves" the text in
      const reveal = easeOut((t - t0 - 0.3) / 1.4);
      mats[4].emissive = new THREE.Color("#ffcf80"); mats[4].emissiveMap = tex; mats[4].emissiveIntensity = 0.12 + 0.35 * Math.max(0, Math.sin(clamp(reveal) * Math.PI));
      stone.position.y = 2.45 + ground.userData.heightAt(0, 0) - (1 - smooth((t - t0) / 1.2)) * 0.6;
      const fl = 26 + Math.sin(t * 17) * 4 + Math.sin(t * 7.3) * 3; fire1.intensity = fl; fire2.intensity = fl * 0.95;
      flames.forEach((f, i) => f.userData.update(t + i));
      embers.userData.update(t); clouds.userData.update(t, camera.position);
    },
  };
}

export function TitleScene({ cfg, film, from }) {
  return <AbsoluteFill><Stage build={buildTitle} cfg={cfg} film={film} from={from} grade={cfg.grade || film.grade} /></AbsoluteFill>;
}
