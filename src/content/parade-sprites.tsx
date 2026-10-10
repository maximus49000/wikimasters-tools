import type { ReactElement, ReactNode } from 'react';
import { outfitFor } from '../core/library/city/people';
import type { ParadeKind, ParadeUnit } from '../core/library/city/parade';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';

// Cortège du 14 juillet (spec §7.4, tâche 13). Repère de chaque unité : sol à y = 0, centre de l'unité à x = 0, regard vers
// +x, dans l'échelle des véhicules (l'appelant applique `unit × STREET_SCALE.vehicle`). Les marcheurs sont dessinés dans le
// repère d'un passant (40 de haut) puis réduits de FIG, pour avoir la taille des passants. Couleurs et tenues tirées de
// `unit.variant` et de `unit.id` (jamais de hasard). Animations SMIL seulement hors mouvement réduit, toutes avec `begin` = 0 :
// elles suivent la ligne de temps du document, donc toutes les unités marchent au même pas, quel que soit l'instant de leur
// montage. Chaque figurant à pied
// ou à cheval porte `data-worker` : il compte dans le plafond des figurants (shopSpriteBudget).

type Props = { unit: ParadeUnit; sky: Sky; still: boolean };
type Tint = (c: string) => string;

const BLUE = '#2B4FA0';
const WHITE = '#F2F2F2';
const RED = '#C0302B';
const BRASS = '#D9A93A';
const STEEL = '#B9C0C8';
const BLACK = '#1C1C22';
const TYRE = '#222222';
const GLASS = '#CFE4F2';
// Réduction des figurants à pied (repère d'un passant → repère des véhicules) : ≈ la taille des passants du trottoir.
export const FIG = 0.7;
const STEP_S = 1; // pas cadencé : 120 pas par minute

const pickOf = <T,>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))]!;
const skinsOf = (id: string, n: number): string[] => {
  const rng = mulberry32(hashString(`parade-${id}`));
  return Array.from({ length: n }, () => outfitFor('ordinary', rng).skin);
};

// ---------- Marcheur (repère d'un passant : pieds à y = 0, tête à y = -33) ----------
type Headwear = 'kepi' | 'beret' | 'shako' | 'bachi' | 'plume';
type Dress = { tunic: string; trousers: string; stripe?: string; head: Headwear; cap: string; capTop?: string; belt: string; skin: string };

function Headgear({ d, t }: { d: Dress; t: Tint }): ReactElement {
  switch (d.head) {
    case 'kepi':
      return (
        <g>
          <path d="M-4.2 -36 L-3.8 -42.5 H3.8 L4.2 -36Z" fill={t(d.cap)} />
          <rect x={-3.8} y={-43.4} width={7.6} height={1.4} fill={t(d.capTop ?? d.cap)} />
          <rect x={1.8} y={-36.6} width={4.4} height={1.3} rx={0.5} fill={t(BLACK)} />
        </g>
      );
    case 'beret':
      // Grande « tarte » des chasseurs alpins, penchée sur le côté.
      return <ellipse cx={-1.6} cy={-37.6} rx={7} ry={2.6} fill={t(d.cap)} />;
    case 'shako':
      // Shako à casoar (plumet blanc et rouge).
      return (
        <g>
          <path d="M-4.2 -36 L-4 -44 H4 L4.2 -36Z" fill={t(d.cap)} />
          <rect x={1.8} y={-36.6} width={4.4} height={1.3} rx={0.5} fill={t(BLACK)} />
          <path d="M0 -44 Q-3 -50 -1 -55 Q2 -50 0 -44Z" fill={t(WHITE)} />
          <path d="M0 -50 Q-1.4 -53 -0.6 -55 Q1.2 -53 0 -50Z" fill={t(RED)} />
        </g>
      );
    case 'bachi':
      // Bachi des marins : bonnet blanc à pompon rouge.
      return (
        <g>
          <path d="M-4.6 -36.5 Q0 -40.5 4.6 -36.5Z" fill={t(WHITE)} />
          <rect x={-4.6} y={-37} width={9.2} height={1.4} fill={t(BLACK)} />
          <circle cx={0} cy={-40} r={1.5} fill={t(RED)} />
        </g>
      );
    case 'plume':
      // Chef de musique : képi et haut plumet tricolore.
      return (
        <g>
          <path d="M-4.2 -36 L-3.8 -42.5 H3.8 L4.2 -36Z" fill={t(d.cap)} />
          <rect x={1.8} y={-36.6} width={4.4} height={1.3} rx={0.5} fill={t(BLACK)} />
          <path d="M0 -42 Q-2.6 -48 0 -54 Q2.6 -48 0 -42Z" fill={t(RED)} />
          <path d="M0 -46 Q-1.4 -49 0 -52 Q1.4 -49 0 -46Z" fill={t(WHITE)} />
        </g>
      );
  }
}

// Jambes à pas cadencé (pivot à la hanche), en opposition de phase.
function Legs({ d, t, anim, begin }: { d: Dress; t: Tint; anim: boolean; begin: string }): ReactElement {
  const leg = (sign: 1 | -1): ReactElement => (
    <g>
      {anim && <animateTransform attributeName="transform" type="rotate" values={`${-16 * sign} 0 -15;${16 * sign} 0 -15;${-16 * sign} 0 -15`} dur={`${STEP_S}s`} begin={begin} repeatCount="indefinite" />}
      <rect x={-1.7} y={-15} width={3.4} height={14} fill={t(d.trousers)} />
      {d.stripe && <rect x={-0.3} y={-15} width={0.8} height={13} fill={t(d.stripe)} />}
      <rect x={-1.9} y={-2} width={4.6} height={2} rx={0.6} fill={t(BLACK)} />
    </g>
  );
  return (
    <g>
      {leg(1)}
      {leg(-1)}
    </g>
  );
}

// Marcheur : `front` = bras ou objet tenu devant (instrument, fusil, hampe) ; sinon le bras balance au pas.
function Marcher({ d, t, anim, begin, children }: { d: Dress; t: Tint; anim: boolean; begin: string; children?: ReactNode }): ReactElement {
  return (
    <g data-worker="" data-parade-figure="">
      <Legs d={d} t={t} anim={anim} begin={begin} />
      <rect x={-5} y={-28} width={10} height={14} rx={2} fill={t(d.tunic)} />
      <rect x={-5} y={-18} width={10} height={1.6} fill={t(d.belt)} />
      <circle cx={0} cy={-33} r={4.4} fill={t(d.skin)} />
      <Headgear d={d} t={t} />
      {children ?? (
        <g>
          {anim && <animateTransform attributeName="transform" type="rotate" values="14 0 -26;-14 0 -26;14 0 -26" dur={`${STEP_S}s`} begin={begin} repeatCount="indefinite" />}
          <path d="M0 -26 L0 -17" stroke={t(d.tunic)} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={0} cy={-16.4} r={1.3} fill={t(d.skin)} />
        </g>
      )}
    </g>
  );
}

// ---------- Instruments (repère du marcheur) ----------
type Instrument = 'tuba' | 'trumpet' | 'bass-drum' | 'snare' | 'bugle' | 'baton';
function InstrumentArt({ kind, d, t, anim, begin }: { kind: Instrument; d: Dress; t: Tint; anim: boolean; begin: string }): ReactElement {
  const brass = t(BRASS);
  const arm = (x2: number, y2: number): ReactElement => <path d={`M0 -26 L${x2} ${y2}`} stroke={t(d.tunic)} strokeWidth={2.4} strokeLinecap="round" />;
  switch (kind) {
    case 'tuba':
      return (
        <g data-instrument="tuba">
          {arm(5, -22)}
          <ellipse cx={4} cy={-22} rx={3.4} ry={6.5} fill="none" stroke={brass} strokeWidth={1.8} />
          <path d="M3 -28 L-2 -44 H8 L5 -28Z" fill={brass} />
          <ellipse cx={3} cy={-44} rx={5} ry={1.3} fill={t('#8A6A1E')} />
        </g>
      );
    case 'trumpet':
      return (
        <g data-instrument="trumpet">
          {arm(6, -30)}
          <line x1={3} y1={-32} x2={13} y2={-31} stroke={brass} strokeWidth={1.2} />
          <path d="M12 -31 L17 -34 V-28Z" fill={brass} />
          <rect x={6} y={-33.4} width={3} height={2} fill={brass} />
        </g>
      );
    case 'bass-drum':
      return (
        <g data-instrument="bass-drum">
          <circle cx={6} cy={-21} r={8} fill={t(WHITE)} stroke={t(RED)} strokeWidth={1.6} />
          <circle cx={6} cy={-21} r={2} fill={t(BLUE)} />
          <g>
            {anim && <animateTransform attributeName="transform" type="rotate" values="0 0 -26;-30 0 -26;0 0 -26" dur={`${STEP_S}s`} begin={begin} repeatCount="indefinite" />}
            {arm(9, -30)}
            <line x1={9} y1={-30} x2={12} y2={-26} stroke={t('#6B4A2A')} strokeWidth={1} />
            <circle cx={12.4} cy={-25.6} r={1.6} fill={t(WHITE)} />
          </g>
        </g>
      );
    case 'snare':
      return (
        <g data-instrument="snare">
          <rect x={2} y={-19} width={9} height={5} fill={t(WHITE)} stroke={t(RED)} strokeWidth={0.8} />
          <path d="M2 -19 L4.2 -14 L6.4 -19 L8.6 -14 L11 -19" stroke={t(BLUE)} strokeWidth={0.6} fill="none" />
          <g>
            {anim && <animateTransform attributeName="transform" type="rotate" values="0 0 -26;-22 0 -26;0 0 -26" dur={`${STEP_S / 2}s`} begin={begin} repeatCount="indefinite" />}
            {arm(5, -21)}
            <line x1={5} y1={-21} x2={9} y2={-20} stroke={t('#6B4A2A')} strokeWidth={0.8} />
          </g>
        </g>
      );
    case 'bugle':
      return (
        <g data-instrument="bugle">
          {arm(5, -29)}
          <ellipse cx={7} cy={-29} rx={3} ry={2} fill="none" stroke={brass} strokeWidth={1} />
          <line x1={3} y1={-32} x2={8} y2={-31} stroke={brass} strokeWidth={1} />
          <path d="M9 -30 L14 -33 V-26Z" fill={brass} />
          {/* Fanion du clairon */}
          <path d="M8 -28 H13 V-24 L10.5 -25.4 L8 -24Z" fill={t(RED)} />
        </g>
      );
    case 'baton':
      // Canne du tambour-major, levée et battue au pas.
      return (
        <g data-instrument="baton">
          <g>
            {anim && <animateTransform attributeName="transform" type="rotate" values="-10 0 -26;25 0 -26;-10 0 -26" dur={`${STEP_S * 2}s`} begin={begin} repeatCount="indefinite" />}
            {arm(4, -36)}
            <line x1={4} y1={-36} x2={9} y2={-52} stroke={t(BLACK)} strokeWidth={1} />
            <circle cx={9.3} cy={-53} r={1.8} fill={brass} />
          </g>
        </g>
      );
  }
}

// Fusil à l'épaule : crosse tenue devant à la hanche, canon incliné vers l'arrière au-dessus de l'épaule.
function Rifle({ d, t }: { d: Dress; t: Tint }): ReactElement {
  return (
    <g data-rifle="">
      <line x1={4} y1={-19} x2={-5} y2={-46} stroke={t('#2E2A24')} strokeWidth={1.4} />
      <path d="M2.6 -21 L5.4 -17 L7 -19 L4.4 -22Z" fill={t('#5A3E26')} />
      <path d="M0 -26 L4.4 -20" stroke={t(d.tunic)} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

// Drapeau tricolore : hampe à x = 0, tissu vers l'arrière (−x, bleu à la hampe), haut à y = top.
function Tricolore({ t, top, w, h, anim }: { t: Tint; top: number; w: number; h: number; anim: boolean }): ReactElement {
  const b = w / 3;
  return (
    <g data-tricolore="">
      {anim && <animateTransform attributeName="transform" type="skewY" values="0;-6;0;5;0" dur="1.7s" repeatCount="indefinite" />}
      <rect x={-b} y={top} width={b} height={h} fill={t(BLUE)} />
      <rect x={-2 * b} y={top} width={b} height={h} fill={t(WHITE)} />
      <rect x={-3 * b} y={top} width={b} height={h} fill={t(RED)} />
    </g>
  );
}

// Un figurant en repère d'unité : position x (repère des véhicules), réduit de FIG.
const at = (x: number, node: ReactElement, key: number | string, dy = 0): ReactElement => (
  <g key={key} transform={`translate(${x} ${dy}) scale(${FIG})`}>
    {node}
  </g>
);

// ---------- Tenues ----------
const BAND_DRESS: readonly Omit<Dress, 'skin' | 'head'>[] = [
  // Garde républicaine : tunique bleu nuit, pantalon à bande rouge.
  { tunic: '#1F2A4A', trousers: '#16192A', stripe: RED, cap: '#1F2A4A', capTop: RED, belt: WHITE },
  // Légion étrangère : tunique kaki, ceinture bleue, képi blanc.
  { tunic: '#B9A57A', trousers: '#B9A57A', cap: WHITE, capTop: WHITE, belt: '#2B4FA0' },
  // Musique de l'Air : bleu, ceinture blanche.
  { tunic: '#2C3E66', trousers: '#2C3E66', cap: '#2C3E66', capTop: '#2C3E66', belt: WHITE },
];
const INFANTRY_DRESS: readonly Omit<Dress, 'skin'>[] = [
  { tunic: '#1F2A4A', trousers: '#B02A2A', head: 'shako', cap: BLACK, belt: WHITE }, // Saint-Cyriens
  { tunic: '#B9A57A', trousers: '#B9A57A', head: 'kepi', cap: WHITE, capTop: WHITE, belt: '#2B4FA0' }, // Légion
  { tunic: '#1E2B4C', trousers: '#1E2B4C', head: 'beret', cap: '#1A2440', belt: '#D8D8D8' }, // chasseurs alpins
  { tunic: '#1A2238', trousers: '#1A2238', head: 'bachi', cap: WHITE, belt: WHITE }, // marins
];

// ---------- Unités ----------
function Band({ unit, t, anim, begin }: UnitArt): ReactElement {
  const base = pickOf(BAND_DRESS, unit.variant);
  const skins = skinsOf(unit.id, 6);
  // De l'arrière vers l'avant : tuba, grosse caisse, caisse claire, trompette, clairon, et le chef en tête.
  const row: Instrument[] = ['tuba', 'bass-drum', 'snare', 'trumpet', 'bugle', 'baton'];
  return (
    <g>
      {row.map((inst, i) => {
        const d: Dress = { ...base, skin: skins[i]!, head: inst === 'baton' ? 'plume' : 'kepi' };
        return at(-75 + i * 30, <Marcher d={d} t={t} anim={anim} begin={begin}><InstrumentArt kind={inst} d={d} t={t} anim={anim} begin={begin} /></Marcher>, inst);
      })}
    </g>
  );
}

function Infantry({ unit, t, anim, begin }: UnitArt): ReactElement {
  const base = pickOf(INFANTRY_DRESS, unit.variant);
  const skins = skinsOf(unit.id, 8);
  return (
    <g>
      {skins.map((skin, i) => {
        const d: Dress = { ...base, skin };
        return at(-70 + i * 20, <Marcher d={d} t={t} anim={anim} begin={begin}><Rifle d={d} t={t} /></Marcher>, i);
      })}
    </g>
  );
}

function Flags({ unit, t, anim, begin }: UnitArt): ReactElement {
  const base = pickOf(INFANTRY_DRESS, (unit.variant * 7) % 1);
  const skins = skinsOf(unit.id, 3);
  return (
    <g>
      {skins.map((skin, i) => {
        const d: Dress = { ...base, skin, head: base.head === 'shako' ? 'kepi' : base.head, cap: base.head === 'shako' ? '#1F2A4A' : base.cap };
        return at(
          -32 + i * 32,
          <Marcher d={d} t={t} anim={anim} begin={begin}>
            <g data-flag-bearer="">
              <line x1={5} y1={-14} x2={5} y2={-66} stroke={t('#6B5B4A')} strokeWidth={1.2} />
              <circle cx={5} cy={-67} r={1.4} fill={t(BRASS)} />
              <g transform="translate(5 0)">
                <Tricolore t={t} top={-65} w={27} h={18} anim={anim} />
              </g>
              <path d="M0 -26 L5 -24" stroke={t(d.tunic)} strokeWidth={2.4} strokeLinecap="round" />
            </g>
          </Marcher>,
          i,
        );
      })}
    </g>
  );
}

// Motard de la Garde : casque blanc, gyrophare bleu.
function Motorbike({ t, anim, skin }: { t: Tint; anim: boolean; skin: string }): ReactElement {
  return (
    <g>
      <circle cx={-11} cy={-6} r={6} fill={t(TYRE)} />
      <circle cx={-11} cy={-6} r={2.4} fill={t(STEEL)} />
      <circle cx={11} cy={-6} r={6} fill={t(TYRE)} />
      <circle cx={11} cy={-6} r={2.4} fill={t(STEEL)} />
      <path d="M-13 -10 L-4 -16 H6 L13 -9 L9 -6 H-8Z" fill={t(WHITE)} />
      <path d="M6 -16 L11 -24 L13 -23 L9 -15Z" fill={t(GLASS)} opacity={0.8} />
      <rect x={-12} y={-14} width={6} height={4} fill={t(BLUE)} />
      <circle cx={-12} cy={-17} r={1.4} fill="#4F7BFF">{anim && <animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite" />}</circle>
      {/* Pilote : veste bleu nuit, culotte, bottes, casque blanc. */}
      <g data-worker="" data-parade-figure="">
        <path d="M-4 -16 L2 -14 L1 -7" stroke={t('#1F2A4A')} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <rect x={0} y={-9} width={2.6} height={4} fill={t(BLACK)} />
        <path d="M-6 -16 L-3 -27 L2 -26 L-1 -15Z" fill={t('#1F2A4A')} />
        <path d="M0 -25 L6 -18" stroke={t('#1F2A4A')} strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={-0.6} cy={-30} r={3} fill={t(skin)} />
        <path d="M-3.8 -30 A3.4 3.4 0 0 1 3.2 -30.6 L3.2 -29 H-3.8Z" fill={t(WHITE)} />
      </g>
    </g>
  );
}
function Motorbikes({ unit, t, anim }: UnitArt): ReactElement {
  const [a, b] = skinsOf(unit.id, 2);
  // Côte à côte : la moto du fond (un peu plus haut, un peu plus petite) est dessinée d'abord.
  return (
    <g>
      <g transform="translate(-6 -3) scale(0.95)"><Motorbike t={t} anim={anim} skin={a!} /></g>
      <g transform="translate(6 0)"><Motorbike t={t} anim={anim} skin={b!} /></g>
    </g>
  );
}

// Cavalier de la Garde : cheval au pas (bipèdes diagonaux), cuirasse, casque à crinière et plumet rouge.
function Horseman({ t, anim, begin, coat, skin }: { t: Tint; anim: boolean; begin: string; coat: string; skin: string }): ReactElement {
  const c = t(coat);
  const leg = (x: number, sign: 1 | -1): ReactElement => (
    <g key={x}>
      {anim && <animateTransform attributeName="transform" type="rotate" values={`${-18 * sign} ${x} -14;${18 * sign} ${x} -14;${-18 * sign} ${x} -14`} dur="0.9s" begin={begin} repeatCount="indefinite" />}
      <rect x={x - 1.1} y={-14} width={2.2} height={13} fill={c} />
      <rect x={x - 1.3} y={-1.6} width={2.8} height={1.6} fill={t(BLACK)} />
    </g>
  );
  return (
    <g>
      {/* Pattes du fond (plus sombres) puis du premier plan. */}
      <g opacity={0.75}>{[leg(-10, -1), leg(10, 1)]}</g>
      <ellipse cx={0} cy={-18} rx={14} ry={6} fill={c} />
      <path d="M-14 -19 Q-21 -15 -19 -6" stroke={t('#2A1A10')} strokeWidth={2.2} fill="none" />
      <path d="M10 -21 L16 -32 L20 -31 L15 -19Z" fill={c} />
      <path d="M15 -33 L24 -29 L23 -26 L15 -28Z" fill={c} />
      <path d="M14 -33 L11 -24" stroke={t('#2A1A10')} strokeWidth={1.4} />
      {[leg(-8, 1), leg(12, -1)]}
      {/* Tapis de selle bleu à galon blanc */}
      <rect x={-6} y={-24} width={10} height={6} fill={t('#1F2A4A')} stroke={t(WHITE)} strokeWidth={0.5} />
      <g data-worker="" data-parade-figure="">
        <path d="M-1 -23 L2 -17 L1 -11" stroke={t(WHITE)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        <rect x={-0.2} y={-13} width={2.6} height={5} fill={t(BLACK)} />
        <rect x={-4} y={-35} width={7} height={12} rx={1.5} fill={t('#1F2A4A')} />
        <path d="M-4 -35 H3 L3.5 -27 H-4.5Z" fill={t(STEEL)} />
        <path d="M2 -31 L8 -26" stroke={t('#1F2A4A')} strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={0} cy={-39} r={3} fill={t(skin)} />
        <path d="M-3.4 -39.4 A3.4 3.4 0 0 1 3.4 -39.4Z" fill={t(STEEL)} />
        <path d="M-3 -42 Q-1 -44 3 -42 Q-2 -41 -7 -36" stroke={t(BLACK)} strokeWidth={1.2} fill="none" />
        <path d="M-1 -42 Q-2.4 -46 -0.4 -49 Q1 -46 -1 -42Z" fill={t(RED)} />
      </g>
    </g>
  );
}
function Cavalry({ unit, t, anim, begin }: UnitArt): ReactElement {
  const coats = ['#6B3F22', '#3A2416', '#8A5530'];
  const rng = mulberry32(hashString(`horses-${unit.id}`));
  const skins = skinsOf(unit.id, 3);
  return (
    <g>
      {skins.map((skin, i) => (
        <g key={i} transform={`translate(${-50 + i * 50} 0)`}>
          <Horseman t={t} anim={anim} begin={begin} coat={pickOf(coats, (unit.variant + rng()) % 1)} skin={skin} />
        </g>
      ))}
    </g>
  );
}

const ARMY = ['#4B5320', '#5B5B3A', '#B49A6A'] as const; // vert armée, kaki, sable

// Jeep pavoisée : deux petits drapeaux sur les antennes arrière, un militaire debout.
function Jeep({ t, anim, paint, skin }: { t: Tint; anim: boolean; paint: string; skin: string }): ReactElement {
  const body = t(paint);
  return (
    <g>
      <rect x={-19} y={-14} width={38} height={9} rx={2} fill={body} />
      <path d="M4 -14 L8 -22 H10 L7 -14Z" fill={t(GLASS)} opacity={0.8} />
      <rect x={-19} y={-17} width={10} height={3} fill={body} />
      <circle cx={-11} cy={-4} r={4.4} fill={t(TYRE)} />
      <circle cx={12} cy={-4} r={4.4} fill={t(TYRE)} />
      <circle cx={-21} cy={-11} r={3.4} fill={t(TYRE)} />
      {[-17, -14].map((x, i) => (
        <g key={x}>
          <line x1={x} y1={-17} x2={x - 1} y2={-34 + i * 2} stroke={t('#333333')} strokeWidth={0.6} />
          <g transform={`translate(${x - 1} 0)`}>
            <Tricolore t={t} top={-34 + i * 2} w={7} h={4.6} anim={anim} />
          </g>
        </g>
      ))}
      {/* Chef de bord debout, au garde-à-vous */}
      <g data-worker="" data-parade-figure="">
        <rect x={-6} y={-24} width={6} height={10} rx={1.2} fill={t(paint === ARMY[2] ? '#8C7A55' : '#3E4420')} />
        <circle cx={-3} cy={-27} r={2.6} fill={t(skin)} />
        <ellipse cx={-3.6} cy={-29.2} rx={3.6} ry={1.4} fill={t('#2B3A6A')} />
      </g>
    </g>
  );
}
function Jeeps({ unit, t, anim }: UnitArt): ReactElement {
  const paint = pickOf(ARMY, unit.variant);
  const [a, b] = skinsOf(unit.id, 2);
  return (
    <g>
      <g transform="translate(-26 0)"><Jeep t={t} anim={anim} paint={paint} skin={a!} /></g>
      <g transform="translate(28 0)"><Jeep t={t} anim={anim} paint={paint} skin={b!} /></g>
    </g>
  );
}

// Camion militaire bâché : cabine à l'avant, plateau sous bâche arrondie, trois essieux.
function Truck({ t, paint }: { t: Tint; paint: string }): ReactElement {
  const body = t(paint);
  return (
    <g>
      <rect x={-27} y={-12} width={54} height={5} fill={t('#2E2E26')} />
      <path d="M-27 -12 V-30 Q-27 -33 -24 -33 H6 Q9 -33 9 -30 V-12Z" fill={t(paint === ARMY[2] ? '#C9B48A' : '#6A6E45')} />
      {[-18, -9, 0].map((x) => <line key={x} x1={x} y1={-32} x2={x} y2={-13} stroke={t('#000000')} strokeOpacity={0.18} strokeWidth={0.8} />)}
      <path d="M11 -12 V-26 H21 L27 -18 V-12Z" fill={body} />
      <path d="M20 -24 L25 -18 H20Z" fill={t(GLASS)} opacity={0.8} />
      {[-20, -10, 17].map((x) => (
        <g key={x}>
          <circle cx={x} cy={-4.5} r={4.5} fill={t(TYRE)} />
          <circle cx={x} cy={-4.5} r={1.6} fill={t(paint)} />
        </g>
      ))}
    </g>
  );
}
function Trucks({ unit, t }: UnitArt): ReactElement {
  const paint = pickOf(ARMY, unit.variant);
  return (
    <g>
      <g transform="translate(-34 0)"><Truck t={t} paint={paint} /></g>
      <g transform="translate(34 0)"><Truck t={t} paint={paint} /></g>
    </g>
  );
}

// Char : chenilles qui défilent (tirets animés), galets, caisse, tourelle et canon, chef de char en tourelle.
function Tank({ t, anim, paint, skin }: { t: Tint; anim: boolean; paint: string; skin: string }): ReactElement {
  const body = t(paint);
  return (
    <g>
      <rect x={-30} y={-9} width={60} height={9} rx={4.5} fill={t('#2A2A26')} />
      <rect x={-29} y={-8.6} width={58} height={8.2} rx={4.1} fill="none" stroke={t('#55554C')} strokeWidth={1.4} strokeDasharray="2 2">
        {anim && <animate attributeName="stroke-dashoffset" values="0;-4" dur="0.4s" repeatCount="indefinite" />}
      </rect>
      {[-22, -13, -4, 5, 14, 23].map((x) => <circle key={x} cx={x} cy={-4.5} r={3} fill={t('#3E3E36')} />)}
      <path d="M-30 -9 L-27 -16 H24 L31 -9Z" fill={body} />
      <path d="M-14 -16 L-12 -23 H6 L10 -16Z" fill={body} />
      <rect x={9} y={-21.4} width={25} height={2} fill={body} />
      <rect x={30} y={-22} width={4} height={3.2} fill={t('#2A2A26')} />
      <g data-worker="" data-parade-figure="">
        <rect x={-8} y={-27} width={5} height={4} fill={t('#3E4420')} />
        <circle cx={-5.5} cy={-29} r={2.4} fill={t(skin)} />
        <path d="M-8.4 -29.4 A2.9 2.9 0 0 1 -2.6 -29.4Z" fill={t('#2A2A26')} />
      </g>
      <line x1={-20} y1={-16} x2={-24} y2={-30} stroke={t('#333333')} strokeWidth={0.5} />
      <g transform="translate(-24 0)">
        <Tricolore t={t} top={-30} w={6} h={4} anim={anim} />
      </g>
    </g>
  );
}
function Tanks({ unit, t, anim }: UnitArt): ReactElement {
  const paint = pickOf(ARMY, unit.variant);
  const [a, b] = skinsOf(unit.id, 2);
  return (
    <g>
      <g transform="translate(-48 0)"><Tank t={t} anim={anim} paint={paint} skin={a!} /></g>
      <g transform="translate(40 0)"><Tank t={t} anim={anim} paint={paint} skin={b!} /></g>
    </g>
  );
}

// Sapeurs-pompiers : grand camion rouge à échelle, bande blanche, gyrophares bleus, casques chromés dans la cabine.
function Firetruck({ unit, t, anim }: UnitArt): ReactElement {
  const red = t(pickOf(['#C8102E', '#B5121B'], unit.variant));
  const skins = skinsOf(unit.id, 2);
  return (
    <g>
      <rect x={-46} y={-26} width={66} height={20} rx={2} fill={red} />
      <path d="M20 -6 V-30 H34 L42 -18 V-6Z" fill={red} />
      <path d="M33 -28 L40 -18 H33Z" fill={t(GLASS)} opacity={0.85} />
      <rect x={22} y={-27} width={9} height={8} fill={t(GLASS)} opacity={0.85} />
      {skins.map((skin, i) => (
        <g key={i}>
          <circle cx={25 + i * 4} cy={-21.5} r={1.7} fill={t(skin)} />
          <path d={`M${23.2 + i * 4} -22 A1.9 1.9 0 0 1 ${26.8 + i * 4} -22Z`} fill={t(STEEL)} />
        </g>
      ))}
      <rect x={-46} y={-15} width={88} height={2.4} fill={t(WHITE)} />
      {[-40, -30, -20, -10, 0, 10].map((x) => <rect key={x} x={x} y={-24} width={7} height={7} rx={0.6} fill={t('#9E0E22')} />)}
      {/* Échelle sur le toit, débordant au-dessus de la cabine */}
      <g data-ladder="">
        <line x1={-44} y1={-29} x2={38} y2={-34} stroke={t(STEEL)} strokeWidth={1.2} />
        <line x1={-44} y1={-32} x2={38} y2={-37} stroke={t(STEEL)} strokeWidth={1.2} />
        {Array.from({ length: 14 }, (_, i) => {
          const x = -42 + i * 6;
          const y = -29 - ((x + 44) / 82) * 5;
          return <line key={i} x1={x} y1={y} x2={x} y2={y - 3} stroke={t(STEEL)} strokeWidth={0.8} />;
        })}
        <rect x={-46} y={-30} width={4} height={4} fill={t('#555555')} />
      </g>
      {/* Gyrophares bleus sur la cabine */}
      {[24, 30].map((x, i) => (
        <rect key={x} data-beacon="" x={x} y={-33} width={4} height={3} rx={1} fill="#3F6BFF">
          {anim && <animate attributeName="opacity" values={i === 0 ? '1;0.15;1' : '0.15;1;0.15'} dur="0.7s" repeatCount="indefinite" />}
        </rect>
      ))}
      {[-34, -14, 30].map((x) => (
        <g key={x}>
          <circle cx={x} cy={-5} r={5} fill={t(TYRE)} />
          <circle cx={x} cy={-5} r={1.8} fill={t(STEEL)} />
        </g>
      ))}
    </g>
  );
}

type UnitArt = { unit: ParadeUnit; t: Tint; anim: boolean; begin: string };
const ARTS: Readonly<Record<ParadeKind, (p: UnitArt) => ReactElement>> = {
  band: Band,
  motorbikes: Motorbikes,
  flags: Flags,
  infantry: Infantry,
  cavalry: Cavalry,
  jeeps: Jeeps,
  trucks: Trucks,
  tanks: Tanks,
  firetruck: Firetruck,
};

export function ParadeUnitSprite({ unit, sky, still }: Props): ReactElement {
  const tint: Tint = (c) => tone(c, sky);
  const anim = !still;
  // Pas commun : début à 0 sur la ligne de temps du document (voir en tête).
  const begin = '0s';
  const Art = ARTS[unit.kind];
  return (
    <g data-parade-unit={unit.kind}>
      <Art unit={unit} t={tint} anim={anim} begin={begin} />
    </g>
  );
}
