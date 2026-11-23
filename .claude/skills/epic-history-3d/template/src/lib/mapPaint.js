// Campaign-map painting: projection, land mask, heightmap with real mountain ranges, the painted
// base texture (sea, coasts, terrain, hillshade, rivers) and the per-frame overlay (territories that
// spread and clip to the coast, Epic-History-style arrows, dashed routes, region and sea labels).
import { clamp, fbm, ridged, smooth, rgba, shade, font, easeInOut, lerp } from "./core";

// ---------------------------------------------------------------- projection
// Equirectangular around the bbox centre, x east, z south, 1 world unit = 1 degree of longitude at lat0.
export function makeProjection(bbox) {
  const [lon0, lat0, lon1, lat1] = bbox;
  const latC = (lat0 + lat1) / 2, lonC = (lon0 + lon1) / 2;
  const kx = Math.cos((latC * Math.PI) / 180);
  const P = {
    bbox, latC, lonC, kx,
    w: (lon1 - lon0) * kx, h: lat1 - lat0,
    toXZ: (lon, lat) => [(lon - lonC) * kx, -(lat - latC)],
    toUV: (lon, lat) => [(lon - lon0) / (lon1 - lon0), (lat1 - lat) / (lat1 - lat0)],
  };
  return P;
}

function tracePath(ctx, ring, W, H, P) {
  for (let i = 0; i < ring.length; i++) {
    const [u, v] = P.toUV(ring[i][0], ring[i][1]);
    if (i === 0) ctx.moveTo(u * W, v * H); else ctx.lineTo(u * W, v * H);
  }
}
function polys(ctx, rings, W, H, P, close = true) {
  ctx.beginPath();
  for (const r of rings) { tracePath(ctx, r, W, H, P); if (close) ctx.closePath(); }
}
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

// distance (in degrees) from point to polyline
function distToPath(x, y, path) {
  let best = 1e9, along = 0, bestAlong = 0, total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2);
    const px = ax + dx * t - x, py = ay + dy * t - y;
    const d = Math.sqrt(px * px + py * py);
    const segL = Math.sqrt(L2);
    if (d < best) { best = d; bestAlong = along + t * segL; }
    along += segL;
  }
  total = along;
  return [best, total ? bestAlong / total : 0];
}

// ---------------------------------------------------------------- base build (once per film)
const CACHE = new Map();
export function buildBase(geo, mapCfg) {
  const key = JSON.stringify(mapCfg.bbox || geo.bbox) + (mapCfg.palette || "") + JSON.stringify(mapCfg.mountains || []);
  if (CACHE.has(key)) return CACHE.get(key);
  const P = makeProjection(mapCfg.bbox || geo.bbox);
  const pal = PALETTES[mapCfg.palette || "campaign"];

  // heightmap grid
  const HW = 768, HH = Math.max(64, Math.round((HW * P.h) / P.w));
  const mask = mk(HW, HH), mctx = mask.getContext("2d");
  mctx.fillStyle = "#000"; mctx.fillRect(0, 0, HW, HH);
  mctx.fillStyle = "#fff"; polys(mctx, geo.land, HW, HH, P); mctx.fill("nonzero");
  mctx.fillStyle = "#000"; polys(mctx, geo.lakes || [], HW, HH, P); mctx.fill();
  const blurred = mk(HW, HH), bctx = blurred.getContext("2d");
  bctx.filter = `blur(${Math.max(2, HW / 90)}px)`; bctx.drawImage(mask, 0, 0); bctx.filter = "none";
  const m0 = mctx.getImageData(0, 0, HW, HH).data, b0 = bctx.getImageData(0, 0, HW, HH).data;

  const [lon0, lat0, lon1, lat1] = P.bbox;
  const ranges = (mapCfg.mountains || []).map((r) => ({ ...r, path: r.path }));
  const heights = new Float32Array(HW * HH);
  const land = new Float32Array(HW * HH);
  for (let j = 0; j < HH; j++) {
    for (let i = 0; i < HW; i++) {
      const idx = j * HW + i;
      const lon = lon0 + ((i + 0.5) / HW) * (lon1 - lon0);
      const lat = lat1 - ((j + 0.5) / HH) * (lat1 - lat0);
      const isLand = m0[idx * 4] / 255;
      const inland = b0[idx * 4] / 255;
      land[idx] = isLand;
      let h = 0;
      if (isLand > 0.01) {
        h = 0.035 + 0.07 * smooth(inland) * (0.4 + 0.6 * fbm(lon * 0.35, lat * 0.35, 4, 3));
        h += 0.05 * smooth(inland) * Math.pow(fbm(lon * 0.45, lat * 0.45, 4, 7), 2.0);
        for (const r of ranges) {
          const [d] = distToPath(lon, lat, r.path);
          const w = r.width || 1.2;
          const k = Math.exp(-(d * d) / (2 * (w * 0.5) * (w * 0.5)));
          if (k > 0.01) h += k * (r.height ?? 0.7) * 0.55 * (0.4 + 0.6 * ridged(lon * 0.9, lat * 0.9, 4, 11)) * smooth(inland * 1.3);
        }
        h *= isLand;
      } else {
        h = -0.03 - 0.03 * (1 - inland);
      }
      const edge = Math.min(i, j, HW - 1 - i, HH - 1 - j) / (HW * 0.035);
      heights[idx] = edge < 1 ? lerp(-0.06, h, smooth(edge)) : h;
    }
  }

  // painted base texture
  const TW = 4096, TH = Math.min(4096, Math.round((TW * P.h) / P.w));
  const tex = mk(TW, TH), c = tex.getContext("2d");
  // sea: deep -> shallow near coast
  c.fillStyle = pal.seaDeep; c.fillRect(0, 0, TW, TH);
  const shallow = mk(TW, TH), sc = shallow.getContext("2d");
  sc.filter = `blur(${TW / 60}px)`; sc.drawImage(mask, 0, 0, TW, TH); sc.filter = "none";
  sc.globalCompositeOperation = "source-in"; sc.fillStyle = pal.seaShallow; sc.fillRect(0, 0, TW, TH);
  c.globalAlpha = 0.95; c.drawImage(shallow, 0, 0); c.globalAlpha = 1;
  // sea ripple contour lines around coasts (old-map hatching)
  c.save();
  for (let k = 5; k >= 1; k--) {
    c.strokeStyle = rgba(pal.seaLine, 0.10 + 0.05 * (5 - k));
    c.lineWidth = TW / 900; c.lineJoin = "round";
    c.setLineDash([]);
    const off = k * (TW / 420);
    polys(c, geo.land, TW, TH, P); c.lineWidth = off * 2; c.strokeStyle = rgba(pal.seaLine, 0.05); c.stroke();
  }
  c.restore();
  // land fill with mottled colours
  const landC = mk(TW, TH), lc = landC.getContext("2d");
  lc.fillStyle = pal.land; polys(lc, geo.land, TW, TH, P); lc.fill("nonzero");
  lc.globalCompositeOperation = "source-atop";
  // colour variation from noise (drawn at heightmap res, then scaled)
  const varC = mk(HW, HH), vc = varC.getContext("2d"), vd = vc.createImageData(HW, HH);
  const lowA = hexToRgb(pal.land), lowB = hexToRgb(pal.land2), rock = hexToRgb(pal.rock), snow = hexToRgb(pal.snow);
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const idx = j * HW + i, lon = lon0 + (i / HW) * (lon1 - lon0), lat = lat1 - (j / HH) * (lat1 - lat0);
    const n = fbm(lon * 0.6, lat * 0.6, 5, 21);
    let col = mix(lowA, lowB, smooth((n - 0.35) * 2.2));
    const h = heights[idx];
    col = mix(col, rock, smooth((h - 0.16) / 0.16));
    col = mix(col, snow, smooth((h - 0.5) / 0.12) * 0.8);
    vd.data[idx * 4] = col[0]; vd.data[idx * 4 + 1] = col[1]; vd.data[idx * 4 + 2] = col[2]; vd.data[idx * 4 + 3] = 255;
  }
  vc.putImageData(vd, 0, 0);
  lc.imageSmoothingQuality = "high"; lc.drawImage(varC, 0, 0, TW, TH);
  // hillshade (light from north-west)
  const hs = mk(HW, HH), hc = hs.getContext("2d"), hd = hc.createImageData(HW, HH);
  const sx = (P.w / HW), sz = (P.h / HH), ex = 5;
  for (let j = 1; j < HH - 1; j++) for (let i = 1; i < HW - 1; i++) {
    const idx = j * HW + i;
    const dx = (heights[idx + 1] - heights[idx - 1]) / (2 * sx) * ex;
    const dz = (heights[idx + HW] - heights[idx - HW]) / (2 * sz) * ex;
    const nx = -dx, ny = 1, nz = -dz, nl = Math.hypot(nx, ny, nz);
    const L = [-0.55, 0.62, -0.55], Ll = Math.hypot(...L);
    const d = (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * Ll);
    const v = clamp(0.5 + (d - 0.75) * 1.6, 0, 1) * 255;
    hd.data[idx * 4] = v; hd.data[idx * 4 + 1] = v; hd.data[idx * 4 + 2] = v; hd.data[idx * 4 + 3] = 255;
  }
  hc.putImageData(hd, 0, 0);
  lc.globalCompositeOperation = "overlay"; lc.globalAlpha = 0.75; lc.drawImage(hs, 0, 0, TW, TH); lc.globalAlpha = 1;
  // keep land paint only on land (overlay also paints transparent pixels)
  lc.globalCompositeOperation = "destination-in"; lc.fillStyle = "#000"; polys(lc, geo.land, TW, TH, P); lc.fill("nonzero");
  lc.globalCompositeOperation = "source-over";
  c.drawImage(landC, 0, 0);
  // lakes
  c.fillStyle = pal.seaShallow; polys(c, geo.lakes || [], TW, TH, P); c.fill();
  // rivers
  c.lineCap = "round"; c.lineJoin = "round";
  for (const r of geo.rivers || []) {
    c.beginPath(); tracePath(c, r, TW, TH, P);
    c.strokeStyle = rgba(pal.river, 0.9); c.lineWidth = TW / 1400; c.stroke();
  }
  // coast ink + inner highlight (clean, readable coasts)
  c.lineJoin = "round";
  polys(c, geo.land, TW, TH, P);
  c.strokeStyle = rgba(pal.coastGlow, 0.5); c.lineWidth = TW / 500; c.stroke();
  c.strokeStyle = pal.ink; c.lineWidth = TW / 1500; c.stroke();
  polys(c, geo.lakes || [], TW, TH, P); c.strokeStyle = rgba(pal.ink, 0.7); c.lineWidth = TW / 2200; c.stroke();
  // paper grain
  const grain = mk(512, 512), gc = grain.getContext("2d"), gd = gc.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const v = 128 + (fbm((i % 512) * 0.08, Math.floor(i / 512) * 0.08, 3, 5) - 0.5) * 90; gd.data[i * 4] = gd.data[i * 4 + 1] = gd.data[i * 4 + 2] = v; gd.data[i * 4 + 3] = 255; }
  gc.putImageData(gd, 0, 0);
  c.globalCompositeOperation = "soft-light"; c.globalAlpha = 0.35;
  for (let y = 0; y < TH; y += 512) for (let x = 0; x < TW; x += 512) c.drawImage(grain, x, y);
  c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;

  // soften the map border into deep sea so the edge never reads as a cut
  const em = TW * 0.05;
  for (const [x0, y0, x1, y1, w, h] of [[0, 0, em, 0, em, TH], [TW, 0, TW - em, 0, em, TH], [0, 0, 0, em, TW, em], [0, TH, 0, TH - em, TW, em]]) {
    const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, pal.seaDeep); gr.addColorStop(1, rgba(pal.seaDeep, 0));
    c.fillStyle = gr; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
  }
  const res = { P, pal, tex, TW, TH, heights, HW, HH, mask, land, geo };
  CACHE.set(key, res);
  return res;
}

export function heightAt(base, lon, lat) {
  const [u, v] = base.P.toUV(lon, lat);
  const x = clamp(u * base.HW - 0.5, 0, base.HW - 1.001), y = clamp(v * base.HH - 0.5, 0, base.HH - 1.001);
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, W = base.HW, H = base.heights;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

// ---------------------------------------------------------------- overlay (every frame)
// Smooth a lon/lat path (Catmull-Rom) for arrows and routes.
export function smoothPath(pts, per = 12) {
  if (pts.length < 3) {
    const out = [];
    for (let i = 0; i <= per * 2; i++) { const t = i / (per * 2); out.push([lerp(pts[0][0], pts[1][0], t), lerp(pts[0][1], pts[1][1], t)]); }
    return out;
  }
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// cut a polyline at fraction f of its length
export function partialPath(path, f) {
  if (f >= 1) return path;
  const seg = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) { const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(d); total += d; }
  let want = total * clamp(f), out = [path[0]];
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i]) { const t = seg[i] ? want / seg[i] : 0; out.push([lerp(path[i][0], path[i + 1][0], t), lerp(path[i][1], path[i + 1][1], t)]); return out; }
    want -= seg[i]; out.push(path[i + 1]);
  }
  return out;
}

export function makeOverlay(base) {
  const OW = 3072, OH = Math.round((OW * base.TH) / base.TW);
  const canvas = mk(OW, OH), tmp = mk(OW, OH);
  // alpha mask of land (transparent sea) so territories clip exactly to the coast
  const landMask = mk(OW, OH), lm = landMask.getContext("2d");
  lm.fillStyle = "#fff"; polys(lm, base.geo.land, OW, OH, base.P); lm.fill("nonzero");
  lm.globalCompositeOperation = "destination-out"; polys(lm, base.geo.lakes || [], OW, OH, base.P); lm.fill();
  return { canvas, tmp, landMask, OW, OH };
}

// Draw everything time-dependent onto the overlay canvas.
export function paintOverlay(ov, base, cfg, t, T) {
  const { canvas, tmp, landMask, OW, OH } = ov;
  const P = base.P, pal = base.pal;
  const c = canvas.getContext("2d");
  c.clearRect(0, 0, OW, OH);
  const px = OW / P.w; // overlay px per world unit (degree)
  const uv = (lon, lat) => { const [u, v] = P.toUV(lon, lat); return [u * OW, v * OH]; };

  // --- territories (clipped to land)
  const tc = tmp.getContext("2d");
  tc.clearRect(0, 0, OW, OH);
  for (const ter of cfg.territories || []) {
    const tin = T(ter.t_in ?? 0), tout = ter.t_out !== undefined ? T(ter.t_out) : Infinity;
    if (t < tin - 0.01 || t > tout + 0.8) continue;
    const dur = ter.dur ?? 1.6;
    const grow = easeInOut((t - tin) / dur);
    const fade = t > tout ? 1 - smooth((t - tout) / 0.8) : 1;
    const alpha = (ter.opacity ?? 0.62) * fade;
    tc.save();
    // spread from a point (conquest growing outward) or plain fade-in
    if (ter.from) {
      const [fx, fy] = uv(ter.from[0], ter.from[1]);
      const R = grow * (ter.reach ?? 1.2) * Math.hypot(OW, OH) * 0.6;
      tc.beginPath(); tc.arc(fx, fy, Math.max(0.1, R), 0, Math.PI * 2); tc.clip();
    } else {
      tc.globalAlpha = smooth((t - tin) / Math.min(dur, 0.8));
    }
    const rings = ter.polys || [ter.poly];
    tc.beginPath();
    for (const r of rings) { r.forEach((p, i) => { const [x, y] = uv(p[0], p[1]); if (i) tc.lineTo(x, y); else tc.moveTo(x, y); }); tc.closePath(); }
    tc.fillStyle = rgba(ter.color, alpha); tc.fill("evenodd");
    // inner glow along the border (History-Mapped-Out style soft edge)
    tc.save(); tc.clip("evenodd");
    tc.strokeStyle = rgba(ter.color, Math.min(1, alpha * 1.25)); tc.lineWidth = px * 0.35; tc.lineJoin = "round"; tc.stroke();
    tc.restore();
    tc.strokeStyle = shade(ter.color, -0.45); tc.globalAlpha *= fade; tc.lineWidth = Math.max(2, px * 0.06); tc.lineJoin = "round"; tc.stroke();
    // flash when conquered
    if (ter.flash !== false && t - tin < dur + 0.6 && t > tin) {
      const fl = Math.sin(clamp((t - tin) / (dur + 0.6)) * Math.PI) * 0.25;
      tc.fillStyle = `rgba(255,248,225,${fl})`; tc.fill("evenodd");
    }
    tc.restore();
  }
  tc.globalCompositeOperation = "destination-in"; tc.drawImage(landMask, 0, 0); tc.globalCompositeOperation = "source-over";
  c.drawImage(tmp, 0, 0);

  // --- highlight pulses (a region outlined in light)
  for (const hl of cfg.highlights || []) {
    const a = T(hl.t_in), b = hl.t_out !== undefined ? T(hl.t_out) : a + 3;
    const k = clamp((t - a) / 0.5) * (1 - clamp((t - b) / 0.5));
    if (k <= 0) continue;
    c.save(); c.beginPath();
    hl.poly.forEach((p, i) => { const [x, y] = uv(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    c.strokeStyle = `rgba(255,236,170,${0.9 * k})`; c.lineWidth = px * 0.09; c.shadowColor = `rgba(255,210,120,${k * pulse})`; c.shadowBlur = px * 0.6; c.setLineDash([px * 0.25, px * 0.12]); c.lineDashOffset = -t * px; c.stroke();
    c.restore();
  }

  // --- routes (dashed travel lines)
  for (const r of cfg.routes || []) {
    const a = T(r.t_in), dur = r.dur ?? 2.5, b = r.t_out !== undefined ? T(r.t_out) : Infinity;
    if (t < a) continue;
    const fade = t > b ? 1 - smooth((t - b) / 0.6) : 1;
    if (fade <= 0) continue;
    const path = partialPath(smoothPath(r.path), easeInOut((t - a) / dur));
    c.save(); c.globalAlpha = fade; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); path.forEach((p, i) => { const [x, y] = uv(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.strokeStyle = "rgba(20,14,10,0.35)"; c.lineWidth = px * 0.12; c.setLineDash([]); c.stroke();
    c.strokeStyle = r.color || "#f3e6c4"; c.lineWidth = px * 0.06; c.setLineDash([px * 0.22, px * 0.14]); c.stroke();
    c.restore();
  }

  // --- arrows (Epic-History-style campaign arrows: thick, tapered, outlined, drawn on)
  for (const ar of cfg.arrows || []) {
    const a = T(ar.t_in), dur = ar.dur ?? 2.2, b = ar.t_out !== undefined ? T(ar.t_out) : Infinity;
    if (t < a) continue;
    const fade = t > b ? 1 - smooth((t - b) / 0.6) : 1;
    if (fade <= 0) continue;
    const prog = easeInOut((t - a) / dur);
    const full = smoothPath(ar.path, 16);
    const path = partialPath(full, prog).map((p) => uv(p[0], p[1]));
    if (path.length < 2) continue;
    const wMax = px * (ar.width ?? 0.55);
    drawArrow(c, path, wMax, ar.color || "#c0392b", fade, t);
  }

  // --- labels painted on the map (regions, seas)
  for (const lb of cfg.labels || []) {
    const a = T(lb.t_in ?? 0), b = lb.t_out !== undefined ? T(lb.t_out) : Infinity;
    const k = clamp((t - a) / 0.8) * (t > b ? 1 - clamp((t - b) / 0.6) : 1);
    if (k <= 0) continue;
    const [x, y] = uv(lb.at[0], lb.at[1]);
    const size = px * (lb.size ?? 0.9);
    c.save(); c.translate(x, y); c.rotate(((lb.rot ?? 0) * Math.PI) / 180);
    c.globalAlpha = k;
    c.font = font(lb.text, size, 700);
    c.textAlign = "center"; c.textBaseline = "middle";
    const isSea = lb.kind === "sea";
    const bn = /[\u0980-\u09FF]/.test(lb.text);
    if ("letterSpacing" in c) c.letterSpacing = bn ? "0px" : isSea ? `${size * 0.25}px` : `${size * 0.12}px`;
    // ink spreading in: reveal left to right
    const wTxt = c.measureText(lb.text).width;
    c.beginPath(); c.rect(-wTxt / 2 - size, -size, (wTxt + 2 * size) * easeInOut((t - a) / 0.9), size * 2); c.clip();
    c.lineJoin = "round";
    c.strokeStyle = isSea ? "rgba(20,40,55,0.5)" : "rgba(250,240,215,0.85)"; c.lineWidth = size * 0.16; c.strokeText(lb.text, 0, 0);
    c.fillStyle = isSea ? pal.seaLabel : (lb.color || pal.labelInk); c.fillText(lb.text, 0, 0);
    c.restore();
  }
}

function drawArrow(c, path, wMax, color, alpha, t) {
  // build left/right edges with taper; head at end
  const n = path.length;
  const L = [], R = [];
  let total = 0; const acc = [0];
  for (let i = 1; i < n; i++) { total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); acc.push(total); }
  const headLen = Math.min(total * 0.6, wMax * 1.7);
  const bodyEnd = total - headLen;
  let iEnd = n - 1;
  for (let i = 0; i < n; i++) if (acc[i] > bodyEnd) { iEnd = Math.max(1, i); break; }
  for (let i = 0; i <= iEnd; i++) {
    const p = path[i], q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const f = acc[i] / Math.max(1, bodyEnd);
    const w = wMax * (0.35 + 0.65 * smooth(Math.min(1, f * 1.4))) * 0.5;
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  const tip = path[n - 1], base = path[iEnd];
  let hx = tip[0] - base[0], hy = tip[1] - base[1]; const hd = Math.hypot(hx, hy) || 1; hx /= hd; hy /= hd;
  const hw = wMax * 0.95 * Math.min(1, 0.45 + total / (wMax * 5));
  const h1 = [base[0] - hy * hw, base[1] + hx * hw], h2 = [base[0] + hy * hw, base[1] - hx * hw];
  const shape = () => {
    c.beginPath();
    c.moveTo(L[0][0], L[0][1]); for (const p of L) c.lineTo(p[0], p[1]);
    c.lineTo(h1[0], h1[1]); c.lineTo(tip[0], tip[1]); c.lineTo(h2[0], h2[1]);
    for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
  };
  c.save(); c.globalAlpha = alpha; c.lineJoin = "round";
  // drop shadow
  c.save(); c.translate(wMax * 0.1, wMax * 0.14); shape(); c.fillStyle = "rgba(15,10,5,0.3)"; c.fill(); c.restore();
  shape();
  const g = c.createLinearGradient(path[0][0], path[0][1], tip[0], tip[1]);
  g.addColorStop(0, shade(color, -0.25)); g.addColorStop(1, shade(color, 0.12));
  c.fillStyle = g; c.fill();
  c.strokeStyle = "rgba(255,246,225,0.95)"; c.lineWidth = Math.max(3, wMax * 0.14); c.stroke();
  c.strokeStyle = shade(color, -0.6); c.lineWidth = Math.max(1, wMax * 0.035); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- palettes
export const PALETTES = {
  // warm strategy-game campaign map
  campaign: { seaDeep: "#24485c", seaShallow: "#3f7484", seaLine: "#a9d2d6", land: "#b9a874", land2: "#8e9a5c", rock: "#8a7a62", snow: "#ece6d8", river: "#3f7d96", ink: "#2b241c", coastGlow: "#f4e6bf", labelInk: "#3a2618", seaLabel: "#cfe6ea" },
  // aged parchment
  parchment: { seaDeep: "#9fb3a6", seaShallow: "#b9c8b4", seaLine: "#5d7468", land: "#e3d1a6", land2: "#cfbb8a", rock: "#a8916a", snow: "#f3ead2", river: "#6f8e8c", ink: "#3b2a1c", coastGlow: "#fbf1d6", labelInk: "#3b2416", seaLabel: "#4c6358" },
  // dusk / grim chapters
  dusk: { seaDeep: "#1b2a3a", seaShallow: "#2c4456", seaLine: "#7fa1b4", land: "#8c7a5c", land2: "#6c6a48", rock: "#6c5f50", snow: "#d6d0c4", river: "#3f6a80", ink: "#17120d", coastGlow: "#e2c79b", labelInk: "#f2e4c4", seaLabel: "#a8c4d2" },
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// A signature of everything time-dependent on the overlay; repaint only when it changes.
export function overlayKey(cfg, t, T) {
  const q = (x) => Math.round(Math.min(1, Math.max(0, x)) * 400);
  const parts = [];
  for (const ter of cfg.territories || []) { const a = T(ter.t_in ?? 0), b = ter.t_out !== undefined ? T(ter.t_out) : Infinity; parts.push(q((t - a) / ((ter.dur ?? 1.6) + 0.6)), q((t - b) / 0.8)); }
  for (const hl of cfg.highlights || []) { const a = T(hl.t_in), b = hl.t_out !== undefined ? T(hl.t_out) : a + 3; parts.push(t > a - 0.1 && t < b + 0.6 ? Math.round(t * 30) : q((t - a) / 0.5)); }
  for (const r of [...(cfg.routes || []), ...(cfg.arrows || [])]) { const a = T(r.t_in), b = r.t_out !== undefined ? T(r.t_out) : Infinity; parts.push(q((t - a) / (r.dur ?? 2.5)), q((t - b) / 0.6)); }
  for (const lb of cfg.labels || []) { const a = T(lb.t_in ?? 0), b = lb.t_out !== undefined ? T(lb.t_out) : Infinity; parts.push(q((t - a) / 0.9), q((t - b) / 0.6)); }
  return parts.join(",");
}
