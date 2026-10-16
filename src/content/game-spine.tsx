// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
// Logos de consoles : les vrais (Wikimedia Commons, voir src/assets/console-logos/SOURCES.md) ; le reste est dessiné.
import { useId, type ReactElement } from 'react';
import type { BoxFormat, CaseStyle } from '../core/game/platform-boxes';
import { logoAspect, logoUri, type ConsoleLogo } from './console-logos';

// Encre lisible sur une couleur #RRGGBB : foncée sur un fond clair, blanche sinon.
export const inkOn = (hex: string): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160 ? '#1B1B1F' : '#FFFFFF';
};
// Bandeau clair (PS5 blanc sur boîtier blanc) : cerné d'un trait fin pour rester visible ; foncé : sans trait.
export const lightEdge = (hex: string): object => (inkOn(hex) === '#FFFFFF' ? {} : { stroke: '#1B1B1F', strokeWidth: 0.7, vectorEffect: 'non-scaling-stroke' });

const INK = '#1B1B1F';
const FONT = 'system-ui, sans-serif';
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const cut = (text: string, max: number): string => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);
// Longueur d'un texte en unités, en fraction de la taille de police.
const CHAR = 0.6;

// Logo de console d'une tranche blanche sans bandeau, d'après le nom de la console.
function consoleLogoOf(name: string): ConsoleLogo | null {
  const n = name.toLowerCase();
  if (/wii/.test(n)) return 'wii';
  if (/3ds/.test(n)) return '3ds';
  if (/\bds\b|nintendo ds|dsi/.test(n)) return 'ds';
  return null;
}
// Mot de la console imprimé dans le bandeau, d'après son libellé (absent : libellé dessiné en repli).
const WORDMARKS: Record<string, ConsoleLogo> = { PS4: 'ps4', PS5: 'ps5', 'XBOX ONE': 'xbox-one', 'XBOX SERIES X': 'xbox-series', 'Wii U': 'wiiu' };
const isNintendo = (format: BoxFormat, name: string): boolean => format === 'switch' || format === 'gamecube' || /nintendo|wii|gamecube|\bds\b|3ds/i.test(name);

// Disposition de la tranche par console, copiée des vraies boîtes (UNE seule table : étagère, second zoom, boîte ouverte retournée) :
// `head` = ce qui est imprimé en haut, `marks` = les logos posés de haut en bas à leur place réelle
// (`wordmark` : le mot du bandeau, `console` : le logo de la console d'une tranche blanche ; `tint` : teinté à l'encre du fond) ;
// `foot` = la marque du bas (logo « Nintendo » ou studio seul). Le titre (ou le logo du jeu) occupe le milieu ;
// les autres côtés de la boîte (dessus, dessous, ouverture) restent en plastique uni.
export type SpineHead = 'switch' | 'playstation' | 'xbox' | 'band' | 'console-mark' | 'none';
export type SpineFoot = 'nintendo' | 'studio';
// `flat` : logo gardé à plat (en travers de la tranche) même s'il est allongé, comme le mot « PS4 » des vraies boîtes.
export type SpineMark = { logo: ConsoleLogo | 'wordmark' | 'console'; tint?: true; flat?: true };
export type SpineLayout = { key: string; head: SpineHead; foot: SpineFoot; marks: SpineMark[] };
type SpineRule = SpineLayout & { test: (format: BoxFormat, style: CaseStyle, name: string) => boolean };
export const SPINE_LAYOUTS: readonly SpineRule[] = [
  // Switch : tranche toute rouge, logo Switch blanc en haut, logo « Nintendo » sur pastille blanche en bas.
  { key: 'switch', head: 'switch', foot: 'nintendo', marks: [{ logo: 'switch', tint: true }], test: (f) => f === 'switch' },
  // PS3/PS4/PS5 : bandeau de la console, logo PS puis le mot « PS4 »/« PS5 » ; éditeur en bas.
  { key: 'playstation', head: 'playstation', foot: 'studio', marks: [{ logo: 'playstation', tint: true }, { logo: 'wordmark', tint: true, flat: true }], test: (_, s) => /^PS\d/.test(s.band?.label ?? '') },
  // Xbox One / Series : bandeau vert, sphère Xbox puis le mot ; éditeur en bas.
  { key: 'xbox', head: 'xbox', foot: 'studio', marks: [{ logo: 'xbox-sphere', tint: true }, { logo: 'wordmark', tint: true }], test: (_, s) => /^XBOX/i.test(s.band?.label ?? '') },
  // Wii U : bandeau bleu « Wii U » sur boîtier blanc, logo « Nintendo » en bas.
  { key: 'wiiu', head: 'band', foot: 'nintendo', marks: [{ logo: 'wordmark', tint: true }], test: (_, s, n) => /wii u/i.test(n) && s.band !== null },
  // Wii, DS, 3DS : boîtier blanc, logo de la console (couleurs d'origine) en haut, logo « Nintendo » en bas.
  { key: 'nintendo-white', head: 'console-mark', foot: 'nintendo', marks: [{ logo: 'console' }], test: (_, s, n) => s.band === null && consoleLogoOf(n) !== null },
  { key: 'nintendo', head: 'none', foot: 'nintendo', marks: [], test: (f, _, n) => isNintendo(f, n) },
  { key: 'band', head: 'band', foot: 'studio', marks: [{ logo: 'wordmark', tint: true }], test: (_, s) => s.band !== null },
  { key: 'plain', head: 'none', foot: 'studio', marks: [], test: () => true },
];

export function spineLayoutOf(format: BoxFormat, style: CaseStyle, name = ''): SpineLayout {
  const { key, head, foot, marks } = SPINE_LAYOUTS.find((r) => r.test(format, style, name))!;
  return { key, head, foot, marks };
}

export type GameSpineProps = {
  w: number; h: number; style: CaseStyle; format: BoxFormat; title: string;
  logoUrl?: string; studio?: string;
  // Nom de la console (TheGamesDB) : logo du haut des tranches blanches, logo « Nintendo » du bas.
  console?: string;
};

// Logo de console posé à `y` (haut), centré : à plat s'il est assez compact, sinon tourné de 90° le long de la tranche.
function placeLogo(name: ConsoleLogo, w: number, y: number, maxLen: number, tint?: string, flat = false): { el: ReactElement; len: number } {
  const u = w;
  const aspect = logoAspect(name);
  const href = logoUri(name, tint);
  if (aspect <= 3 || flat) {
    const lw = Math.min(u * 0.8, u * 0.62 * aspect);
    const lh = lw / aspect;
    return { el: <image key={name} data-spine-logo-mark={name} data-y={r2(y)} href={href} x={r2((w - lw) / 2)} y={r2(y)} width={r2(lw)} height={r2(lh)} preserveAspectRatio="xMidYMid meet" />, len: lh };
  }
  const len = Math.min(maxLen, u * 0.62 * aspect);
  const t = len / aspect;
  return {
    el: (
      <g key={name} transform={`translate(${r2(w / 2)} ${r2(y + len / 2)}) rotate(90)`}>
        <image data-spine-logo-mark={name} data-y={r2(y)} href={href} x={r2(-len / 2)} y={r2(-t / 2)} width={r2(len)} height={r2(t)} preserveAspectRatio="xMidYMid meet" />
      </g>
    ),
    len,
  };
}

// Tranche d'une boîte de jeu dessinée comme la vraie (repère w × h, haut en y = 0, verticale), d'après SPINE_LAYOUTS.
// Titre vertical (logo du jeu tourné de 90° s'il existe), studio en petit en bas.
export function GameSpine({ w, h, style, format, title, logoUrl, studio, console: name = '' }: GameSpineProps): ReactElement {
  const u = w;
  const outlineId = `wm-spine-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const body = style.plastic;
  const ink = inkOn(body);
  const layout = spineLayoutOf(format, style, name);
  const band = layout.head === 'playstation' || layout.head === 'xbox' || layout.head === 'band' ? style.band : null;
  // Encre des logos teintés : celle du bandeau, sinon celle du boîtier.
  const tint = inkOn(band ? band.color : body);

  // En-tête : les logos de la table, l'un sous l'autre ; un mot absent (PS3…) est écrit en repli.
  const marks: ReactElement[] = [];
  let y = u * 0.3;
  for (const m of layout.marks) {
    const logo = m.logo === 'wordmark' ? WORDMARKS[style.band?.label ?? ''] : m.logo === 'console' ? consoleLogoOf(name) : m.logo;
    if (logo) {
      const placed = placeLogo(logo, w, y, h * 0.2, m.tint ? tint : undefined, m.flat);
      marks.push(placed.el);
      y += placed.len + u * 0.22;
    } else if (m.logo === 'wordmark' && style.band) {
      const label = style.band.label;
      const fs = u * 0.42;
      if (label.length <= 3) {
        marks.push(<text key="label" data-spine-band-label="" x={r2(w / 2)} y={r2(y + fs * 0.8)} fontSize={r2(fs)} fontFamily={FONT} fontWeight={800} textAnchor="middle" fill={tint}>{label}</text>);
        y += fs + u * 0.22;
      } else {
        marks.push(<text key="label" data-spine-band-label="" transform={`translate(${r2(w / 2 - fs * 0.35)} ${r2(y)}) rotate(90)`} fontSize={r2(fs)} fontFamily={FONT} fontWeight={800} fill={tint}>{label}</text>);
        y += label.length * fs * CHAR + u * 0.22;
      }
    }
  }
  const headH = marks.length > 0 ? y + u * 0.08 : u * 0.4;

  // Pied : logo « Nintendo » tout en bas (sur pastille blanche sur une tranche foncée), studio au-dessus.
  let footTop = h - u * 0.3;
  let pill: ReactElement | null = null;
  if (layout.foot === 'nintendo') {
    const pw = u * 0.84;
    const ph = pw / logoAspect('nintendo');
    const py = h - u * 0.3 - ph;
    const onDark = ink === '#FFFFFF';
    pill = (
      <g data-spine-nintendo="">
        {onDark && <rect x={r2((w - pw) / 2)} y={r2(py)} width={r2(pw)} height={r2(ph)} rx={r2(ph / 2)} fill="#FFFFFF" />}
        <image data-spine-logo-mark="nintendo" data-y={r2(py)} href={logoUri('nintendo')} x={r2((w - pw) / 2)} y={r2(py)} width={r2(pw)} height={r2(ph)} preserveAspectRatio="xMidYMid meet" />
      </g>
    );
    footTop = py - u * 0.25;
  }
  let studioEl: ReactElement | null = null;
  if (studio) {
    const fs = u * 0.3;
    const text = cut(studio, Math.floor((h * 0.22) / (fs * CHAR)));
    const sy = footTop - text.length * fs * CHAR;
    studioEl = <text data-spine-studio="" transform={`translate(${r2(w / 2 - fs * 0.35)} ${r2(sy)}) rotate(90)`} fontSize={r2(fs)} fontFamily={FONT} fontWeight={600} fill={ink} opacity={0.85}>{text}</text>;
    footTop = sy - u * 0.4;
  }

  // Titre : entre l'en-tête et le pied.
  const zoneTop = headH + u * 0.3;
  const zoneLen = Math.max(u, footTop - zoneTop);
  // Titre au plus grand qui tienne entier (jusqu'à 60 % de la taille de base), coupé seulement au-delà.
  const tfs = Math.max(u * 0.32, Math.min(u * 0.5, zoneLen / (Math.max(1, title.length) * CHAR)));
  // Tranche claire : le logo du jeu (souvent blanc) est cerné d'encre pour rester lisible.
  const outline = logoUrl && ink === INK;
  const titleEl = logoUrl
    ? (
      <g transform={`translate(${r2(w / 2)} ${r2(zoneTop + zoneLen / 2)}) rotate(90)`}>
        {outline && (
          <filter id={outlineId} x="-5%" y="-5%" width="110%" height="110%">
            <feMorphology in="SourceAlpha" operator="dilate" radius={r2(u * 0.025)} result="grown" />
            <feFlood floodColor={INK} />
            <feComposite in2="grown" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
        <image data-spine-logo="" href={logoUrl} x={r2(-zoneLen * 0.475)} y={r2(-u * 0.45)} width={r2(zoneLen * 0.95)} height={r2(u * 0.9)} preserveAspectRatio="xMidYMid meet" {...NO_REFERRER} {...(outline ? { filter: `url(#${outlineId})` } : {})} />
      </g>
    )
    : title && (
      <text data-spine-title="" transform={`translate(${r2(w / 2 - tfs * 0.35)} ${r2(zoneTop)}) rotate(90)`} fontSize={r2(tfs)} fontFamily={FONT} fontWeight={700} fill={ink}>
        {cut(title, Math.floor(zoneLen / (tfs * CHAR)))}
      </text>
    );

  return (
    <g data-game-spine={layout.key}>
      <rect data-spine-body="" width={r2(w)} height={r2(h)} fill={body} />
      {/* Léger reflet du plastique le long de la tranche. */}
      <rect x={r2(w * 0.12)} width={r2(w * 0.12)} height={r2(h)} fill="#FFFFFF" opacity={0.12} />
      {band && <rect data-spine-band="" width={r2(w)} height={r2(headH)} fill={band.color} {...lightEdge(band.color)} />}
      {marks.length > 0 && <g data-spine-head={layout.head}>{marks}</g>}
      {band && <line x1={0} x2={r2(w)} y1={r2(headH)} y2={r2(headH)} stroke={INK} strokeWidth={0.7} vectorEffect="non-scaling-stroke" opacity={0.6} />}
      {titleEl}
      {studioEl}
      {pill}
      <rect width={r2(w)} height={r2(h)} fill="none" stroke={INK} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
