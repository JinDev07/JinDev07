// Core helpers: timing, easing, seeded randomness, smooth noise, camera warps, fonts.
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import timing from "../timing.json";

export const FPS = 30;

// ---------------------------------------------------------------- time references
// A time in film.json can be:
//   12.4            absolute seconds
//   "c12"           start of SRT cue 12 (1-based, as in the SRT file)
//   "c12e"          end of cue 12
//   "c12:marched"   when the word "marched" is spoken inside cue 12 (estimated by characters)
//   "c12:marched#2" its second occurrence;  any of these may end in "+0.3" or "-0.5"
export function T(ref) {
  if (ref === undefined || ref === null) return 0;
  if (typeof ref === "number") return ref;
  const m = String(ref).trim().match(/^c(\d+)(e)?(?::([^#+\-]+?)(?:#(\d+))?)?\s*([+-]\s*[\d.]+)?$/);
  if (!m) throw new Error("Bad time reference: " + ref);
  const cue = timing.cues.find((c) => c.i === Number(m[1]));
  if (!cue) throw new Error("No SRT cue " + m[1] + " (ref " + ref + ")");
  let t = m[2] ? cue.end : cue.start;
  if (m[3]) {
    const want = m[3].trim().toLowerCase();
    const nth = m[4] ? Number(m[4]) : 1;
    let seen = 0;
    const w = cue.words.find((x) => x.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === want.replace(/[^\p{L}\p{N}]/gu, "") && ++seen === nth);
    if (!w) throw new Error(`Word "${want}" not found in cue ${m[1]}: ${cue.text}`);
    t = w.t;
  }
  if (m[5]) t += Number(m[5].replace(/\s/g, ""));
  return t;
}

// ---------------------------------------------------------------- easing
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const backOut = (t) => { t = clamp(t); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// 0 before a, rises to 1 over [a, a+d], stays 1 until b, falls to 0 over [b, b+d2]
export function window01(t, a, d = 0.5, b = Infinity, d2 = 0.5) {
  if (t < a) return 0;
  const up = smooth((t - a) / d);
  if (t < b) return up;
  return up * (1 - smooth((t - b) / d2));
}

// ---------------------------------------------------------------- randomness
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 5, seed = 1) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function ridged(x, y, oct = 5, seed = 1) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 31) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
// 1D smooth noise for handheld camera drift
export const noise1 = (t, seed) => vnoise(t, seed * 13.37, seed) * 2 - 1;

// ---------------------------------------------------------------- camera keys
// Smooth monotone cubic time warp: zero speed at first and last key, no overshoot.
export function warpU(Ts, t) {
  const n = Ts.length;
  if (n < 2) return 0;
  if (t <= Ts[0]) return 0;
  if (t >= Ts[n - 1]) return 1;
  const sec = [];
  for (let i = 0; i < n - 1; i++) sec.push((1 / (n - 1)) / Math.max(1e-4, Ts[i + 1] - Ts[i]));
  const m = [0];
  for (let i = 1; i < n - 1; i++) m.push((2 * sec[i - 1] * sec[i]) / (sec[i - 1] + sec[i]));
  m.push(0);
  let i = 0;
  while (t > Ts[i + 1]) i++;
  const h = Ts[i + 1] - Ts[i], x = (t - Ts[i]) / h, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * (i / (n - 1)) + (x3 - 2 * x2 + x) * h * m[i] + (-2 * x3 + 3 * x2) * ((i + 1) / (n - 1)) + (x3 - x2) * h * m[i + 1];
}
// Catmull-Rom through values at uniform u
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// keys: [{t, ...numeric fields}] -> object of fields at time t (Catmull-Rom path, warped timing)
export function camAt(keys, t, fields) {
  const Ts = keys.map((k) => k.t);
  const u = warpU(Ts, t) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(u));
  const f = u - i;
  const out = {};
  for (const name of fields) {
    const v = (j) => keys[Math.max(0, Math.min(keys.length - 1, j))][name];
    // clamp overshoot: blend Catmull-Rom with linear for stability
    const c = cr(v(i - 1), v(i), v(i + 1), v(i + 2), f);
    const l = lerp(v(i), v(i + 1), smooth(f));
    const lo = Math.min(v(i), v(i + 1)), hi = Math.max(v(i), v(i + 1));
    out[name] = keys.length < 3 ? l : Math.min(hi, Math.max(lo, c));
  }
  return out;
}

// ---------------------------------------------------------------- fonts
export const FONTS = {
  title: "Cinzel",
  bn: "NotoSerifBengali",
  bnSans: "NotoSansBengali",
  num: "Oswald",
};
let fontsPromise = null;
export function loadFonts() {
  if (!fontsPromise) {
    const list = [
      ["Cinzel", "fonts/Cinzel-700.woff2", "700"],
      ["Cinzel", "fonts/Cinzel-900.woff2", "900"],
      ["NotoSerifBengali", "fonts/NotoSerifBengali-700.woff2", "700"],
      ["NotoSerifBengali", "fonts/NotoSerifBengali-latin-700.woff2", "700"],
      ["NotoSansBengali", "fonts/NotoSansBengali-600.woff2", "600"],
      ["Oswald", "fonts/Oswald-600.woff2", "600"],
    ];
    fontsPromise = Promise.all(list.map(([fam, file, weight]) => {
      const f = new FontFace(fam, `url(${staticFile(file)})`, { weight });
      return f.load().then((ff) => document.fonts.add(ff)).catch(() => null);
    })).then(() => document.fonts.ready);
  }
  return fontsPromise;
}
// Pick the right family for a string: Bangla script -> Noto Serif Bengali, else Cinzel.
export const hasBangla = (s) => /[ঀ-৿]/.test(s || "");
export const fontFor = (s, weight = 700, kind = "title") => {
  if (hasBangla(s)) return `${weight} %SIZE%px ${kind === "sans" ? "NotoSansBengali" : "NotoSerifBengali"}`;
  if (kind === "num") return `600 %SIZE%px Oswald`;
  return `${weight} %SIZE%px Cinzel`;
};
export const font = (s, size, weight = 700, kind = "title") => fontFor(s, weight, kind).replace("%SIZE%", String(Math.round(size)));

// One delayRender for the whole film until fonts are in.
export function useFontsReady() {
  const [h] = useState(() => delayRender("fonts"));
  const [ok, setOk] = useState(false);
  useEffect(() => { loadFonts().then(() => { setOk(true); continueRender(h); }); }, [h]);
  return ok;
}

// ---------------------------------------------------------------- colours
export function hex(c) { return c.startsWith("#") ? c : "#" + c; }
export function shade(hexc, k) {
  // k > 0 lighten, k < 0 darken
  const n = parseInt(hex(hexc).slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function rgba(hexc, a) {
  const n = parseInt(hex(hexc).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
