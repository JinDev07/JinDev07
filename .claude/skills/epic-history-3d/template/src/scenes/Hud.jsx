// Game-style HUD pieces that sit on top of a 3D scene, the way a historical strategy game frames
// its campaign map: the date cartouche (year rolls between keys). Never used for subtitles.
import React from "react";
import { useCurrentFrame } from "remotion";
import { T, FPS, clamp, smooth, easeInOut, font, hasBangla } from "../lib/core";

const BN = "০১২৩৪৫৬৭৮৯";
export const bnDigits = (s) => String(s).replace(/\d/g, (d) => BN[d]);

// years: { keys: [{t, y}], fmt: "{y} খ্রিস্টাব্দ" | "AD {y}", bcFmt: "খ্রিস্টপূর্ব {y}", bangla: true, t_in, t_out, pos: "tl"|"tr" }
export function YearCartouche({ years }) {
  const frame = useCurrentFrame();
  // the parent Sequence offsets frames; MapScene passes film time via years.keys being absolute,
  // so recover film time from the Sequence start stored on the element.
  const t = (years._from ?? 0) + frame / FPS;
  const keys = years.keys.map((k) => ({ t: T(k.t), y: k.y }));
  let y = keys[0].y;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t < keys[i + 1].t) {
      const dur = Math.min(years.roll ?? 1.2, keys[i + 1].t - keys[i].t);
      const u = easeInOut((t - (keys[i + 1].t - dur)) / dur);
      y = Math.round(keys[i].y + (keys[i + 1].y - keys[i].y) * clamp(u));
    }
  }
  if (t >= keys[keys.length - 1].t) y = keys[keys.length - 1].y;
  const tin = years.t_in !== undefined ? T(years.t_in) : keys[0].t - 0.4;
  const tout = years.t_out !== undefined ? T(years.t_out) : Infinity;
  const vis = smooth((t - tin) / 0.5) * (t > tout ? 1 - smooth((t - tout) / 0.5) : 1);
  if (vis <= 0) return null;
  const fmt = y < 0 ? years.bcFmt || "{y} BC" : years.fmt || "AD {y}";
  let txt = fmt.replace("{y}", String(Math.abs(y)));
  if (years.bangla || hasBangla(fmt)) txt = bnDigits(txt);
  const isBn = hasBangla(txt);
  const right = (years.pos || "tr") === "tr";
  return (
    <div style={{ position: "absolute", top: 54, [right ? "right" : "left"]: 64, opacity: vis, transform: `translateY(${(1 - vis) * -20}px)` }}>
      <div style={{
        padding: "14px 38px 16px", minWidth: 260, textAlign: "center",
        background: "linear-gradient(180deg,#f2e3bd 0%,#d8c08c 100%)",
        border: "4px solid #6e4b25", borderRadius: 10,
        boxShadow: "0 0 0 3px #e6cf8f inset, 0 0 0 6px rgba(110,75,37,0.6) inset, 0 10px 28px rgba(0,0,0,0.45)",
        font: font(txt, isBn ? 50 : 54, isBn ? 700 : 900), color: "#3a2411", letterSpacing: isBn ? 0 : 3,
        textShadow: "0 1px 0 rgba(255,250,230,0.8)",
      }}>{txt}</div>
    </div>
  );
}
