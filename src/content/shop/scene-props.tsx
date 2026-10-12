import { memo, type ReactElement } from 'react';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { INK } from '../../core/library/paint/cel';
import { mixHex, type Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { AccessorySprite } from '../shop-gesture-sprites';

// Objets d'interaction des commerces (G4b) : ce que le pantin prend, tend, paie, emporte. Dessinés en cellulo (aplat saturé,
// une ombre violet-bleu à bord net en bas à droite, un rehaut chaud en haut à gauche, trait encré), autour de (0, 0) = le poignet
// (accroche `handR`/`handL` du pantin), 4 à 7 unités du pantin (40 de haut) : derrière une vitrine (INSIDE_SCALE), 2 à 4 px.
// Teintés par le ciel comme les accessoires (`tone`). Aucun id (la scène est copiée dans chaque fenêtre par <use>).

// Palette cellulo d'une couleur : aplat, ombre (vers le violet-bleu), rehaut (vers le soleil), encre ; tout teinté par le ciel.
type Cel = { fill: string; shade: string; lit: string; ink: string };
const COOL = '#5A4A9C';
const SUN = '#FFF6D0';
const celOf = (c: string, sky: Sky): Cel => ({ fill: tone(c, sky), shade: tone(mixHex(c, COOL, 0.32), sky), lit: tone(mixHex(c, SUN, 0.45), sky), ink: tone(INK, sky) });
const f = (v: number): number => Math.round(v * 100) / 100;
const INK_W = 0.5;

// Boîte cellulo : aplat, ombre en L (bande droite + bande basse), rehaut en haut à gauche, encre.
function Box({ x, y, w, h, rx = 0, k, lit = true }: { x: number; y: number; w: number; h: number; rx?: number; k: Cel; lit?: boolean }): ReactElement {
  const sx = x + w * 0.7;
  const sy = y + h * 0.7;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={k.fill} />
      <path d={`M${f(sx)} ${f(y + 0.3)} H${f(x + w)} V${f(y + h)} H${f(x + 0.3)} V${f(sy)} H${f(sx)}Z`} fill={k.shade} />
      {lit && <line x1={x + 0.6} y1={y + 0.6} x2={x + w * 0.42} y2={y + 0.6} stroke={k.lit} strokeWidth={0.45} strokeLinecap="round" />}
      <rect x={x} y={y} width={w} height={h} rx={rx} fill="none" stroke={k.ink} strokeWidth={INK_W} strokeLinejoin="round" />
    </>
  );
}

// Ombre d'un disque : croissant en bas à droite (entre le disque et le même disque décalé vers la lumière), bord net.
function crescent(cx: number, cy: number, r: number): string {
  const d = 0.36 * r;
  const mx = cx - d / 2;
  const my = cy - d / 2;
  const h = Math.sqrt(r * r - (d * d) / 2);
  const vx = h / Math.SQRT2;
  const p1: readonly [number, number] = [mx + vx, my - vx];
  const p2: readonly [number, number] = [mx - vx, my + vx];
  return `M${f(p1[0])} ${f(p1[1])} A${f(r)} ${f(r)} 0 1 1 ${f(p2[0])} ${f(p2[1])} A${f(r)} ${f(r)} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z`;
}
// Disque cellulo : aplat, croissant d'ombre, point de rehaut, encre.
function Disc({ cx, cy, r, k }: { cx: number; cy: number; r: number; k: Cel }): ReactElement {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={k.fill} />
      <path d={crescent(cx, cy, r)} fill={k.shade} />
      <circle cx={cx - r * 0.4} cy={cy - r * 0.4} r={r * 0.2} fill={k.lit} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={k.ink} strokeWidth={INK_W} />
    </>
  );
}
// Forme cellulo libre : aplat `d`, ombre `shade` et rehaut `lit` facultatifs (chemins), encre sur l'aplat.
function Shape({ d, shade, lit, k, w = INK_W }: { d: string; shade?: string; lit?: string; k: Cel; w?: number }): ReactElement {
  return (
    <>
      <path d={d} fill={k.fill} />
      {shade && <path d={shade} fill={k.shade} />}
      {lit && <path d={lit} fill="none" stroke={k.lit} strokeWidth={0.45} strokeLinecap="round" />}
      <path d={d} fill="none" stroke={k.ink} strokeWidth={w} strokeLinejoin="round" />
    </>
  );
}

// Montures : deux verres arrondis teintés ciel, pont, branches ; dessin partagé par la monture tenue et la monture portée.
function Frames({ cx, cy, s, k, lens }: { cx: number; cy: number; s: number; k: Cel; lens: string }): ReactElement {
  const w = 1.5 * s;
  const h = 1 * s;
  return (
    <>
      <line x1={cx - 1.7 * s} y1={cy - 0.35 * s} x2={cx - 2.1 * s} y2={cy - 0.55 * s} stroke={k.fill} strokeWidth={0.2 * s} strokeLinecap="round" />
      <line x1={cx + 1.7 * s} y1={cy - 0.35 * s} x2={cx + 2.1 * s} y2={cy - 0.55 * s} stroke={k.fill} strokeWidth={0.2 * s} strokeLinecap="round" />
      {[-1, 1].map((d) => (
        <rect key={d} data-lens="" x={cx + d * 0.95 * s - w / 2} y={cy - h / 2} width={w} height={h} rx={0.4 * s} fill={lens} opacity={0.7} stroke={k.fill} strokeWidth={0.26 * s} />
      ))}
      <line x1={cx - 0.2 * s} y1={cy - 0.15 * s} x2={cx + 0.2 * s} y2={cy - 0.15 * s} stroke={k.fill} strokeWidth={0.2 * s} />
      <line x1={cx - 1.4 * s} y1={cy - 0.2 * s} x2={cx - 1.0 * s} y2={cy - 0.2 * s} stroke={k.lit} strokeWidth={0.18 * s} strokeLinecap="round" />
    </>
  );
}

// Paquet (ficelle croisée) : objet générique, aussi le repli d'« accessory » sans accessoire de métier.
function Parcel({ sky }: { sky: Sky }): ReactElement {
  const k = celOf('#D9AE6E', sky);
  const r = tone('#C0306A', sky);
  return (
    <>
      <Box x={-2.8} y={-2.4} w={5.6} h={4.8} k={k} />
      <rect x={-0.5} y={-2.4} width={1} height={4.8} fill={r} />
      <rect x={-2.8} y={-0.5} width={5.6} height={1} fill={r} />
      <path d="M-0.9 -0.4 L-1.8 -1.6 L-0.2 -0.6 L0.9 -1.7 L0.3 -0.4Z" fill={r} stroke={k.ink} strokeWidth={0.3} strokeLinejoin="round" />
    </>
  );
}

// ---------- Un dessin par PropId ----------
function propShape(id: PropId, sky: Sky, accessory: string | null): ReactElement {
  const ink = tone(INK, sky);
  switch (id) {
    // Pièce : disque doré, tranche encrée, rehaut.
    case 'coin': {
      const k = celOf('#E8B83A', sky);
      return (
        <>
          <Disc cx={0} cy={0} r={1.9} k={k} />
          <circle cx={0} cy={0} r={1.2} fill="none" stroke={k.shade} strokeWidth={0.3} />
        </>
      );
    }
    // Carte bancaire : rectangle bleu légèrement penché, puce dorée, bande.
    case 'card': {
      const k = celOf('#2E6FA0', sky);
      return (
        <g transform="rotate(-18)">
          <Box x={-2.8} y={-1.8} w={5.6} h={3.6} rx={0.4} k={k} />
          <rect x={-1.9} y={-0.6} width={1.2} height={1} rx={0.2} fill={tone('#E8C04A', sky)} stroke={k.ink} strokeWidth={0.25} />
          <rect x={-0.2} y={0.8} width={2.4} height={0.5} fill={k.lit} />
        </g>
      );
    }
    // Ticket de caisse : papier dentelé, lignes d'encre pâle.
    case 'ticket': {
      const k = celOf('#F6F1E4', sky);
      const d = 'M-1.6 -3 H1.6 V2.2 L1.1 2.7 L0.6 2.2 L0.1 2.7 L-0.4 2.2 L-0.9 2.7 L-1.4 2.2 L-1.6 2.4Z';
      return (
        <g transform="rotate(10)">
          <Shape d={d} shade="M0.7 -2.7 H1.6 V2.2 L1.1 2.7 L0.7 2.3Z" k={k} />
          {[-1.9, -1.1, -0.3, 0.5].map((y, i) => (
            <line key={y} x1={-1} y1={y} x2={i === 3 ? 0.2 : 1} y2={y} stroke={ink} strokeWidth={0.3} opacity={0.55} />
          ))}
        </g>
      );
    }
    // Menu du restaurant : carte bordeaux ouverte, page crème, filet doré.
    case 'menu': {
      const k = celOf('#8A2A3A', sky);
      return (
        <>
          <Box x={-2.4} y={-3.4} w={4.8} h={6.4} rx={0.2} k={k} lit={false} />
          <rect x={-1.9} y={-2.9} width={3.8} height={5.4} fill={tone('#F6EBD2', sky)} />
          <line x1={0} y1={-3.4} x2={0} y2={3} stroke={k.ink} strokeWidth={0.35} />
          <line x1={-1.4} y1={-2.2} x2={-0.5} y2={-2.2} stroke={tone('#C8A040', sky)} strokeWidth={0.4} />
          <line x1={0.5} y1={-2.2} x2={1.4} y2={-2.2} stroke={tone('#C8A040', sky)} strokeWidth={0.4} />
          {[-1.2, -0.4, 0.4, 1.2].map((y) => (
            <g key={y}>
              <line x1={-1.4} y1={y} x2={-0.5} y2={y} stroke={ink} strokeWidth={0.25} opacity={0.5} />
              <line x1={0.5} y1={y} x2={1.4} y2={y} stroke={ink} strokeWidth={0.25} opacity={0.5} />
            </g>
          ))}
        </>
      );
    }
    // Carnet de commande : bloc blanc à spirale, crayon jaune.
    case 'notepad': {
      const k = celOf('#F8F6EE', sky);
      const p = celOf('#F2C84A', sky);
      return (
        <>
          <Box x={-2} y={-2.6} w={4} h={5} rx={0.2} k={k} lit={false} />
          {[-1.3, -0.4, 0.5].map((x) => (
            <circle key={x} cx={x} cy={-2.6} r={0.35} fill="none" stroke={k.ink} strokeWidth={0.3} />
          ))}
          {[-1.2, -0.4, 0.4].map((y) => (
            <line key={y} x1={-1.3} y1={y} x2={1.2} y2={y} stroke={ink} strokeWidth={0.3} opacity={0.5} />
          ))}
          <g transform="translate(2.1 0.4) rotate(-30)">
            <rect x={-0.4} y={-2.4} width={0.8} height={4.4} fill={p.fill} />
            <rect x={0} y={-2.4} width={0.4} height={4.4} fill={p.shade} />
            <path d="M-0.4 2 L0 3 L0.4 2Z" fill={tone('#E8C9A0', sky)} />
            <path d="M-0.4 -2.4 H0.4 V2 L0 3 L-0.4 2Z" fill="none" stroke={k.ink} strokeWidth={0.3} strokeLinejoin="round" />
          </g>
        </>
      );
    }
    // Assiette garnie : ovale blanc, plat brun, touche de vert.
    case 'plate': {
      const k = celOf('#FFFFFF', sky);
      return (
        <>
          <ellipse cx={0} cy={0.6} rx={4} ry={1.4} fill={k.fill} />
          <path d="M-3.9 0.9 A4 1.4 0 0 0 3.9 0.9 A3.4 1 0 0 1 -3.9 0.9Z" fill={k.shade} />
          <ellipse cx={0} cy={0.6} rx={4} ry={1.4} fill="none" stroke={k.ink} strokeWidth={INK_W} />
          <ellipse cx={0} cy={0} rx={2.1} ry={0.9} fill={tone('#A8743A', sky)} stroke={k.ink} strokeWidth={0.35} />
          <ellipse cx={0.3} cy={-0.3} rx={1.2} ry={0.4} fill={tone('#C9925A', sky)} />
          <circle cx={-1.3} cy={-0.3} r={0.5} fill={tone('#6AAA2A', sky)} />
          <line x1={-3} y1={0.3} x2={-2} y2={0.1} stroke={k.lit} strokeWidth={0.4} strokeLinecap="round" />
        </>
      );
    }
    // Verre de vin : calice teinté, vin rouge, pied, rehaut vertical.
    case 'glass': {
      const g = celOf('#D8ECF4', sky);
      const w = tone('#8A1A2A', sky);
      const bowl = 'M-1.7 -3.6 H1.7 Q1.9 -0.4 0 0.2 Q-1.9 -0.4 -1.7 -3.6Z';
      return (
        <>
          <path d={bowl} fill={g.fill} opacity={0.75} />
          <path d="M-1.55 -2 Q-1.4 -0.4 0 0.2 Q1.4 -0.4 1.55 -2Z" fill={w} />
          <path d="M0.6 -2 Q1.5 -1.3 0 0.2 Q1.4 -0.4 1.55 -2Z" fill={tone(mixHex('#8A1A2A', COOL, 0.3), sky)} />
          <line x1={0} y1={0.2} x2={0} y2={2.2} stroke={g.ink} strokeWidth={0.4} />
          <line x1={-1.2} y1={2.4} x2={1.2} y2={2.4} stroke={g.ink} strokeWidth={0.5} strokeLinecap="round" />
          <line x1={-1.1} y1={-3} x2={-1} y2={-1.6} stroke={g.lit} strokeWidth={0.4} strokeLinecap="round" />
          <path d={bowl} fill="none" stroke={g.ink} strokeWidth={0.4} strokeLinejoin="round" />
        </>
      );
    }
    case 'parcel':
      return <Parcel sky={sky} />;
    // Bouquet emballé : cône de papier, tiges, trois fleurs, feuille.
    case 'bouquet': {
      const p = celOf('#F4E4C8', sky);
      const green = tone('#3A8A3A', sky);
      return (
        <>
          <line x1={-1.2} y1={-1.6} x2={-0.4} y2={0.6} stroke={green} strokeWidth={0.35} />
          <line x1={1.2} y1={-1.8} x2={0.3} y2={0.6} stroke={green} strokeWidth={0.35} />
          <line x1={0} y1={-2.6} x2={0} y2={0.6} stroke={green} strokeWidth={0.35} />
          <path d="M-1.9 -1.4 Q-2.6 -2.6 -1.4 -2.9 Q-1.1 -1.9 -1.9 -1.4Z" fill={green} stroke={p.ink} strokeWidth={0.25} />
          <Disc cx={-1.5} cy={-2.4} r={1.1} k={celOf('#E8486A', sky)} />
          <Disc cx={1.5} cy={-2.6} r={1.1} k={celOf('#F2C94A', sky)} />
          <Disc cx={0} cy={-3.6} r={1.1} k={celOf('#B05ACF', sky)} />
          <Shape d="M-2.4 -0.6 L2.4 -0.6 L0.4 3.6 L-0.4 3.6Z" shade="M0.6 -0.6 H2.4 L0.4 3.6 H0.1Z" lit="M-1.5 0 L-0.9 1.4" k={p} />
          <line x1={-2.4} y1={-0.6} x2={2.4} y2={-0.6} stroke={tone('#C0306A', sky)} strokeWidth={0.5} />
        </>
      );
    }
    // Monture tenue par l'opticien (les montures essayées se dessinent sur le visage : WornFrames).
    case 'frames':
      return <Frames cx={0} cy={0} s={1.25} k={celOf('#2A2A3A', sky)} lens={tone('#CFE6F2', sky)} />;
    // Miroir à main : cadre doré ovale, glace bleutée, reflet en biais, manche.
    case 'mirror': {
      const k = celOf('#C8A040', sky);
      const g = tone('#CFE6F2', sky);
      return (
        <>
          <line x1={0} y1={2.4} x2={0.4} y2={4.4} stroke={k.ink} strokeWidth={1.1} strokeLinecap="round" />
          <line x1={0} y1={2.4} x2={0.4} y2={4.4} stroke={k.fill} strokeWidth={0.6} strokeLinecap="round" />
          <ellipse cx={0} cy={0} rx={2.6} ry={2.9} fill={k.fill} />
          <path d="M2.3 -1.4 A2.6 2.9 0 0 1 -1.8 2.1 A2 2.3 0 0 0 2.3 -1.4Z" fill={k.shade} />
          <ellipse cx={0} cy={0} rx={1.9} ry={2.2} fill={g} />
          <line x1={-0.9} y1={1.1} x2={0.7} y2={-1.3} stroke={tone('#FFFFFF', sky)} strokeWidth={0.5} strokeLinecap="round" />
          <ellipse cx={0} cy={0} rx={1.9} ry={2.2} fill="none" stroke={k.ink} strokeWidth={0.3} />
          <ellipse cx={0} cy={0} rx={2.6} ry={2.9} fill="none" stroke={k.ink} strokeWidth={INK_W} />
        </>
      );
    }
    // Échantillon : cube de fromage sur une pique.
    case 'sample': {
      const k = celOf('#F2C84A', sky);
      return (
        <>
          <line x1={0} y1={-1.2} x2={0.6} y2={2.6} stroke={tone('#E8C9A0', sky)} strokeWidth={0.45} strokeLinecap="round" />
          <line x1={0} y1={-1.2} x2={0.6} y2={2.6} stroke={k.ink} strokeWidth={0.2} opacity={0.6} />
          <Shape d="M-1.4 -2.4 L0.6 -3.2 L1.6 -2.2 L1.6 -0.4 L-0.4 0.4 L-1.4 -0.6Z" shade="M-0.4 -1.4 L1.6 -2.2 V-0.4 L-0.4 0.4Z" lit="M-1 -1.9 L-0.2 -2.2" k={k} />
          <circle cx={0.5} cy={-1.3} r={0.25} fill={k.shade} />
        </>
      );
    }
    // Tasse de café : tasse blanche, café, anse, soucoupe.
    case 'cup': {
      const k = celOf('#FFFFFF', sky);
      return (
        <>
          <ellipse cx={0} cy={2} rx={3.1} ry={0.8} fill={k.fill} stroke={k.ink} strokeWidth={0.4} />
          <path d="M-3 2.1 A3.1 0.8 0 0 0 3 2.1 A2.4 0.5 0 0 1 -3 2.1Z" fill={k.shade} />
          <path d="M1.9 -0.9 Q3.6 -0.4 1.7 1.1" fill="none" stroke={k.ink} strokeWidth={1} strokeLinecap="round" />
          <path d="M1.9 -0.9 Q3.6 -0.4 1.7 1.1" fill="none" stroke={k.fill} strokeWidth={0.5} strokeLinecap="round" />
          <Shape d="M-2.1 -1.6 H2.1 L1.6 1.8 H-1.6Z" shade="M0.9 -1.6 H2.1 L1.6 1.8 H0.6Z" k={k} />
          <ellipse cx={0} cy={-1.6} rx={2.1} ry={0.6} fill={tone('#5A2E1A', sky)} stroke={k.ink} strokeWidth={0.3} />
          <line x1={-1.5} y1={-0.9} x2={-1.3} y2={0.6} stroke={k.lit} strokeWidth={0.4} strokeLinecap="round" />
        </>
      );
    }
    // Livre : couverture bleue, tranche crème, titre.
    case 'book': {
      const k = celOf('#2E6FA0', sky);
      return (
        <>
          <Box x={-2.5} y={-3} w={5} h={6} rx={0.2} k={k} />
          <rect x={1.9} y={-2.7} width={0.8} height={5.4} fill={tone('#F6EBD2', sky)} />
          <line x1={1.9} y1={-2.7} x2={1.9} y2={2.7} stroke={k.ink} strokeWidth={0.25} />
          <rect x={-1.7} y={-1.8} width={2.8} height={0.5} fill={tone('#E8C04A', sky)} />
        </>
      );
    }
    // Sac de courses en papier kraft, poignées de ficelle.
    case 'bag': {
      const k = celOf('#E2D0A8', sky);
      return (
        <>
          <path d="M-1.5 -2.6 Q0 -4.6 1.5 -2.6" fill="none" stroke={k.ink} strokeWidth={0.4} />
          <Box x={-2.6} y={-2.6} w={5.2} h={5.6} rx={0.2} k={k} />
          <line x1={-1.5} y1={-2.6} x2={-1.5} y2={-1.6} stroke={k.ink} strokeWidth={0.3} />
          <line x1={1.5} y1={-2.6} x2={1.5} y2={-1.6} stroke={k.ink} strokeWidth={0.3} />
          <circle cx={0} cy={0.6} r={0.7} fill={tone('#C0306A', sky)} />
        </>
      );
    }
    // Accessoire du métier (existant) ; sans accessoire, un paquet.
    case 'accessory':
      return accessory ? <AccessorySprite id={accessory} sky={sky} ghibli /> : <Parcel sky={sky} />;
  }
}

export function PropSprite({ id, sky, accessory }: { id: PropId; sky: Sky; accessory: string | null }): ReactElement {
  return <g data-prop={id}>{propShape(id, sky, accessory)}</g>;
}

// ---------- Montures portées ----------
// Lunettes dessinées sur le visage, accrochées à l'ancre `head` (centre de la tête, rayon HEAD_R = 4,4) : `yaw` est l'orientation
// de la tête (yaw du pantin + rotation de tête, crans de π/8 ; 0 regarde à droite, 4 vers le spectateur, 8 à gauche, 12 de dos).
// Même repère que bake.ts : avant F = (cos a, 0, sin a), côté R = (−sin a, 0, cos a), z vers le spectateur, caméra plongeante
// de 12°. Chaque verre est posé au point de l'œil projeté, aplati selon l'angle (ellipse) ; un verre derrière la tête (profondeur
// faible) n'est pas dessiné, les branches vont du verre à l'oreille visible. De dos (visage caché) : rien.
const HEAD_R = 4.4;
const ELEV = (12 * Math.PI) / 180;
const CA = Math.cos(ELEV);
const SA = Math.sin(ELEV);
type V3 = readonly [number, number, number];
const proj = (p: V3): readonly [number, number, number] => [p[0], -(p[1] * CA - p[2] * SA), p[2] * CA + p[1] * SA];

export function WornFrames({ yaw, sky, color = '#2A2A3A' }: { yaw: number; sky: Sky; color?: string }): ReactElement | null {
  const a = (yaw * Math.PI) / 8;
  const F: V3 = [Math.cos(a), 0, Math.sin(a)];
  const R: V3 = [-Math.sin(a), 0, Math.cos(a)];
  if (F[2] < -0.2) return null; // de dos
  const k = celOf(color, sky);
  const lens = tone('#CFE6F2', sky);
  const at = (fw: number, side: number, up: number): V3 => [F[0] * fw + R[0] * side, up, F[2] * fw + R[2] * side];
  const rx = f(1.3 * Math.abs(F[2]) + 0.3 * Math.abs(F[0]));
  const eyes = [-1, 1]
    .map((s) => ({ s, e: proj(at(HEAD_R * 0.86, s * 1.5, -0.3)), ear: proj(at(0.4, s * (HEAD_R - 0.2), 0)) }))
    .filter(({ e }) => e[2] > 0.3)
    .sort((p, q) => p.e[2] - q.e[2]); // le verre le plus loin d'abord
  if (eyes.length === 0) return null;
  const near = eyes[eyes.length - 1]!;
  return (
    <g data-worn-frames="">
      {eyes.map(({ s, e, ear }) =>
        ear[2] > 0 ? <line key={s} x1={f(e[0] + s * rx * 0.6)} y1={f(e[1] - 0.2)} x2={f(ear[0])} y2={f(ear[1] - 0.4)} stroke={k.fill} strokeWidth={0.3} strokeLinecap="round" /> : null,
      )}
      {eyes.length === 2 && <line x1={f(eyes[0]!.e[0])} y1={f(eyes[0]!.e[1] - 0.15)} x2={f(eyes[1]!.e[0])} y2={f(eyes[1]!.e[1] - 0.15)} stroke={k.fill} strokeWidth={0.3} />}
      {eyes.map(({ s, e }) => (
        <ellipse key={s} data-lens="" cx={f(e[0])} cy={f(e[1])} rx={rx} ry={1} fill={lens} opacity={0.7} stroke={k.fill} strokeWidth={0.35} />
      ))}
      <line x1={f(near.e[0] - rx * 0.5)} y1={f(near.e[1] - 0.35)} x2={f(near.e[0] - rx * 0.1)} y2={f(near.e[1] - 0.35)} stroke={k.lit} strokeWidth={0.25} strokeLinecap="round" />
    </g>
  );
}

// Versions mémoïsées pour les nœuds pré-rendus de la scène des commerces (le ciel ne change qu'à la minute) : un re-rendu de la
// scène ne redessine pas les objets cachés.
export const PropSpriteMemo = memo(PropSprite);
export const WornFramesMemo = memo(WornFrames);
