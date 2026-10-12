import { useMemo, useRef, useState, type ReactElement } from 'react';
import { WALK_PACE } from '../core/library/city/metrics';
import type { Outfit } from '../core/library/city/people';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { TURN_S, facingYaw, phaseIndexOf, turnYaw } from '../core/library/figure/gait';
import type { ArmPose } from '../core/library/figure/skeleton';
import { WORLD_MARGIN } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { STAGE, STAGE_STAND, spotLens } from './install-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Musiciens de la scène de la Fête de la musique et faisceaux des projecteurs (spec §7.3). Repère de la scène : centre x = 0,
// arête avant du plancher à y = -STAGE.floor ; les musiciens ont les pieds sur le dessus du plancher (STAGE_STAND). La nuit,
// ils sont éclairés par les projecteurs (`lit`) : leur teinte reste lisible au lieu de prendre celle de la nuit. Les faisceaux sont des cônes dont la POINTE est la lentille d'un projecteur de la
// traverse (STAGE.spotXs / spotY) et dont la base est sur le plancher sous un musicien : aucun cône flottant.
// Animation (SMIL) seulement hors mouvement réduit : balancement des musiciens, respiration des faisceaux.
// Ghibli : pantins sans miroir, tournés vers le public (PLAY_YAW), pose fixe (`guitar`, `mic`, `drum`) que le balancement SMIL
// du groupe porteur fait osciller avec l'instrument, tenu à la main droite (GhibliProp : guitare en travers du corps vers la
// main gauche, micro sur son pied posé sur le plancher, caisse claire à la taille entre les deux mains). En marche : pas réglés
// sur la distance (montée sur le plancher comprise, `lift`), instrument porté ; demi-tour sur place au bout du trajet.

export type Instrument = 'guitar' | 'mic' | 'drum';
// Un musicien par projecteur (même index) : guitare / ukulélé, chanteuse au micro sur pied, batteur au tambour.
export const MUSICIANS: readonly { x: number; instrument: Instrument }[] = [
  { x: -24, instrument: 'guitar' },
  { x: 0, instrument: 'mic' },
  { x: 24, instrument: 'drum' },
];
const SCALE = 0.8;
const BEAM_HALF = 9;

function Prop({ kind, sky }: { kind: Instrument; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  if (kind === 'guitar') {
    return (
      <g data-instrument="guitar">
        <ellipse cx={3} cy={-15} rx={4.2} ry={3.4} fill={t('#B5723A')} transform="rotate(-18 3 -15)" />
        <circle cx={3} cy={-15} r={1} fill={t('#2A1A10')} />
        <line x1={6} y1={-17} x2={15} y2={-24} stroke={t('#5A3A22')} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'mic') {
    return (
      <g data-instrument="mic">
        <line x1={7} y1={0} x2={7} y2={-26} stroke={t('#2A2D34')} strokeWidth={0.9} />
        <line x1={4} y1={0} x2={10} y2={0} stroke={t('#2A2D34')} strokeWidth={1} strokeLinecap="round" />
        <circle cx={7} cy={-27.5} r={1.7} fill={t('#4A4E58')} />
      </g>
    );
  }
  // Caisse claire sur pied, un peu plus grande que le buste du batteur, baguettes en l'air.
  return (
    <g data-instrument="drum">
      <rect x={4} y={-17} width={16} height={11} rx={1.4} fill={t('#B02A2A')} />
      <rect x={4} y={-17} width={16} height={2.4} rx={1.1} fill={t('#E8E8E0')} />
      <rect x={4} y={-8.2} width={16} height={1.4} fill={t('#E8E8E0')} />
      <line x1={5.5} y1={-6} x2={4.5} y2={0} stroke={t('#2A2D34')} strokeWidth={0.9} />
      <line x1={18.5} y1={-6} x2={19.5} y2={0} stroke={t('#2A2D34')} strokeWidth={0.9} />
      <line x1={1} y1={-26} x2={8} y2={-18} stroke={t('#D8C8A0')} strokeWidth={0.9} strokeLinecap="round" />
      <line x1={-1} y1={-24} x2={5} y2={-17} stroke={t('#D8C8A0')} strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

// ---------- Arrivée et départ à pied ----------
// Les musiciens arrivent à pied par le bord de la rue le plus proche de la scène (hors champ), longent le trottoir, montent sur
// le plancher par le côté et gagnent leur place, l'un après l'autre (le plus éloigné d'abord) entre 16 h 46 et 17 h. À minuit,
// ils repartent de même (le plus proche de la sortie d'abord), de 0 h 01 à 0 h 15, avant l'équipe de nuit. Moteur pur :
// position depuis l'instant (s) et le début du jour de la fête (`dayStartS`).
export type MusicianMode = 'absent' | 'walking' | 'playing';
// `lift` : 0 = pieds sur le trottoir, 1 = pieds sur le plancher ; `trip` : 'in' à l'arrivée, 'out' au départ ; pantin :
// `yaw`, `gait` ('step' : demi-tour sur place, au bout du trajet) et `walked` (px parcourus, phase des pas).
export type MusicianPos = { x: number; lift: number; dir: 1 | -1; mode: MusicianMode; trip?: 'in' | 'out'; yaw: number; gait: 'walk' | 'step' | 'stand'; walked: number };
// Orientation en jouant : de face, le guitariste et le batteur un peu tournés vers la chanteuse.
export const PLAY_YAW: readonly number[] = [3, 4, 5];
export type StageGeom = { stageX: number; width: number; unit: number };
const ARRIVE_MIN = [16 * 60 + 46, 16 * 60 + 50, 16 * 60 + 54] as const;
const LEAVE_MIN = [24 * 60 + 1, 24 * 60 + 5, 24 * 60 + 9] as const;
export const MUSICIAN_SPEED = 22 * WALK_PACE;
type P = { x: number; y: number };
const sideOf = (g: StageGeom): 1 | -1 => (g.stageX < g.width / 2 ? -1 : 1);
// Chemin (px du monde ; y = hauteur au-dessus du trottoir, en px) du bord de la rue à la place sur le plancher.
function pathTo(i: number, g: StageGeom): P[] {
  const side = sideOf(g);
  const u = g.unit;
  const up = -STAGE_STAND * u;
  return [
    { x: side < 0 ? -WORLD_MARGIN : g.width + WORLD_MARGIN, y: 0 },
    { x: g.stageX + side * (STAGE.half + 4) * u, y: 0 },
    { x: g.stageX + side * (STAGE.half - 6) * u, y: up },
    { x: g.stageX + MUSICIANS[i]!.x * u, y: up },
  ];
}
const segLen = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);
const pathLen = (p: readonly P[]): number => p.slice(1).reduce((acc, q, k) => acc + segLen(p[k]!, q), 0);
function pointAt(p: readonly P[], dist: number): P {
  let left = Math.max(0, dist);
  for (let k = 1; k < p.length; k++) {
    const l = segLen(p[k - 1]!, p[k]!);
    if (left <= l && l > 0) return { x: p[k - 1]!.x + ((p[k]!.x - p[k - 1]!.x) * left) / l, y: p[k - 1]!.y + ((p[k]!.y - p[k - 1]!.y) * left) / l };
    left -= l;
  }
  return p[p.length - 1]!;
}
// Rang d'arrivée : le plus éloigné de l'entrée d'abord ; rang de départ : le plus proche de la sortie d'abord.
const rankOf = (i: number, g: StageGeom, first: 'far' | 'near'): number => {
  const side = sideOf(g);
  const order = MUSICIANS.map((m, k) => ({ k, d: side * m.x })).sort((a, b) => (first === 'far' ? a.d - b.d : b.d - a.d));
  return order.findIndex((o) => o.k === i);
};

// Arrivée : marche (montée sur le plancher comprise), puis demi-tour vers le public (TURN_S, avant 17 h) ; départ : demi-tour
// vers la sortie, puis marche.
export function musicianAt(i: number, t: number, dayStartS: number, g: StageGeom): MusicianPos {
  const path = pathTo(i, g);
  const len = pathLen(path);
  const dur = len / MUSICIAN_SPEED;
  const inStart = dayStartS + ARRIVE_MIN[rankOf(i, g, 'far')]! * 60;
  const outStart = dayStartS + LEAVE_MIN[rankOf(i, g, 'near')]! * 60;
  const up = -STAGE_STAND * g.unit;
  const side = sideOf(g);
  const toward = (-side) as 1 | -1;
  const play = PLAY_YAW[i]!;
  const end = path[path.length - 1]!;
  const pos = (d: number, dir: 1 | -1, trip: 'in' | 'out', walked: number): MusicianPos => {
    const p = pointAt(path, d);
    return { x: p.x, lift: up > 0 ? p.y / up : 0, dir, mode: 'walking', trip, yaw: facingYaw(dir), gait: 'walk', walked };
  };
  const turn = (from: number, to: number, k: number, dir: 1 | -1, trip: 'in' | 'out', walked: number): MusicianPos => ({ x: end.x, lift: 1, dir, mode: 'walking', trip, yaw: turnYaw(from, to, k), gait: 'step', walked });
  if (t < inStart) return { x: path[0]!.x, lift: 0, dir: toward, mode: 'absent', yaw: facingYaw(toward), gait: 'stand', walked: 0 };
  if (t < inStart + dur) return pos((t - inStart) * MUSICIAN_SPEED, toward, 'in', (t - inStart) * MUSICIAN_SPEED);
  if (t < inStart + dur + TURN_S) return turn(facingYaw(toward), play, (t - inStart - dur) / TURN_S, toward, 'in', len);
  if (t < outStart) return { x: end.x, lift: 1, dir: 1, mode: 'playing', yaw: play, gait: 'stand', walked: 0 };
  if (t < outStart + TURN_S) return turn(play, facingYaw(side), (t - outStart) / TURN_S, side, 'out', 0);
  if (t < outStart + TURN_S + dur) {
    const w = (t - outStart - TURN_S) * MUSICIAN_SPEED;
    return pos(len - w, side, 'out', w);
  }
  return { x: path[0]!.x, lift: 0, dir: side, mode: 'absent', yaw: facingYaw(side), gait: 'stand', walked: 0 };
}

// ---------- Ghibli ----------
// Bras du pantin : en jouant, la pose de l'instrument ; en marche, guitare et caisse claire portées en place, pied du micro
// tenu à la main.
const walkArms: Readonly<Record<Instrument, ArmPose>> = { guitar: 'guitar', mic: 'hold', drum: 'drum' };
const poseOfMusician = (i: number, p: MusicianPos, unit: number): PoseIn => {
  const kind = MUSICIANS[i]!.instrument;
  if (p.mode === 'playing') return { yaw: p.yaw, gait: 'stand', phase: 0, head: 0, arms: kind };
  return { yaw: p.yaw, gait: p.gait, phase: p.gait === 'walk' ? phaseIndexOf(p.walked / (unit * SCALE)) : 0, head: 0, arms: walkArms[kind] };
};

// Instrument tenu (repère du pantin, poignet droit à l'origine), placé d'après les mains de la pose `arms` (accroches du
// pantin à l'arrêt, orientation de jeu) : la marche ne fait que translater l'objet avec la main droite.
function GhibliProp({ kind, sky, outfit, yaw, walking }: { kind: Instrument; sky: Sky; outfit: Outfit; yaw: number; walking: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const sig = signatureOf(shapeOf(outfit, false));
  const a = anchorsOf({ sig, yaw, gait: 'stand', phase: 0, head: 0, arms: walking ? walkArms[kind] : kind, lean: 0 });
  const [hx, hy] = a.handR;
  const dx = a.handL[0] - hx;
  const dy = a.handL[1] - hy;
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  if (kind === 'guitar') {
    // Caisse sous la main droite (qui gratte), manche en travers du corps jusqu'à la main gauche et un peu au-delà.
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <g data-instrument="guitar">
        <line x1={0} y1={0} x2={r2(dx * 1.3)} y2={r2(dy * 1.3)} stroke={t('#5A3A22')} strokeWidth={0.9} strokeLinecap="round" />
        <ellipse cx={r2(-dx * 0.12)} cy={r2(-dy * 0.12 + 0.4)} rx={3.2} ry={2.5} fill={t('#B5723A')} transform={`rotate(${r2(ang)} ${r2(-dx * 0.12)} ${r2(-dy * 0.12 + 0.4)})`} />
        <circle cx={r2(-dx * 0.12)} cy={r2(-dy * 0.12 + 0.4)} r={0.8} fill={t('#2A1A10')} />
      </g>
    );
  }
  if (kind === 'mic') {
    // En jouant : micro à la main, pied posé sur le plancher (y du pantin = 0, soit −hy sous la main). En marche : porté.
    const foot = walking ? 9 : r2(-hy);
    return (
      <g data-instrument="mic">
        <line data-mic-pole="" x1={0.6} y1={-0.6} x2={0.6} y2={foot} stroke={t('#2A2D34')} strokeWidth={0.6} />
        <line x1={-1.8} y1={foot} x2={3} y2={foot} stroke={t('#2A2D34')} strokeWidth={0.7} strokeLinecap="round" />
        <circle cx={0.6} cy={-1.4} r={1.2} fill={t('#4A4E58')} />
      </g>
    );
  }
  // Caisse claire à la taille, centrée entre les deux mains, sur son pied (posé sur le plancher en jouant, porté en marche) ;
  // baguettes des deux mains vers la peau.
  const mx = dx / 2;
  const top = dy / 2 + 1.4;
  const foot = walking ? top + 9 : r2(-hy);
  return (
    <g data-instrument="drum">
      <line x1={r2(mx - 4.4)} y1={r2(top + 6)} x2={r2(mx - 5)} y2={foot} stroke={t('#2A2D34')} strokeWidth={0.6} />
      <line x1={r2(mx + 4.4)} y1={r2(top + 6)} x2={r2(mx + 5)} y2={foot} stroke={t('#2A2D34')} strokeWidth={0.6} />
      <rect x={r2(mx - 5.5)} y={r2(top)} width={11} height={6.5} rx={1} fill={t('#B02A2A')} />
      <rect x={r2(mx - 5.5)} y={r2(top)} width={11} height={1.5} rx={0.7} fill={t('#E8E8E0')} />
      <line x1={0} y1={0} x2={r2(mx - 1.2)} y2={r2(top + 0.2)} stroke={t('#D8C8A0')} strokeWidth={0.6} strokeLinecap="round" />
      <line x1={r2(dx)} y1={r2(dy)} x2={r2(mx + 1.2)} y2={r2(top + 0.2)} stroke={t('#D8C8A0')} strokeWidth={0.6} strokeLinecap="round" />
    </g>
  );
}

type LiveProps = {
  stageX: number; base: number; unit: number; width: number; minutes: number; dayOffset: number;
  outfits: readonly Outfit[]; sky: Sky; rainy: boolean; still: boolean; lit?: boolean; stageId?: string; ghibli?: boolean;
};

// Musiciens à l'échelle de la scène (0,8 du repère de la scène), pieds sur le trottoir (`base`) ou sur le plancher. La boucle de
// l'horloge murale place les marcheurs à chaque image et ne re-rend que lorsqu'un musicien change d'état. `dayOffset` : jours
// écoulés depuis le jour de la fête (1 la nuit suivante). `outfits` : trois tenues tirées de la graine par l'appelant (jamais
// Math.random). Mouvement réduit : seulement ceux qui jouent, immobiles.
export function StageBand({ stageX, base, unit, width, minutes, dayOffset, outfits, sky: night, rainy, still, lit = false, stageId = '', ghibli = false }: LiveProps): ReactElement | null {
  const figures = useFigureRegistry();
  const sky = lit ? { ...night, daylight: Math.max(night.daylight, 0.75) } : night;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now) - dayOffset * 86400;
  const g = useMemo(() => ({ stageX, width, unit }), [stageX, width, unit]);
  const statesAt = (t: number): MusicianPos[] => MUSICIANS.map((_, i) => musicianAt(i, t, dayStart, g));
  const [sig, setSig] = useState('');
  const root = useRef<SVGGElement | null>(null);
  const k = unit * SCALE;
  // Le dessin classique se retourne selon le sens ; le pantin Ghibli se tourne par son yaw.
  const transformOf = (p: MusicianPos): string => `translate(${p.x.toFixed(1)} ${(base + p.lift * STAGE_STAND * unit).toFixed(1)}) scale(${((ghibli ? 1 : p.dir) * k).toFixed(3)} ${k.toFixed(3)})`;
  const place = useMemo(
    () => (t: number): void => {
      if (still) return;
      const st = statesAt(t);
      // Mode, allure et orientation : l'instrument porté suit l'orientation du pantin, demi-tours compris (quelques rendus).
      const key = st.map((p) => `${p.mode}${p.gait}${p.yaw}`).join(',');
      if (key !== sig) setSig(key);
      const el = root.current;
      if (!el) return;
      st.forEach((p, i) => {
        if (p.mode !== 'walking') return;
        const node = el.querySelector(`[data-stage-band="${MUSICIANS[i]!.instrument}"]`);
        node?.setAttribute('transform', transformOf(p));
        if (ghibli) poseFigure(figures, node?.querySelector('[data-figure]') ?? null, poseOfMusician(i, p, unit));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStart, g, sig, still, base, k, ghibli, figures],
  );
  useWallClockLoop(place, [place]);
  const states = statesAt(now).map((p) => (still && p.mode !== 'playing' ? { ...p, mode: 'absent' as const } : p));
  if (states.every((p) => p.mode === 'absent')) return null;
  return (
    <g data-stage-band-group={stageId} ref={root}>
      {MUSICIANS.map((m, i) => {
        const p = states[i]!;
        if (p.mode === 'absent') return null;
        const walking = p.mode === 'walking';
        const outfit = outfits[i % outfits.length]!;
        const sway = !still && !walking && <animateTransform attributeName="transform" type="rotate" values="0 0 0;-2.5 0 0;0 0 0;2.5 0 0;0 0 0" dur={`${(1.1 + i * 0.25).toFixed(2)}s`} repeatCount="indefinite" />;
        const attrs = { 'data-stage-band': m.instrument, 'data-mode': p.mode, 'data-trip': p.trip, 'data-lit': lit ? 'true' : 'false' };
        if (ghibli) {
          // Le mode change de nœud (clé) : l'instrument porté devient celui qu'on joue.
          const node = <GhibliProp kind={m.instrument} sky={sky} outfit={outfit} yaw={p.yaw} walking={walking} />;
          return (
            <g key={`${m.instrument}-${p.mode}`} {...attrs} transform={transformOf(p)}>
              <g>
                {sway}
                <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={poseOfMusician(i, p, unit)} held={[{ anchor: 'handR', node }]} />
              </g>
            </g>
          );
        }
        return (
          <g key={m.instrument} {...attrs} transform={transformOf(p)}>
            <g>
              {sway}
              <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? i * 0.3 : null} />
            </g>
            {/* En marche, l'instrument est porté : le tambour et le pied du micro ne touchent pas le sol. */}
            <g transform={walking ? 'translate(0 -4)' : undefined}>
              <Prop kind={m.instrument} sky={sky} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// Faisceaux : pointe = lentille du projecteur i, base = sol du plancher sous le musicien i.
// Ghibli (G5, maquette `stageBeams`) : deux polygones par projecteur, le large (0,3 ± 0,06 sur 2,4 / 2,9 / 3,4 s, comme le
// classique) et un cœur plus étroit (base ±4) et plus clair, à opacité FIXE (pas d'animation SMIL nouvelle en Ghibli) ;
// l'éclairage de concert de nuit (tâche 7) les remplace.
export function StageBeams({ still, ghibli = false }: { still: boolean; ghibli?: boolean }): ReactElement {
  return (
    <g data-stage-beams="">
      {STAGE.spotXs.map((_, i) => {
        const o = spotLens(i);
        const tx = MUSICIANS[i]!.x;
        const ty = -STAGE.floor;
        const dur = `${(2.4 + i * 0.5).toFixed(1)}s`;
        return (
          <g key={i}>
            <polygon
              data-stage-beam={i}
              data-origin-x={o.x.toFixed(2)}
              data-origin-y={o.y.toFixed(2)}
              data-target-x={tx}
              data-target-y={ty}
              points={`${o.x.toFixed(2)},${o.y.toFixed(2)} ${tx - BEAM_HALF},${ty} ${tx + BEAM_HALF},${ty}`}
              fill="#FFF1B8"
              opacity={0.3}
            >
              {!still && <animate attributeName="opacity" values="0.24;0.36;0.24" dur={dur} repeatCount="indefinite" />}
            </polygon>
            {ghibli && (
              <polygon data-stage-beam-core={i} points={`${o.x.toFixed(2)},${o.y.toFixed(2)} ${tx - 4},${ty} ${tx + 4},${ty}`} fill="#FFFADC" opacity={0.18} />
            )}
          </g>
        );
      })}
    </g>
  );
}
