// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
//
// Face extérieure de la boîte de jeu retournée, ouverte à plat : dos | tranche | devant. Le dos est le scan de TheGamesDB, sinon
// un dos fabriqué (bandeau console, logo ou titre, captures, début de la description). Style cellulo : aplats + trait encré.
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { BOX_FORMATS, consoleLabelOf } from '../../core/game/platform-boxes';
import type { GameBox } from '../game-box-service';
import { GameSpine, inkOn } from '../game-spine';
import type { Geometry } from './item-case';

const INK = '#2B1D16';
const PAPER = '#F7F1E3';
const FONT = 'system-ui, sans-serif';
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;
const STROKE = { stroke: INK, strokeWidth: 2, vectorEffect: 'non-scaling-stroke' } as const;
const THIN = { stroke: INK, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;
const r2 = (v: number): number => Math.round(v * 100) / 100;

// Épaisseur de la boîte (mm) : la largeur de la tranche entre le dos et le devant.
export const spineMmOf = (box: Pick<GameBox, 'format'>): number => BOX_FORMATS[box.format].d * 10;

// Texte coupé en lignes d'au plus `max` caractères, `n` lignes au plus (la dernière finit par « … » si le texte continue).
function wrap(text: string, max: number, n: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.trim().split(/\s+/)) {
    if (cur === '') cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur !== '') out.push(cur);
  const lines = out.slice(0, n).map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l));
  if (out.length > n) lines[n - 1] = lines[n - 1]!.slice(0, max - 1) + '…';
  return lines;
}

// Dos fabriqué, dans le repère du gabarit (mm, 0…w × 0…h, w × h de la boîte fermée).
export function MadeBack({ box }: { box: GameBox }): ReactElement {
  const t = BOX_FORMATS[box.format];
  const w = t.w * 10;
  const h = t.h * 10;
  const uid = `wm-back-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const m = w * 0.07;
  // Bandeau : celui de la console (couleur et libellé court), sinon le plastique du boîtier.
  const bandColor = box.style.band?.color ?? box.style.plastic;
  const bandInk = inkOn(bandColor);
  const bandH = h * 0.075;
  const label = consoleLabelOf(box.platformName || box.style.band?.label || '');
  // Logo ou titre.
  const headTop = bandH + h * 0.03;
  const headH = h * 0.16;
  const titleSize = w * 0.075;
  const titleLines = wrap(box.title, Math.max(6, Math.floor((w - 2 * m) / (titleSize * 0.58))), 2);
  // Captures (au plus 4), deux par ligne, au format 16:9.
  const shots = box.shots.slice(0, 4);
  const gap = w * 0.03;
  const sw = (w - 2 * m - gap) / 2;
  const sh = sw * 9 / 16;
  const shotsTop = headTop + headH + h * 0.02;
  const rows = Math.ceil(shots.length / 2);
  const summaryTop = shots.length > 0 ? shotsTop + rows * (sh + gap) + h * 0.01 : shotsTop;
  // Description : autant de lignes que la place en laisse.
  const fs = w * 0.042;
  const lineH = fs * 1.35;
  const summaryLines = box.summary ? wrap(box.summary, Math.floor((w - 2 * m) / (fs * 0.52)), Math.max(1, Math.floor((h - summaryTop - h * 0.06) / lineH))) : [];
  return (
    <g data-made-back="">
      <rect x={0} y={0} width={w} height={h} fill={PAPER} {...STROKE} />
      <rect data-made-back-band-rect="" x={0} y={0} width={w} height={r2(bandH)} fill={bandColor} {...THIN} />
      <text data-made-back-band="" x={r2(m)} y={r2(bandH * 0.68)} fontSize={r2(bandH * 0.55)} fontFamily={FONT} fontWeight={800} fill={bandInk}>{label}</text>
      {box.logoUrl
        ? <image data-made-back-logo="" href={box.logoUrl} x={r2(m)} y={r2(headTop)} width={r2(w - 2 * m)} height={r2(headH)} preserveAspectRatio="xMidYMid meet" {...NO_REFERRER} />
        : (
          <text data-made-back-title="" x={r2(w / 2)} y={r2(headTop + headH / 2 - ((titleLines.length - 1) * titleSize * 1.1) / 2)} textAnchor="middle" dominantBaseline="middle"
            fontSize={r2(titleSize)} fontWeight={800} fontFamily="Georgia, 'Times New Roman', serif" fill={INK}>
            {titleLines.map((l, i) => <tspan key={i} x={r2(w / 2)} dy={i === 0 ? 0 : r2(titleSize * 1.1)}>{l}</tspan>)}
          </text>
        )}
      {shots.map((src, i) => {
        const x = m + (i % 2) * (sw + gap);
        const y = shotsTop + Math.floor(i / 2) * (sh + gap);
        const clip = `${uid}-s${i}`;
        return (
          <g key={i}>
            <clipPath id={clip}><rect x={r2(x)} y={r2(y)} width={r2(sw)} height={r2(sh)} /></clipPath>
            <image data-made-back-shot="" href={src} x={r2(x)} y={r2(y)} width={r2(sw)} height={r2(sh)} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} {...NO_REFERRER} />
            <rect x={r2(x)} y={r2(y)} width={r2(sw)} height={r2(sh)} fill="none" {...THIN} />
          </g>
        );
      })}
      {summaryLines.length > 0 && (
        <text data-made-back-summary="" x={r2(m)} y={r2(summaryTop + fs)} fontSize={r2(fs)} fontFamily={FONT} fill={INK}>
          {summaryLines.map((l, i) => <tspan key={i} x={r2(m)} dy={i === 0 ? 0 : r2(lineH)}>{l}</tspan>)}
        </text>
      )}
      {/* Pied : petite bande au plastique, comme les mentions du bas d'un vrai dos. */}
      <rect x={0} y={r2(h - h * 0.035)} width={w} height={r2(h * 0.035)} fill={box.style.plastic} {...THIN} />
    </g>
  );
}

// Dos fabriqué posé sur une face de w × h (unités de l'appelant : décor de la pièce, second zoom) ; la clé change avec ce qu'il montre.
export function madeBackFace(box: GameBox): { key: string; draw: (w: number, h: number) => ReactElement } {
  const t = BOX_FORMATS[box.format];
  const key = ['made-back', box.format, box.title, box.platformName, box.style.plastic, box.style.band?.color ?? '', box.style.band?.label ?? '', box.logoUrl ?? '', box.shots.slice(0, 4).join(','), box.summary ?? ''].join('|');
  return {
    key,
    draw: (w, h) => (
      <svg data-made-back-face="" x={0} y={0} width={w} height={h} viewBox={`0 0 ${t.w * 10} ${t.h * 10}`} preserveAspectRatio="none" overflow="visible">
        <MadeBack box={box} />
      </svg>
    ),
  };
}

// Scan (dos ou devant) dans un cadre au trait ; sans image (ou image introuvable), `fallback` (sinon l'aplat du plastique et le titre).
function Scan({ url, w, h, box, id, fallback }: { url?: string; w: number; h: number; box: GameBox; id: string; fallback?: ReactNode }): ReactElement {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = url && failed !== url ? url : undefined;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <clipPath id={id}><rect x={0} y={0} width={w} height={h} /></clipPath>
      {shown
        ? <image href={shown} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} onError={() => setFailed(shown)} {...NO_REFERRER} />
        : fallback ?? <>
            <rect x={0} y={0} width={w} height={h} fill={box.style.plastic} />
            <text x={r2(w / 2)} y={r2(h / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={r2(w * 0.08)} fontWeight={700} fontFamily={FONT} fill={inkOn(box.style.plastic)}>
              {box.title.length > 22 ? box.title.slice(0, 21) + '…' : box.title}
            </text>
          </>}
      <rect x={0} y={0} width={w} height={h} fill="none" {...STROKE} />
    </svg>
  );
}

// Glyphe loupe (44 px), posé au coin bas droit du dos, toujours visible.
const MAGNIFY_BUTTON = {
  position: 'absolute', right: 6, bottom: 6, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in',
  font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)', border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
} as const;

export function GameOutside({ box, geometry, onMagnify }: { box: GameBox; geometry: Geometry; onMagnify: () => void }): ReactElement {
  const uid = `wm-out-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { w, h } = geometry;
  const d = spineMmOf(box);
  const total = 2 * w + d;
  const pct = (v: number): string => `${r2((v / total) * 100)}%`;
  const zone = (left: number, width: number) => ({ position: 'absolute', top: 0, height: '100%', left: pct(left), width: pct(width) }) as const;
  return (
    <div data-game-outside="" style={{ position: 'absolute', inset: 0 }}>
      {/* Ombre nette : un aplat décalé (un filtre drop-shadow se décale mal sous le pivot 3D de la boîte). */}
      <div style={{ position: 'absolute', inset: 0, transform: 'translate(5px, 7px)', background: 'rgba(28,18,12,.32)', borderRadius: 3 }} />
      {/* Dos : la loupe s'ouvre au glyphe 🔍 (ou au toucher du dos). */}
      <div data-outside-zone="back" onClick={onMagnify} style={{ ...zone(0, w), cursor: 'zoom-in' }}>
        {box.backUrl
          ? <Scan url={box.backUrl} w={w} h={h} box={box} id={`${uid}-b`} fallback={<MadeBack box={box} />} />
          : (
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
              <MadeBack box={box} />
            </svg>
          )}
        <button type="button" data-action="magnify" aria-label="Loupe sur le dos de la boîte" title="Lire le dos"
          onClick={(e) => { e.stopPropagation(); onMagnify(); }} style={MAGNIFY_BUTTON}>🔍</button>
      </div>
      <div data-outside-zone="spine" style={zone(w, d)}>
        <svg viewBox={`0 0 ${d} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
          <GameSpine w={d} h={h} style={box.style} format={box.format} title={box.title} console={box.platformName}
            {...(box.logoUrl ? { logoUrl: box.logoUrl } : {})} {...(box.studio ? { studio: box.studio } : {})} />
        </svg>
      </div>
      <div data-outside-zone="front" style={zone(w + d, w)}>
        <Scan {...(box.frontUrl ? { url: box.frontUrl } : {})} w={w} h={h} box={box} id={`${uid}-f`} />
      </div>
    </div>
  );
}
