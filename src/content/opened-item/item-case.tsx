// Fable n'est pas passé : à reprendre lors d'un rattrapage Fable (boîtes de jeux : dessin provisoire Opus, gel jusqu'au 2026-10-17).
//
// Boîtier ouvert (CSS 3D) : l'objet touché dans la scène vole depuis sa place, grossit et se centre, puis son couvercle
// (ou la couverture du livre) pivote de 180° autour de sa charnière gauche ; la face intérieure du couvercle porte le
// sélecteur (à gauche) et le plateau garde le disque, centré, à droite. Style cellulo : aplats + trait encré + ombre nette.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { BOX_FORMATS, type BoxFormat } from '../../core/game/platform-boxes';
import type { Opening } from '../../core/library/opened-item';
import type { Box } from '../../core/library/zoom-target';

export type CasePhase = 'opening' | 'open' | 'closing';
// 'flying' : le disque vient de quitter le plateau (il vole vers le poste) ; plateau vide, son emplacement reste mesurable.
export type DiscState = 'in' | 'spinning' | 'away' | 'flying';

type Props = {
  opening: Opening;
  phase: CasePhase;
  // Rectangles (repère du calque) d'où part le boîtier à l'ouverture et vers lequel il va à la fermeture ; null = centre.
  from: Box | null;
  to: Box | null;
  cover: string | null;
  color: string;
  title: string;
  disc: DiscState;
  // Mouvement réduit : fondu, ni vol ni pivot (passé par l'appelant).
  reduced: boolean;
  // Face intérieure du couvercle.
  selector: ReactNode;
  // Remplace le disque dans le plateau (vidéo, couverture du livre).
  right?: ReactNode;
  // Boîte de jeu : le gabarit de la console (dimensions réelles, support) et la couleur de son plastique.
  format?: BoxFormat;
  caseColor?: string;
  // Boîte de jeu : face extérieure (dos | tranche | devant), vue quand la boîte est retournée (⟲).
  outside?: ReactNode;
  flipped?: boolean;
  // Taille du calque connue de l'appelant, tant qu'elle n'est pas mesurée (rendu hors écran, tests).
  size?: { w: number; h: number };
};

// Durées : vol puis pivot du couvercle ; fondu en mouvement réduit.
export const CASE_FLY_MS = 500;
export const CASE_PIVOT_MS = 700;
export const CASE_FADE_MS = 150;

type Rect = { x: number; y: number; w: number; h: number };
// 'mini' : mini-disque 8 cm (GameCube) ; 'umd' : disque PSP dans sa coque ; 'cart' : cartouche.
type DiscKind = 'cd' | 'dvd' | 'game' | 'vinyl' | 'mini' | 'umd' | 'cart';
// Géométrie d'un boîtier, en unités du dessin (≈ mm) : une moitié (plateau ou couvercle). `d` : diamètre (ou plus grand côté) du
// support ; `w`/`h` : support rectangulaire (UMD, cartouche) ; `color` : plastique de la cartouche.
export type Geometry = {
  w: number; h: number;
  disc: { kind: DiscKind; cx: number; cy: number; d: number; w?: number; h?: number; color?: string } | null;
  selector: Rect; right: Rect;
};

// Boîte de jeu ouverte : chaque moitié a la taille de la boîte fermée de la console ; le support, à l'échelle réelle, est centré dans
// la moitié droite ; le sélecteur prend la moitié gauche moins 9 mm de marge.
const PAGE_MARGIN = 9;
export function gameGeometry(format: BoxFormat): Geometry {
  const t = BOX_FORMATS[format];
  const w = t.w * 10;
  const h = t.h * 10;
  const at = { cx: w / 2, cy: h / 2 };
  const s = t.support;
  const disc: Geometry['disc'] = s.kind === 'disc' ? { kind: s.d < 12 ? 'mini' : 'game', ...at, d: s.d * 10 }
    : s.kind === 'umd' ? { kind: 'umd', ...at, d: Math.max(s.w, s.h) * 10, w: s.w * 10, h: s.h * 10 }
    : { kind: 'cart', ...at, d: Math.max(s.w, s.h) * 10, w: s.w * 10, h: s.h * 10, color: s.color };
  const page: Rect = { x: PAGE_MARGIN, y: PAGE_MARGIN, w: w - 2 * PAGE_MARGIN, h: h - 2 * PAGE_MARGIN };
  return { w, h, disc, selector: page, right: { ...page } };
}

const GEOMETRY: Record<Exclude<Opening, 'game-case'>, Geometry> = {
  'jewel-cd': { w: 142, h: 125, disc: { kind: 'cd', cx: 76, cy: 62.5, d: 112 }, selector: { x: 9, y: 6, w: 116, h: 113 }, right: { x: 16, y: 5, w: 120, h: 115 } },
  'dvd-case': { w: 135, h: 190, disc: { kind: 'dvd', cx: 71, cy: 95, d: 114 }, selector: { x: 13, y: 27, w: 106, h: 136 }, right: { x: 14, y: 12, w: 113, h: 166 } },
  'vinyl-sleeve': { w: 100, h: 100, disc: { kind: 'vinyl', cx: 51, cy: 50, d: 88 }, selector: { x: 8, y: 8, w: 82, h: 84 }, right: { x: 7, y: 9, w: 88, h: 82 } },
  book: { w: 130, h: 200, disc: null, selector: { x: 13, y: 15, w: 102, h: 170 }, right: { x: 10, y: 10, w: 110, h: 180 } },
};

// Trait encré de 2 px quelle que soit la taille du boîtier ; trait fin pour les détails.
const INK_C = '#2B1D16';
const INK = { stroke: INK_C, strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { ...INK, strokeWidth: 1 } as const;
// Ombre nette, décalée, sans flou.
const SHADOW = 'drop-shadow(5px 7px 0 rgba(28,18,12,.32))';

const f = (n: number): number => Math.round(n * 100) / 100;

const geometryOf = (opening: Opening, format: BoxFormat): Geometry => (opening === 'game-case' ? gameGeometry(format) : GEOMETRY[opening]);

// Place gardée au-dessus (et au-dessous, pour rester centrée) d'une boîte de jeu pour le bouton ⟲ de 44 px.
export const FLIP_ROOM = 56;

// Boîte ouverte dans le calque (lw × lh) : `x` = la charnière (centre horizontal de la boîte), `y` = son bord haut, `W` × `H` = une moitié.
// Elle tient dans 88 % de la largeur (face extérieure d'un jeu comprise, plus large de la tranche) et 80 % de la hauteur ;
// un jeu laisse en plus la place du bouton ⟲ au-dessus.
export function openCaseLayout(opening: Opening, format: BoxFormat, lw: number, lh: number): { x: number; y: number; W: number; H: number } {
  const g = geometryOf(opening, format);
  const game = opening === 'game-case';
  const span = game ? 2 * g.w + BOX_FORMATS[format].d * 10 : 2 * g.w;
  const maxH = game ? Math.min(lh * 0.8, lh - 2 * FLIP_ROOM) : lh * 0.8;
  const H = Math.max(0, Math.min(maxH, (lw * 0.88 * g.h) / span));
  const W = H * (g.w / g.h);
  return { x: lw / 2, y: (lh - H) / 2, W, H };
}

function rgbOf(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split('').map((x) => x + x).join('') : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// Couleur assombrie (tranches, dos) ; une couleur non hexadécimale est gardée telle quelle.
function shade(c: string, k = 0.28): string {
  const rgb = rgbOf(c);
  if (!rgb) return c;
  const ink = [30, 20, 16];
  return `#${rgb.map((v, i) => Math.round(v + (ink[i]! - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
// Couleur éclaircie (fond moulé du plastique, stries).
function lighten(c: string, k = 0.14): string {
  const rgb = rgbOf(c);
  if (!rgb) return c;
  return `#${rgb.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
// Texte lisible sur l'aplat.
function textOn(c: string): string {
  const rgb = rgbOf(c);
  if (!rgb) return '#FBF6EA';
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? INK_C : '#FBF6EA';
}
// Titre coupé en lignes courtes (au plus `n`, la dernière tronquée).
function titleLines(title: string, max: number, n: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of title.trim().split(/\s+/)) {
    if (cur === '') cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur !== '') out.push(cur);
  const lines = out.slice(0, n).map((l) => (l.length > max ? l.slice(0, Math.max(1, max - 1)) + '…' : l));
  if (out.length > n && lines.length > 0) {
    const last = lines[n - 1]!;
    lines[n - 1] = (last.length >= max ? last.slice(0, Math.max(1, max - 1)) : last) + '…';
  }
  return lines;
}

// Titre centré sur un aplat, en quelques lignes.
function TitleText({ cx, cy, w, title, fill, size }: { cx: number; cy: number; w: number; title: string; fill: string; size: number }): ReactElement {
  const lines = titleLines(title, Math.max(4, Math.floor(w / (size * 0.56))), 3);
  const top = cy - ((lines.length - 1) * size * 1.15) / 2;
  return (
    <text x={f(cx)} y={f(top)} textAnchor="middle" dominantBaseline="middle" fill={fill} fontSize={f(size)} fontWeight={700} fontFamily="Georgia, 'Times New Roman', serif">
      {lines.map((l, i) => <tspan key={i} x={f(cx)} dy={i === 0 ? 0 : f(size * 1.15)}>{l}</tspan>)}
    </text>
  );
}

type Art = { cover: string | null; color: string; title: string; uid: string };

// Pochette : l'image (rognée au cadre) ou, sans image, l'aplat de couleur avec le titre.
function CoverArt({ r, art, id }: { r: Rect; art: Art; id: string }): ReactElement {
  const clip = `${art.uid}-${id}`;
  return (
    <g>
      <clipPath id={clip}><rect x={r.x} y={r.y} width={r.w} height={r.h} /></clipPath>
      {art.cover
        ? <image href={art.cover} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        : <>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={art.color} />
            <rect x={f(r.x + r.w * 0.08)} y={f(r.y + r.h * 0.08)} width={f(r.w * 0.84)} height={f(r.h * 0.84)} fill="none" stroke={textOn(art.color)} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.45} />
            <TitleText cx={r.x + r.w / 2} cy={r.y + r.h / 2} w={r.w * 0.8} title={art.title} fill={textOn(art.color)} size={Math.min(r.w, r.h) * 0.11} />
          </>}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" {...THIN} />
    </g>
  );
}

// Charnière à rotules du boîtier cristal (bande striée + deux tenons).
function JewelHinge({ x, h }: { x: number; h: number }): ReactElement {
  return (
    <g>
      <rect x={x} y={0} width={12} height={h} fill="#B9CCD4" {...INK} />
      <line x1={x + 4} y1={3} x2={x + 4} y2={h - 3} {...THIN} stroke="#8EA6B0" />
      <line x1={x + 8} y1={3} x2={x + 8} y2={h - 3} {...THIN} stroke="#8EA6B0" />
      <rect x={x + 1.5} y={4} width={9} height={10} rx={2.5} fill="#A3BBC5" {...INK} />
      <rect x={x + 1.5} y={h - 14} width={9} height={10} rx={2.5} fill="#A3BBC5" {...INK} />
    </g>
  );
}

// Rainures du dos d'un boîtier plastique (DVD, jeu).
function CaseSpine({ x, h, c, dark }: { x: number; h: number; c: string; dark: string }): ReactElement {
  return (
    <g>
      <rect x={x} y={0} width={7} height={h} fill={dark} {...INK} />
      {[1.8, 3.5, 5.2].map((dx) => <line key={dx} x1={x + dx} y1={4} x2={x + dx} y2={h - 4} {...THIN} stroke={c} />)}
    </g>
  );
}

type Plastic = { c: string; light: string; dark: string };
// Plastique du boîtier : celui de la console pour un jeu (`caseColor`), sinon le bleu des jeux ou le noir des DVD.
function plasticOf(opening: Opening, caseColor?: string): Plastic {
  if (opening === 'game-case' && caseColor) return { c: caseColor, light: lighten(caseColor), dark: shade(caseColor, 0.22) };
  return opening === 'game-case'
    ? { c: '#1F4C9E', light: '#2C5DB4', dark: '#163A7C' }
    : { c: '#24262E', light: '#323540', dark: '#18191F' };
}

// Face extérieure du couvercle (vue quand le boîtier est fermé).
function LidOuter({ opening, art, g, plastic }: { opening: Opening; art: Art; g: Geometry; plastic: Plastic }): ReactElement {
  switch (opening) {
    case 'jewel-cd':
      return (
        <>
          <rect x={0} y={0} width={g.w} height={g.h} rx={2.5} fill="#CFDDE3" {...INK} />
          <CoverArt r={{ x: 14, y: 2.5, w: 125, h: 120 }} art={art} id="lid" />
          <rect x={13} y={1.8} width={127} height={121.4} rx={1} fill="none" {...THIN} stroke="#8EA6B0" />
          <JewelHinge x={0} h={g.h} />
          {/* Reflets du plastique cristal, nets. */}
          <path d="M62 2.5 L86 2.5 L46 122.5 L22 122.5Z" fill="#FFFFFF" opacity={0.26} />
          <path d="M94 2.5 L100 2.5 L60 122.5 L54 122.5Z" fill="#FFFFFF" opacity={0.2} />
        </>
      );
    case 'dvd-case':
    case 'game-case': {
      const p = plastic;
      const game = opening === 'game-case';
      const top = game ? 18 : 4;
      const W = g.w;
      return (
        <>
          <rect x={0} y={0} width={W} height={g.h} rx={4} fill={p.c} {...INK} />
          {game && <>
            <rect x={9} y={4} width={W - 13} height={14} fill={p.dark} {...THIN} />
            <rect x={14} y={8} width={30} height={6} rx={3} fill="#F4F1EA" opacity={0.85} />
            <circle cx={W - 11} cy={11} r={3.2} fill="#F4F1EA" opacity={0.7} />
          </>}
          <CoverArt r={{ x: 9, y: top, w: W - 13, h: g.h - top - 4 }} art={art} id="lid" />
          {/* Film transparent qui retient la jaquette. */}
          <rect x={8} y={3} width={W - 11} height={g.h - 6} rx={2} fill="none" {...THIN} stroke="#9AA3B5" />
          <path d={`M${f(W * 0.52)} ${top} L${f(W * 0.68)} ${top} L${f(W * 0.37)} ${g.h - 4} L${f(W * 0.21)} ${g.h - 4}Z`} fill="#FFFFFF" opacity={0.18} />
          <CaseSpine x={0} h={g.h} c={p.light} dark={p.dark} />
        </>
      );
    }
    case 'vinyl-sleeve':
      return (
        <>
          <rect x={0} y={0} width={100} height={100} rx={0.8} fill="#E8DCC4" {...INK} />
          <CoverArt r={{ x: 0.8, y: 0.8, w: 98.4, h: 98.4 }} art={art} id="lid" />
          {/* Usure du carton : cercle du disque marqué, coins et bords blanchis, petite déchirure. */}
          <circle cx={52} cy={50} r={44} fill="none" stroke="#FFFFFF" strokeWidth={2.5} vectorEffect="non-scaling-stroke" opacity={0.16} />
          <path d="M84 0.8 L99.2 0.8 L99.2 15 Q97 8 92 4.5 Q88 2 84 0.8Z" fill="#F4EEDF" opacity={0.75} />
          <path d="M99.2 84 L99.2 99.2 L86 99.2 Q93 97 96 93 Q98.5 89 99.2 84Z" fill="#F4EEDF" opacity={0.6} />
          <path d="M0.8 97 L40 97.6 L70 97 L99.2 97.8" fill="none" stroke="#F4EEDF" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />
          <path d="M99.2 40 L96.5 42 L98 43.5 L96 46 L99.2 47" fill="#E8DCC4" {...THIN} />
          <rect x={0} y={0} width={100} height={100} rx={0.8} fill="none" {...INK} />
        </>
      );
    case 'book':
      return (
        <>
          <rect x={0} y={0} width={130} height={200} rx={2.5} fill={shade(art.color)} {...INK} />
          <CoverArt r={{ x: 2, y: 2, w: 126, h: 196 }} art={art} id="lid" />
          {/* Dos arrondi avec ses nerfs, rainure de la charnière. */}
          <rect x={0} y={0} width={9} height={200} rx={2.5} fill={shade(art.color, 0.4)} {...INK} />
          {[16, 22, 178, 184].map((y) => <line key={y} x1={1} y1={y} x2={8} y2={y} {...THIN} stroke={shade(art.color, 0.65)} />)}
          <line x1={12} y1={3} x2={12} y2={197} {...THIN} stroke={shade(art.color, 0.55)} opacity={0.6} />
          <path d="M118 2 L128 2 L128 12 Q124 6 118 2Z" fill="#F4EEDF" opacity={0.5} />
        </>
      );
  }
}

// Face intérieure du couvercle (vue à gauche quand le boîtier est ouvert ; la charnière est alors à droite).
function LidInner({ opening, art, g, plastic }: { opening: Opening; art: Art; g: Geometry; plastic: Plastic }): ReactElement {
  switch (opening) {
    case 'jewel-cd':
      return (
        <>
          <rect x={0} y={0} width={g.w} height={g.h} rx={2.5} fill="#CFDDE3" {...INK} />
          {/* Dos du livret, tenu par deux pattes. */}
          <rect x={3} y={2.5} width={126} height={120} fill="#F3EAD8" {...INK} />
          <rect x={0} y={20} width={7} height={13} rx={1.5} fill="#B9CCD4" {...INK} />
          <rect x={0} y={92} width={7} height={13} rx={1.5} fill="#B9CCD4" {...INK} />
          <JewelHinge x={130} h={g.h} />
          <path d="M3 2.5 L18 2.5 L3 40Z" fill="#FFFFFF" opacity={0.3} />
        </>
      );
    case 'dvd-case':
    case 'game-case': {
      const p = plastic;
      if (opening === 'game-case') {
        // Jeu : pas de livret ; une page claire, tenue par deux pinces, porte la fiche courte et le sélecteur.
        const W = g.w;
        const r = g.selector;
        const mid = (W - 7) / 2;
        return (
          <>
            <rect x={0} y={0} width={W} height={g.h} rx={4} fill={p.c} {...INK} />
            <rect x={4} y={4} width={W - 12} height={g.h - 8} rx={4} fill={p.light} {...THIN} />
            <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx={2} fill="#F7F1E3" {...INK} />
            <path d={`M${f(mid - 8)} 3 L${f(mid + 8)} 3 L${f(mid + 6)} ${r.y + 1} L${f(mid - 6)} ${r.y + 1}Z`} fill={p.dark} {...INK} />
            <path d={`M${f(mid - 8)} ${g.h - 3} L${f(mid + 8)} ${g.h - 3} L${f(mid + 6)} ${g.h - r.y - 1} L${f(mid - 6)} ${g.h - r.y - 1}Z`} fill={p.dark} {...INK} />
            <CaseSpine x={W - 7} h={g.h} c={p.light} dark={p.dark} />
          </>
        );
      }
      return (
        <>
          <rect x={0} y={0} width={g.w} height={g.h} rx={4} fill={p.c} {...INK} />
          <rect x={5} y={6} width={121} height={g.h - 12} rx={4} fill={p.light} {...THIN} />
          {/* Livret tenu par les pinces du haut et du bas. */}
          <rect x={10} y={16} width={112} height={g.h - 32} fill="#F3EAD8" {...INK} />
          <path d={`M58 12 L76 12 L74 23 L60 23Z`} fill={p.dark} {...INK} />
          <path d={`M58 ${g.h - 12} L76 ${g.h - 12} L74 ${g.h - 23} L60 ${g.h - 23}Z`} fill={p.dark} {...INK} />
          <CaseSpine x={128} h={g.h} c={p.light} dark={p.dark} />
        </>
      );
    }
    case 'vinyl-sleeve':
      return (
        <>
          <rect x={0} y={0} width={100} height={100} rx={0.8} fill="#D6BE93" {...INK} />
          {FIBRES.map(([x, y, l], i) => <line key={i} x1={x} y1={y} x2={x + l} y2={y + l * 0.3} {...THIN} stroke="#B99C6C" />)}
          {/* Notes de pochette collées sur le carton ; pli de l'ouvrant à droite. */}
          <rect x={6} y={6} width={86} height={88} fill="#F2E8D3" {...INK} />
          <rect x={96.5} y={0.8} width={3} height={98.4} fill="#C8AE80" />
          <line x1={96.5} y1={1} x2={96.5} y2={99} {...THIN} />
        </>
      );
    case 'book':
      return (
        <>
          <rect x={0} y={0} width={130} height={200} rx={2.5} fill={shade(art.color)} {...INK} />
          {/* Garde décorée (rabats du plat visibles autour), ex-libris où vient le sélecteur. */}
          <rect x={4} y={4} width={126} height={192} fill="#E7D8B6" {...INK} />
          {ENDPAPER_DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill="#CDB98F" />)}
          <rect x={10} y={12} width={108} height={176} rx={1.5} fill="#FBF6EA" {...INK} />
          <rect x={124} y={4} width={6} height={192} fill="#D9C79F" />
        </>
      );
  }
}

// Fibres du carton (positions fixes).
const FIBRES: [number, number, number][] = [[8, 3, 5], [30, 2.5, 6], [70, 3, 4], [94, 20, 3], [2, 40, 3], [94, 55, 3], [3, 75, 4], [20, 96, 5], [55, 96.5, 6], [82, 95.5, 4]];
const ENDPAPER_DOTS: [number, number][] = Array.from({ length: 8 * 13 }, (_, i) => [9 + (i % 8) * 15 + (Math.floor(i / 8) % 2) * 7.5, 8 + Math.floor(i / 8) * 15]);

// Plateau (moitié droite) : le fond du boîtier, la charnière à gauche.
function Tray({ opening, art, g, plastic }: { opening: Opening; art: Art; g: Geometry; plastic: Plastic }): ReactElement {
  switch (opening) {
    case 'jewel-cd': {
      const { cx, cy } = g.disc!;
      return (
        <>
          <rect x={0} y={0} width={g.w} height={g.h} rx={2.5} fill="#CFDDE3" {...INK} />
          {/* Tranches de la jaquette arrière, de part et d'autre du plateau noir. */}
          <rect x={11} y={2} width={4} height={121} fill={art.color} {...THIN} />
          <rect x={137} y={2} width={4} height={121} fill={art.color} {...THIN} />
          <rect x={15} y={2} width={122} height={121} rx={2} fill="#26272C" {...INK} />
          <circle cx={cx} cy={cy} r={58} fill="#2F3036" {...THIN} stroke="#141418" />
          {/* Encoches pour saisir le disque, nervures d'angle. */}
          <circle cx={cx - 58} cy={cy} r={6} fill="#18191D" {...INK} />
          <circle cx={cx + 58} cy={cy} r={6} fill="#18191D" {...INK} />
          {[[19, 6, 1, 1], [133, 6, -1, 1], [19, 119, 1, -1], [133, 119, -1, -1]].map(([x, y, sx, sy], i) => (
            <path key={i} d={`M${x} ${y! + sy! * 9} L${x} ${y} L${x! + sx! * 9} ${y}`} fill="none" {...THIN} stroke="#4A4B53" />
          ))}
          <Hub cx={cx} cy={cy} />
          <JewelHinge x={0} h={g.h} />
        </>
      );
    }
    case 'game-case':
      return <GameTray g={g} p={plastic} />;
    case 'dvd-case': {
      const p = plastic;
      const { cx, cy } = g.disc!;
      return (
        <>
          <rect x={0} y={0} width={g.w} height={g.h} rx={4} fill={p.c} {...INK} />
          <rect x={10} y={6} width={120} height={g.h - 12} rx={5} fill={p.light} {...INK} />
          <circle cx={cx} cy={cy} r={60} fill={p.dark} {...THIN} />
          <rect x={18} y={12} width={8} height={8} rx={1} fill={p.dark} {...THIN} />
          <rect x={115} y={12} width={8} height={8} rx={1} fill={p.dark} {...THIN} />
          <Rosette cx={cx} cy={cy} p={p} />
          <CaseSpine x={0} h={g.h} c={p.light} dark={p.dark} />
        </>
      );
    }
    case 'vinyl-sleeve':
      return (
        <>
          <rect x={0} y={0} width={100} height={100} rx={0.8} fill="#D6BE93" {...INK} />
          {FIBRES.map(([x, y, l], i) => <line key={i} x1={100 - x} y1={y} x2={100 - x - l} y2={y + l * 0.3} {...THIN} stroke="#B99C6C" />)}
          <rect x={0.8} y={0.8} width={3} height={98.4} fill="#C8AE80" />
          <line x1={3.8} y1={1} x2={3.8} y2={99} {...THIN} />
          {/* Pochette intérieure en papier, échancrure en haut. */}
          <rect x={7} y={8} width={88} height={84} rx={1} fill="#F6F2EA" {...INK} />
          <path d="M42 8 A9 9 0 0 0 60 8Z" fill="#D6BE93" {...INK} />
          <circle cx={51} cy={50} r={43} fill="none" stroke="#E4DCCB" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          <circle cx={51} cy={50} r={1.6} fill="#B99C6C" />
        </>
      );
    case 'book':
      return (
        <>
          {/* Plat arrière, bloc des pages, tranche (pages en épaisseur), ombre du pli, tranchefile. */}
          <rect x={0} y={0} width={130} height={200} rx={2.5} fill={shade(art.color)} {...INK} />
          <rect x={0} y={3} width={124} height={193} fill="#FBF5E6" {...INK} />
          <rect x={124} y={4} width={4} height={191} fill="#EFE4CC" {...THIN} />
          {[125.3, 126.6].map((x) => <line key={x} x1={x} y1={5} x2={x} y2={194} {...THIN} stroke="#CDBE9F" />)}
          <rect x={1} y={196} width={123} height={2.5} fill="#EFE4CC" {...THIN} />
          <rect x={1} y={4} width={9} height={191} fill="#EADFC6" />
          <line x1={10} y1={4} x2={10} y2={195} {...THIN} stroke="#D9CBAA" />
          <rect x={0} y={0} width={6} height={4} fill="#B8423A" {...THIN} />
          <rect x={0} y={196} width={6} height={4} fill="#B8423A" {...THIN} />
        </>
      );
  }
}

// Clip central d'un boîtier plastique : rosette de pétales souples autour du bouton (`k` : échelle, mini-disque).
function Rosette({ cx, cy, p, k = 1 }: { cx: number; cy: number; p: Plastic; k?: number }): ReactElement {
  return (
    <g>
      <circle cx={cx} cy={cy} r={f(16 * k)} fill={p.c} {...THIN} />
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx={cx} cy={f(cy - 9.5 * k)} rx={f(3 * k)} ry={f(5.5 * k)} fill="#3A3E48" {...THIN} transform={`rotate(${i * 45} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={f(5.5 * k)} fill={p.light} {...INK} />
    </g>
  );
}

// Plateau d'une boîte de jeu, à la taille du gabarit : logement du support (disque, mini-disque, UMD ou cartouche) en creux, centré.
function GameTray({ g, p }: { g: Geometry; p: Plastic }): ReactElement {
  const s = g.disc!;
  const { cx, cy } = s;
  let well: ReactElement;
  if (s.w !== undefined && s.h !== undefined) {
    const { w, h } = s;
    well = (
      <g data-case-well={s.kind}>
        <rect x={f(cx - w / 2 - 2)} y={f(cy - h / 2 - 2)} width={w + 4} height={h + 4} rx={s.kind === 'umd' ? 6 : 2.5} fill={p.dark} {...INK} />
        {/* Encoche pour saisir le support du bout du doigt. */}
        <path d={`M${f(cx - 5)} ${f(cy + h / 2 + 2)} A5 4 0 0 0 ${f(cx + 5)} ${f(cy + h / 2 + 2)}Z`} fill={shade(p.dark, 0.3)} {...THIN} />
      </g>
    );
  } else {
    well = (
      <g data-case-well={s.kind}>
        <circle cx={cx} cy={cy} r={s.d / 2} fill={p.dark} {...THIN} />
        <Rosette cx={cx} cy={cy} p={p} k={s.kind === 'mini' ? 0.8 : 1} />
      </g>
    );
  }
  return (
    <>
      <rect x={0} y={0} width={g.w} height={g.h} rx={4} fill={p.c} {...INK} />
      <rect x={9} y={5} width={g.w - 13} height={g.h - 10} rx={5} fill={p.light} {...INK} />
      {/* Ergots d'angle qui tiennent la jaquette intérieure. */}
      <rect x={13} y={9} width={6} height={6} rx={1} fill={p.dark} {...THIN} />
      <rect x={g.w - 10} y={9} width={6} height={6} rx={1} fill={p.dark} {...THIN} />
      {well}
      <CaseSpine x={0} h={g.h} c={p.light} dark={p.dark} />
    </>
  );
}

// Cartouche (repère en mm, 0…w × 0…h) : coque au plastique de la console, coin coupé et stries en haut, étiquette = devant de la version.
function CartArt({ w, h, color, art }: { w: number; h: number; color: string; art: Art }): ReactElement {
  const clip = `${art.uid}-cart`;
  const top = Math.max(3, h * 0.14);
  const label = { x: 1.6, y: top + 0.8, w: w - 3.2, h: h - top - 2.4 };
  return (
    <>
      <rect x={0.8} y={1.1} width={w} height={h} rx={1.6} fill="rgba(12,8,6,.35)" />
      <path d={`M1.6 0 L${f(w - 3)} 0 L${w} 3 L${w} ${f(h - 1.6)} Q${w} ${h} ${f(w - 1.6)} ${h} L1.6 ${h} Q0 ${h} 0 ${f(h - 1.6)} L0 1.6 Q0 0 1.6 0Z`} fill={color} {...INK} />
      {[0.32, 0.55, 0.78].map((k) => <line key={k} x1={f(w * 0.2)} y1={f(top * k)} x2={f(w * 0.8)} y2={f(top * k)} {...THIN} stroke={lighten(color, 0.35)} />)}
      <clipPath id={clip}><rect x={label.x} y={label.y} width={label.w} height={label.h} rx={0.8} /></clipPath>
      {art.cover
        ? <image href={art.cover} x={label.x} y={label.y} width={label.w} height={label.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        : <>
            <rect x={label.x} y={label.y} width={label.w} height={label.h} rx={0.8} fill={art.color} />
            <TitleText cx={w / 2} cy={label.y + label.h / 2} w={label.w * 0.9} title={art.title} fill={textOn(art.color)} size={Math.min(label.w, label.h) * 0.16} />
          </>}
      <rect x={label.x} y={label.y} width={label.w} height={label.h} rx={0.8} fill="none" {...THIN} />
      {/* Reflet net sur l'étiquette. */}
      <path d={`M${f(w * 0.62)} ${f(label.y)} L${f(w * 0.8)} ${f(label.y)} L${f(w * 0.45)} ${f(label.y + label.h)} L${f(w * 0.27)} ${f(label.y + label.h)}Z`} fill="#FFFFFF" opacity={0.16} />
    </>
  );
}

// UMD (repère en mm) : coque à deux pans coupés en haut, étiquette = pochette sur le haut, fenêtre ronde sur le disque.
function UmdArt({ w, h, art }: { w: number; h: number; art: Art }): ReactElement {
  const clip = `${art.uid}-umd`;
  const r = Math.min(w, h) * 0.3;
  const cy = h * 0.6;
  const label = { x: f(w * 0.16), y: 2.5, w: f(w * 0.68), h: f(cy - r - 5) };
  return (
    <>
      <path d={`M${f(w * 0.12)} 0 L${f(w * 0.88)} 0 L${w} ${f(h * 0.12)} L${w} ${h - 3} Q${w} ${h} ${w - 3} ${h} L3 ${h} Q0 ${h} 0 ${h - 3} L0 ${f(h * 0.12)}Z`} fill="#2A2B31" {...INK} />
      <clipPath id={clip}><rect x={label.x} y={label.y} width={label.w} height={label.h} rx={1} /></clipPath>
      {art.cover
        ? <image href={art.cover} x={label.x} y={label.y} width={label.w} height={label.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        : <rect x={label.x} y={label.y} width={label.w} height={label.h} rx={1} fill={art.color} />}
      <g transform={`translate(${f(w / 2)} ${f(cy)})`}>
        <circle cx={0} cy={0} r={f(r)} fill="#D9DEE3" {...THIN} />
        <path d={sector(r * 0.35, r * 0.95, 200, 250)} fill="#B8E3F0" opacity={0.6} />
        <path d={sector(r * 0.35, r * 0.95, -48, -14)} fill="#FFFFFF" opacity={0.7} />
        <circle cx={0} cy={0} r={f(r * 0.3)} fill="#1E1F24" {...THIN} />
      </g>
    </>
  );
}

// Moyeu à dents du plateau cristal.
function Hub({ cx, cy }: { cx: number; cy: number }): ReactElement {
  return (
    <g>
      <circle cx={cx} cy={cy} r={12.5} fill="#3A3B42" {...INK} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={cx - 1} y={cy - 12} width={2} height={6} fill="#55565F" transform={`rotate(${i * 30} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={5} fill="#18191D" {...INK} />
    </g>
  );
}

// Secteur d'anneau (reflets, irisations) ; angles en degrés, 0 = droite, sens horaire.
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${f(Math.cos((a * Math.PI) / 180) * r)} ${f(Math.sin((a * Math.PI) / 180) * r)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

// Le disque (repère centré, rayon 60) : sillons concentriques, pochette sur l'étiquette, reflet asymétrique.
function DiscArt({ kind, art }: { kind: DiscKind; art: Art }): ReactElement {
  const clip = `${art.uid}-label`;
  const vinyl = kind === 'vinyl';
  // Rayon de l'étiquette : petite sur un vinyle, presque toute la face sur un disque de jeu.
  const lr = vinyl ? 21 : kind === 'game' || kind === 'mini' ? 54 : 40;
  const hole = vinyl ? 1.8 : 7.5;
  const grooves = vinyl
    ? Array.from({ length: 19 }, (_, i) => 23.5 + i * 1.85)
    : Array.from({ length: Math.max(0, Math.floor((57 - lr) / 2.4)) }, (_, i) => lr + 2.2 + i * 2.4);
  const label = (
    <g>
      <clipPath id={clip}><circle cx={0} cy={0} r={lr} /></clipPath>
      {art.cover
        ? <image href={art.cover} x={-lr} y={-lr} width={lr * 2} height={lr * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        : <>
            <circle cx={0} cy={0} r={lr} fill={art.color} />
            <TitleText cx={0} cy={-lr * 0.42} w={lr * 1.3} title={art.title} fill={textOn(art.color)} size={lr * 0.2} />
          </>}
      <circle cx={0} cy={0} r={lr} fill="none" {...THIN} />
    </g>
  );
  if (vinyl) {
    return (
      <>
        <circle cx={0} cy={0} r={59} fill="#151517" {...INK} />
        <circle cx={0} cy={0} r={57.5} fill="none" stroke="#2E2E33" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {grooves.map((r) => <circle key={r} cx={0} cy={0} r={f(r)} fill="none" stroke="#26262B" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        {/* Reflet asymétrique : un large éclat d'un côté, un mince de l'autre. */}
        <path d={sector(23, 58, -62, -28)} fill="#FFFFFF" opacity={0.16} />
        <path d={sector(23, 58, 128, 140)} fill="#FFFFFF" opacity={0.1} />
        {label}
        <circle cx={0} cy={0} r={hole} fill="#D9D3C6" {...THIN} />
      </>
    );
  }
  const base = kind === 'dvd' ? '#D3D5E4' : '#D9DEE3';
  return (
    <>
      <circle cx={0} cy={0} r={59} fill={base} {...INK} />
      {/* Irisations nettes de la face argentée. */}
      <path d={sector(lr, 58, 200, 250)} fill="#B8E3F0" opacity={0.6} />
      <path d={sector(lr, 58, 250, 280)} fill="#F2C6E0" opacity={0.55} />
      <path d={sector(lr, 58, 20, 60)} fill="#F7E9A8" opacity={0.5} />
      {grooves.map((r) => <circle key={r} cx={0} cy={0} r={f(r)} fill="none" stroke="#000000" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.07} />)}
      {label}
      <path d={sector(lr + 1, 57.5, -48, -14)} fill="#FFFFFF" opacity={0.75} />
      <path d={sector(lr + 1, 57.5, 150, 158)} fill="#FFFFFF" opacity={0.4} />
      <circle cx={0} cy={0} r={13} fill="#E8ECEF" {...THIN} />
      <circle cx={0} cy={0} r={hole} fill="#1E1F24" {...INK} />
    </>
  );
}

// Page de titre du livre, à droite : la couverture en frontispice et le titre.
function BookTitlePage({ art }: { art: Art }): ReactElement {
  return (
    <svg data-case-cover="" viewBox="0 0 130 200" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
      <rect x={24} y={26} width={80} height={112} fill="#FFFFFF" {...INK} />
      <CoverArt r={{ x: 27, y: 29, w: 74, h: 106 }} art={art} id="page" />
      <line x1={45} y1={150} x2={85} y2={150} {...THIN} />
      <TitleText cx={65} cy={164} w={90} title={art.title} fill={INK_C} size={7} />
      <line x1={50} y1={182} x2={80} y2={182} {...THIN} />
    </svg>
  );
}

type Pose = { x: number; y: number; s: number };

export function ItemCase({ opening, phase, from, to, cover, color, title, disc, reduced, selector, right, format = 'generic', caseColor, outside, flipped = false, size }: Props): ReactElement {
  const g = geometryOf(opening, format);
  const plastic = plasticOf(opening, caseColor);
  const uid = `wm-case-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const art: Art = { cover, color, title, uid };
  const ref = useRef<HTMLDivElement>(null);
  // Taille du calque (le parent) : le boîtier ouvert y est centré, en grand.
  const [layer, setLayer] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => setLayer((l) => (l.w === host.clientWidth && l.h === host.clientHeight ? l : { w: host.clientWidth, h: host.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  // À la première image le boîtier est posé au départ, puis rejoint le centre (deux images pour que le départ soit peint).
  const [arrived, setArrived] = useState(phase !== 'opening');
  useEffect(() => {
    if (arrived) return;
    let raf = window.requestAnimationFrame(() => { raf = window.requestAnimationFrame(() => setArrived(true)); });
    return () => window.cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sans mesure (rendu hors écran, tests), la taille donnée par l'appelant, sinon un calque paysage par défaut.
  const lw = layer.w > 0 ? layer.w : size?.w ?? 800;
  const lh = layer.h > 0 ? layer.h : size?.h ?? 450;
  // Ouvert, le boîtier fait deux moitiés côte à côte, la charnière (bord gauche du plateau) au centre du calque.
  const { x: hingeX, y: topY, W, H } = openCaseLayout(opening, format, lw, lh);
  const k = W / g.w;
  const centre: Pose = { x: hingeX, y: topY, s: 1 };
  const poseIn = (b: Box): Pose => {
    const s = Math.min(b.w / W, b.h / H);
    return { x: b.x + (b.w - W * s) / 2, y: b.y + (b.h - H * s) / 2, s };
  };
  const pose: Pose = reduced ? centre
    : phase === 'opening' ? (arrived || !from ? centre : poseIn(from))
    : phase === 'closing' ? (to ? poseIn(to) : centre)
    : centre;
  const lidOpen = !reduced && ((phase === 'opening' && arrived) || phase === 'open');
  // Sans rectangle de départ (ou d'arrivée), le boîtier apparaît (ou s'efface) au centre.
  const visible = reduced
    ? !(phase === 'closing' || (phase === 'opening' && !arrived))
    : !((phase === 'opening' && !arrived && !from) || (phase === 'closing' && !to));
  // Ouverture : vol puis pivot ; fermeture : le couvercle se referme puis le boîtier vole.
  const flyDelay = phase === 'closing' ? CASE_PIVOT_MS : 0;
  const pivotDelay = phase === 'opening' ? CASE_FLY_MS : 0;

  const caseStyle: CSSProperties = {
    position: 'absolute', left: 0, top: 0, width: f(W), height: f(H),
    transform: `translate(${f(pose.x)}px, ${f(pose.y)}px) scale(${Math.round(pose.s * 10000) / 10000})`,
    transformOrigin: '0 0',
    opacity: visible ? 1 : 0,
    transition: reduced
      ? `opacity ${CASE_FADE_MS}ms ease-out`
      : `transform ${CASE_FLY_MS}ms ease-in-out ${flyDelay}ms, opacity ${CASE_FLY_MS}ms ease-in-out ${flyDelay}ms`,
    pointerEvents: 'auto',
  };
  const lidStyle: CSSProperties = reduced
    ? { position: 'absolute', inset: 0, transform: 'translateX(-100%)' }
    : {
        position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d',
        transform: `perspective(1800px) rotateY(${lidOpen ? -180 : 0}deg)`,
        transition: `transform ${CASE_PIVOT_MS}ms ease-in-out ${pivotDelay}ms`,
      };
  const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  const svgStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'block', overflow: 'visible', filter: SHADOW };
  const pct = (r: Rect): CSSProperties => ({
    position: 'absolute', left: `${f((r.x / g.w) * 100)}%`, top: `${f((r.y / g.h) * 100)}%`, width: `${f((r.w / g.w) * 100)}%`, height: `${f((r.h / g.h) * 100)}%`,
  });
  const viewBox = `0 0 ${g.w} ${g.h}`;

  // Retournée (⟲) : demi-tour autour de la charnière, centre de la boîte ouverte ; fondu en mouvement réduit. Fermer depuis
  // l'extérieur ramène l'intérieur sans animation, puis la fermeture habituelle se déroule.
  const hasOutside = outside !== undefined;
  const out = hasOutside && flipped && phase !== 'closing';
  const flipTransition = phase === 'closing' ? 'none' : `transform ${CASE_PIVOT_MS}ms ease-in-out`;
  const flipperStyle: CSSProperties = reduced || !hasOutside
    ? { position: 'absolute', inset: 0 }
    : { position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transform: `perspective(2400px) rotateY(${out ? 180 : 0}deg)`, transition: flipTransition };
  // Faces de l'intérieur : cachées de dos ; en mouvement réduit, en fondu.
  const fade = (shown: boolean): CSSProperties => ({ opacity: shown ? 1 : 0, transition: phase === 'closing' ? 'none' : `opacity ${CASE_FADE_MS}ms ease-out`, pointerEvents: shown ? undefined : 'none' });
  const insideFace: CSSProperties = !hasOutside ? {} : reduced ? fade(!out) : { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', pointerEvents: out ? 'none' : undefined };
  // Face extérieure du couvercle (le devant) : retournée, elle serait de face sous la face extérieure dessinée ; masquée pendant
  // le retournement, elle ne revient qu'une fois l'intérieur de nouveau de face.
  const lidOuterHidden: CSSProperties = !hasOutside || phase === 'closing' ? {} : { visibility: out ? 'hidden' : 'visible', transition: out ? 'visibility 0s' : `visibility 0s linear ${CASE_PIVOT_MS}ms` };
  const spineMm = opening === 'game-case' ? BOX_FORMATS[format].d * 10 : 0;
  const outsideStyle: CSSProperties = {
    position: 'absolute', top: 0, height: '100%', left: `${f((-(g.w + spineMm / 2) / g.w) * 100)}%`, width: `${f(((2 * g.w + spineMm) / g.w) * 100)}%`,
    ...(reduced ? fade(out) : { transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', pointerEvents: out ? undefined : 'none' }),
  };

  // Contenu du plateau : `right`, sinon la page de titre du livre, sinon le disque (ou le plateau vide).
  let content: ReactNode;
  if (right !== undefined) content = <div style={{ ...pct(g.right), overflow: 'hidden' }}>{right}</div>;
  else if (opening === 'book') content = <BookTitlePage art={art} />;
  else if (g.disc && disc === 'away') {
    // Sous un support rectangulaire (cartouche, UMD), sinon dans la partie basse du disque.
    const below = g.disc.h !== undefined ? g.disc.h / 2 + 4 : 18;
    content = (
      <div data-case-tray-empty="" style={{ position: 'absolute', left: 0, right: 0, top: `${f(((g.disc.cy + below) / g.h) * 100)}%`, textAlign: 'center', padding: '0 12%' }}>
        <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: 'rgba(251,246,234,.92)', border: `2px solid ${INK_C}`, color: INK_C, fontSize: Math.max(11, Math.round(H * 0.05)), fontWeight: 600, lineHeight: 1.25 }}>
          {g.disc.kind === 'cart' ? 'La cartouche est sur le poste' : 'Le disque est sur le poste'}
        </span>
      </div>
    );
  } else if (g.disc && g.disc.w !== undefined && g.disc.h !== undefined) {
    // Support rectangulaire à l'échelle réelle, immobile (ni la cartouche ni la coque de l'UMD ne tournent).
    const s = g.disc;
    const sw = g.disc.w;
    const sh = g.disc.h;
    content = (
      <div data-case-disc="" data-disc={disc} data-support={s.kind} style={{ position: 'absolute', left: f((s.cx - sw / 2) * k), top: f((s.cy - sh / 2) * k), width: f(sw * k), height: f(sh * k), ...(disc === 'flying' ? { visibility: 'hidden' } : {}) }}>
        <svg viewBox={`0 0 ${sw} ${sh}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }}>
          {s.kind === 'cart' ? <CartArt w={sw} h={sh} color={s.color ?? '#1B1B1F'} art={art} /> : <UmdArt w={sw} h={sh} art={art} />}
        </svg>
      </div>
    );
  } else if (g.disc) {
    const d = g.disc.d * k;
    const spin = disc === 'spinning' && !reduced;
    // Centré dans le plateau par left/top : le conteneur du disque n'a jamais de translation ; seul le calque intérieur tourne.
    content = (
      <div data-case-disc="" data-disc={disc} data-support="disc" style={{ position: 'absolute', left: f((g.disc.cx - g.disc.d / 2) * k), top: f((g.disc.cy - g.disc.d / 2) * k), width: f(d), height: f(d), ...(disc === 'flying' ? { visibility: 'hidden' } : {}) }}>
        <svg viewBox="-60 -60 120 120" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }}>
          <circle cx={2.5} cy={3.5} r={59} fill="rgba(12,8,6,.35)" />
        </svg>
        <div data-case-disc-spin="" style={{ position: 'absolute', inset: 0, animation: spin ? `wmt-case-disc-spin ${g.disc.kind === 'vinyl' ? 1.8 : 1.2}s linear infinite` : undefined }}>
          <svg viewBox="-60 -60 120 120" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
            <DiscArt kind={g.disc.kind} art={art} />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="wmt-item-case" data-item-case="" data-phase={phase} data-opening={opening} data-flipped={hasOutside ? String(out) : undefined} style={caseStyle} aria-label={title}>
      <style>{'@keyframes wmt-case-disc-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      <div data-case-flipper="" style={flipperStyle}>
      {/* Plateau : moitié droite (la charnière à gauche). */}
      <div data-case-tray="" style={{ position: 'absolute', inset: 0, ...insideFace }}>
        <svg viewBox={viewBox} width="100%" height="100%" style={svgStyle}><Tray opening={opening} art={art} g={g} plastic={plastic} /></svg>
        <div data-case-right="" style={{ position: 'absolute', inset: 0 }}>{content}</div>
      </div>
      {/* Couvercle : pivote autour de sa charnière gauche ; sa face intérieure porte le sélecteur. */}
      <div data-case-lid="" style={{ ...lidStyle, ...(reduced ? insideFace : out ? { pointerEvents: 'none' } : {}) }}>
        {!reduced && (
          <div data-case-lid-outer="" style={{ ...face, ...lidOuterHidden }}>
            <svg viewBox={viewBox} width="100%" height="100%" style={svgStyle}><LidOuter opening={opening} art={{ ...art, uid: `${uid}-o` }} g={g} plastic={plastic} /></svg>
          </div>
        )}
        <div data-case-lid-inner="" style={reduced ? { position: 'absolute', inset: 0 } : { ...face, transform: 'rotateY(180deg)' }}>
          <svg viewBox={viewBox} width="100%" height="100%" style={svgStyle}><LidInner opening={opening} art={art} g={g} plastic={plastic} /></svg>
          <div data-case-selector="" style={{ ...pct(g.selector), overflow: 'auto', color: INK_C, fontSize: Math.max(12, Math.round(H * 0.045)) }}>{selector}</div>
        </div>
      </div>
      {hasOutside && <div data-case-outside="" aria-hidden={!out} style={outsideStyle}>{outside}</div>}
      </div>
    </div>
  );
}
