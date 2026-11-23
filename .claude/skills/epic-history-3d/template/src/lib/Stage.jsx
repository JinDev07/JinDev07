// Stage: one ThreeCanvas per scene. A scene type supplies build(cfg, film) -> world, where
// world = { root: THREE.Object3D, fog, background, update(t, camera, scene) }.
// Everything is driven by film time t (seconds), never by wall-clock time.
import React, { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FPS, rng } from "./core";

function World({ build, cfg, film, t }) {
  const { scene, camera, gl } = useThree();
  const w = useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = cfg.exposure ?? 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const world = build(cfg, film);
    scene.add(world.root);
    if (world.fog) scene.fog = world.fog;
    if (world.background) scene.background = new THREE.Color(world.background);
    return world;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  w.update(t, camera, scene);
  camera.updateProjectionMatrix();
  return null;
}

export function Stage({ build, cfg, film, from, grade = {} }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = from + frame / FPS;
  return (
    <AbsoluteFill style={{ filter: gradeFilter(grade) }}>
      <ThreeCanvas width={width} height={height} shadows camera={{ fov: 40, near: 0.05, far: 3000, position: [0, 10, 10] }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <World build={build} cfg={cfg} film={film} t={t} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
}

function gradeFilter(g) {
  const parts = [];
  parts.push(`contrast(${g.contrast ?? 1.06})`);
  parts.push(`saturate(${g.saturate ?? 1.05})`);
  if (g.sepia) parts.push(`sepia(${g.sepia})`);
  if (g.brightness) parts.push(`brightness(${g.brightness})`);
  return parts.join(" ");
}

// Film finish over every frame: vignette, warm grade wash, fine animated grain, letterbox optional.
export function Finish({ vignette = 0.55, grain = 0.06, tint = "rgba(255,226,180,0.05)" }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const seed = (frame % 8) + 1;
  const r = rng(seed);
  const bx = Math.floor(r() * 200), by = Math.floor(r() * 200);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: tint, mixBlendMode: "soft-light" }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 52%, rgba(12,8,4,${vignette}) 100%)` }} />
      <svg width={width} height={height} style={{ position: "absolute", opacity: grain, mixBlendMode: "overlay" }}>
        <filter id={`g${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} /><feColorMatrix type="saturate" values="0" /></filter>
        <rect x={-bx} y={-by} width={width + 200} height={height + 200} filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}
