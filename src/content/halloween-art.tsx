import type { ReactElement } from 'react';
import type { HwKind } from '../core/library/city/halloween';
import { mulberry32 } from '../core/library/scene-world';
import { INK, light, shade } from '../core/library/paint/cel';
import { hexRgb, rgba } from '../core/library/paint/color';

// Dessins des décors d'Halloween des habitants (spec 2026-10-20 « Halloween » §2 ; port en SVG de `paintPumpkin`,
// `paintWitch`, `paintSkeleton`, `paintCrow`, `paintSpider` de docs/superpowers/maquettes/halloween/src/09-halloween.js).
// Composants de présentation, chacun dans son repère (pied ou point d'accroche en 0,0), 1 px de scène = 1 px de maquette.
// Règle des calques de la façade : nombre de nœuds fixe quel que soit l'état ; la nuit, un voile #1E2A5A à 0,64 × `dark`
// recouvre les formes colorées (comme window-life-art.tsx) ; ce qui brille (visage et lueur d'une citrouille allumée, yeux de
// l'araignée) reste au-dessus. Aucune animation.

// Voile de nuit des dessins de la façade (window-life-art.tsx : DARK_VEIL, DARK_ALPHA).
const DARK_VEIL = '#1E2A5A';
const DARK_ALPHA = 0.64;
const n = (v: number): number => Math.round(v * 100) / 100;
const veil = (dark: number): number => n(DARK_ALPHA * Math.min(1, Math.max(0, dark)));
const css = (hex: string, f?: (c: ReturnType<typeof hexRgb>) => ReturnType<typeof hexRgb>): string => rgba(f ? f(hexRgb(hex)) : hexRgb(hex), 1);
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0z`;

// ---------- Citrouille ----------
const PUMPKIN_HUES = ['#E8772E', '#F08A2A', '#D86A22', '#F2A03A', '#E06A30'] as const;
const STEM = '#5A6A2E';
const FACE_DARK = '#3A1A10';
const FACE_LIT = '#FFE27A';
const GLOW_OUT = 'rgba(255,170,60,0.22)';
const GLOW_IN = 'rgba(255,190,90,0.25)';
// Tirages d'une citrouille (teinte, aplatissement, visage, inclinaison de la tige) depuis `v` : jamais deux pareilles côte à côte.
export function pumpkinLook(v: number): { hue: string; squash: number; face: 0 | 1 | 2 | 3; lean: number } {
  const r = mulberry32(Math.floor(v * 1e9) + 7);
  const hue = PUMPKIN_HUES[Math.floor(r() * PUMPKIN_HUES.length)]!;
  const squash = 0.72 + r() * 0.22;
  const face = Math.floor(r() * 4) as 0 | 1 | 2 | 3;
  return { hue, squash, face, lean: (r() - 0.5) * 0.5 };
}
// Visage sculpté (repère de la citrouille, centre du corps en (0, cy)) : triangles et dents en zigzag, yeux ronds et sourire,
// yeux méchants et dents carrées, ou une simple fente (citrouille non sculptée : la bougie passe par une fente).
function facePath(face: number, r: number, ry: number, cy: number): string {
  const ex = r * 0.38, ey = cy - ry * 0.22, es = r * 0.22;
  const tri = (x: number, y: number, s: number, up: boolean): string => {
    const k = up ? 1 : -1;
    return `M${n(x - s)} ${n(y + k * s * 0.6)}L${n(x + s)} ${n(y + k * s * 0.6)}L${n(x)} ${n(y - k * s * 0.8)}z`;
  };
  if (face === 0) {
    let mouth = `M${n(-r * 0.6)} ${n(cy + ry * 0.3)}`;
    for (let k = 0; k <= 6; k++) mouth += `L${n(-r * 0.6 + k * r * 0.2)} ${n(cy + ry * (0.3 + (k % 2 ? 0.22 : 0)))}`;
    mouth += `L${n(r * 0.5)} ${n(cy + ry * 0.58)}Q0 ${n(cy + ry * 0.75)} ${n(-r * 0.5)} ${n(cy + ry * 0.58)}z`;
    return tri(-ex, ey, es, true) + tri(ex, ey, es, true) + tri(0, cy + ry * 0.05, es * 0.6, true) + mouth;
  }
  if (face === 1) {
    return ellipse(-ex, ey, es * 0.85, es * 0.85) + ellipse(ex, ey, es * 0.85, es * 0.85)
      + `M${n(-r * 0.62)} ${n(cy + ry * 0.2)}Q0 ${n(cy + ry * 0.95)} ${n(r * 0.62)} ${n(cy + ry * 0.2)}Q0 ${n(cy + ry * 0.5)} ${n(-r * 0.62)} ${n(cy + ry * 0.2)}z`;
  }
  if (face === 2) return tri(-ex, ey, es, false) + tri(ex, ey, es, false) + `M${n(-r * 0.55)} ${n(cy + ry * 0.28)}h${n(r * 1.1)}v${n(ry * 0.3)}h${n(-r * 1.1)}z`;
  return `M${n(-r * 0.5)} ${n(cy - ry * 0.05)}h${n(r)}v${n(ry * 0.12)}h${n(-r)}z`;
}
// Citrouille posée, pied en (0, 0), rayon `r`. `lit` : bougie allumée (lueur, visage jaune) ; sinon visage sombre (sauf la
// citrouille non sculptée, sans visage de jour).
export function Pumpkin({ v, r, lit, dark = 0 }: { v: number; r: number; lit: boolean; dark?: number }): ReactElement {
  const { hue, squash, face, lean } = pumpkinLook(v);
  const ry = r * squash;
  const cy = -ry;
  const body = ellipse(0, cy, r * 1.04, ry);
  const lobes = ellipse(r * 0.42, cy, r * 0.62, ry);
  const left = ellipse(-r * 0.42, cy, r * 0.62, ry);
  const front = ellipse(0, cy, r * 0.6, ry * 1.02);
  const stem = `M${n(-r * 0.12)} ${n(cy - ry * 0.95)}L${n(lean * r)} ${n(cy - ry - r * 0.42)}L${n(lean * r + r * 0.22)} ${n(cy - ry - r * 0.36)}L${n(r * 0.14)} ${n(cy - ry * 0.95)}z`;
  const fp = facePath(face, r, ry, cy);
  const on = lit ? 1 : 0;
  return (
    <g data-pumpkin={face} data-lit={lit ? 'true' : 'false'}>
      <circle cx={0} cy={n(cy)} r={n(r * 2.6)} fill={GLOW_OUT} opacity={on} />
      <circle cx={0} cy={n(cy)} r={n(r * 1.6)} fill={GLOW_IN} opacity={on} />
      <path d={lobes} fill={css(hue, (c) => shade(c, 0.3))} />
      <path d={left} fill={css(hue, (c) => light(c, 0.08))} />
      <path d={front} fill={hue} />
      <path d={stem} fill={STEM} />
      <path data-dark-veil="" d={body + stem} fill={DARK_VEIL} opacity={lit ? n(veil(dark) * 0.35) : veil(dark)} />
      <path d={body} fill="none" stroke={INK} strokeWidth={n(Math.max(0.25, r * 0.12))} />
      <path d={ellipse(0, cy, r * 0.5, ry * 0.98)} fill="none" stroke={INK} strokeWidth={n(Math.max(0.15, r * 0.06))} />
      <path data-face="" d={fp} fill={FACE_DARK} opacity={face === 3 || lit ? 0 : 1} />
      <path data-face-lit="" d={fp} fill={FACE_LIT} opacity={on} />
    </g>
  );
}

// ---------- Sorcière (silhouette découpée) et son balai ----------
const WITCH = '#2A1E30';
const WITCH_BAND = '#8A5A8E';
const BROOM = '#7A5A3A';
const STRAW = '#C8A050';
// Pieds en (0, 0), hauteur `h`, tournée vers `dir` ; le balai est posé contre le mur, de l'autre côté.
export function Witch({ h, dir = 1, dark = 0 }: { h: number; dir?: 1 | -1; dark?: number }): ReactElement {
  const d = (x: number): number => n(dir * x * h);
  const y = (k: number): number => n(-k * h);
  const robe = `M${d(-0.2)} 0L${d(-0.1)} ${y(0.62)}L${d(0.1)} ${y(0.62)}L${d(0.22)} 0z`;
  const head = ellipse(0, -0.7 * h, 0.09 * h, 0.09 * h);
  const nose = `M${d(0.08)} ${y(0.71)}L${d(0.2)} ${y(0.66)}L${d(0.07)} ${y(0.66)}z`;
  const hat = `M${d(-0.2)} ${y(0.76)}L${d(0.2)} ${y(0.76)}L${d(0.03)} ${y(1.08)}L${d(-0.02)} ${y(0.86)}z`;
  const stick = `M${d(-0.42)} ${y(0.95)}L${d(-0.3)} ${y(0.15)}`;
  const straw = `M${d(-0.33)} ${y(0.25)}L${d(-0.4)} 0L${d(-0.18)} 0L${d(-0.27)} ${y(0.25)}z`;
  return (
    <g data-witch="">
      <path d={stick} stroke={BROOM} strokeWidth={n(Math.max(0.4, h * 0.04))} fill="none" />
      <path d={straw} fill={STRAW} />
      <path d={stick} stroke={DARK_VEIL} strokeWidth={n(Math.max(0.4, h * 0.04))} fill="none" opacity={veil(dark)} />
      <path d={straw} fill={DARK_VEIL} opacity={veil(dark)} />
      <path d={robe + head + nose + hat} fill={WITCH} />
      <rect x={n(-0.1 * h)} y={n(-0.8 * h)} width={n(0.2 * h)} height={n(0.035 * h)} fill={WITCH_BAND} />
    </g>
  );
}

// ---------- Squelette assis sur la rambarde ----------
const BONE = '#F2EEE2';
// Bassin posé sur la lisse en (0, 0), hauteur assise `h` : jambes pendantes devant le garde-corps.
export function Skeleton({ h, dark = 0 }: { h: number; dark?: number }): ReactElement {
  const p = (x: number, y: number): string => `${n(x * h)} ${n(y * h)}`;
  const bones = `M${p(0, 0)}L${p(0, -0.45)}`
    + [0, 1, 2].map((k) => `M${p(-0.12, -(0.18 + k * 0.08))}L${p(0.12, -(0.18 + k * 0.08))}`).join('')
    + `M${p(-0.04, 0)}L${p(-0.1, 0.22)}L${p(-0.08, 0.45)}M${p(0.06, 0)}L${p(0.12, 0.22)}L${p(0.16, 0.44)}`
    + `M${p(-0.12, -0.4)}L${p(-0.22, -0.18)}L${p(-0.18, -0.02)}M${p(0.12, -0.4)}L${p(0.26, -0.5)}L${p(0.32, -0.66)}`;
  const lw = n(Math.max(0.35, h * 0.05));
  const skull = ellipse(0, -0.58 * h, 0.12 * h, 0.12 * h);
  return (
    <g data-skeleton="">
      <path d={bones} stroke={BONE} strokeWidth={lw} strokeLinecap="round" fill="none" />
      <path d={skull} fill={BONE} stroke={INK} strokeWidth={0.25} />
      <path data-dark-veil="" d={bones} stroke={DARK_VEIL} strokeWidth={lw} strokeLinecap="round" fill="none" opacity={veil(dark)} />
      <path d={skull} fill={DARK_VEIL} opacity={veil(dark)} />
      <path d={ellipse(-0.045 * h, -0.59 * h, 0.035 * h, 0.035 * h) + ellipse(0.045 * h, -0.59 * h, 0.035 * h, 0.035 * h)} fill={INK} />
    </g>
  );
}

// ---------- Corbeau perché ----------
const CROW = '#1E1A24';
const BEAK = '#C89A3A';
// Pattes sur la lisse en (0, 0), taille `s`, tête tournée vers `look`.
export function Crow({ s, look = 1, dark = 0 }: { s: number; look?: 1 | -1; dark?: number }): ReactElement {
  const x = (k: number): number => n(look * k * s);
  const y = (k: number): number => n(-k * s);
  const body = `M${x(0.75)} ${y(0.55)}Q${x(0.5)} ${y(1.05)} ${x(-0.2)} ${y(0.95)}L${x(-1.25)} ${y(0.1)}L${x(-0.55)} ${y(0.35)}Q${x(-0.3)} ${y(0.05)} ${x(0.3)} ${y(0.1)}Q${x(0.8)} ${y(0.2)} ${x(0.75)} ${y(0.55)}z`;
  const head = ellipse(look * 0.55 * s, -0.95 * s, 0.32 * s, 0.32 * s);
  const beak = `M${x(0.82)} ${y(1.0)}L${x(1.2)} ${y(0.9)}L${x(0.8)} ${y(0.86)}z`;
  return (
    <g data-crow="">
      <path d={body + head} fill={CROW} />
      <path d={beak + `M${x(-0.1)} 0h${n(look * 0.08 * s)}v${y(0.12)}h${n(-look * 0.08 * s)}zM${x(0.12)} 0h${n(look * 0.08 * s)}v${y(0.12)}h${n(-look * 0.08 * s)}z`} fill={BEAK} />
      <path d={beak} fill={DARK_VEIL} opacity={veil(dark)} />
      <circle cx={x(0.62)} cy={y(1.02)} r={n(0.08 * s)} fill="#FFD86A" />
    </g>
  );
}

// ---------- Araignée géante au bout de son fil ----------
const SPIDER = '#1A1418';
const SPIDER_MARK = '#C83A3A';
const THREAD = 'rgba(240,240,240,0.8)';
const EYES = '#FF3A3A';
// Fil accroché en (0, 0), araignée à `len` en dessous, taille `s` ; `eyes` : yeux rouges allumés (la nuit).
export function Spider({ s, len, eyes, dark = 0 }: { s: number; len: number; eyes: boolean; dark?: number }): ReactElement {
  const y = len;
  let legs = '';
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const a = -0.9 + k * 0.55;
      legs += `M0 ${n(y)}Q${n(sd * s * 1.1)} ${n(y + Math.sin(a) * s * 1.4 - s * 0.6)} ${n(sd * s * 1.7)} ${n(y + Math.sin(a) * s * 1.2 + s * 0.4)}`;
    }
  }
  return (
    <g data-spider="">
      <path d={`M0 0L0 ${n(y - s * 0.6)}`} stroke={THREAD} strokeWidth={0.22} />
      <path d={legs} stroke={SPIDER} strokeWidth={n(Math.max(0.3, s * 0.18))} fill="none" />
      <path d={ellipse(0, y + s * 0.15, s * 0.7, s * 0.7) + ellipse(0, y - s * 0.55, s * 0.42, s * 0.42)} fill={SPIDER} />
      <rect x={n(-s * 0.18)} y={n(y + s * 0.05)} width={n(s * 0.36)} height={n(s * 0.14)} fill={SPIDER_MARK} />
      <rect x={n(-s * 0.18)} y={n(y + s * 0.05)} width={n(s * 0.36)} height={n(s * 0.14)} fill={DARK_VEIL} opacity={veil(dark)} />
      <path d={ellipse(-s * 0.15, y - s * 0.58, s * 0.1, s * 0.1) + ellipse(s * 0.15, y - s * 0.58, s * 0.1, s * 0.1)} fill={EYES} opacity={eyes ? 1 : 0} />
    </g>
  );
}

// Décor tenu dans les mains (repère de la main, objet sous elle) : en petit, éteint.
export function HeldDecor({ kind, v = 0.37, dark = 0 }: { kind: HwKind; v?: number; dark?: number }): ReactElement {
  switch (kind) {
    case 'pumpkin': return <g transform="translate(0 1.6)"><Pumpkin v={v} r={1.6} lit={false} dark={dark} /></g>;
    case 'witch': return <g transform="translate(1 2.5)"><Witch h={5} dark={dark} /></g>;
    case 'skeleton': return <g transform="translate(0 1)"><Skeleton h={4} dark={dark} /></g>;
    case 'crow': return <g transform="translate(0 0.8)"><Crow s={1.4} dark={dark} /></g>;
    case 'spider': return <g transform="translate(0 -0.5)"><Spider s={1.1} len={1.5} eyes={false} dark={dark} /></g>;
  }
}

// ---------- Décors d'entrée et de lampadaire (habitants à l'échelle, mairie) ----------
const WEB = 'rgba(250,250,250,0.9)';
const WEB_NIGHT = 'rgba(230,236,255,0.85)';
// Toile d'araignée dans l'angle d'un encadrement : coin en (0, 0), rayons vers +x (dir 1) ou −x (dir −1) et vers le bas,
// trois fils en arc, une petite araignée.
export function Web({ s, dir, night }: { s: number; dir: 1 | -1; night: boolean }): ReactElement {
  const rays = 5;
  const ang = (k: number): number => (k / (rays - 1)) * (Math.PI / 2);
  const pt = (a: number, q: number): [number, number] => [dir * Math.cos(a) * s * q, Math.sin(a) * s * q];
  let d = '';
  for (let k = 0; k < rays; k++) {
    const [x, y] = pt(ang(k), 1);
    d += `M0 0L${n(x)} ${n(y)}`;
  }
  for (const q of [0.35, 0.62, 0.9]) {
    const [x0, y0] = pt(ang(0), q);
    d += `M${n(x0)} ${n(y0)}`;
    for (let k = 1; k < rays; k++) {
      const [x, y] = pt(ang(k), q);
      const [mx, my] = pt((ang(k) + ang(k - 1)) / 2, q * 0.82);
      d += `Q${n(mx)} ${n(my)} ${n(x)} ${n(y)}`;
    }
  }
  const [sx, sy] = pt(ang(2), 0.62);
  return (
    <g data-web="">
      <path d={d} fill="none" stroke={night ? WEB_NIGHT : WEB} strokeWidth={0.28} />
      <path d={[0, 1, 2, 3].map((k) => `M${n(sx - 1.1)} ${n(sy - 0.6 + k * 0.4)}L${n(sx + 1.1)} ${n(sy + 0.6 - k * 0.4)}`).join('')} stroke={INK} strokeWidth={0.22} />
      <circle cx={n(sx)} cy={n(sy)} r={0.55} fill={SPIDER} />
    </g>
  );
}
const SHEET = '#F4F2EC';
const SHEET_GLOW = 'rgba(200,230,255,0.18)';
// Fantôme en drap pendu par le haut en (0, 0) : bas ondulé, deux yeux ; la nuit, une légère lueur.
export function Ghost({ w, h, glow, dark = 0 }: { w: number; h: number; glow: boolean; dark?: number }): ReactElement {
  let sheet = `M${n(-w / 2)} ${n(h * 0.45)}Q${n(-w / 2)} 0 0 0Q${n(w / 2)} 0 ${n(w / 2)} ${n(h * 0.45)}L${n(w / 2)} ${n(h)}`;
  for (let k = 3; k >= 0; k--) sheet += `Q${n(-w / 2 + (k + 0.5) * (w / 4))} ${n(h * 0.84)} ${n(-w / 2 + k * (w / 4))} ${n(h)}`;
  sheet += 'z';
  return (
    <g data-ghost="">
      <path d={ellipse(0, h * 0.5, w * 0.9, h * 0.75)} fill={SHEET_GLOW} opacity={glow ? 1 : 0} />
      <path d={sheet} fill={SHEET} stroke={INK} strokeWidth={0.4} />
      <path d={`M${n(w * 0.2)} ${n(h * 0.3)}h${n(w * 0.28)}v${n(h * 0.6)}h${n(-w * 0.28)}z`} fill={css(SHEET, (c) => shade(c, 0.25))} />
      <path data-dark-veil="" d={sheet} fill={DARK_VEIL} opacity={glow ? n(veil(dark) * 0.4) : veil(dark)} />
      <path d={ellipse(-w * 0.17, h * 0.34, w * 0.07, h * 0.08) + ellipse(w * 0.17, h * 0.34, w * 0.07, h * 0.08)} fill={INK} />
    </g>
  );
}
const BAT = '#22182A';
const BAT_EYES = '#FFB040';
// Chauve-souris en papier, ailes ouvertes, accrochée en (0, 0) ; `eyes` : yeux orange (lampadaire allumé).
export function batPath(x: number, y: number, s: number): string {
  return `M${n(x)} ${n(y)}Q${n(x - s * 0.6)} ${n(y - s * 0.6)} ${n(x - s * 1.4)} ${n(y - s * 0.2)}Q${n(x - s * 0.9)} ${n(y + s * 0.1)} ${n(x - s * 0.7)} ${n(y + s * 0.4)}`
    + `Q${n(x - s * 0.3)} ${n(y + s * 0.1)} ${n(x)} ${n(y + s * 0.4)}Q${n(x + s * 0.3)} ${n(y + s * 0.1)} ${n(x + s * 0.7)} ${n(y + s * 0.4)}`
    + `Q${n(x + s * 0.9)} ${n(y + s * 0.1)} ${n(x + s * 1.4)} ${n(y - s * 0.2)}Q${n(x + s * 0.6)} ${n(y - s * 0.6)} ${n(x)} ${n(y)}z`;
}
export function Bats({ at, s, eyes }: { at: readonly (readonly [number, number])[]; s: number; eyes: boolean }): ReactElement {
  return (
    <g data-bats="">
      <path d={at.map(([x, y]) => batPath(x, y, s)).join('')} fill={BAT} />
      <path d={at.map(([x, y]) => ellipse(x - s * 0.15, y + s * 0.05, 0.18, 0.18) + ellipse(x + s * 0.15, y + s * 0.05, 0.18, 0.18)).join('')} fill={BAT_EYES} opacity={eyes ? 1 : 0} />
    </g>
  );
}
