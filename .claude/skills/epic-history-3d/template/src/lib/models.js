// Procedural 3D models in a painted strategy-game style: toon shading with an ink outline,
// soldiers (instanced), army figurines with waving banners, castles, cities, tents, ships,
// trees, sky dome and clouds. Everything is built in code; nothing is downloaded.
import * as THREE from "three";
import { rng, fbm, font, clamp, shade, smooth } from "./core";

export const INK = "#2a1d17";

// ---------------------------------------------------------------- materials
let gradTex = null;
function toonGradient() {
  if (gradTex) return gradTex;
  const d = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradTex = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
  gradTex.needsUpdate = true;
  return gradTex;
}
const matCache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: toonGradient(), ...opts });
  matCache.set(key, m);
  return m;
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
// inverted-hull outline: a slightly bigger back-face copy in ink
export function outlined(mesh, thickness = 0.04) {
  const g = new THREE.Group();
  g.add(mesh);
  const o = new THREE.Mesh(mesh.geometry, inkMat);
  o.position.copy(mesh.position); o.rotation.copy(mesh.rotation);
  o.scale.copy(mesh.scale).multiplyScalar(1 + thickness);
  g.add(o);
  return g;
}
export function mesh(geo, color, opts) { const m = new THREE.Mesh(geo, toon(color, opts)); m.castShadow = true; m.receiveShadow = true; return m; }

// ---------------------------------------------------------------- canvas textures
export function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Banner cloth with an emblem (simple heraldic shapes, never a real logo)
export function bannerTexture(color, emblem = "star", accent = "#f1d98a") {
  return canvasTex(256, 384, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    // cloth weave and wear
    const rr = rng(77);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(0,0,0,${rr() * 0.05})`; c.fillRect(rr() * w, rr() * h, 2, 6); }
    c.strokeStyle = accent; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 70);
    // swallow-tail cut
    c.globalCompositeOperation = "destination-out";
    c.beginPath(); c.moveTo(0, h); c.lineTo(w / 2, h - 56); c.lineTo(w, h); c.fill();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = accent; c.strokeStyle = "rgba(30,20,10,0.6)"; c.lineWidth = 4;
    const cx = w / 2, cy = h * 0.42, r = 62;
    c.beginPath();
    if (emblem === "star") { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } }
    else if (emblem === "crescent") { c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(cx + r * 0.38, cy - r * 0.1, r * 0.85, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = "source-over"; return; }
    else if (emblem === "cross") { c.rect(cx - 14, cy - r, 28, r * 2); c.rect(cx - r, cy - 14, r * 2, 28); }
    else if (emblem === "eagle") { c.moveTo(cx, cy - r); c.lineTo(cx + r, cy - 10); c.lineTo(cx + 20, cy); c.lineTo(cx + 30, cy + r); c.lineTo(cx, cy + 25); c.lineTo(cx - 30, cy + r); c.lineTo(cx - 20, cy); c.lineTo(cx - r, cy - 10); }
    else if (emblem === "sun") { c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.moveTo(cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65); c.lineTo(cx + Math.cos(a + 0.12) * r, cy + Math.sin(a + 0.12) * r); c.lineTo(cx + Math.cos(a - 0.12) * r, cy + Math.sin(a - 0.12) * r); } }
    else if (emblem === "lion") { c.arc(cx, cy, r * 0.7, 0, Math.PI * 2); }
    else { c.rect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2); }
    c.closePath(); c.fill(); c.stroke();
  });
}

// A flat label sprite (always faces camera) drawn on canvas: names of armies and cities.
export function labelSprite(text, opts = {}) {
  const size = 96;
  const c = document.createElement("canvas"); const ctx = c.getContext("2d");
  ctx.font = font(text, size, 700);
  const w = Math.ceil(ctx.measureText(text).width + size * 1.4), h = Math.ceil(size * 1.9);
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  if (opts.plate !== false) {
    // parchment scroll plate (game UI-like but living in the world)
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#f3e6c4"); g.addColorStop(1, "#d9c497");
    x.fillStyle = g; roundRect(x, 6, 10, w - 12, h - 20, h * 0.22); x.fill();
    x.strokeStyle = opts.accent || "#6b4a2a"; x.lineWidth = 6; x.stroke();
  }
  x.font = font(text, size, 700); x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = opts.color || "#2e1d12";
  if (opts.plate === false) { x.lineWidth = size * 0.18; x.strokeStyle = "rgba(250,240,215,0.95)"; x.lineJoin = "round"; x.strokeText(text, w / 2, h / 2 + 4); }
  x.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true });
  const s = new THREE.Sprite(mat);
  const hWorld = opts.height ?? 0.5;
  s.scale.set((hWorld * w) / h, hWorld, 1);
  s.renderOrder = 10;
  return s;
}
export function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------------------------------------------------------------- soldiers (instanced)
// One merged low-poly soldier: legs, tunic, head, helmet, shield, spear. Height ~1.0
function soldierGeometry(kind = "infantry") {
  const parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
  if (kind === "cavalry") {
    add(new THREE.BoxGeometry(0.34, 0.36, 1.0), 0, 0.62, 0);            // horse body
    add(new THREE.BoxGeometry(0.2, 0.42, 0.26), 0, 0.92, 0.52, -0.5);  // neck
    add(new THREE.BoxGeometry(0.16, 0.18, 0.36), 0, 1.08, 0.72);       // head
    for (const [x, z] of [[-0.12, 0.38], [0.12, 0.38], [-0.12, -0.38], [0.12, -0.38]]) add(new THREE.BoxGeometry(0.09, 0.46, 0.09), x, 0.23, z);
    add(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 6), 0, 1.08, -0.05); // rider
    add(new THREE.SphereGeometry(0.11, 8, 6), 0, 1.42, -0.05);
    add(new THREE.ConeGeometry(0.12, 0.2, 8), 0, 1.58, -0.05);
    add(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 4), 0.2, 1.3, 0.3, 0.9); // lance
  } else {
    add(new THREE.BoxGeometry(0.1, 0.42, 0.12), -0.07, 0.21, 0);
    add(new THREE.BoxGeometry(0.1, 0.42, 0.12), 0.07, 0.21, 0);
    add(new THREE.CylinderGeometry(0.13, 0.17, 0.46, 7), 0, 0.64, 0);
    add(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.98, 0);
    add(new THREE.ConeGeometry(0.115, 0.17, 8), 0, 1.11, 0);
    if (kind === "archers") add(new THREE.TorusGeometry(0.22, 0.012, 4, 12, Math.PI), 0.18, 0.72, 0.08, 0, Math.PI / 2, Math.PI / 2);
    else {
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 10), 0.0, 0.66, 0.15, Math.PI / 2); // round shield on front
      add(new THREE.CylinderGeometry(0.012, 0.012, 1.7, 4), 0.17, 0.95, 0.02);            // spear
    }
  }
  const merged = mergeGeos(parts);
  return merged;
}
function mergeGeos(geos) {
  // tiny merge (positions + normals) to avoid importing BufferGeometryUtils
  let count = 0;
  const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  nonIdx.forEach((g) => (count += g.attributes.position.count));
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of nonIdx) { g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}
const soldierGeoCache = {};
export function soldierGeo(kind) { return (soldierGeoCache[kind] ||= soldierGeometry(kind)); }

// Instanced block of soldiers in ranks. Returns {group, update(t, state)}
export function formation({ rows = 6, cols = 12, kind = "infantry", color = "#8b2f2f", spacing = 0.42, seed = 1, scale = 1 }) {
  const n = rows * cols;
  const g = new THREE.Group();
  const geo = soldierGeo(kind);
  const im = new THREE.InstancedMesh(geo, toon("#ffffff"), n);
  im.castShadow = true; im.receiveShadow = true;
  const outline = new THREE.InstancedMesh(geo, inkMat, n);
  const r = rng(seed);
  const base = [], cols3 = [];
  const tint = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const rr = Math.floor(i / cols), cc = i % cols;
    const sp = kind === "cavalry" ? spacing * 1.7 : spacing;
    base.push({ x: (cc - (cols - 1) / 2) * sp + (r() - 0.5) * sp * 0.25, z: (rr - (rows - 1) / 2) * sp * (kind === "cavalry" ? 1.4 : 1) + (r() - 0.5) * sp * 0.25, ph: r() * 6.28, s: 0.92 + r() * 0.16 });
    const c = tint.clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12);
    im.setColorAt(i, c); cols3.push(c);
  }
  g.add(outline); g.add(im);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  g.userData.update = (t, { moving = 0, fallen = 0, charge = 0 } = {}) => {
    for (let i = 0; i < n; i++) {
      const b = base[i];
      const bob = moving * Math.abs(Math.sin(t * (kind === "cavalry" ? 9 : 6) + b.ph)) * 0.06;
      const fall = clamp(fallen * 1.6 - (b.ph / 6.28) * 0.6);
      e.set(fall * 1.3, 0, 0); q.setFromEuler(e);
      v.set(b.x, bob - fall * 0.1, b.z + charge * Math.sin(b.ph) * 0.05);
      s.setScalar(b.s * scale);
      m4.compose(v, q, s); im.setMatrixAt(i, m4);
      s.setScalar(b.s * scale * 1.06); m4.compose(v, q, s); outline.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true; outline.instanceMatrix.needsUpdate = true;
  };
  g.userData.update(0);
  g.userData.size = { w: cols * spacing, d: rows * spacing };
  return g;
}

// A waving flag on a pole. update(t) animates the cloth.
export function banner({ color = "#9b2b2b", emblem = "star", accent = "#f1d98a", height = 1.6, width = 0.6 }) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.03, height, 6), "#4a3322");
  pole.position.y = height / 2; g.add(pole);
  const tip = mesh(new THREE.ConeGeometry(0.05, 0.14, 6), "#d8b85a"); tip.position.y = height + 0.07; g.add(tip);
  const cw = width, ch = width * 1.5;
  const geo = new THREE.PlaneGeometry(cw, ch, 16, 12);
  geo.translate(cw / 2, 0, 0);
  const base = geo.attributes.position.array.slice();
  const m = new THREE.MeshToonMaterial({ map: bannerTexture(color, emblem, accent), side: THREE.DoubleSide, gradientMap: toonGradient(), transparent: true, alphaTest: 0.5 });
  const cloth = new THREE.Mesh(geo, m); cloth.castShadow = true;
  cloth.position.set(0.02, height - ch / 2 - 0.04, 0); g.add(cloth);
  g.userData.update = (t, wind = 1) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], y = base[i + 1];
      const k = x / cw;
      p[i + 2] = Math.sin(x * 6 - t * 5.5 + y * 1.5) * 0.08 * k * wind + Math.sin(x * 11 - t * 8) * 0.02 * k * wind;
      p[i + 1] = y - k * k * 0.06;
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  };
  return g;
}

// Army figurine for the campaign map: gilded base in faction colour + a small block of soldiers + big banner.
export function armyFigure({ color = "#9b2b2b", emblem = "star", accent = "#f1d98a", kind = "infantry", seed = 1 }) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.1, 32), color);
  base.position.y = 0.05; g.add(outlined(base, 0.03));
  const rim = mesh(new THREE.TorusGeometry(0.65, 0.035, 6, 40), "#d6b25e"); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; g.add(rim);
  const f = formation({ rows: 3, cols: 4, kind, color: shade(color, 0.05), spacing: 0.26, seed, scale: 0.42 });
  f.position.y = 0.1; g.add(f);
  const b = banner({ color, emblem, accent, height: 1.25, width: 0.42 });
  b.position.set(-0.42, 0.1, -0.15); g.add(b);
  g.userData.update = (t, st = {}) => { f.userData.update(t, st); b.userData.update(t); };
  return g;
}

// Castle / city marker for maps (and bigger for world scenes)
export function castle({ color = "#d8cdb5", roof = "#8b3a2e", size = 1, seed = 3, domes = false }) {
  const g = new THREE.Group();
  const r = rng(seed);
  const wallH = 0.35 * size, R = 0.55 * size;
  const towers = 6;
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2;
    const tw = mesh(new THREE.CylinderGeometry(0.11 * size, 0.13 * size, wallH * 1.5, 8), color);
    tw.position.set(Math.cos(a) * R, wallH * 0.75, Math.sin(a) * R); g.add(outlined(tw, 0.06));
    const cap = mesh(new THREE.ConeGeometry(0.15 * size, 0.22 * size, 8), roof);
    cap.position.set(Math.cos(a) * R, wallH * 1.5 + 0.11 * size, Math.sin(a) * R); g.add(cap);
    const a2 = ((i + 1) / towers) * Math.PI * 2;
    const mx = (Math.cos(a) + Math.cos(a2)) / 2 * R, mz = (Math.sin(a) + Math.sin(a2)) / 2 * R;
    const len = 2 * R * Math.sin(Math.PI / towers);
    const wall = mesh(new THREE.BoxGeometry(len, wallH, 0.07 * size), color);
    wall.position.set(mx, wallH / 2, mz); wall.rotation.y = -Math.atan2(mz, mx) + Math.PI / 2; g.add(wall);
  }
  // keep / central buildings
  const keep = mesh(new THREE.BoxGeometry(0.34 * size, 0.6 * size, 0.34 * size), shade(color, -0.06));
  keep.position.y = 0.3 * size; g.add(outlined(keep, 0.05));
  if (domes) {
    const d = mesh(new THREE.SphereGeometry(0.2 * size, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), "#c9a35a");
    d.position.y = 0.6 * size; g.add(d);
    for (const s of [-1, 1]) { const mn = mesh(new THREE.CylinderGeometry(0.03 * size, 0.035 * size, 0.8 * size, 8), color); mn.position.set(0.3 * size * s, 0.4 * size, 0.25 * size); g.add(mn); const c = mesh(new THREE.ConeGeometry(0.045 * size, 0.14 * size, 8), "#c9a35a"); c.position.set(0.3 * size * s, 0.87 * size, 0.25 * size); g.add(c); }
  } else {
    const kr = mesh(new THREE.ConeGeometry(0.3 * size, 0.3 * size, 4), roof); kr.rotation.y = Math.PI / 4; kr.position.y = 0.75 * size; g.add(kr);
  }
  for (let i = 0; i < 6; i++) {
    const h = mesh(new THREE.BoxGeometry(0.12 * size, 0.14 * size, 0.12 * size), shade(color, (r() - 0.5) * 0.2));
    const a = r() * 6.28, d = (0.18 + r() * 0.2) * size; h.position.set(Math.cos(a) * d, 0.07 * size, Math.sin(a) * d); g.add(h);
  }
  return g;
}

export function tent({ color = "#e7dcc0", stripe = "#9b2b2b", size = 1 }) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.5 * size, 0.55 * size, 0.45 * size, 10), color); body.position.y = 0.22 * size; g.add(outlined(body, 0.04));
  const top = mesh(new THREE.ConeGeometry(0.62 * size, 0.55 * size, 10), stripe); top.position.y = 0.72 * size; g.add(outlined(top, 0.04));
  const pole = mesh(new THREE.CylinderGeometry(0.02 * size, 0.02 * size, 0.4 * size, 5), "#4a3322"); pole.position.y = 1.1 * size; g.add(pole);
  return g;
}

export function tree({ size = 1, kind = "pine", seed = 1 }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.04 * size, 0.06 * size, 0.4 * size, 5), "#5a3e2a"); trunk.position.y = 0.2 * size; g.add(trunk);
  if (kind === "palm") {
    for (let i = 0; i < 6; i++) { const l = mesh(new THREE.ConeGeometry(0.08 * size, 0.6 * size, 4), "#5d7a3a"); l.position.y = 0.75 * size; l.rotation.z = 1.1; l.rotation.y = (i / 6) * 6.28; g.add(l); }
    trunk.scale.y = 2; trunk.position.y = 0.4 * size;
  } else if (kind === "oak") {
    const c = mesh(new THREE.IcosahedronGeometry(0.32 * size, 0), shade("#5f7d3a", (r() - 0.5) * 0.2)); c.position.y = 0.6 * size; g.add(outlined(c, 0.05));
  } else {
    for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry((0.32 - i * 0.08) * size, 0.42 * size, 7), shade("#3f5f36", (r() - 0.5) * 0.2)); c.position.y = (0.45 + i * 0.22) * size; g.add(c); }
  }
  return g;
}

export function ship({ color = "#6b4a2e", sail = "#e9dfc6", emblemColor = "#9b2b2b", size = 1 }) {
  const g = new THREE.Group();
  const hullGeo = new THREE.CylinderGeometry(0.35 * size, 0.18 * size, 2.2 * size, 10, 1, false, 0, Math.PI);
  hullGeo.rotateZ(Math.PI / 2); hullGeo.rotateX(Math.PI / 2);
  const hull = mesh(hullGeo, color); hull.position.y = 0.32 * size; hull.rotation.x = Math.PI; g.add(outlined(hull, 0.04));
  const deck = mesh(new THREE.BoxGeometry(0.6 * size, 0.05 * size, 2.0 * size), shade(color, 0.15)); deck.position.y = 0.33 * size; g.add(deck);
  const mast = mesh(new THREE.CylinderGeometry(0.03 * size, 0.035 * size, 1.9 * size, 6), "#4a3322"); mast.position.y = 1.2 * size; g.add(mast);
  const sg = new THREE.PlaneGeometry(1.1 * size, 1.0 * size, 8, 8);
  const sm = new THREE.MeshToonMaterial({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = sail; c.fillRect(0, 0, w, h); c.fillStyle = emblemColor; c.fillRect(0, h * 0.35, w, h * 0.3); }), side: THREE.DoubleSide, gradientMap: toonGradient() });
  const s = new THREE.Mesh(sg, sm); s.position.set(0, 1.35 * size, 0.05); s.castShadow = true; g.add(s);
  const base = sg.attributes.position.array.slice();
  g.userData.update = (t) => {
    const p = sg.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const y = base[i + 1], x = base[i]; p[i + 2] = (1 - Math.pow(x / (0.55 * size), 2)) * 0.16 * size * (0.8 + 0.2 * Math.sin(t * 2 + y)); }
    sg.attributes.position.needsUpdate = true;
    g.rotation.z = Math.sin(t * 0.9) * 0.03; g.position.y = Math.sin(t * 1.1) * 0.04 * size;
  };
  // oars
  for (let i = 0; i < 6; i++) for (const sdir of [-1, 1]) { const o = mesh(new THREE.CylinderGeometry(0.01 * size, 0.01 * size, 0.8 * size, 4), "#5a3e2a"); o.position.set(sdir * 0.45 * size, 0.2 * size, (i - 2.5) * 0.28 * size); o.rotation.z = sdir * 1.1; g.add(o); }
  return g;
}

// ---------------------------------------------------------------- sky and clouds
export function skyDome({ top = "#5d86a8", mid = "#c9d6d8", horizon = "#f0dcb4", sun = [0.5, 0.25, -1], sunColor = "#fff2cc", radius = 400 }) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, hor: { value: new THREE.Color(horizon) }, sunDir: { value: new THREE.Vector3(...sun).normalize() }, sunCol: { value: new THREE.Color(sunColor) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10;
  return m;
}
let cloudTex = null;
export function cloudTexture() {
  if (cloudTex) return cloudTex;
  cloudTex = canvasTex(256, 256, (c, w, h) => {
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const x = w * (0.2 + r() * 0.6), y = h * (0.3 + r() * 0.45), rad = w * (0.1 + r() * 0.17);
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(0.6, "rgba(250,248,244,0.25)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
  return cloudTex;
}
// A field of soft cloud sprites. update(t, camPos) fades the ones close to the lens.
export function cloudField({ count = 30, area = [40, 20], height = [3, 6], seed = 4, color = "#ffffff", opacity = 0.75, size = [3, 7] }) {
  const g = new THREE.Group();
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexture(), color, transparent: true, depthWrite: false, opacity });
    const s = new THREE.Sprite(m);
    const sz = size[0] + r() * (size[1] - size[0]);
    s.scale.set(sz * 1.6, sz, 1);
    s.position.set((r() - 0.5) * area[0], height[0] + r() * (height[1] - height[0]), (r() - 0.5) * area[1]);
    items.push({ s, x: s.position.x, v: 0.05 + r() * 0.12, o: opacity * (0.6 + r() * 0.4) });
    g.add(s);
  }
  g.userData.update = (t, cam) => {
    for (const it of items) {
      it.s.position.x = it.x + t * it.v;
      const d = cam ? it.s.position.distanceTo(cam) : 99;
      it.s.material.opacity = it.o * smooth((d - 0.8) / 4);
    }
  };
  return g;
}

// Ground particles: dust, embers, sand. Returns Points with update(t)
export function particles({ count = 300, area = [20, 3, 20], color = "#e8d9b5", size = 0.06, seed = 2, rise = 0.2, drift = [0.3, 0] }) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), base = [];
  for (let i = 0; i < count; i++) { base.push([(r() - 0.5) * area[0], r() * area[1], (r() - 0.5) * area[2], r()]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const tex = canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
  const m = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, depthWrite: false, opacity: 0.8, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(geo, m);
  p.userData.update = (t) => {
    for (let i = 0; i < count; i++) {
      const b = base[i];
      const y = (b[1] + t * rise * (0.5 + b[3])) % area[1];
      pos[i * 3] = b[0] + t * drift[0] + Math.sin(t + b[3] * 10) * 0.2;
      pos[i * 3 + 1] = y; pos[i * 3 + 2] = b[2] + t * drift[1];
    }
    geo.attributes.position.needsUpdate = true;
  };
  return p;
}

// Painted terrain patch for battle and world scenes. Returns mesh + heightAt(x,z).
export function terrain({ w = 80, d = 60, seg = 200, hills = 1.5, seed = 5, colors = ["#8d9a55", "#a7a463", "#6f7f45"], flat = [] , river = null }) {
  const geo = new THREE.PlaneGeometry(w, d, seg, Math.round((seg * d) / w));
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const hAt = (x, z) => {
    let h = (fbm(x * 0.05 + seed, z * 0.05, 5, seed) - 0.45) * hills * 2.2;
    for (const f of flat) { const dd = Math.hypot(x - f[0], z - f[1]); h *= smooth(dd / f[2]); }
    if (river) { const dd = Math.abs(z - (river.z + Math.sin(x * 0.12) * river.amp)); h = Math.min(h, -0.4 + smooth(dd / river.width) * (h + 0.4)); }
    // rise towards far edge for a natural horizon
    h += smooth((-z - d * 0.2) / (d * 0.3)) * hills * 3;
    return h;
  };
  for (let i = 0; i < p.count; i++) p.setY(i, hAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const tex = canvasTex(1024, 1024, (c, W, H) => {
    c.fillStyle = colors[0]; c.fillRect(0, 0, W, H);
    const id = c.getImageData(0, 0, W, H);
    const a = hexRGB(colors[0]), b = hexRGB(colors[1]), e = hexRGB(colors[2]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.012 + seed, y * 0.012, 5, seed + 3), n2 = fbm(x * 0.06, y * 0.06, 3, seed + 9);
      const k = smooth((n - 0.4) * 3), k2 = smooth((n2 - 0.55) * 4) * 0.5;
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) id.data[i + ch] = a[ch] + (b[ch] - a[ch]) * k + (e[ch] - a[ch]) * k2;
    }
    c.putImageData(id, 0, 0);
    // brush strokes
    const r = rng(seed);
    for (let i = 0; i < 2500; i++) { c.strokeStyle = `rgba(${r() < 0.5 ? "255,250,220" : "40,40,20"},${0.04 + r() * 0.05})`; c.lineWidth = 1 + r() * 2; const x = r() * W, y = r() * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 6); c.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 30, d / 30);
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }));
  m.receiveShadow = true;
  m.userData.heightAt = hAt;
  return m;
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Water plane with gentle animated colour
export function water({ w = 200, d = 200, color = "#3b6f80", deep = "#1f4555", y = -0.15 }) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: { t: { value: 0 }, c1: { value: new THREE.Color(color) }, c2: { value: new THREE.Color(deep) }, ...THREE.UniformsLib.fog },
    vertexShader: `varying vec3 vW; #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition; #include <fog_vertex> }`.replace(/#include <fog_pars_vertex>/, "\n#include <fog_pars_vertex>\n").replace(/#include <fog_vertex>/, "\n#include <fog_vertex>\n"),
    fragmentShader: `uniform float t; uniform vec3 c1; uniform vec3 c2; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){ float w = sin(vW.x*1.3+t*1.2)*sin(vW.z*1.7-t*0.9)+sin(vW.x*3.1-t*2.0+vW.z*2.3)*0.5;
        vec3 c = mix(c2, c1, 0.55+0.25*w); c += vec3(1.0,0.97,0.9)*smoothstep(1.1,1.45,w)*0.35;
        gl_FragColor = vec4(c, 0.96);
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(w, d, 1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.y = y;
  m.userData.update = (t) => { mat.uniforms.t.value = t; };
  return m;
}

// ---------------------------------------------------------------- city houses and walls
const houseMats = {};
function houseMaterial(base, seed) {
  const key = base + seed;
  if (houseMats[key]) return houseMats[key];
  const tex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(${r() < 0.5 ? "255,250,235" : "60,45,30"},${r() * 0.07})`; c.fillRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 5); }
    // windows (arched) and a door
    c.fillStyle = "#2b2018";
    for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) {
      if (r() < 0.25) continue;
      const x = 30 + j * 75, y = 40 + k * 80;
      c.beginPath(); c.moveTo(x, y + 40); c.lineTo(x, y + 12); c.arc(x + 12, y + 12, 12, Math.PI, 0); c.lineTo(x + 24, y + 40); c.closePath(); c.fill();
    }
    c.fillStyle = "#3a2a1c"; c.fillRect(w / 2 - 22, h - 70, 44, 70);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, 0, w, 10);
  });
  houseMats[key] = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
  return houseMats[key];
}
// A dense town: houses with windows, flat roofs with parapets (domes style) or pitched tiled roofs.
export function town({ count = 160, inner = 6, outer = 22, domes = false, roof = "#9b4a35", seed = 3, hAt = () => 0, walls = true, wallColor = "#cbbd9c" }) {
  const g = new THREE.Group();
  const r = rng(seed);
  const tones = ["#e4d6b6", "#d8c49c", "#cdb58c", "#e9ddc4", "#c9a982"];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = inner + Math.sqrt(r()) * (outer - inner);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = 1.1 + r() * 1.2, dd = 1.1 + r() * 1.2, hgt = 1 + r() * 1.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, dd), houseMaterial(tones[i % tones.length], (i % 6) + 1));
    m.castShadow = m.receiveShadow = true;
    const y0 = hAt(x, z);
    m.position.set(x, y0 + hgt / 2, z); m.rotation.y = Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.2;
    g.add(outlined(m, 0.025));
    if (domes) {
      const rim = mesh(new THREE.BoxGeometry(w + 0.12, 0.14, dd + 0.12), "#bfa77c"); rim.position.set(x, y0 + hgt + 0.07, z); rim.rotation.y = m.rotation.y; g.add(rim);
      if (r() < 0.12) { const dm = mesh(new THREE.SphereGeometry(Math.min(w, dd) * 0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), r() < 0.5 ? "#b9a27a" : "#7f9aa3"); dm.position.set(x, y0 + hgt + 0.1, z); g.add(dm); }
    } else {
      const rf = mesh(new THREE.ConeGeometry(Math.max(w, dd) * 0.78, 0.9, 4), shade(roof, (r() - 0.5) * 0.25)); rf.position.set(x, y0 + hgt + 0.45, z); rf.rotation.y = m.rotation.y + Math.PI / 4; g.add(rf);
    }
  }
  if (walls) {
    const R = outer + 3, n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const tw = mesh(new THREE.BoxGeometry(1.6, 4.2, 1.6), shade(wallColor, -0.05)); tw.position.set(x, hAt(x, z) + 2.1, z); tw.rotation.y = -a; g.add(outlined(tw, 0.03));
      for (let k = -1; k <= 1; k += 2) { const mer = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), wallColor); mer.position.set(x + Math.cos(a + Math.PI / 2) * k * 0.55, hAt(x, z) + 4.4, z + Math.sin(a + Math.PI / 2) * k * 0.55); g.add(mer); }
      const mx = (x + Math.cos(a2) * R) / 2, mz = (z + Math.sin(a2) * R) / 2, len = 2 * R * Math.sin(Math.PI / n);
      const wl = mesh(new THREE.BoxGeometry(len, 3, 0.9), wallColor); wl.position.set(mx, hAt(mx, mz) + 1.5, mz); wl.rotation.y = -Math.atan2(mz, mx) + Math.PI / 2; g.add(wl);
    }
  }
  return g;
}

// Bushes, rocks and grass tufts scattered over a terrain (instanced, cheap).
export function scatter({ hAt, area = [100, 80], count = 900, seed = 4, clear = [[0, 0, 0]], colors = ["#6f7f42", "#8a8a5a", "#7b6f5c"] }) {
  const g = new THREE.Group();
  const r = rng(seed);
  const kinds = [new THREE.IcosahedronGeometry(0.35, 0), new THREE.DodecahedronGeometry(0.28, 0), new THREE.ConeGeometry(0.12, 0.45, 4)];
  kinds.forEach((geo, k) => {
    const n = Math.floor(count / 3);
    const im = new THREE.InstancedMesh(geo, toon(colors[k % colors.length]), n);
    im.castShadow = true; im.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const x = (r() - 0.5) * area[0], z = (r() - 0.5) * area[1];
      if (clear.some(([cx, cz, rad]) => Math.hypot(x - cx, z - cz) < rad)) continue;
      e.set(r() * 0.4, r() * 6.28, r() * 0.4); q.setFromEuler(e);
      const s = 0.5 + r() * 1.3; sc.set(s, s * (0.6 + r() * 0.6), s);
      v.set(x, hAt(x, z) + 0.05, z); m.compose(v, q, sc); im.setMatrixAt(placed++, m);
    }
    im.count = placed; g.add(im);
  });
  return g;
}
