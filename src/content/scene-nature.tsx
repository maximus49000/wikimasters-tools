import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { CHUNK, mulberry32 } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

const tone = (day: string, night: string, daylight: number): string => mixHex(night, day, daylight);

// Une lampe (fenêtre de ferme, refuge, feu de port) : allumée selon l'activité, visible seulement quand il fait sombre.
function Lamp({ x, y, w = 5, h = 6, u, minutes, dim, color = '#FFD27A' }: { x: number; y: number; w?: number; h?: number; u: number; minutes: number; dim: number; color?: string }): ReactElement {
  const lit = lampLit(u, minutes);
  return <rect data-lamp="" data-lit={lit ? 'true' : 'false'} x={x} y={y} width={w} height={h} fill={color} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }} />;
}

// Collines ondulées : une courbe par bande de 360 px, déterministe.
function hills(width: number, base: number, amp: number, seed: number): string {
  let d = `M0 ${base}`;
  for (let chunk = 0; chunk * CHUNK <= width; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 7, 2246822519));
    const x0 = chunk * CHUNK;
    d += ` Q${x0 + CHUNK * 0.25} ${base - rng() * amp} ${x0 + CHUNK * 0.5} ${base - rng() * amp * 0.4} T${x0 + CHUNK} ${base}`;
  }
  return `${d} L${(Math.ceil(width / CHUNK) + 1) * CHUNK} 340 L0 340z`;
}

export function CountrysideScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.78;
  const dim = 1 - sky.daylight;
  const farHills = tone('#8DB88B', '#1F3B3A', sky.daylight);
  const nearHills = tone('#6FA463', '#17332F', sky.daylight);
  const field = tone('#9CC46E', '#1E3A2C', sky.daylight);
  const rng = mulberry32(seed ^ 0xfa12);
  const farms = Array.from({ length: Math.max(1, Math.round(width / 520)) }, (_, i) => ({ i, x: 80 + i * 520 + rng() * 200, u: 0.15 + rng() * 0.5 }));
  const trees = Array.from({ length: Math.round(width / 70) }, (_, i) => ({ i, x: rng() * width, h: 16 + rng() * 14 }));
  return (
    <g data-scene-body data-scene-art="countryside">
      <path d={hills(width, ground - 36, 40, seed)} fill={farHills} />
      <path d={hills(width, ground - 12, 26, seed + 1)} fill={nearHills} />
      <rect x={0} y={ground} width={width} height={height - ground} fill={field} />
      {Array.from({ length: Math.ceil(width / 90) }, (_, i) => (
        <rect key={i} x={i * 90} y={ground} width={45} height={height - ground} fill={tone('#B2D27C', '#254432', sky.daylight)} opacity={0.5} />
      ))}
      {trees.map((t) => (
        <g key={t.i}>
          <rect x={t.x - 1.5} y={ground - t.h * 0.4} width={3} height={t.h * 0.4} fill={tone('#6B4A2E', '#2A1F18', sky.daylight)} />
          <circle cx={t.x} cy={ground - t.h * 0.6} r={t.h * 0.45} fill={tone('#3F7F3F', '#16301F', sky.daylight)} />
        </g>
      ))}
      {farms.map((f) => (
        <g key={f.i}>
          <rect x={f.x} y={ground - 22} width={34} height={22} fill={tone('#C9553E', '#4A2A33', sky.daylight)} />
          <path d={`M${f.x - 3} ${ground - 22} L${f.x + 17} ${ground - 36} L${f.x + 37} ${ground - 22}z`} fill={tone('#7A3B2A', '#2F1B20', sky.daylight)} />
          <Lamp x={f.x + 8} y={ground - 15} u={f.u} minutes={minutes} dim={dim} />
          <Lamp x={f.x + 21} y={ground - 15} u={f.u + 0.05} minutes={minutes} dim={dim} />
        </g>
      ))}
    </g>
  );
}

export function MountainScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.82;
  const dim = 1 - sky.daylight;
  const peaks = (base: number, hMin: number, hMax: number, salt: number): { x: number; w: number; h: number }[] => {
    const out: { x: number; w: number; h: number }[] = [];
    for (let chunk = 0; chunk * CHUNK <= width; chunk++) {
      const rng = mulberry32(seed ^ Math.imul(chunk + salt, 2654435761));
      let x = chunk * CHUNK;
      while (x < (chunk + 1) * CHUNK) {
        const w = 120 + rng() * 140;
        out.push({ x, w, h: hMin + rng() * (hMax - hMin) });
        x += w * 0.6;
      }
    }
    return out;
  };
  const far = peaks(ground, 90, 170, 3);
  const near = peaks(ground, 60, 120, 11);
  const rng = mulberry32(seed ^ 0xbe11);
  const refuges = Array.from({ length: Math.max(1, Math.round(width / 900)) }, (_, i) => ({ i, x: 140 + i * 900 + rng() * 300, u: 0.3 + rng() * 0.4 }));
  const pines = Array.from({ length: Math.round(width / 40) }, (_, i) => ({ i, x: rng() * width, h: 18 + rng() * 16 }));
  const rock = (day: string, night: string): string => tone(day, night, sky.daylight);
  return (
    <g data-scene-body data-scene-art="mountain">
      {far.map((p, i) => (
        <g key={`f${i}`}>
          <path d={`M${p.x - p.w / 2} ${ground} L${p.x} ${ground - p.h} L${p.x + p.w / 2} ${ground}z`} fill={rock('#8C9BB5', '#252B52')} />
          <path d={`M${p.x - p.w * 0.1} ${ground - p.h * 0.8} L${p.x} ${ground - p.h} L${p.x + p.w * 0.1} ${ground - p.h * 0.8}z`} fill={rock('#FFFFFF', '#6C76A8')} />
        </g>
      ))}
      {near.map((p, i) => (
        <path key={`n${i}`} d={`M${p.x - p.w / 2} ${ground} L${p.x} ${ground - p.h} L${p.x + p.w / 2} ${ground}z`} fill={rock('#5F7A66', '#17261F')} />
      ))}
      <rect x={0} y={ground} width={width} height={height - ground} fill={rock('#4F7F4A', '#14291D')} />
      {pines.map((t) => (
        <path key={t.i} d={`M${t.x - 7} ${ground + 4} L${t.x} ${ground + 4 - t.h} L${t.x + 7} ${ground + 4}z`} fill={rock('#2F5F3A', '#0F2118')} />
      ))}
      {refuges.map((r) => (
        <g key={r.i}>
          <rect x={r.x} y={ground - 16} width={26} height={16} fill={rock('#8A5A3A', '#2E2018')} />
          <path d={`M${r.x - 3} ${ground - 16} L${r.x + 13} ${ground - 28} L${r.x + 29} ${ground - 16}z`} fill={rock('#5E3B26', '#20150F')} />
          <Lamp x={r.x + 9} y={ground - 11} u={r.u} minutes={minutes} dim={dim} />
        </g>
      ))}
    </g>
  );
}

export function SeaScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const horizon = height * 0.5;
  const dim = 1 - sky.daylight;
  const water = tone('#3F8CC4', '#16224A', sky.daylight);
  const deep = tone('#2F78B0', '#0F1838', sky.daylight);
  const rng = mulberry32(seed ^ 0x5ea);
  const waves = Array.from({ length: Math.round(width / 28) }, (_, i) => ({ i, x: rng() * width, y: horizon + 8 + rng() * (height - horizon - 12), w: 18 + rng() * 34 }));
  const quay = Array.from({ length: Math.max(1, Math.round(width / 260)) }, (_, i) => ({ i, x: 40 + i * 260 + rng() * 120, u: rng() * 0.8 }));
  return (
    <g data-scene-body data-scene-art="sea">
      <rect x={0} y={horizon} width={width} height={height - horizon} fill={water} />
      <rect x={0} y={horizon + (height - horizon) * 0.45} width={width} height={(height - horizon) * 0.55} fill={deep} />
      <rect x={0} y={horizon} width={width} height={2} fill="#FFFFFF" opacity={0.35} />
      {waves.map((w) => (
        <rect key={w.i} x={w.x} y={w.y} width={w.w} height={2} fill="#FFFFFF" opacity={0.3 + 0.2 * sky.daylight} />
      ))}
      {/* Reflet du soleil ou de la lune : bande claire sous l'astre le plus haut */}
      <g opacity={0.25}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={width * (0.04 + 0.92 * (sky.sunFrac ?? sky.moonFrac ?? 0.5)) - 20 + i * 2} y={horizon + 4 + i * 14} width={40 - i * 3} height={3} fill="#FFF3B8" />
        ))}
      </g>
      {quay.map((q) => (
        <g key={q.i}>
          <rect x={q.x} y={horizon - 10} width={6} height={10} fill={tone('#6B5B45', '#241D18', sky.daylight)} />
          <Lamp x={q.x + 1} y={horizon - 9} w={4} h={4} u={q.u} minutes={minutes} dim={dim} color="#FFE08A" />
          <rect x={q.x + 12} y={horizon - 6} width={22} height={6} fill={tone('#8B7355', '#2A2118', sky.daylight)} />
        </g>
      ))}
    </g>
  );
}
