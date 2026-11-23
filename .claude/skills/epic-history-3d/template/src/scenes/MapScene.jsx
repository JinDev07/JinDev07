// MAP scene: a 3D campaign map (strategy-game look) with relief from real mountain ranges, painted
// coasts and rivers, territories that spread and clip to the coast (History-Mapped-Out style),
// thick campaign arrows and army figurines that march (Epic-History style), cities, battles,
// drifting clouds, and a camera flying over it all.
import React from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Stage } from "../lib/Stage";
import { T, FPS, camAt, clamp, smooth, easeInOut, backOut, noise1, lerp } from "../lib/core";
import { buildBase, makeOverlay, paintOverlay, overlayKey, heightAt, smoothPath, partialPath } from "../lib/mapPaint";
import { armyFigure, castle, labelSprite, cloudField, skyDome, canvasTex, particles } from "../lib/models";
import { YearCartouche } from "./Hud";
import geo from "../geo.json";

function buildMap(cfg, film) {
  const mapCfg = { ...(film.map || {}), ...(cfg.mapOverride || {}) };
  const base = buildBase(geo, mapCfg);
  const P = base.P;
  const root = new THREE.Group();
  const relief = mapCfg.relief ?? 1.0;
  const H = (lon, lat) => Math.max(0, heightAt(base, lon, lat)) * relief;
  const pos3 = (lon, lat, up = 0) => { const [x, z] = P.toXZ(lon, lat); return new THREE.Vector3(x, H(lon, lat) + up, z); };

  // terrain
  const segX = 480, segZ = Math.max(32, Math.round((segX * P.h) / P.w));
  const g = new THREE.PlaneGeometry(P.w, P.h, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const lon = P.lonC + x / P.kx, lat = P.latC - z;
    p.setY(i, heightAt(base, lon, lat) * relief);
  }
  g.computeVertexNormals();
  const baseTex = new THREE.CanvasTexture(base.tex); baseTex.colorSpace = THREE.SRGBColorSpace; baseTex.anisotropy = 16;
  const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.92, metalness: 0 }));
  land.receiveShadow = true; land.castShadow = true;
  root.add(land);

  // overlay (territories, arrows, labels) on the same relief
  const ov = makeOverlay(base);
  const ovTex = new THREE.CanvasTexture(ov.canvas); ovTex.colorSpace = THREE.SRGBColorSpace; ovTex.anisotropy = 16;
  const ovMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: ovTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ovMesh.receiveShadow = true; ovMesh.renderOrder = 2;
  root.add(ovMesh);

  // ocean beyond the painted map + a table edge far away
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(P.w * 8, P.h * 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: base.pal.seaDeep, roughness: 1 }));
  sea.position.y = -0.065; root.add(sea);

  // sky
  const skyCfg = mapCfg.sky || {};
  root.add(skyDome({ top: skyCfg.top || "#5f87a6", mid: skyCfg.mid || "#b9cbd0", horizon: skyCfg.horizon || "#ecd6ac", radius: P.w * 20 }));

  // lights
  const hemi = new THREE.HemisphereLight(skyCfg.hemiSky || "#dfe8ff", skyCfg.hemiGround || "#6b5a40", 0.85); root.add(hemi);
  const sun = new THREE.DirectionalLight(skyCfg.sun || "#fff0d6", 2.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  root.add(sun); root.add(sun.target);

  // cities
  const scaleObj = mapCfg.objectScale ?? P.w / 40;
  const cities = (cfg.cities || []).map((c, i) => {
    const grp = new THREE.Group();
    if (c.kind !== "dot") { const m = castle({ size: (c.size ?? 1) * 0.9, domes: !!c.domes, color: c.wall || "#ddd0b4", roof: c.roof || "#8b3a2e", seed: i + 3 }); grp.add(m); }
    else { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20), new THREE.MeshToonMaterial({ color: "#2a1d17" })); grp.add(d); }
    const lbl = labelSprite(c.name, { height: 0.55, plate: c.plate !== false });
    lbl.position.y = (c.kind === "dot" ? 0.6 : 1.55) * (c.size ?? 1);
    grp.add(lbl);
    grp.scale.setScalar(scaleObj);
    grp.position.copy(pos3(c.at[0], c.at[1]));
    root.add(grp);
    return { c, grp, lbl };
  });

  // armies
  const armies = (cfg.armies || []).map((a, i) => {
    const fig = armyFigure({ color: a.color || "#9b2b2b", emblem: a.emblem || "star", accent: a.accent || "#f1d98a", kind: a.kind || "infantry", seed: i + 11 });
    fig.scale.setScalar(scaleObj * (a.size ?? 1));
    let lbl = null;
    if (a.label) { lbl = labelSprite(a.label, { height: 0.5, plate: true, accent: a.color }); lbl.position.y = 2.1; fig.add(lbl); }
    const dust = particles({ count: 60, area: [1.6, 0.6, 1.6], color: "#e9d8b0", size: 0.12, seed: i + 5, rise: 0.4 });
    fig.add(dust);
    root.add(fig);
    const path = smoothPath(a.path, 14);
    return { a, fig, path, dust, lbl };
  });

  // battles: crossed swords plate + smoke column
  const swordTex = canvasTex(256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.fillStyle = "rgba(25,15,8,0.55)"; c.beginPath(); c.arc(0, 0, 110, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#f3e2b0"; c.lineWidth = 8; c.beginPath(); c.arc(0, 0, 104, 0, Math.PI * 2); c.stroke();
    for (const s of [-1, 1]) { c.save(); c.rotate(s * Math.PI / 4); c.fillStyle = "#efe6d0"; c.fillRect(-7, -80, 14, 120); c.beginPath(); c.moveTo(-7, -80); c.lineTo(0, -98); c.lineTo(7, -80); c.fill(); c.fillStyle = "#c79a3e"; c.fillRect(-26, 38, 52, 10); c.fillRect(-6, 48, 12, 30); c.restore(); }
  });
  const battles = (cfg.battles || []).map((b, i) => {
    const grp = new THREE.Group();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: swordTex, transparent: true, depthWrite: false })); s.scale.set(1.3, 1.3, 1); s.position.y = 1.1; grp.add(s);
    const smoke = particles({ count: 120, area: [1.6, 3.5, 1.6], color: "#b9a993", size: 0.45, seed: i + 40, rise: 0.6 });
    smoke.material.blending = THREE.NormalBlending; smoke.material.opacity = 0.35; grp.add(smoke);
    let lbl = null;
    if (b.name) { lbl = labelSprite(b.name, { height: 0.42, plate: true, accent: "#7a1f1f" }); lbl.position.y = 2.05; grp.add(lbl); }
    grp.scale.setScalar(scaleObj * (b.size ?? 1));
    grp.position.copy(pos3(b.at[0], b.at[1]));
    root.add(grp);
    return { b, grp, s, smoke, lbl };
  });

  // clouds that the camera dives through
  const clouds = cloudField({ count: mapCfg.clouds ?? 40, area: [P.w * 1.3, P.h * 1.3], height: [P.w * 0.06, P.w * 0.14], size: [P.w * 0.06, P.w * 0.14], opacity: 0.7, seed: 6 });
  root.add(clouds);

  const fogColor = new THREE.Color(skyCfg.fog || "#c9c3ad");
  const fog = new THREE.Fog(fogColor, P.w * 0.6, P.w * 3.2);

  const keys = (cfg.camera || []).map((k) => ({ t: T(k.t), lon: k.at[0], lat: k.at[1], dist: k.dist ?? P.w * 0.6, pitch: k.pitch ?? 55, yaw: k.yaw ?? 0, fov: k.fov ?? 38 }));
  if (keys.length === 1) keys.push({ ...keys[0], t: keys[0].t + 5, dist: keys[0].dist * 0.85 });
  let lastFrameKey = null;

  return {
    root, fog,
    background: "#c9c3ad",
    update(t, camera) {
      // camera
      const k = camAt(keys, t, ["lon", "lat", "dist", "pitch", "yaw", "fov"]);
      const shake = cfg.handheld ?? 1;
      const tgt = pos3(k.lon + noise1(t * 0.35, 1) * 0.004 * k.dist * shake, k.lat + noise1(t * 0.35, 2) * 0.004 * k.dist * shake);
      const pitch = THREE.MathUtils.degToRad(k.pitch), yaw = THREE.MathUtils.degToRad(k.yaw);
      const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(k.dist);
      camera.position.copy(tgt).add(off);
      const minY = H(...[P.lonC + camera.position.x / P.kx, P.latC - camera.position.z]) + 0.25;
      if (camera.position.y < minY) camera.position.y = minY;
      camera.fov = k.fov; camera.near = Math.max(0.02, k.dist * 0.01); camera.far = P.w * 25;
      camera.lookAt(tgt);
      camera.rotateZ(noise1(t * 0.3, 3) * 0.003 * shake);

      // sun follows the view so shadows stay crisp where we look
      sun.position.copy(tgt).add(new THREE.Vector3(-0.6, 1.0, -0.5).multiplyScalar(Math.max(8, k.dist * 1.5)));
      sun.target.position.copy(tgt);
      const ext = Math.max(4, k.dist * 1.1);
      Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.1, far: k.dist * 5 + 40 });
      sun.shadow.camera.updateProjectionMatrix();

      // overlay repaint (once per distinct frame)
      const okey = overlayKey(cfg, t, T);
      if (okey !== lastFrameKey) { paintOverlay(ov, base, cfg, t, T); ovTex.needsUpdate = true; lastFrameKey = okey; }

      // cities rise in
      for (const { c, grp, lbl } of cities) {
        const a = T(c.t_in ?? 0), b = c.t_out !== undefined ? T(c.t_out) : Infinity;
        const s = backOut((t - a) / 0.7) * (t > b ? 1 - smooth((t - b) / 0.5) : 1);
        grp.visible = s > 0.001;
        grp.scale.setScalar(scaleObj * Math.max(0.001, s));
        lbl.material.opacity = clamp((t - a - 0.3) / 0.5) * (t > b ? 1 - smooth((t - b) / 0.5) : 1);
      }
      // armies march along their path
      for (const { a, fig, path, dust } of armies) {
        const tin = T(a.t_in ?? 0), tout = a.t_out !== undefined ? T(a.t_out) : Infinity;
        const m0 = a.move ? T(a.move[0]) : Infinity, m1 = a.move ? T(a.move[1]) : Infinity;
        const prog = a.move ? easeInOut((t - m0) / Math.max(0.1, m1 - m0)) : 0;
        const ptA = partialPath(path, prog); const here = ptA[ptA.length - 1];
        const prev = partialPath(path, Math.max(0, prog - 0.02)); const before = prev[prev.length - 1];
        fig.position.copy(pos3(here[0], here[1]));
        const [x1, z1] = P.toXZ(before[0], before[1]), [x2, z2] = P.toXZ(here[0], here[1]);
        if (Math.hypot(x2 - x1, z2 - z1) > 1e-4) fig.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        const appear = backOut((t - tin) / 0.6);
        const defeat = a.defeat ? clamp((t - T(a.defeat)) / 1.2) : 0;
        const gone = t > tout ? smooth((t - tout) / 0.5) : 0;
        fig.visible = appear > 0.001 && gone < 0.999;
        fig.scale.setScalar(scaleObj * (a.size ?? 1) * Math.max(0.001, appear) * (1 - gone));
        const moving = t > m0 && t < m1 ? 1 : 0;
        fig.userData.update(t, { moving, fallen: defeat });
        dust.visible = moving > 0; dust.userData.update(t);
        fig.position.y += (1 - clamp((t - tin) / 0.35)) * 2;
      }
      for (const { b, grp, s, smoke } of battles) {
        const a = T(b.t_in), e = b.t_out !== undefined ? T(b.t_out) : Infinity;
        const k2 = clamp((t - a) / 0.4) * (t > e ? 1 - smooth((t - e) / 0.6) : 1);
        grp.visible = k2 > 0.001;
        const pulse = 1 + Math.sin((t - a) * 6) * 0.06 * k2;
        s.scale.setScalar(1.3 * backOut((t - a) / 0.5) * pulse); s.material.opacity = k2;
        smoke.userData.update(t); smoke.material.opacity = 0.35 * k2;
      }
      clouds.userData.update(t, camera.position);
    },
  };
}

export function MapScene({ cfg, film, from }) {
  return (
    <AbsoluteFill>
      <Stage build={buildMap} cfg={cfg} film={film} from={from} grade={cfg.grade || film.grade} />
      {cfg.years && <YearCartouche years={{ ...cfg.years, _from: from }} />}
    </AbsoluteFill>
  );
}
