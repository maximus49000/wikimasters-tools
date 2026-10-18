import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { DOOR_DARK, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { CROWD_DOOR_DEPTH, CROWD_ROW_DEPTH, CROWD_TIMES, crowdFor, crowdLevel, spectatorAt, spectatorYaw, type Spectator, type SpectatorPos } from '../core/library/city/parade';
import { anchorsOf, type FigureKey } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { phaseIndexOf } from '../core/library/figure/gait';
import { LIMB, type ArmPose } from '../core/library/figure/skeleton';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { citizenSeed } from '../core/citizens/identity';
import { CITIZENS_3D } from './figure/citizen-config';
import { useFigureRegistry, type FigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, shown3DAnchors, type PoseIn } from './figure/ghibli-figure';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Foule de spectateurs du 14 juillet (spec §7.4) : massée sur le trottoir, derrière les barrières (dessinées plus tard, sur la
// chaussée), en trois rangs. Personne n'apparaît ni ne disparaît sur place : chaque spectateur arrive à pied (par une entrée
// d'immeuble proche, en passant le seuil de la porte comme les habitants (door-passage.ts : <svg> rogné à l'ouverture, ombre de
// l'entrée), ou depuis un bord de la rue, hors champ) le long d'un couloir de marche derrière la foule, jusqu'à sa place, et
// repart de même (moteur pur `spectatorAt`, city/parade.ts). Aucun fondu de groupe, dans les deux graphismes.
// Les spectateurs debout sont statiques et mémoïsés (jamais posés à chaque image) ; les marcheurs (peu nombreux à la fois) sont
// placés à chaque image par la boucle de l'horloge murale, qui ne re-rend que lorsque l'ensemble des marcheurs, leur passage du
// seuil ou le nombre de spectateurs en place change.
// Ghibli : pantins sans miroir (orientation = yaw). Debout : de trois quarts vers la chaussée (spectatorYaw), bras levé (`raise`)
// avec l'objet à la main droite (drapeau agité par SMIL autour de la main, téléphone, main ouverte), sinon `down` / `swing`
// immobile ; enfant sur les épaules : pantin enfant assis à la nuque de l'adulte. En marche : pas réglé sur la distance,
// drapeau porté haut sans l'agiter.
// Mouvement réduit : seulement les spectateurs en place au niveau courant (u < crowdLevel), immobiles.
// Hors du plafond des figurants (shopSpriteBudget) : la foule remplace les marcheurs (×0,3 pendant la fermeture) et a sa
// propre densité bornée ; comptée dans le plafond, elle ferait disparaître clients et équipes.

// Échelle selon la profondeur sur le trottoir : les rangs de derrière, plus hauts, sont un peu plus petits (1 ; 0,96 ; 0,92).
const ROW_SCALE = [1, 0.96, 0.92] as const;
const depthScale = (d: number): number => Math.min(1, Math.max(0.85, 1 - ((d - CROWD_ROW_DEPTH[0]) * 0.08) / (CROWD_ROW_DEPTH[2] - CROWD_ROW_DEPTH[0])));
// Marge (min) autour de la fenêtre de la foule : les premiers partent en avance, les derniers finissent leur trajet.
const MARGIN_MIN = 5;

type Props = { width: number; seed: number; sky: Sky; still: boolean; rainy: boolean; dayFests: readonly FestivityId[]; minutes: number; metrics: CityMetrics; doorXs: readonly number[]; ghibli?: boolean };

// Bras levé (repère du PersonSprite : épaule vers (4, -26)) tenant un drapeau tricolore, un téléphone ou la main ouverte.
function RaisedArm({ s, sky, still }: { s: Spectator; sky: Sky; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const dur = 1.1 + s.phase * 0.8;
  return (
    <g data-arm="" data-prop={s.prop}>
      {!still && s.prop !== 'phone' && (
        <animateTransform attributeName="transform" type="rotate" values="-12 4 -26;12 4 -26;-12 4 -26" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />
      )}
      <path d="M4 -26 L7.2 -37" stroke={t(s.outfit.topColor)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <circle cx={7.4} cy={-38} r={s.prop === 'wave' ? 1.7 : 1.3} fill={t(s.outfit.skin)} />
      {s.prop === 'flag' && (
        <>
          <line x1={7.4} y1={-37} x2={7.4} y2={-49} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={7.4} y={-49} width={2.4} height={5} fill={t('#2B4FA0')} />
          <rect x={9.8} y={-49} width={2.4} height={5} fill={t('#F2F2F2')} />
          <rect x={12.2} y={-49} width={2.4} height={5} fill={t('#C0302B')} />
        </>
      )}
      {s.prop === 'phone' && (
        <>
          <rect x={5.6} y={-43.5} width={3.6} height={5.4} rx={0.6} fill="#1E1E24" />
          <rect x={6.1} y={-43} width={2.6} height={4.2} fill="#9FD3FF" opacity={0.85} />
        </>
      )}
    </g>
  );
}

// Debout : bras levé (drapeau, téléphone, main). En marche : jambes au pas, le drapeau porté haut sans l'agiter, l'enfant
// reste sur les épaules.
const SpectatorSprite = memo(function SpectatorSprite({ s, sky, still, rainy, walking }: { s: Spectator; sky: Sky; still: boolean; rainy: boolean; walking: boolean }): ReactElement {
  const arm = walking ? (s.prop === 'flag' ? <RaisedArm s={s} sky={sky} still /> : null) : s.prop !== 'none' ? <RaisedArm s={s} sky={sky} still={still} /> : null;
  return (
    <>
      {/* Enfant sur les épaules : dessiné avant l'adulte, dont la tête cache le bas de ses jambes. */}
      {s.kind === 'shoulders' && s.child && (
        <g data-shoulders="" transform="translate(0 -27) scale(0.62)">
          <PersonSprite outfit={s.child} sky={sky} rainy={rainy} umbrella={false} />
        </g>
      )}
      <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? s.phase : null} />
      {arm}
    </>
  );
});

const scaleOf = (s: Spectator, p: SpectatorPos, m: CityMetrics, standing: boolean): number =>
  m.unit * STREET_SCALE.person * (standing ? ROW_SCALE[s.row] : depthScale(p.depth)) * (s.kind === 'child' ? 0.7 : 1);
// `mirror` : le dessin classique se retourne selon le sens ; le pantin Ghibli se tourne par son yaw.
const transformOf = (s: Spectator, p: SpectatorPos, m: CityMetrics, standing: boolean, mirror: boolean): string => {
  const k = scaleOf(s, p, m, standing);
  const y = m.curb - p.depth * m.unit;
  return `translate(${p.x.toFixed(1)} ${y.toFixed(1)}) scale(${((mirror ? p.dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`;
};
// Échelle de référence du pas (px par unité du pantin) : la phase suit la distance, sans dépendre de la profondeur.
const strideScale = (s: Spectator, m: CityMetrics): number => m.unit * STREET_SCALE.person * (s.kind === 'child' ? 0.7 : 1);
// Seuil d'une porte d'immeuble (door-passage.ts) : ouverture de l'entrée dont `x` est le centre, figure à l'échelle de la
// ligne des portes (celle du chemin à cette profondeur : pas de saut d'échelle au sortir du seuil).
const openingAt = (x: number, m: CityMetrics) => entranceOpening(x - DOOR_WIDTH / 2, m);
const passageOf = (p: SpectatorPos): Passage => ({ stage: 'threshold', x: p.x, depth: p.sill ?? 0, yaw: p.yaw, gait: 'walk', walked: 0 });
const sillScale = (s: Spectator, m: CityMetrics): number => m.unit * STREET_SCALE.person * depthScale(CROWD_DOOR_DEPTH) * (s.kind === 'child' ? 0.7 : 1);

// ---------- Ghibli ----------
// Enfant sur les épaules : bassin assis (tibia + cheville + 0,6, comme poseOf) posé à la nuque de l'adulte, échelle 0,62.
export const SHOULDER_SCALE = 0.62;
export const SHOULDER_SEAT = LIMB.shin + LIMB.ankle + 0.6;
// Signature de l'adulte mémoïsée par spectateur (la boucle relit sa nuque à chaque changement de pose).
const sigCache = new WeakMap<Spectator, string>();
const sigOfAdult = (s: Spectator): string => {
  let sig = sigCache.get(s);
  if (sig === undefined) {
    sig = signatureOf(shapeOf(s.outfit, false));
    sigCache.set(s, sig);
  }
  return sig;
};
const keyFor = (s: Spectator, pose: PoseIn): FigureKey => ({ sig: sigOfAdult(s), yaw: pose.yaw, gait: pose.gait, phase: pose.phase, head: pose.head, arms: pose.arms ?? 'swing', lean: pose.lean ?? 0 });
// `nape` : nuque de l'image montrée par l'adulte (accroches 3D quand il est en 3D, voir syncShoulders), sinon celle du pantin.
export const shoulderTransform = (adult: FigureKey, nape: readonly [number, number] = anchorsOf(adult).nape): string => {
  const [x, y] = nape;
  return `translate(${x} ${Math.round((y + SHOULDER_SEAT * SHOULDER_SCALE) * 100) / 100}) scale(${SHOULDER_SCALE})`;
};
// Debout : bras levé avec un objet ; sans objet, bras le long du corps ou au repos du balancement (tirage du spectateur).
const standArms = (s: Spectator): ArmPose => (s.prop !== 'none' ? 'raise' : s.phase < 0.5 ? 'down' : 'swing');
const standPose = (s: Spectator): PoseIn => ({ yaw: spectatorYaw(s), gait: 'stand', phase: 0, head: 0, arms: standArms(s) });
// En marche : pas réglé sur la distance parcourue, petits pas pendant un demi-tour ; seul le drapeau reste levé.
const walkPose = (s: Spectator, p: SpectatorPos, m: CityMetrics): PoseIn => ({
  yaw: p.yaw,
  gait: p.gait,
  phase: p.gait === 'walk' ? phaseIndexOf(p.walked / strideScale(s, m)) : 0,
  head: 0,
  arms: s.prop === 'flag' ? 'raise' : 'swing',
});
const childPose = (yaw: number): PoseIn => ({ yaw, gait: 'seated', phase: 0, head: 0, arms: 'down' });

// Objet tenu à la main droite (repère du pantin, poignet à l'origine) : drapeau tricolore, téléphone, main ouverte. `wave` :
// drapeau et main agités par SMIL autour de la main (jamais en marche ni en mouvement réduit).
function HandProp({ s, sky, wave }: { s: Spectator; sky: Sky; wave: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const dur = 1.1 + s.phase * 0.8;
  return (
    <g data-prop={s.prop}>
      {wave && s.prop !== 'phone' && (
        <animateTransform attributeName="transform" type="rotate" values="-14 0 0;14 0 0;-14 0 0" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />
      )}
      {s.prop === 'flag' && (
        <>
          <line x1={0} y1={0.5} x2={0} y2={-12} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={0} y={-12} width={2.4} height={5} fill={t('#2B4FA0')} />
          <rect x={2.4} y={-12} width={2.4} height={5} fill={t('#F2F2F2')} />
          <rect x={4.8} y={-12} width={2.4} height={5} fill={t('#C0302B')} />
        </>
      )}
      {s.prop === 'phone' && (
        <>
          <rect x={-1.8} y={-5.2} width={3.6} height={5.4} rx={0.6} fill="#1E1E24" />
          <rect x={-1.3} y={-4.7} width={2.6} height={4.2} fill="#9FD3FF" opacity={0.85} />
        </>
      )}
      {s.prop === 'wave' && (
        <>
          <ellipse cx={0} cy={-1.4} rx={1.5} ry={1.8} fill={t(s.outfit.skin)} />
          <path d="M-1.1 -2.8 L-1.3 -4.3 M0 -3.1 L0 -4.7 M1.1 -2.8 L1.3 -4.3" stroke={t(s.outfit.skin)} strokeWidth={0.8} strokeLinecap="round" fill="none" />
        </>
      )}
    </g>
  );
}

// Corps Ghibli d'un spectateur (`[data-spectator-body]`) : l'enfant des épaules d'abord (la tête de l'adulte cache le bas de ses
// jambes), puis l'adulte et son objet à la main.
// `standing` : spectateur en place (jamais posé par la boucle) : l'enfant des épaules suit la nuque de l'adulte par le registre
// (watch), quand l'adulte passe en 3D sans re-rendu (mouvement réduit compris).
function GhibliSpectator({ s, sky, rainy, pose, wave, standing = false }: { s: Spectator; sky: Sky; rainy: boolean; pose: PoseIn; wave: boolean; standing?: boolean }): ReactElement {
  const held = pose.arms === 'raise' && s.prop !== 'none' ? [{ anchor: 'handR' as const, node: <HandProp s={s} sky={sky} wave={wave} /> }] : undefined;
  const reg = useFigureRegistry();
  const body = useRef<SVGGElement | null>(null);
  const shoulders = standing && s.kind === 'shoulders';
  useLayoutEffect(() => {
    const node = body.current;
    const kid = node?.querySelector(':scope > [data-shoulders]');
    if (!CITIZENS_3D || !shoulders || !node || !kid) return;
    reg.watch(kid, () => {
      syncShoulders(reg, node, s, pose);
      return false;
    });
    return () => reg.unwatch(kid);
  });
  return (
    <g data-spectator-body="" ref={body}>
      {s.kind === 'shoulders' && s.child && (
        <g data-shoulders="" transform={shoulderTransform(keyFor(s, pose))}>
          <GhibliFigure outfit={s.child} sky={sky} rainy={rainy} umbrella={false} initial={childPose(pose.yaw)} citizen={citizenSeed(`${s.id}:epaules`)} kind="child" pin="seat" />
        </g>
      )}
      <GhibliFigure outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} initial={pose} held={held} citizen={citizenSeed(s.id)} kind={s.kind === 'child' ? 'child' : undefined} />
    </g>
  );
}

// Pose d'un marcheur Ghibli par la boucle : l'adulte, puis l'enfant des épaules (même orientation, à la nuque de la pose).
function poseWalker(reg: FigureRegistry, body: Element | null, s: Spectator, pose: PoseIn): void {
  if (!body) return;
  poseFigure(reg, body.querySelector(':scope > [data-figure]'), pose);
  if (s.kind !== 'shoulders') return;
  if (CITIZENS_3D) syncShoulders(reg, body, s, pose);
  else {
    const kid = body.querySelector(':scope > [data-shoulders]');
    const tr = shoulderTransform(keyFor(s, pose));
    if (kid && kid.getAttribute('transform') !== tr) kid.setAttribute('transform', tr);
  }
  poseFigure(reg, body.querySelector(':scope > [data-shoulders] > [data-figure]'), childPose(pose.yaw));
}
// Enfant des épaules posé à la nuque de l'image que montre l'adulte : en 3D, la nuque du rendu (autre silhouette que le
// pantin) ; marcheurs : à chaque pose ; debout : par le registre (GhibliSpectator). L'enfant, lui, a son bassin 3D
// épinglé sur celui de son pantin (`pin="seat"`) : il reste assis à la même hauteur au-dessus de la nuque.
function syncShoulders(reg: FigureRegistry, body: Element, s: Spectator, pose: PoseIn): void {
  const kid = body.querySelector(':scope > [data-shoulders]');
  if (!kid) return;
  const key = keyFor(s, pose);
  const adult = body.querySelector(':scope > [data-figure]');
  const tr = shoulderTransform(key, (shown3DAnchors(adult) ?? anchorsOf(key)).nape);
  if (kid.getAttribute('transform') !== tr) kid.setAttribute('transform', tr);
}

export function ParadeCrowd({ width, seed, sky, still, rainy, dayFests, minutes, metrics, doorXs, ghibli = false }: Props): ReactElement | null {
  const figures = useFigureRegistry();
  const bastille = dayFests.includes('bastille');
  const doorKey = doorXs.join(',');
  // Devant une entrée, le rang du fond s'écarte : on voit encore la porte entre les têtes.
  const doorClear = DOOR_WIDTH / 2 + 2;
  const all = useMemo(
    () => (bastille ? crowdFor(seed, width, doorXs.map((d) => d + DOOR_WIDTH / 2)) : []).filter((s) => !(s.row === 2 && doorXs.some((d) => Math.abs(d + DOOR_WIDTH / 2 - s.x) < doorClear))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bastille, seed, width, doorKey],
  );
  const on = bastille && minutes >= CROWD_TIMES.arrive - MARGIN_MIN && minutes < CROWD_TIMES.gone + MARGIN_MIN;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const statesAt = (t: number): SpectatorPos[] => all.map((s) => spectatorAt(s, t, dayStart));
  // Signature de ce qui est monté : nombre de spectateurs en place (monotone à l'arrivée comme au départ) et marcheurs (« @ » :
  // pendant le seuil d'une porte, autre nœud, le <svg> rogné).
  const sigOf = (states: readonly SpectatorPos[]): string => {
    let n = 0;
    const w: string[] = [];
    states.forEach((p, i) => {
      if (p.mode === 'standing') n++;
      else if (p.mode === 'walking') w.push(p.sill !== undefined ? `${all[i]!.id}@` : all[i]!.id);
    });
    return `${n}|${w.join(',')}`;
  };
  const [sig, setSig] = useState('');
  const root = useRef<SVGGElement | null>(null);

  const place = useMemo(
    () => (t: number): void => {
      if (still || !on) return;
      const states = statesAt(t);
      const key = sigOf(states);
      if (key !== sig) setSig(key);
      const el = root.current;
      if (!el) return;
      states.forEach((p, i) => {
        const s = all[i]!;
        if (p.mode !== 'walking') return;
        const node = el.querySelector(`[data-spectator-id="${s.id}"]`);
        if (!node) return;
        const inSill = p.sill !== undefined;
        // Nœud pas encore recomposé (trottoir ↔ seuil) : laissé tel quel jusqu'au rendu qui suit.
        if (inSill !== (node.tagName === 'svg')) return;
        if (inSill) placeSill(node, openingAt(p.x, metrics), passageOf(p), metrics, sillScale(s, metrics), ghibli ? 1 : p.dir);
        else node.setAttribute('transform', transformOf(s, p, metrics, false, !ghibli));
        if (ghibli) poseWalker(figures, node.querySelector('[data-spectator-body]'), s, walkPose(s, p, metrics));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, dayStart, sig, still, on, metrics, ghibli, figures],
  );
  useWallClockLoop(place, [place]);

  // Rendu : l'état à l'instant présent (mouvement réduit : les spectateurs en place au niveau de la minute).
  const level = crowdLevel(minutes);
  const states = on && !still ? statesAt(now) : [];
  const standing = on ? (still ? all.filter((s) => s.u < level) : all.filter((_, i) => states[i]!.mode === 'standing')) : [];
  const walkers = on && !still ? all.map((s, i) => [s, states[i]!] as const).filter(([, p]) => p.mode === 'walking') : [];
  const standKey = standing.map((s) => s.id).join(',');
  const standNodes = useMemo(
    () =>
      [...standing].sort((a, b) => b.row - a.row).map((s) => (
        <g
          key={s.id}
          data-spectator=""
          data-spectator-id={s.id}
          data-row={s.row}
          data-kind={s.kind}
          data-mode="standing"
          transform={transformOf(s, { x: s.x, depth: CROWD_ROW_DEPTH[s.row] + s.jitter * 1.2, dir: s.dir, mode: 'standing', yaw: spectatorYaw(s), gait: 'stand', walked: 0 }, metrics, true, !ghibli)}
        >
          {ghibli ? <GhibliSpectator s={s} sky={sky} rainy={rainy} pose={standPose(s)} wave={!still} standing /> : <SpectatorSprite s={s} sky={sky} still={still} rainy={rainy} walking={false} />}
        </g>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standKey, sky, still, rainy, metrics, ghibli],
  );
  if (!on || (standing.length === 0 && walkers.length === 0)) return null;
  const walkerBody = (s: Spectator, p: SpectatorPos): ReactElement =>
    ghibli ? <GhibliSpectator s={s} sky={sky} rainy={rainy} pose={walkPose(s, p, metrics)} wave={false} /> : <SpectatorSprite s={s} sky={sky} still={still} rainy={rainy} walking />;
  return (
    <g data-parade-crowd="" data-level={level.toFixed(2)} ref={root}>
      {/* Marcheurs : dans le couloir derrière la foule, dessinés avant elle ; au seuil d'une porte, <svg> rogné à l'ouverture
          (ni clipPath ni masque : ce calque reste copiable par <use>, comme pour la fenêtre soulevée) avec l'ombre de l'entrée. */}
      {walkers.map(([s, p]) => {
        const attrs = { 'data-spectator': '', 'data-spectator-id': s.id, 'data-row': s.row, 'data-kind': s.kind, 'data-mode': 'walking' };
        if (p.sill === undefined)
          return (
            <g key={s.id} {...attrs} transform={transformOf(s, p, metrics, false, !ghibli)}>
              {walkerBody(s, p)}
            </g>
          );
        const k = sillScale(s, metrics);
        const ps = passageOf(p);
        const { clip, dark } = sillBox(openingAt(p.x, metrics), ps.depth, metrics, k);
        return (
          <svg key={`${s.id}@`} {...attrs} data-door="true" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
            <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={doorDarkOpacity(ps.depth).toFixed(2)} />
            <g data-door-fig="" transform={sillFigTransform(ps, clip, metrics, k, ghibli ? 1 : p.dir)} opacity={(1 - ps.depth).toFixed(2)}>
              {walkerBody(s, p)}
            </g>
          </svg>
        );
      })}
      {standNodes}
    </g>
  );
}
