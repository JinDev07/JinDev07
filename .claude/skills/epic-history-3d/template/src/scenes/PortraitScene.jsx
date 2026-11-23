// PORTRAIT scene: a person's picture in a gilded frame on a stone wall, candlelight, dust in the
// air, a name plaque, a slow push-in. The picture is a file the user supplies (or a public-domain
// painting) in public/assets/. Without a picture it shows a lit empty frame with the name only;
// that is also the respectful choice for prophets and sacred figures (never depict them).
import React, { useState, useEffect } from "react";
import * as THREE from "three";
import { AbsoluteFill, staticFile, delayRender, continueRender } from "remotion";
import { Stage } from "../lib/Stage";
import { T, camAt, noise1, smooth, font, rng } from "../lib/core";
import { particles, canvasTex, mesh, banner } from "../lib/models";

const texCache = {};
function useImage(file) {
  const [img, setImg] = useState(texCache[file] || null);
  const [h] = useState(() => (file && !texCache[file] ? delayRender("portrait " + file) : null));
  useEffect(() => {
    if (!file || texCache[file]) return;
    const im = new Image();
    im.onload = () => { texCache[file] = im; setImg(im); continueRender(h); };
    im.onerror = () => { continueRender(h); };
    im.src = staticFile(file);
  }, [file, h]);
  return img;
}

function stoneWall() {
  return canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = "#4a4137"; c.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let y = 0; y < h; y += 64) for (let x = -((y / 64) % 2) * 64; x < w; x += 128) {
      c.fillStyle = `rgb(${70 + r() * 25},${62 + r() * 20},${52 + r() * 18})`; c.fillRect(x + 3, y + 3, 122, 58);
      c.fillStyle = "rgba(255,240,210,0.05)"; c.fillRect(x + 3, y + 3, 122, 6);
    }
  });
}
function plaqueTex(name, sub) {
  return canvasTex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#d8b360"); g.addColorStop(0.5, "#a77d33"); g.addColorStop(1, "#7a5622");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#5a3e16"; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24);
    let s = sub ? 92 : 110; c.font = font(name, s, 900);
    while (c.measureText(name).width > w - 80 && s > 30) { s -= 4; c.font = font(name, s, 900); }
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "rgba(255,240,200,0.6)"; c.fillText(name, w / 2 + 2, (sub ? h * 0.4 : h / 2) + 3);
    c.fillStyle = "#3b2610"; c.fillText(name, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) { c.font = font(sub, 54, 700); c.fillText(sub, w / 2, h * 0.76); }
  });
}

function makeBuild(img) {
  return (cfg) => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), new THREE.MeshStandardMaterial({ map: stoneWall(), roughness: 1 }));
    wall.material.map.wrapS = wall.material.map.wrapT = THREE.RepeatWrapping; wall.material.map.repeat.set(4, 2.2);
    wall.receiveShadow = true; root.add(wall);
    const aspect = img ? img.width / img.height : 0.78;
    const H = 6.2, W = H * aspect;
    // frame
    const fr = new THREE.Group();
    const gold = { color: "#b68a3a", metalness: 0.75, roughness: 0.35 };
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), new THREE.MeshStandardMaterial(gold)); m.position.set(x, y, 0.2); m.castShadow = true; fr.add(m); };
    const b = 0.55; bar(W + 2 * b, b, 0, H / 2 + b / 2); bar(W + 2 * b, b, 0, -H / 2 - b / 2); bar(b, H, -W / 2 - b / 2, 0); bar(b, H, W / 2 + b / 2, 0);
    let picMat;
    if (img) { const tx = new THREE.Texture(img); tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true; tx.anisotropy = 8; picMat = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.75 }); }
    else picMat = new THREE.MeshStandardMaterial({ color: "#2a221a", emissive: new THREE.Color("#ffdca0"), emissiveIntensity: 0.12, roughness: 1 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, H), picMat); pic.position.z = 0.12; fr.add(pic);
    fr.position.set(0, 1.2, 0); root.add(fr);
    // plaque
    const pl = new THREE.Mesh(new THREE.BoxGeometry(5, 1.25, 0.15), [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial(i === 4 ? { map: plaqueTex(cfg.name || "", cfg.subtitle), metalness: 0.5, roughness: 0.4 } : gold)));
    pl.position.set(0, 1.2 - H / 2 - b - 1.0, 0.15); pl.castShadow = true; root.add(pl);
    // light
    root.add(new THREE.AmbientLight("#5a4a3a", 0.6));
    const spot = new THREE.SpotLight("#ffe2b0", 260, 30, 0.55, 0.6, 1.6); spot.position.set(0, 9, 8); spot.target = fr; spot.castShadow = true; root.add(spot); root.add(spot.target);
    const candles = [];
    for (const s of [-1, 1]) {
      const stand = mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), "#3a2b1c"); stand.position.set(s * (W / 2 + 2.3), -2.6, 1.2); root.add(stand);
      const L = new THREE.PointLight("#ffb060", 18, 10, 2); L.position.set(s * (W / 2 + 2.3), -0.7, 1.4); root.add(L); candles.push(L);
      const f = particles({ count: 40, area: [0.2, 0.5, 0.2], color: "#ffc060", size: 0.18, seed: s + 8, rise: 0.9 }); f.position.set(s * (W / 2 + 2.3), -0.95, 1.2); root.add(f); candles.push(f);
      if (cfg.bannerColor) { const bn = banner({ color: cfg.bannerColor, emblem: cfg.emblem || "star", height: 7, width: 1.4 }); bn.position.set(s * (W / 2 + 4.4), -4.2, 0.6); root.add(bn); candles.push(bn); }
    }
    const motes = particles({ count: 260, area: [16, 12, 6], color: "#ffe9c0", size: 0.05, seed: 2, rise: 0.08, drift: [0.05, 0] });
    motes.position.set(0, -4, 1); root.add(motes);
    const t0 = T(cfg.from), t1 = T(cfg.to);
    const keys = [{ t: t0, x: -2.2, y: 0.4, z: 15.5, fov: 36 }, { t: t1, x: 0.6, y: 0.9, z: 11.2, fov: 36 }];
    return {
      root, fog: new THREE.Fog("#140e09", 14, 40), background: "#140e09",
      update(t, camera) {
        const k = camAt(keys, t, ["x", "y", "z", "fov"]);
        camera.position.set(k.x + noise1(t * 0.4, 1) * 0.04, k.y + noise1(t * 0.4, 2) * 0.03, k.z);
        camera.fov = k.fov; camera.lookAt(0, 0.2, 0);
        candles.forEach((c, i) => { if (c.isLight) c.intensity = 16 + Math.sin(t * 13 + i) * 2.5; else c.userData.update?.(t); });
        motes.userData.update(t);
      },
    };
  };
}

export function PortraitScene({ cfg, film, from }) {
  const img = useImage(cfg.image);
  if (cfg.image && !img) return null;
  return <AbsoluteFill><Stage build={makeBuild(img)} cfg={cfg} film={film} from={from} grade={cfg.grade || film.grade} /></AbsoluteFill>;
}
