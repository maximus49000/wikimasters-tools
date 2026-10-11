import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { addDays, festivityStartsOn, type YMD } from '../core/library/city/calendar';
import { QUEUE_DEPTH, SERVER_DEPTH, beerSchedule, beerServers, queueAt, serverAt, type BeerCustomer, type BeerPersonState, type BeerSchedule, type BeerServer, type ServerState } from '../core/library/city/beer';
import { DOOR_DARK, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { doorsFor } from '../core/library/city/doors';
import { MUSIC_BARRIER_EDGE, absMinute, beerStandsFor, stageXs } from '../core/library/city/install';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { musicCrowdAt, musicCrowdFor, type MusicCrowdPos, type MusicSpectator } from '../core/library/city/music-crowd';
import type { Outfit } from '../core/library/city/people';
import { dayNumber } from '../core/library/city/shops/hours';
import { phaseIndexOf } from '../core/library/figure/gait';
import type { ArmPose } from '../core/library/figure/skeleton';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { useFigureRegistry, type FigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type Held, type PoseIn } from './figure/ghibli-figure';
import { BeerCup } from './music-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Chaussée de la rue privatisée de la Fête de la musique (spec §7.6) : décors de la chaussée et leurs équipes (barrières en
// travers, stands de bière, reçus d'install-layer.tsx), serveurs, clients et foule, dessinés du plus loin au plus proche
// (`depth` : unités sous le bord du trottoir). Moteurs purs : city/beer.ts (service, file, serveurs) et city/music-crowd.ts
// (foule). Personne n'apparaît ni ne disparaît sur place : chacun arrive et repart à pied, par un bout de la rue (hors champ)
// ou une entrée d'immeuble, en passant le seuil de la porte (door-passage.ts : <svg> rogné à l'ouverture, ombre de l'entrée) ;
// aucun fondu, dans les deux graphismes.
// Les personnes en place (spectateurs debout, serveurs au comptoir) sont statiques et mémoïsées ; celles qui bougent
// (marcheurs, file qui avance d'un cran, client qui va au comptoir) sont placées à chaque image par la boucle de l'horloge
// murale, qui ne re-rend que lorsque l'ensemble des personnes visibles, leur mode ou leur passage d'un seuil change. Les
// spectateurs dansent (petits rebonds SMIL déphasés sur le groupe porteur) tant que les musiciens jouent. Mouvement réduit :
// décors et personnes en place figés, personne en marche, aucune animation.
// Ghibli : pantins sans miroir (orientation = yaw des moteurs). Danseurs : pose fixe (`cheer`, `raise` ou `swing`), le rebond
// SMIL porte le pantin ; gobelet à la main droite (`cup`), ceux qui ne dansent pas boivent (`cup` ↔ `up`, posé par la boucle).
// Serveurs en tablier : `work` à la tireuse, `hold` en tendant le gobelet (posés par la boucle) ; clients : marche réglée sur
// la distance, `reach` vers le gobelet tendu, repartent gobelet à la main.
// Hors du plafond des figurants (shopSpriteBudget : aucun `data-worker` ici) : comme la foule du défilé, la foule, les serveurs
// et les clients remplacent les passants ordinaires (réduits à CLOSED_WALKERS pendant la fermeture de la rue) ; comptés dans le
// plafond, ils feraient disparaître clients des commerces et équipes.

export type StreetNode = { depth: number; node: ReactElement };
type Props = { width: number; height: number; seed: number; sky: Sky; still: boolean; rainy: boolean; date: YMD; minutes: number; metrics: CityMetrics; extra: readonly StreetNode[]; ghibli?: boolean };

// Fenêtre où la chaussée a du monde (minutes du jour de la fête) : des premiers serveurs (≈ 16 h 40) au départ de ceux qui
// attendent l'équipe de nuit (2 h 30 le lendemain, plus leur marche).
const PEOPLE_FROM = 16 * 60;
const PEOPLE_TO = 24 * 60 + 3 * 60;
// Fond de foule : rien contre les barrières des bouts de la rue.
const EDGE_CLEAR = MUSIC_BARRIER_EDGE + 20;

type Data = {
  festDay: number;
  schedules: BeerSchedule[];
  customers: Map<string, BeerCustomer>;
  servers: BeerServer[];
  crowd: MusicSpectator[];
  fans: Map<string, MusicSpectator>;
  standIndex: Map<string, number>;
};

// Personne en marche : dessinée à sa profondeur, arrondie à BAND unités (le rendu est refait quand elle change de tranche :
// celui qui descend d'une entrée d'immeuble passe derrière un comptoir, celui qui longe l'avant de la chaussée devant tout).
const BAND = 4;
const band = (d: number): number => Math.round(d / BAND) * BAND;

const scaleOf = (m: CityMetrics): number => m.unit * STREET_SCALE.person;
// `mirror` : le dessin classique se retourne selon le sens ; le pantin Ghibli se tourne par son yaw.
const transformOf = (x: number, depth: number, dir: 1 | -1, m: CityMetrics, mirror = true): string => {
  const k = scaleOf(m);
  return `translate(${x.toFixed(1)} ${(m.curb + depth * m.unit).toFixed(1)}) scale(${((mirror ? dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`;
};

// ---------- Seuil des portes ----------
// Personne qui bouge : position, sens du profil classique, orientation du pantin ; `sill` pendant le seuil d'une porte
// d'immeuble (x = centre de la porte, pieds sur la ligne des portes).
type Moving = { x: number; depth: number; dir: 1 | -1; yaw: number; sill?: number };
const openingAt = (x: number, m: CityMetrics) => entranceOpening(x - DOOR_WIDTH / 2, m);
const passageOf = (p: Moving): Passage => ({ stage: 'threshold', x: p.x, depth: p.sill ?? 0, yaw: p.yaw, gait: 'walk', walked: 0 });
type Attrs = Record<string, string | number | undefined>;

// Nœud d'une personne : <g> sur la chaussée ; au seuil d'une porte, <svg> rogné à l'ouverture (ni clipPath ni masque : ce
// calque est copié par <use>) avec l'ombre de l'entrée ; la clé de l'appelant change au passage (« @ »).
function Mover({ attrs, p, m, ghibli, children }: { attrs: Attrs; p: Moving; m: CityMetrics; ghibli: boolean; children: ReactNode }): ReactElement {
  if (p.sill === undefined) return <g {...attrs} transform={transformOf(p.x, p.depth, p.dir, m, !ghibli)}>{children}</g>;
  const k = scaleOf(m);
  const ps = passageOf(p);
  const { clip, dark } = sillBox(openingAt(p.x, m), ps.depth, m, k);
  return (
    <svg {...attrs} data-door="true" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
      <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={doorDarkOpacity(ps.depth).toFixed(2)} />
      <g data-door-fig="" transform={sillFigTransform(ps, clip, m, k, ghibli ? 1 : p.dir)} opacity={(1 - ps.depth).toFixed(2)}>
        {children}
      </g>
    </svg>
  );
}
const keyOf = (id: string, p: Moving): string => (p.sill !== undefined ? `${id}@` : id);
// Placement par la boucle ; false : nœud pas encore recomposé (chaussée ↔ seuil), laissé tel quel jusqu'au rendu qui suit.
function placeMover(node: Element, p: Moving, m: CityMetrics, ghibli: boolean): boolean {
  const inSill = p.sill !== undefined;
  if (inSill !== (node.tagName === 'svg')) return false;
  if (inSill) placeSill(node, openingAt(p.x, m), passageOf(p), m, scaleOf(m), ghibli ? 1 : p.dir);
  else node.setAttribute('transform', transformOf(p.x, p.depth, p.dir, m, !ghibli));
  return true;
}

// ---------- Poses du pantin ----------
type Step = { yaw: number; gait: 'walk' | 'step' | 'stand'; walked: number };
// Pas réglé sur la distance parcourue (px → unités du pantin) ; demi-tour : petits pas sur place.
const stepPose = (p: Step, m: CityMetrics, arms: ArmPose): PoseIn => ({ yaw: p.yaw, gait: p.gait, phase: p.gait === 'walk' ? phaseIndexOf(p.walked / scaleOf(m)) : 0, head: 0, arms });
// Gorgée : le bras monte au visage (`up`) de 60 % à 78 % de chaque cycle de DRINK_S secondes, déphasé par spectateur.
export const DRINK_S = 5;
const sipping = (phase: number, t: number): boolean => {
  const f = (((t / DRINK_S + phase) % 1) + 1) % 1;
  return f >= 0.6 && f < 0.78;
};
// Bras d'un spectateur en place : gobelet (`cup` ; il boit s'il ne danse pas, hors mouvement réduit) ; danseur : deux bras
// levés (`cheer`, un sur trois), un bras levé (`raise`) ou bras au repos (`swing`, immobile) ; sinon bras au repos.
export function fanArms(s: Pick<MusicSpectator, 'beer' | 'phase'>, dance: boolean, t: number, still: boolean): ArmPose {
  if (s.beer) return !dance && !still && sipping(s.phase, t) ? 'up' : 'cup';
  if (!dance) return 'swing';
  return s.phase < 0.35 ? 'cheer' : s.phase < 0.6 ? 'raise' : 'swing';
}
const standPose = (s: MusicSpectator, dance: boolean, t: number, still: boolean): PoseIn => ({ yaw: s.yaw, gait: 'stand', phase: 0, head: 0, arms: fanArms(s, dance, t, still) });
// Gobelet tenu à la main droite du pantin (poignet à l'origine, la main le serre à mi-hauteur).
function HeldCup({ sky }: { sky: Sky }): ReactElement {
  return <g data-held-cup="" transform="translate(0 2.2) scale(1.1)"><BeerCup sky={sky} /></g>;
}
const cupHeld = (sky: Sky): Held[] => [{ anchor: 'handR', node: <HeldCup sky={sky} /> }];
// Le serveur tend le gobelet les CUP_S dernières secondes du service (le client tend la main) ; avant, il tire la bière.
const CUP_S = 4;
const handing = (c: BeerCustomer, a: number): boolean => a >= c.end - CUP_S / 60;
type Gesture = 'work' | 'hold' | 'down';
export function serverGesture(v: Pick<BeerServer, 'slot'>, queue: readonly BeerPersonState[], customers: ReadonlyMap<string, BeerCustomer>, a: number): Gesture {
  for (const p of queue) {
    if (p.mode !== 'being-served') continue;
    const c = customers.get(p.id);
    if (c && c.server === v.slot) return handing(c, a) ? 'hold' : 'work';
  }
  return 'down';
}
const serverArms = (st: ServerState, gesture: Gesture): ArmPose => (st.mode === 'walking' ? 'swing' : st.mode === 'serving' ? gesture : 'down');
const customerArms = (c: BeerCustomer, st: BeerPersonState, a: number): ArmPose => (st.drinking ? 'cup' : st.mode === 'being-served' && handing(c, a) ? 'reach' : 'swing');

// ---------- Classique ----------
// Gobelet tenu à la main (repère du PersonSprite, regard vers +x : main devant, à mi-hauteur), bras plié.
function HandCup({ outfit, sky, raise, still, phase }: { outfit: Outfit; sky: Sky; raise: boolean; still: boolean; phase: number }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-hand-cup="">
      {raise && !still && (
        <animateTransform attributeName="transform" type="rotate" values="0 3 -25;0 3 -25;-32 3 -25;0 3 -25" keyTimes="0;0.6;0.75;1" dur="5s" begin={`-${(phase * 5).toFixed(2)}s`} repeatCount="indefinite" />
      )}
      <path d="M3 -25 L6 -20 L8 -22" stroke={t(outfit.topColor)} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <g transform="translate(8.6 -20.5) scale(1.6)"><BeerCup sky={sky} /></g>
    </g>
  );
}

// Bras levé de danseur (main ouverte), agité hors mouvement réduit.
function DanceArm({ outfit, sky, still, phase }: { outfit: Outfit; sky: Sky; still: boolean; phase: number }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const dur = 0.9 + phase * 0.6;
  return (
    <g data-arm="">
      {!still && <animateTransform attributeName="transform" type="rotate" values="-14 4 -26;14 4 -26;-14 4 -26" dur={`${dur.toFixed(2)}s`} begin={`-${(phase * dur).toFixed(2)}s`} repeatCount="indefinite" />}
      <path d="M4 -26 L7 -37" stroke={t(outfit.topColor)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <circle cx={7.2} cy={-38} r={1.5} fill={t(outfit.skin)} />
    </g>
  );
}

// Spectateur en place : mémoïsé (ne change qu'avec le ciel, la danse, le graphisme ou le mouvement réduit ; aucun instant dans
// ses props : quand la foule change, seuls les nouveaux venus sont rendus). Ghibli : premier rendu gobelet à la poitrine
// (`cup`) ; `data-drinker` désigne ceux dont la boucle pose ensuite les gorgées, dès l'image suivante.
const Fan = memo(function Fan({ s, dance, sky, still, rainy, m, ghibli }: { s: MusicSpectator; dance: boolean; sky: Sky; still: boolean; rainy: boolean; m: CityMetrics; ghibli: boolean }): ReactElement {
  const bounce = dance && !still;
  const dur = 0.42 + s.phase * 0.2;
  return (
    <g
      data-music-spectator=""
      data-fan-id={s.id}
      data-zone={s.zone}
      data-mode="standing"
      data-dance={dance ? 'true' : undefined}
      data-drinker={ghibli && s.beer && !dance && !still ? '' : undefined}
      transform={transformOf(s.x, s.depth, s.dir, m, !ghibli)}
    >
      <g>
        {bounce && <animateTransform attributeName="transform" type="translate" values="0 0;0 -2.2;0 0" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />}
        {ghibli ? (
          <GhibliFigure outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} initial={standPose(s, dance, 0, true)} held={s.beer ? cupHeld(sky) : undefined} />
        ) : (
          <>
            <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} />
            {/* Un danseur sur trois lève le bras (moins d'animations SMIL dans une foule de 200 personnes). */}
            {s.beer ? <HandCup outfit={s.outfit} sky={sky} raise={!dance} still={still} phase={s.phase} /> : dance && s.phase < 0.35 ? <DanceArm outfit={s.outfit} sky={sky} still={still} phase={s.phase} /> : null}
          </>
        )}
      </g>
    </g>
  );
});

function Walker({ s, p, sky, rainy, m, ghibli }: { s: MusicSpectator; p: MusicCrowdPos; sky: Sky; rainy: boolean; m: CityMetrics; ghibli: boolean }): ReactElement {
  return (
    <Mover attrs={{ 'data-music-spectator': '', 'data-fan-id': s.id, 'data-zone': s.zone, 'data-mode': 'walking' }} p={p} m={m} ghibli={ghibli}>
      {ghibli ? (
        <GhibliFigure outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} initial={stepPose(p, m, s.beer ? 'cup' : 'swing')} held={s.beer ? cupHeld(sky) : undefined} />
      ) : (
        <>
          <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} stride={s.phase} />
          {s.beer && <HandCup outfit={s.outfit} sky={sky} raise={false} still phase={s.phase} />}
        </>
      )}
    </Mover>
  );
}

// Serveur : tablier blanc ; au service, il tire une bière (classique : bras vers la tireuse, SMIL hors mouvement réduit ;
// Ghibli : `work`, puis `hold`, gobelet tendu — `data-server-cup`, visible seulement alors).
function Server({ v, st, sky, rainy, still, m, ghibli, gesture }: { v: BeerServer; st: ServerState; sky: Sky; rainy: boolean; still: boolean; m: CityMetrics; ghibli: boolean; gesture: Gesture }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const walking = st.mode === 'walking';
  const serving = st.mode === 'serving';
  const arms = serverArms(st, gesture);
  return (
    <Mover attrs={{ 'data-beer-server': v.id, 'data-serving': serving ? '' : undefined, 'data-mode': st.mode }} p={st} m={m} ghibli={ghibli}>
      {ghibli ? (
        <GhibliFigure
          outfit={v.outfit}
          sky={sky}
          rainy={rainy}
          umbrella={false}
          work="apron"
          initial={stepPose(st, m, arms)}
          held={[{ anchor: 'handR', node: <g data-server-cup="" visibility={arms === 'hold' ? undefined : 'hidden'}><HeldCup sky={sky} /></g> }]}
        />
      ) : (
        <>
          <PersonSprite outfit={v.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? 0.3 : null} />
          <rect x={-4.6} y={-24} width={9.2} height={14} rx={1} fill={t('#F4F2EC')} opacity={0.95} />
          {!walking && (
            <g data-server-arm="">
              {serving && !still && <animateTransform attributeName="transform" type="rotate" values="0 2 -25;-25 2 -25;0 2 -25" dur="2.6s" begin={`-${(v.id.length % 5) * 0.5}s`} repeatCount="indefinite" />}
              <path d="M2 -25 L7 -23 L10 -25" stroke={t(v.outfit.topColor)} strokeWidth={2.2} strokeLinecap="round" fill="none" />
            </g>
          )}
        </>
      )}
    </Mover>
  );
}

// Client : en marche (jambes au pas), en file, au comptoir (classique : le gobelet posé par le serveur apparaît sur le zinc en
// fin de service, `data-served-cup`, placé par la boucle ; Ghibli : le serveur le lui tend), puis repartant en buvant,
// gobelet à la main.
function Customer({ c, st, sky, rainy, still, m, ghibli, a }: { c: BeerCustomer; st: BeerPersonState; sky: Sky; rainy: boolean; still: boolean; m: CityMetrics; ghibli: boolean; a: number }): ReactElement {
  const walking = st.mode === 'walking-in' || st.mode === 'leaving';
  const phase = (c.n * 0.37) % 1;
  return (
    <Mover attrs={{ 'data-queue-person': c.id, 'data-mode': st.mode, 'data-rank': st.rank ?? undefined }} p={st} m={m} ghibli={ghibli}>
      {ghibli ? (
        <GhibliFigure outfit={c.outfit} sky={sky} rainy={rainy} umbrella={false} initial={stepPose(st, m, customerArms(c, st, a))} held={st.drinking ? cupHeld(sky) : undefined} />
      ) : (
        <>
          <PersonSprite outfit={c.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? phase : null} />
          {st.drinking && <HandCup outfit={c.outfit} sky={sky} raise still={still} phase={phase} />}
          {st.mode === 'being-served' && (
            <g data-served-cup="" visibility="hidden" transform="translate(9 -21) scale(1.6)"><BeerCup sky={sky} /></g>
          )}
        </>
      )}
    </Mover>
  );
}

// Jour de la fête (dayNumber) dont la soirée couvre cet instant, sinon null.
function festDayOf(date: YMD, minutes: number): number | null {
  if (festivityStartsOn(date, 'music') && minutes >= PEOPLE_FROM) return dayNumber(date);
  const eve = addDays(date, -1);
  if (festivityStartsOn(eve, 'music') && minutes < PEOPLE_TO - 1440) return dayNumber(eve);
  return null;
}

// Pose d'un serveur par la boucle (Ghibli) : marche ou geste au comptoir, gobelet tendu visible seulement pendant `hold`.
function poseServer(reg: FigureRegistry, node: Element, st: ServerState, gesture: Gesture, m: CityMetrics): void {
  const fig = node.querySelector('[data-figure]');
  const arms = serverArms(st, gesture);
  poseFigure(reg, fig, stepPose(st, m, arms));
  const cup = fig?.querySelector('[data-server-cup]');
  if (!cup) return;
  if (arms === 'hold') cup.removeAttribute('visibility');
  else if (cup.getAttribute('visibility') !== 'hidden') cup.setAttribute('visibility', 'hidden');
}

export function MusicStreet({ width, height, seed, sky, still, rainy, date, minutes, metrics, extra, ghibli = false }: Props): ReactElement {
  const figures = useFigureRegistry();
  const festDay = festDayOf(date, minutes);
  const u = metrics.unit;
  const data = useMemo<Data | null>(() => {
    if (festDay === null) return null;
    const stands = beerStandsFor(width, height, seed);
    const doors = doorsFor(width, height, seed).map((d) => d.x + DOOR_WIDTH / 2);
    const schedules = stands.map((stand) => beerSchedule({ seed, stand, day: festDay, width, unit: u, doors }));
    const customers = new Map(schedules.flatMap((s) => s.customers.map((c) => [c.id, c] as const)));
    const servers = stands.flatMap((stand) => beerServers({ seed, stand, day: festDay, width, unit: u, doors }));
    const crowd = musicCrowdFor({ seed, width, day: festDay, stages: stageXs(width, seed), stands, doors, unit: u })
      .filter((s) => s.zone !== 'back' || (s.x > EDGE_CLEAR * u && s.x < width - EDGE_CLEAR * u));
    const fans = new Map(crowd.map((s) => [s.id, s] as const));
    const standIndex = new Map(stands.map((st, i) => [st.id, i] as const));
    return { festDay, schedules, customers, servers, crowd, fans, standIndex };
  }, [festDay, width, height, seed, u]);

  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const day0 = absMinute(dayNumber(date), 0);
  const absAt = (t: number): number => day0 + (t - dayStart) / 60;

  type States = { fans: MusicCrowdPos[]; servers: ServerState[]; queues: BeerPersonState[][] };
  const statesAt = (t: number): States | null => {
    if (!data) return null;
    const a = absAt(t);
    return {
      fans: data.crowd.map((s) => musicCrowdAt(s, a)),
      servers: data.servers.map((v) => serverAt(v, a)),
      queues: data.schedules.map((sc) => queueAt(sc, a)),
    };
  };
  const gestureOf = (s: States, v: BeerServer, a: number): Gesture => (data ? serverGesture(v, s.queues[data.standIndex.get(v.standId) ?? 0] ?? [], data.customers, a) : 'down');
  // Signature de ce qui est monté : spectateurs en place (et danse), marcheurs, leur tranche de profondeur et leur passage d'un
  // seuil (« # » : autre nœud, le <svg> rogné), modes des serveurs et des clients.
  const sigOf = (s: States | null): string => {
    if (!s) return '';
    const sill = (p: { sill?: number }): string => (p.sill !== undefined ? '#' : '');
    let standing = 0;
    let dancing = 0;
    const walkers: string[] = [];
    s.fans.forEach((p, i) => {
      if (p.mode === 'standing') {
        standing++;
        if (p.dance) dancing++;
      } else if (p.mode === 'walking') walkers.push(`${i}${sill(p)}@${band(p.depth)}`);
    });
    const servers = s.servers.map((v) => (v.mode === 'walking' ? `w${sill(v)}${band(v.depth)}` : v.mode[0])).join(',');
    const queues = s.queues.map((q) => q.map((c) => `${c.id}:${c.mode[0]}${c.mode === 'walking-in' || c.mode === 'leaving' ? `${sill(c)}${band(c.depth)}` : ''}`).join(',')).join(';');
    return `${standing}/${dancing}|${walkers.join(',')}|${servers}|${queues}`;
  };
  const [, setSig] = useState('');
  const sigRef = useRef('');
  const root = useRef<SVGGElement | null>(null);
  // Buveurs (Ghibli) : relus après chaque rendu, posés à chaque image (poseFigure n'écrit que si la pose change).
  const drinkers = useRef<{ s: MusicSpectator; fig: Element }[] | null>(null);
  useLayoutEffect(() => {
    drinkers.current = null;
  });

  const place = useMemo(
    () => (t: number): void => {
      if (still || !data) return;
      const s = statesAt(t);
      if (!s) return;
      const key = sigOf(s);
      if (key !== sigRef.current) {
        sigRef.current = key;
        setSig(key);
      }
      const el = root.current;
      if (!el) return;
      const a = absAt(t);
      s.fans.forEach((p, i) => {
        if (p.mode !== 'walking') return;
        const fan = data.crowd[i]!;
        const node = el.querySelector(`[data-fan-id="${fan.id}"]`);
        if (!node || !placeMover(node, p, metrics, ghibli)) return;
        if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), stepPose(p, metrics, fan.beer ? 'cup' : 'swing'));
      });
      s.servers.forEach((p, i) => {
        if (p.mode === 'absent' || (p.mode !== 'walking' && !ghibli)) return;
        const v = data.servers[i]!;
        const node = el.querySelector(`[data-beer-server="${v.id}"]`);
        if (!node) return;
        if (p.mode === 'walking' && !placeMover(node, p, metrics, ghibli)) return;
        if (ghibli) poseServer(figures, node, p, gestureOf(s, v, a), metrics);
      });
      for (const q of s.queues) {
        for (const p of q) {
          const node = el.querySelector(`[data-queue-person="${p.id}"]`);
          if (!node || !placeMover(node, p, metrics, ghibli)) continue;
          const c = data.customers.get(p.id)!;
          if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), stepPose(p, metrics, customerArms(c, p, a)));
          // Classique : le gobelet est posé sur le zinc dans les 4 dernières secondes du service.
          else if (p.mode === 'being-served') node.querySelector('[data-served-cup]')?.setAttribute('visibility', handing(c, a) ? 'visible' : 'hidden');
        }
      }
      if (ghibli) {
        drinkers.current ??= [...el.querySelectorAll('[data-drinker]')].flatMap((n) => {
          const fan = data.fans.get(n.getAttribute('data-fan-id') ?? '');
          const fig = n.querySelector('[data-figure]');
          return fan && fig ? [{ s: fan, fig }] : [];
        });
        for (const d of drinkers.current) poseFigure(figures, d.fig, standPose(d.s, false, t, false));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, dayStart, still, metrics, day0, ghibli, figures],
  );
  useWallClockLoop(place, [place]);

  // Rendu : l'état à l'instant présent (mouvement réduit : seulement ce qui est en place, immobile).
  const s = statesAt(now);
  const a = absAt(now);
  const items: StreetNode[] = [...extra];
  const standing: { s: MusicSpectator; dance: boolean }[] = [];
  if (data && s) {
    s.fans.forEach((p, i) => {
      const fan = data.crowd[i]!;
      if (p.mode === 'standing') standing.push({ s: fan, dance: p.dance });
      else if (p.mode === 'walking' && !still) items.push({ depth: band(p.depth) + 0.2, node: <Walker key={keyOf(fan.id, p)} s={fan} p={p} sky={sky} rainy={rainy} m={metrics} ghibli={ghibli} /> });
    });
    // Serveurs en place : derrière les comptoirs ; ceux qui arrivent ou repartent, à leur profondeur.
    const servers = data.servers
      .map((v, i) => [v, s.servers[i]!] as const)
      .filter(([, st]) => st.mode !== 'absent' && (!still || st.mode !== 'walking'));
    const server = (v: BeerServer, st: ServerState): ReactElement => (
      <Server key={keyOf(v.id, st)} v={v} st={st} sky={sky} rainy={rainy} still={still} m={metrics} ghibli={ghibli} gesture={gestureOf(s, v, a)} />
    );
    for (const [v, st] of servers) {
      if (st.mode === 'walking') items.push({ depth: band(st.depth) + 0.1, node: server(v, st) });
    }
    for (const sc of data.schedules) {
      const mine = servers.filter(([v, st]) => v.standId === sc.stand.id && st.mode !== 'walking');
      if (mine.length > 0) {
        items.push({
          depth: SERVER_DEPTH,
          node: <g key={`${sc.stand.id}-servers`} data-beer-servers={sc.stand.id}>{mine.map(([v, st]) => server(v, st))}</g>,
        });
      }
    }
    // Clients en file et au comptoir : devant le comptoir ; ceux qui arrivent ou repartent, à leur profondeur. Mouvement réduit :
    // seulement la file et le comptoir.
    data.schedules.forEach((sc, k) => {
      const all = s.queues[k]!.filter((p) => !still || p.mode === 'waiting' || p.mode === 'being-served');
      const customer = (p: BeerPersonState): ReactElement => (
        <Customer key={keyOf(p.id, p)} c={data.customers.get(p.id)!} st={p} sky={sky} rainy={rainy} still={still} m={metrics} ghibli={ghibli} a={a} />
      );
      for (const p of all) {
        if (p.mode === 'walking-in' || p.mode === 'leaving') items.push({ depth: band(p.depth) + 0.3, node: customer(p) });
      }
      const list = all.filter((p) => p.mode === 'waiting' || p.mode === 'being-served');
      if (list.length === 0) return;
      items.push({
        depth: QUEUE_DEPTH - 0.5,
        node: (
          <g key={`${sc.stand.id}-queue`} data-beer-queue={sc.stand.id}>
            {list.map(customer)}
          </g>
        ),
      });
    });
  }
  const standKey = standing.map((f) => `${f.s.id}${f.dance ? '*' : ''}`).join(',');
  const fanNodes = useMemo(
    () => standing.map((f) => ({ depth: f.s.depth, node: <Fan key={f.s.id} s={f.s} dance={f.dance} sky={sky} still={still} rainy={rainy} m={metrics} ghibli={ghibli} /> })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standKey, sky, still, rainy, metrics, ghibli],
  );
  items.push(...fanNodes);
  items.sort((a, b) => a.depth - b.depth);
  return (
    <g data-music-street="" ref={root}>
      {items.map((i) => i.node)}
    </g>
  );
}
