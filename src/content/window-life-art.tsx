import type { ReactElement } from 'react';
import type { FacadeLayout, FacadeWindow } from '../core/library/city/facade-layout';
import type { LightTone } from '../core/library/city/schedules';
import type { HandProp } from '../core/library/city/window-choreo';
import { mulberry32 } from '../core/library/scene-world';
import { INK, light, shade } from '../core/library/paint/cel';
import { hexRgb, rgba } from '../core/library/paint/color';
import { curtainWidth, nightCurtain, nightVoile } from './ghibli-window-art';

// Dessins de la façade vivante (chantier « vie au-dessus de la rue », spec §5.2) : port en SVG de `paintShutters`,
// `paintSash`, `paintFlowerBox`, `paintSapin`, `paintInteriorProp` et `paintHandProps` de
// docs/superpowers/maquettes/vie-etages/src/07a-facade.js (couleurs de notes.md §Couleurs), rideaux repris du chantier 1
// (`curtainWidth`, `nightCurtain`) rendus paramétrables par `drawn`. Composants de présentation seuls, branchés par le calque
// de la tâche 8. Règle du calque (perfs Android) : un composant rend toujours les mêmes nœuds quel que soit son état ; seuls
// `transform` et `opacity` changent (un vantail est un dessin fixe dans le repère de sa charnière, mis à l'échelle), pas de
// clip-path CSS, pas de SMIL. `shutterTransform` est exporté pour que la boucle écrive le `transform` des vantaux
// (`[data-shutter-leaf]`) sans re-rendu React. 1 px de scène = 1 px de maquette.
const SILH = '#1A1422';
const GLASS_DAY = '#7FB4E0';
const GLASS_NIGHT = '#232D52';
// Lames des volets quand la pièce est allumée derrière ; reflets du battant ouvert.
const SLAT_LIT = 'rgba(255,216,106,0.7)';
const SHINE_DAY = 'rgba(255,255,255,0.6)';
const SHINE_NIGHT = 'rgba(150,170,230,0.25)';
// Voilage (lit / éteint de jour) ; plis et bord des rideaux.
const VOILE_LIT = 'rgba(255,248,230,0.45)';
const VOILE_DAY = 'rgba(255,248,230,0.3)';
const VOILE_LINES = 'rgba(255,255,255,0.45)';
const CURTAIN_EDGE = 'rgba(0,0,0,0.18)';
const CURTAIN_FOLD = 'rgba(0,0,0,0.12)';
// Jardinière et fleurs par saison (hiver : terre nue, deux touches).
const BOX = '#8A4A2E';
const FLOWERS = {
  winter: ['#6A5A48', '#5A6A48'],
  spring: ['#F6C62E', '#E8A0C8', '#FFFFFF'],
  summer: ['#E8456B', '#F6C62E', '#FFFFFF', '#E070C0', '#3F8A3A'],
  autumn: ['#D88A2E', '#B85A3A', '#E8C060', '#8A5A8E'],
} as const;
// Sapin (de jour / à contre-jour), tronc, guirlande, étoile.
const SAPIN = '#2F5A3A';
const SAPIN_NIGHT = '#1E3A2A';
const TRUNK = '#5A3A2E';
const GARLAND = ['#FF6A6A', '#FFD86A', '#8AF0FF', '#C8FF8A', '#FFA0E0'] as const;
const STAR = '#FFE060';
// Écrans : bureau (lumière froide), télé éteinte / allumée.
const SCREEN_DESK = '#DDEBFF';
const SCREEN_OFF = '#9CC4FF';
// Accessoires tenus : braise, fumée (jour / nuit), arrosoir et filet d'eau, tapis et poussière, cuillère, livre, tasse.
const EMBER = '#FF6A2A';
const SMOKE_DAY = 'rgb(235,235,242)';
const SMOKE_NIGHT = 'rgb(200,205,225)';
const CAN = '#5A8A5A';
const WATER = 'rgba(150,200,255,0.9)';
const RUG = '#B8503A';
const RUG_STRIPE = '#E8C060';
const DUST = 'rgba(220,210,190,0.5)';
const SPOON = '#8A7A6A';
const BOOK = '#E8C060';
const CUP = '#F4F0E0';
// Volet battant rabattu contre le mur : à 0,6 px de la charnière, large d'un quart de vitre (maquette : 2 px pour w = 8).
const BATTANT_GAP = 0.6;
const BATTANT_FOLD = 1.5;
// Battant de la fenêtre : vantail gauche pivoté vers l'extérieur, biais de 0,32 (skewY de atan 0,32).
const SASH_SKEW = 17.745;
const SASH_W = 0.95;
// Nombre d'ampoules de la guirlande et seuil d'allumage de leur cycle de 2 s.
const BULBS = 7;
// Ampoule `i` de la guirlande allumée à l'instant `blink` (s) : 1,3 s sur 2, décalée par ampoule.
export const bulbOn = (blink: number, i: number): number => on(((blink * 1.5 + i * 0.7) % 2) < 1.3);
// Lueur de l'écran de télé (opacité du blanc) : scintille quand la pièce est à la télé (`flicker` en secondes), sinon 0.
export const tvGlow = (tone: LightTone, flicker: number): number => n(tone === 'tv' ? 0.75 + 0.2 * Math.sin(flicker * 9) : 0);
// Ambiance de nuit (notes.md : amb(c) = mix(c, #1E2A5A, 0,64)) : un voile de cette couleur à l'opacité 0,64 × `dark`,
// superposé aux seules formes colorées d'un composant, compose exactement amb(c) à la nuit pleine — un nœud, sans
// changer les couleurs des formes ; ce qui éclaire (lames éclairées, braise, fumée, eau, écrans allumés) reste au-dessus.
export const DARK_VEIL = '#1E2A5A';
export const DARK_ALPHA = 0.64;

export type ShutterKind = 'persienne' | 'battant';
// Volets que porte une fenêtre d'un logement (`kind` : Dwelling.shutters ; `layout` : mise en page de sa façade) :
// battants sur les fenêtres courantes loin des bords du mur (maquette) ; persiennes partout sauf l'entresol, montées
// seulement si la pièce les ferme un jour (`closes` ; repliées toute la journée : invisibles). Règle partagée par le
// calque de la vie aux fenêtres (montage des volets) et les fenêtres allumées (lueur selon les volets).
export function windowShutters(kind: 'persienne' | 'battant' | null, win: FacadeWindow, layout: FacadeLayout | null | undefined, closes: boolean): ShutterKind | null {
  if (kind === 'battant') return win.kind === 'std' && layout && win.x - 2.6 > layout.x + 1 && win.x + win.w + 2.6 < layout.x + layout.w - 1 ? 'battant' : null;
  return kind === 'persienne' && win.kind !== 'mezz' && closes ? 'persienne' : null;
}
export type InteriorKind = 'table' | 'tv' | 'stove' | 'desk';

const n = (v: number): number => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const hex = hexRgb;
const css = (c: readonly [number, number, number]): string => rgba(c, 1);
const rectPath = (x: number, y: number, w: number, h: number): string => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
const disc = (cx: number, cy: number, r: number): string => `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0z`;
// Disque tracé dans le sens horaire (sweep 1), celui de `rectPath` : un voile qui réunit un rect et des disques garde un
// winding non nul là où ils se chevauchent (remplissage nonzero), sinon la zone commune reste non voilée.
const discCw = (cx: number, cy: number, r: number): string => `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 1 ${n(2 * r)} 0a${r} ${r} 0 1 1 ${n(-2 * r)} 0z`;
const on = (v: boolean): number => (v ? 1 : 0);
const veil = (dark: number): number => n(DARK_ALPHA * Math.min(1, Math.max(0, dark)));

// Plancher de la pièce derrière une fenêtre (maquette : bas de l'étage − 0,5 ; porte-fenêtre : bas de la vitre + 0,5),
// retrouvé depuis la vitre seule (facade-layout : std = 62 % de l'étage à 42 % du jeu, top = 56 %, french = 72 %).
export function floorOf(win: Pick<FacadeWindow, 'y' | 'h' | 'kind'>): number {
  const { y, h, kind } = win;
  if (kind === 'french' || kind === 'dormer') return y + h + 0.5;
  if (kind === 'top') return y + h + 0.455 * h - 0.5;
  return y + h + 0.355 * h - 0.5;
}
// Taille d'un adulte derrière cette vitre : 0,66 × hauteur d'étage.
export function figureHeight(win: Pick<FacadeWindow, 'h' | 'kind'>): number {
  const { h, kind } = win;
  if (kind === 'french') return (0.66 / 0.72) * h;
  if (kind === 'top') return (0.66 / 0.56) * h;
  if (kind === 'dormer') return 0.9 * h;
  return (0.66 / 0.62) * h;
}

// Transform d'un vantail dans le repère de sa charnière (origine au bord extérieur de la vitre, x vers le centre) :
// persienne repliée dans l'embrasure (largeur 1 − open), volet battant qui pivote (edge-on aux deux tiers, puis rabattu
// contre le mur, miroir à −0,5 décalé de 0,6 px). Le vantail droit est dessiné en miroir par son groupe parent.
export const shutterTransform = (open: number, kind: ShutterKind = 'persienne'): string =>
  kind === 'persienne' ? `scale(${n(1 - open)} 1)` : `translate(${n(-BATTANT_GAP * open)} 0) scale(${n(1 - BATTANT_FOLD * open)} 1)`;
// Lames éclairées (1) ou sombres (0) : persienne dès que la pièce est allumée derrière, battant seulement plus fermé qu'ouvert.
export const shutterLit = (kind: ShutterKind, open: number, litBehind: boolean): number => on(kind === 'persienne' ? litBehind : litBehind && open < 0.5);

// Un vantail : face, lames sombres et lames éclairées (l'une transparente), ombre du bord intérieur (persienne), contour.
function Leaf({ kind, lw, h, face, slat, lit, edge, dark }: { kind: ShutterKind; lw: number; h: number; face: string; slat: string; lit: number; edge: string; dark: number }): ReactElement {
  let slats = '';
  const step = kind === 'persienne' ? 1.6 : 2;
  const sh = kind === 'persienne' ? 0.35 : 0.4;
  for (let k = kind === 'persienne' ? 1.2 : 1.5; k < h; k += step) slats += rectPath(0.3, k, Math.max(0.3, lw - 0.6), sh);
  // Persienne : contour mis à l'échelle (disparaît repliée) ; battant : contour constant (rabattu toute la journée).
  const stroke = kind === 'persienne' ? {} : { vectorEffect: 'non-scaling-stroke' as const };
  return (
    <>
      <rect width={n(lw)} height={n(h)} fill={face} stroke={INK} strokeWidth={kind === 'persienne' ? 0.4 : 0.45} {...stroke} />
      {kind === 'persienne' && <rect x={n(lw - 0.5)} width={0.5} height={n(h)} fill={edge} />}
      <path data-slats-dark="" d={slats} fill={slat} opacity={1 - lit} />
      <rect data-dark-veil="" width={n(lw)} height={n(h)} fill={DARK_VEIL} opacity={veil(dark)} />
      <path data-slats-lit="" d={slats} fill={SLAT_LIT} opacity={lit} />
    </>
  );
}

// Volets d'une fenêtre : persiennes métalliques repliables (haussmann, lames qui laissent filtrer la lumière) ou volets
// battants (faubourg, lames éclairées seulement quand ils sont plus fermés qu'ouverts). `open` 0 fermé … 1 replié ;
// `dark` : obscurité 0-1 (ambiance de nuit sur les vantaux, lames éclairées au-dessus).
export function Shutters({ win, kind, color, open, litBehind, dark = 0 }: { win: FacadeWindow; kind: ShutterKind; color: string; open: number; litBehind: boolean; dark?: number }): ReactElement {
  const { x, y, w, h } = win;
  const c = hex(color);
  const lw = w / 2;
  const lit = shutterLit(kind, open, litBehind);
  const slat = css(shade(c, kind === 'persienne' ? 0.55 : 0.5));
  const edge = css(shade(c, 0.35));
  const t = shutterTransform(open, kind);
  const faceL = kind === 'persienne' ? color : css(light(c, 0.2));
  const faceR = kind === 'persienne' ? color : css(shade(c, 0.3));
  return (
    <g data-shutters={kind}>
      <g transform={`translate(${n(x)} ${n(y)})`}>
        <g data-shutter-leaf={kind} transform={t}>
          <Leaf kind={kind} lw={lw} h={h} face={faceL} slat={slat} lit={lit} edge={edge} dark={dark} />
        </g>
      </g>
      <g transform={`translate(${n(x + w)} ${n(y)}) scale(-1 1)`}>
        <g data-shutter-leaf={kind} transform={t}>
          <Leaf kind={kind} lw={lw} h={h} face={faceR} slat={slat} lit={lit} edge={edge} dark={dark} />
        </g>
      </g>
    </g>
  );
}

// Battant gauche de la fenêtre ouvert vers l'extérieur : vitre (jour / nuit, l'une transparente), reflet, contour et
// meneau ; dessiné à pleine ouverture dans le repère de la charnière biaisé, mis à l'échelle par `open` ; `dark` : ambiance.
export function Sash({ win, open, night, dark = 0 }: { win: FacadeWindow; open: number; night: boolean; dark?: number }): ReactElement {
  const { x, y, w, h } = win;
  const L = (w / 2) * SASH_W;
  const shine = `M${n(-L)} 0H${n(-L * 0.4)}V${n(h * 0.5)}L${n(-L)} ${n(h * 0.6)}z`;
  const ink = { fill: 'none', stroke: INK, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <g data-sash="" transform={`translate(${n(x)} ${n(y)}) skewY(${SASH_SKEW})`}>
      <g data-sash-leaf="" transform={`scale(${n(open)} 1)`}>
        <rect x={n(-L)} width={n(L)} height={n(h)} fill={GLASS_DAY} opacity={on(!night)} />
        <rect x={n(-L)} width={n(L)} height={n(h)} fill={GLASS_NIGHT} opacity={on(night)} />
        <path d={shine} fill={SHINE_DAY} opacity={on(!night)} />
        <path d={shine} fill={SHINE_NIGHT} opacity={on(night)} />
        <rect data-dark-veil="" x={n(-L)} width={n(L)} height={n(h)} fill={DARK_VEIL} opacity={veil(dark)} />
        <rect x={n(-L)} width={n(L)} height={n(h)} strokeWidth={0.55} {...ink} />
        <path d={`M${n(-L / 2)} 0v${n(h)}`} strokeWidth={0.4} {...ink} />
      </g>
    </g>
  );
}

// Largeur d'un panneau de rideau ouvert (chantier 1) ; tiré, il couvre sa moitié de vitre (+ 0,2 de recouvrement).
export const curtainOpenWidth = curtainWidth;
const curtainDrawnWidth = (w: number): number => w / 2 + 0.2;

// Attributs des rideaux qui changent avec leur position (`drawn`), l'allumage et la nuit : échelle des panneaux, étoffe de
// jour / de nuit, plis, voilage allumé / de jour / de nuit et ses lignes. Partagés par `Curtains` (rendu) et la boucle du
// calque de la vie aux fenêtres (écriture directe des attributs, sans re-rendu).
export function curtainAttrs(w: number, drawn: number, lit: boolean, night: boolean): { sx: number; day: number; folds: number; voileLit: number; voileDay: number; voileNight: number; lines: number } {
  const sheer = drawn < 0.5;
  return {
    sx: n(lerp(curtainOpenWidth(w), curtainDrawnWidth(w), drawn) / curtainDrawnWidth(w)),
    day: on(lit || !night),
    folds: on(drawn > 0.2),
    voileLit: on(sheer && lit),
    voileDay: on(sheer && !lit && !night),
    voileNight: on(sheer && !lit && night),
    lines: on(sheer && (lit || !night)),
  };
}

// Un panneau dans le repère de son bord extérieur : étoffe de jour (ou allumée) et de nuit éteinte (l'une transparente),
// plis (dès que le rideau est un peu tiré ; ils se resserrent quand il est ouvert), ombre du bord intérieur.
function Panel({ W, h, color, nightColor, day, folds }: { W: number; h: number; color: string; nightColor: string; day: number; folds: number }): ReactElement {
  let d = '';
  for (let k = 1; k < W; k += 1.3) d += `M${n(k)} 0v${n(h)}`;
  return (
    <>
      <rect data-curtain-day="" width={n(W)} height={n(h)} fill={color} opacity={day} />
      <rect data-curtain-night="" width={n(W)} height={n(h)} fill={nightColor} opacity={1 - day} />
      <path data-curtain-folds="" d={d} fill="none" stroke={CURTAIN_FOLD} strokeWidth={0.35} opacity={folds} />
      <path d={`M${n(W - 0.2)} 0v${n(h)}`} fill="none" stroke={CURTAIN_EDGE} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
    </>
  );
}

// Rideaux d'une fenêtre : deux panneaux latéraux (largeur du chantier 1 ouverts, moitié de la vitre tirés) ; style
// `voile` : voilage (allumé / éteint de jour / éteint de nuit, jamais plus clair que le mur) visible tant que `drawn` < 0,5,
// et ses panneaux. `night` (défaut : `lit`) choisit l'étoffe éteinte de nuit (`nightCurtain`) ; de jour, la couleur du logement.
export function Curtains({ win, style, color, drawn, lit, wall, night = lit }: { win: FacadeWindow; style: 'side' | 'voile'; color: string; drawn: number; lit: boolean; wall: string; night?: boolean }): ReactElement {
  const { x, y, w, h } = win;
  const W = curtainDrawnWidth(w);
  const a = curtainAttrs(w, drawn, lit, night);
  const sx = a.sx;
  const panel = { W, h, color, nightColor: nightCurtain(color, wall), day: a.day, folds: a.folds };
  let lines = '';
  if (style === 'voile') for (let k = 1; k < w; k += 1.6) lines += `M${n(x + k)} ${n(y)}L${n(x + k - 0.6)} ${n(y + h)}`;
  return (
    <g data-curtains={style}>
      {style === 'voile' && (
        <>
          <rect data-voile-lit="" x={n(x)} y={n(y)} width={n(w)} height={n(h)} fill={VOILE_LIT} opacity={a.voileLit} />
          <rect data-voile-day="" x={n(x)} y={n(y)} width={n(w)} height={n(h)} fill={VOILE_DAY} opacity={a.voileDay} />
          <rect data-voile-night="" x={n(x)} y={n(y)} width={n(w)} height={n(h)} fill={nightVoile(wall)} opacity={a.voileNight} />
          <path data-voile-lines="" d={lines} fill="none" stroke={VOILE_LINES} strokeWidth={0.4} opacity={a.lines} />
        </>
      )}
      <g data-curtain-panel="" transform={`translate(${n(x)} ${n(y)}) scale(${sx} 1)`}>
        <Panel {...panel} />
      </g>
      <g data-curtain-panel="" transform={`translate(${n(x + w)} ${n(y)}) scale(${n(-sx)} 1)`}>
        <Panel {...panel} />
      </g>
    </g>
  );
}

// Palette des fleurs selon le mois (1-12) : primevères au printemps, géraniums l'été, chrysanthèmes à l'automne, terre nue l'hiver.
export const flowerPalette = (month: number): readonly string[] =>
  month >= 11 || month <= 2 ? FLOWERS.winter : month <= 4 ? FLOWERS.spring : month <= 9 ? FLOWERS.summer : FLOWERS.autumn;

// Jardinière sous l'appui (faubourg, `win.box`) : bac et touches de couleur de la saison, tirage fixe par `seed` ;
// `dark` : ambiance de nuit (voile aux formes du bac et des fleurs).
export function FlowerBox({ win, month, seed, dark = 0 }: { win: FacadeWindow; month: number; seed: number; dark?: number }): ReactElement {
  const { x, y, w, h } = win;
  const bx = x - 0.4;
  const by = y + h + 1;
  const bw = w + 0.8;
  const pal = flowerPalette(month);
  const count = pal === FLOWERS.winter ? 2 : 6;
  const r = mulberry32(seed);
  const flowers: { c: string; cx: number; cy: number }[] = [];
  for (let k = 0; k < count; k++) {
    const c = pal[Math.floor(r() * pal.length)]!;
    flowers.push({ c, cx: bx + 0.9 + r() * (bw - 1.8), cy: by + 0.4 + r() * 1.0 - (count > 2 ? 0.6 : 0) });
  }
  return (
    <g data-flower-box="">
      <rect x={n(bx)} y={n(by)} width={n(bw)} height={1.6} fill={BOX} stroke={INK} strokeWidth={0.4} />
      {flowers.map((f, i) => <circle key={i} data-flower="" cx={n(f.cx)} cy={n(f.cy)} r={0.7} fill={f.c} />)}
      <path data-dark-veil="" d={rectPath(bx, by, bw, 1.6) + flowers.map((f) => discCw(f.cx, f.cy, 0.7)).join('')} fill={DARK_VEIL} opacity={veil(dark)} />
    </g>
  );
}

// Sapin de Noël au salon (décembre) : trois étages de branches (vert de jour / sombre à contre-jour, l'un transparent),
// tronc, guirlande de 7 ampoules qui clignotent (`blink` : secondes ; allumée 1,3 s sur 2, décalée par ampoule), étoile.
export function Sapin({ win, night, blink }: { win: FacadeWindow; night: boolean; blink: number }): ReactElement {
  const { x, w, h } = win;
  const cx = x + w * 0.72;
  const fl = floorOf(win);
  const H = h * 0.78;
  let tree = '';
  for (let k = 0; k < 3; k++) {
    const yy = fl - H * (0.25 + k * 0.25);
    const ww = H * (0.42 - k * 0.1);
    tree += `M${n(cx - ww / 2)} ${n(yy)}L${n(cx)} ${n(yy - H * 0.3)}L${n(cx + ww / 2)} ${n(yy)}z`;
  }
  const bulbs = Array.from({ length: BULBS }, (_, i) => ({
    cx: cx + (((i * 37) % 7) - 3) * (H * 0.06),
    cy: fl - H * (0.3 + (i % 4) * 0.17),
    c: GARLAND[i % 5]!,
    lit: bulbOn(blink, i),
  }));
  return (
    <g data-sapin="">
      <path d={tree} fill={SAPIN} opacity={on(!night)} />
      <path d={tree} fill={SAPIN_NIGHT} opacity={on(night)} />
      <rect x={n(cx - 0.5)} y={n(fl - H * 0.25)} width={1} height={n(H * 0.25)} fill={TRUNK} />
      {bulbs.map((b, i) => <circle key={i} data-bulb="" cx={n(b.cx)} cy={n(b.cy)} r={0.45} fill={b.c} opacity={b.lit} />)}
      <circle cx={n(cx)} cy={n(fl - H * 1.03)} r={0.6} fill={STAR} />
    </g>
  );
}

// Écran de la télé (maquette : télé à 0,34 × 2,2 largeurs à gauche du spectateur assis à +0,22, près du bord gauche de la
// vitre) : dalle éteinte, ambiance de nuit, lueur blanche d'opacité `glow` (`[data-screen]`, scintillement écrit par la
// boucle du calque). Monté dans le meuble, ou seul (écran allumé tenu vivant hors de l'image cuite du calque).
export function TvScreen({ win, glow, dark = 0 }: { win: Pick<FacadeWindow, 'x' | 'w' | 'y' | 'h' | 'kind'>; glow: number; dark?: number }): ReactElement {
  const fl = floorOf(win);
  const hh = figureHeight(win);
  const tx = win.x + win.w / 2 - win.w * 0.4;
  const ty = fl - hh * 0.55;
  const r = { x: n(tx - 1.4), y: n(ty), width: 2.8, height: n(hh * 0.22) };
  return (
    <g data-tv-screen="">
      <rect {...r} fill={SCREEN_OFF} />
      <rect data-dark-veil="" {...r} fill={DARK_VEIL} opacity={veil(dark)} />
      <rect data-screen="" {...r} fill="#FFFFFF" opacity={n(glow)} />
    </g>
  );
}

// Meuble lié à une pose, en silhouette dans la pièce (le calque règle l'opacité du groupe selon la lumière) : table avec
// assiettes et bouteille, bureau et son écran froid, télé sur son meuble (écran qui scintille quand la pièce est à la télé :
// `flicker` en secondes), plan de cuisson. Placé sur le plancher, au centre de la vitre (l'acteur est à ±0,22 largeur).
// `dark` : ambiance de nuit sur les parties claires (assiettes, écrans éteints) ; les silhouettes sont déjà sombres.
export function InteriorProp({ win, kind, tone, flicker, dark = 0 }: { win: FacadeWindow; kind: InteriorKind; tone: LightTone; flicker: number; dark?: number }): ReactElement {
  const { x, w } = win;
  const ax = x + w / 2;
  const fl = floorOf(win);
  const hh = figureHeight(win);
  if (kind === 'table') {
    const ty = fl - hh * 0.46;
    const tw = hh * 0.55;
    return (
      <g data-interior-prop="table">
        <path d={rectPath(ax - tw / 2, ty, tw, hh * 0.05) + rectPath(ax - tw / 2 + 0.6, ty, 0.5, hh * 0.46) + rectPath(ax + tw / 2 - 1.1, ty, 0.5, hh * 0.46) + rectPath(ax - 0.5, ty - hh * 0.14, 1, hh * 0.14)} fill={SILH} />
        <path d={rectPath(ax - tw * 0.36, ty - 0.5, tw * 0.22, 0.5) + rectPath(ax + tw * 0.14, ty - 0.5, tw * 0.22, 0.5)} fill="#FFFFFF" opacity={0.5} />
        <path data-dark-veil="" d={rectPath(ax - tw * 0.36, ty - 0.5, tw * 0.22, 0.5) + rectPath(ax + tw * 0.14, ty - 0.5, tw * 0.22, 0.5)} fill={DARK_VEIL} opacity={veil(dark)} />
      </g>
    );
  }
  if (kind === 'desk') {
    const ty = fl - hh * 0.46;
    const tw = hh * 0.5;
    return (
      <g data-interior-prop="desk">
        <path d={rectPath(ax - tw * 0.1, ty, tw, hh * 0.05) + rectPath(ax + tw * 0.75, ty, 0.5, hh * 0.46)} fill={SILH} />
        <rect x={n(ax + tw * 0.35)} y={n(ty - hh * 0.2)} width={n(tw * 0.3)} height={n(hh * 0.19)} fill={SCREEN_DESK} />
        <rect data-dark-veil="" x={n(ax + tw * 0.35)} y={n(ty - hh * 0.2)} width={n(tw * 0.3)} height={n(hh * 0.19)} fill={DARK_VEIL} opacity={veil(dark)} />
      </g>
    );
  }
  if (kind === 'tv') {
    const tx = ax - w * 0.4;
    return (
      <g data-interior-prop="tv">
        <rect x={n(tx - 1.6)} y={n(fl - hh * 0.3)} width={3.2} height={n(hh * 0.3)} fill={SILH} />
        <TvScreen win={win} glow={tvGlow(tone, flicker)} dark={dark} />
      </g>
    );
  }
  const sx = ax + hh * 0.22 - w * 0.22;
  return (
    <g data-interior-prop="stove">
      <rect x={n(sx)} y={n(fl - hh * 0.46)} width={n(hh * 0.3)} height={n(hh * 0.46)} fill={SILH} />
      <rect x={n(sx + 0.3)} y={n(fl - hh * 0.5)} width={n(hh * 0.2)} height={n(hh * 0.05)} fill="#FFFFFF" opacity={0.35} />
      <rect data-dark-veil="" x={n(sx + 0.3)} y={n(fl - hh * 0.5)} width={n(hh * 0.2)} height={n(hh * 0.05)} fill={DARK_VEIL} opacity={veil(dark)} />
    </g>
  );
}

// Volute de la cigarette à l'avancement `phase` de la bouffée (0 → 1 : elle monte et se dilue ; < 0 : pas de fumée) :
// attributs du disque `[data-puff]`, partagés avec la boucle du calque de la vie aux fenêtres.
export function puffAttrs(phase: number): { transform: string; opacity: number } {
  const puff = Math.min(1, Math.max(0, phase));
  return { transform: `translate(${n(1.5 + puff * 4)} ${n(-4 - puff * 5)}) scale(${n(0.8 + puff * 2)})`, opacity: n(phase < 0 ? 0 : 0.5 * (1 - puff)) };
}

// Accessoire dans la main (`at` : main droite du pantin, en coordonnées de la scène) ; la nuit, en silhouette.
// `phase` : cigarette = avancement de la bouffée (0 → 1 : la volute monte et se dilue ; < 0 : pas de fumée) ; arrosoir =
// 1 quand il verse (filet d'eau) ; tapis = phase de l'ondulation (radians) ; sans effet pour la cuillère, le livre, la tasse.
// `dark` : ambiance de nuit (crépuscule) sur l'objet ; la braise, la fumée et l'eau restent claires.
export function HeldProp({ kind, at, phase, night, dark = 0 }: { kind: HandProp; at: readonly [number, number]; phase: number; night: boolean; dark?: number }): ReactElement {
  const t = `translate(${n(at[0])} ${n(at[1])})`;
  const sil = night ? SILH : null;
  const dv = { 'data-dark-veil': '', fill: DARK_VEIL, opacity: veil(dark) } as const;
  if (kind === 'cigarette') {
    const puff = puffAttrs(phase);
    return (
      <g data-held-prop="cigarette" transform={t}>
        <path d="M0 -0.3h1.8" stroke={sil ?? CUP} strokeWidth={0.4} />
        <path d="M0 -0.3h1.8" stroke={DARK_VEIL} strokeWidth={0.4} opacity={veil(dark)} />
        <circle cx={1.9} cy={-0.3} r={0.45} fill={EMBER} />
        <circle data-puff="" r={1} fill={night ? SMOKE_NIGHT : SMOKE_DAY} transform={puff.transform} opacity={puff.opacity} />
      </g>
    );
  }
  if (kind === 'watering-can') {
    return (
      <g data-held-prop="watering-can" transform={t}>
        <path d="M-1.2 0H1.4L1.1 2.2H-0.9z" fill={sil ?? CAN} />
        <path d="M-1.2 0H1.4L1.1 2.2H-0.9z" {...dv} />
        <path d="M1.2 0.6L3 2.6" stroke={INK} strokeWidth={0.6} />
        <path data-pour="" d="M3 2.8Q3.6 4 3.4 5.5" fill="none" stroke={WATER} strokeWidth={0.5} opacity={on(phase > 0)} />
      </g>
    );
  }
  if (kind === 'rug') {
    // Tapis tenu à deux mains (3,2 px) qui ondule : le bas suit un biais (skewX de wv / 4,2) ; poussière qui tombe.
    const lx = -1.6;
    const rx = 1.6;
    const wv = Math.sin(phase) * 0.8;
    const skew = n((Math.atan(wv / 4.2) * 180) / Math.PI);
    return (
      <g data-held-prop="rug" transform={t}>
        <g transform={`skewX(${skew})`}>
          <path d={`M${lx} 0H${rx}V4.2Q0 5 ${lx} 4.2z`} fill={sil ?? RUG} stroke={INK} strokeWidth={0.4} strokeLinejoin="round" />
          <path d={rectPath(lx + 0.6, 1.2, rx - lx - 1.2, 0.5) + rectPath(lx + 0.6, 2.8, rx - lx - 1.2, 0.5)} fill={RUG_STRIPE} opacity={on(!night)} />
          <path d={`M${lx} 0H${rx}V4.2Q0 5 ${lx} 4.2z`} {...dv} />
        </g>
        {[0, 1, 2, 3].map((k) => <circle key={k} data-dust="" r={0.5} fill={DUST} transform={`translate(${n(Math.sin(phase * 0.7 + k) * 2.5)} ${n(5.5 + k * 1.1)})`} />)}
      </g>
    );
  }
  if (kind === 'spoon') {
    return (
      <g data-held-prop="spoon" transform={t}>
        <path d="M0 0L2.2 -2.2" stroke={sil ?? SPOON} strokeWidth={0.5} />
        <circle cx={2.5} cy={-2.5} r={0.6} fill={sil ?? SPOON} />
        <path d={`M0 0L2.2 -2.2${disc(2.5, -2.5, 0.6)}`} stroke={DARK_VEIL} strokeWidth={0.5} {...dv} />
      </g>
    );
  }
  if (kind === 'book') {
    return (
      <g data-held-prop="book" transform={t}>
        <path d="M-1.6 -1.4L0 -1.1L1.6 -1.4V0.6L0 0.9L-1.6 0.6z" fill={sil ?? BOOK} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
        <path d="M0 -1.1V0.9" stroke={INK} strokeWidth={0.3} />
        <path d="M-1.6 -1.4L0 -1.1L1.6 -1.4V0.6L0 0.9L-1.6 0.6z" {...dv} />
      </g>
    );
  }
  return (
    <g data-held-prop="cup" transform={t}>
      <rect x={-0.7} y={-1.6} width={1.4} height={1.6} fill={sil ?? CUP} stroke={INK} strokeWidth={0.3} />
      <path d="M0.7 -1.2Q1.6 -0.8 0.7 -0.4" fill="none" stroke={INK} strokeWidth={0.35} />
      <rect x={-0.7} y={-1.6} width={1.4} height={1.6} {...dv} />
    </g>
  );
}
