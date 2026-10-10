import { memo, useMemo, useRef, useState, type ReactElement } from 'react';
import { addDays, festivityStartsOn, type YMD } from '../core/library/city/calendar';
import { QUEUE_DEPTH, SERVER_DEPTH, beerSchedule, beerServers, customerAt, queueAt, serverAt, type BeerCustomer, type BeerPersonState, type BeerSchedule, type BeerServer, type ServerState } from '../core/library/city/beer';
import { doorsFor } from '../core/library/city/doors';
import { MUSIC_BARRIER_EDGE, absMinute, beerStandsFor, stageXs } from '../core/library/city/install';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { musicCrowdAt, musicCrowdFor, type MusicCrowdPos, type MusicSpectator } from '../core/library/city/music-crowd';
import type { Outfit } from '../core/library/city/people';
import { dayNumber } from '../core/library/city/shops/hours';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { BeerCup } from './music-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Chaussée de la rue privatisée de la Fête de la musique (spec §7.6) : décors de la chaussée et leurs équipes (barrières en
// travers, stands de bière, reçus d'install-layer.tsx), serveurs, clients et foule, dessinés du plus loin au plus proche
// (`depth` : unités sous le bord du trottoir). Moteurs purs : city/beer.ts (service, file, serveurs) et city/music-crowd.ts
// (foule). Personne n'apparaît ni ne disparaît sur place : chacun arrive et repart à pied, par un bout de la rue (hors champ)
// ou une entrée d'immeuble (fondu court à l'encadrement de la porte seulement).
// Les personnes en place (spectateurs debout, serveurs au comptoir) sont statiques et mémoïsées ; celles qui bougent
// (marcheurs, file qui avance d'un cran, client qui va au comptoir) sont placées à chaque image par la boucle de l'horloge
// murale, qui ne re-rend que lorsque l'ensemble des personnes visibles ou leur mode change. Les spectateurs dansent (petits
// rebonds SMIL déphasés) tant que les musiciens jouent. Mouvement réduit : décors et personnes en place figés, personne en
// marche, aucune animation.
// Hors du plafond des figurants (shopSpriteBudget : aucun `data-worker` ici) : comme la foule du défilé, la foule, les serveurs
// et les clients remplacent les passants ordinaires (réduits à CLOSED_WALKERS pendant la fermeture de la rue) ; comptés dans le
// plafond, ils feraient disparaître clients des commerces et équipes.

export type StreetNode = { depth: number; node: ReactElement };
type Props = { width: number; height: number; seed: number; sky: Sky; still: boolean; rainy: boolean; date: YMD; minutes: number; metrics: CityMetrics; extra: readonly StreetNode[] };

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
};

// Personne en marche : dessinée à sa profondeur, arrondie à BAND unités (le rendu est refait quand elle change de tranche :
// celui qui descend d'une entrée d'immeuble passe derrière un comptoir, celui qui longe l'avant de la chaussée devant tout).
const BAND = 4;
const band = (d: number): number => Math.round(d / BAND) * BAND;

const transformOf = (x: number, depth: number, dir: 1 | -1, m: CityMetrics): string => {
  const k = m.unit * STREET_SCALE.person;
  return `translate(${x.toFixed(1)} ${(m.curb + depth * m.unit).toFixed(1)}) scale(${(dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

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

// Spectateur en place : mémoïsé (ne change qu'avec le ciel, la danse ou le mouvement réduit).
const Fan = memo(function Fan({ s, dance, sky, still, rainy, m }: { s: MusicSpectator; dance: boolean; sky: Sky; still: boolean; rainy: boolean; m: CityMetrics }): ReactElement {
  const bounce = dance && !still;
  const dur = 0.42 + s.phase * 0.2;
  return (
    <g data-music-spectator="" data-fan-id={s.id} data-zone={s.zone} data-mode="standing" data-dance={dance ? 'true' : undefined} transform={transformOf(s.x, s.depth, s.dir, m)}>
      <g>
        {bounce && <animateTransform attributeName="transform" type="translate" values="0 0;0 -2.2;0 0" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />}
        <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} />
        {/* Un danseur sur trois lève le bras (moins d'animations SMIL dans une foule de 200 personnes). */}
        {s.beer ? <HandCup outfit={s.outfit} sky={sky} raise={!dance} still={still} phase={s.phase} /> : dance && s.phase < 0.35 ? <DanceArm outfit={s.outfit} sky={sky} still={still} phase={s.phase} /> : null}
      </g>
    </g>
  );
});

function Walker({ s, p, sky, rainy, m }: { s: MusicSpectator; p: MusicCrowdPos; sky: Sky; rainy: boolean; m: CityMetrics }): ReactElement {
  return (
    <g data-music-spectator="" data-fan-id={s.id} data-zone={s.zone} data-mode="walking" data-door={p.fade !== undefined ? 'true' : undefined} transform={transformOf(p.x, p.depth, p.dir, m)} opacity={(p.fade ?? 1).toFixed(2)}>
      <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} stride={s.phase} />
      {s.beer && <HandCup outfit={s.outfit} sky={sky} raise={false} still phase={s.phase} />}
    </g>
  );
}

// Serveur : tablier blanc ; au service, il tire une bière (bras vers la tireuse, SMIL hors mouvement réduit).
function Server({ v, st, sky, rainy, still, m }: { v: BeerServer; st: ServerState; sky: Sky; rainy: boolean; still: boolean; m: CityMetrics }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const walking = st.mode === 'walking';
  const serving = st.mode === 'serving';
  return (
    <g data-beer-server={v.id} data-serving={serving ? '' : undefined} data-mode={st.mode} transform={transformOf(st.x, st.depth, st.dir, m)} opacity={st.fade !== undefined ? st.fade.toFixed(2) : undefined}>
      <PersonSprite outfit={v.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? 0.3 : null} />
      <rect x={-4.6} y={-24} width={9.2} height={14} rx={1} fill={t('#F4F2EC')} opacity={0.95} />
      {!walking && (
        <g data-server-arm="">
          {serving && !still && <animateTransform attributeName="transform" type="rotate" values="0 2 -25;-25 2 -25;0 2 -25" dur="2.6s" begin={`-${(v.id.length % 5) * 0.5}s`} repeatCount="indefinite" />}
          <path d="M2 -25 L7 -23 L10 -25" stroke={t(v.outfit.topColor)} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        </g>
      )}
    </g>
  );
}

// Client : en marche (jambes au pas), en file, au comptoir (le gobelet posé par le serveur apparaît sur le zinc en fin de
// service, `data-served-cup`, placé par la boucle), puis repartant en buvant, gobelet à la main.
function Customer({ c, st, sky, rainy, still, m }: { c: BeerCustomer; st: BeerPersonState; sky: Sky; rainy: boolean; still: boolean; m: CityMetrics }): ReactElement {
  const walking = st.mode === 'walking-in' || st.mode === 'leaving';
  const phase = (c.n * 0.37) % 1;
  return (
    <g data-queue-person={c.id} data-mode={st.mode} data-rank={st.rank ?? undefined} transform={transformOf(st.x, st.depth, st.dir, m)} opacity={st.fade !== undefined ? st.fade.toFixed(2) : undefined}>
      <PersonSprite outfit={c.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? phase : null} />
      {st.drinking && <HandCup outfit={c.outfit} sky={sky} raise still={still} phase={phase} />}
      {st.mode === 'being-served' && (
        <g data-served-cup="" visibility="hidden" transform="translate(9 -21) scale(1.6)"><BeerCup sky={sky} /></g>
      )}
    </g>
  );
}

// Jour de la fête (dayNumber) dont la soirée couvre cet instant, sinon null.
function festDayOf(date: YMD, minutes: number): number | null {
  if (festivityStartsOn(date, 'music') && minutes >= PEOPLE_FROM) return dayNumber(date);
  const eve = addDays(date, -1);
  if (festivityStartsOn(eve, 'music') && minutes < PEOPLE_TO - 1440) return dayNumber(eve);
  return null;
}

export function MusicStreet({ width, height, seed, sky, still, rainy, date, minutes, metrics, extra }: Props): ReactElement {
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
    return { festDay, schedules, customers, servers, crowd };
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
  // Signature de ce qui est monté : spectateurs en place (et danse), marcheurs et leur tranche de profondeur, modes des
  // serveurs et des clients.
  const sigOf = (s: States | null): string => {
    if (!s) return '';
    let standing = 0;
    let dancing = 0;
    const walkers: string[] = [];
    s.fans.forEach((p, i) => {
      if (p.mode === 'standing') {
        standing++;
        if (p.dance) dancing++;
      } else if (p.mode === 'walking') walkers.push(`${i}@${band(p.depth)}`);
    });
    const servers = s.servers.map((v) => (v.mode === 'walking' ? `w${band(v.depth)}` : v.mode[0])).join(',');
    const queues = s.queues.map((q) => q.map((c) => `${c.id}:${c.mode[0]}${c.mode === 'walking-in' || c.mode === 'leaving' ? band(c.depth) : ''}`).join(',')).join(';');
    return `${standing}/${dancing}|${walkers.join(',')}|${servers}|${queues}`;
  };
  const [, setSig] = useState('');
  const sigRef = useRef('');
  const root = useRef<SVGGElement | null>(null);

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
        const node = el.querySelector(`[data-fan-id="${data.crowd[i]!.id}"]`);
        if (!node) return;
        node.setAttribute('transform', transformOf(p.x, p.depth, p.dir, metrics));
        if (p.fade !== undefined) node.setAttribute('opacity', p.fade.toFixed(2));
      });
      s.servers.forEach((p, i) => {
        if (p.mode !== 'walking') return;
        const node = el.querySelector(`[data-beer-server="${data.servers[i]!.id}"]`);
        if (!node) return;
        node.setAttribute('transform', transformOf(p.x, p.depth, p.dir, metrics));
        if (p.fade !== undefined) node.setAttribute('opacity', p.fade.toFixed(2));
      });
      for (const q of s.queues) {
        for (const p of q) {
          const node = el.querySelector(`[data-queue-person="${p.id}"]`);
          if (!node) continue;
          node.setAttribute('transform', transformOf(p.x, p.depth, p.dir, metrics));
          if (p.fade !== undefined) node.setAttribute('opacity', p.fade.toFixed(2));
          if (p.mode === 'being-served') {
            const c = data.customers.get(p.id)!;
            // Le gobelet est posé sur le zinc dans les 4 dernières secondes du service.
            node.querySelector('[data-served-cup]')?.setAttribute('visibility', a >= c.end - 4 / 60 ? 'visible' : 'hidden');
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, dayStart, still, metrics, day0],
  );
  useWallClockLoop(place, [place]);

  // Rendu : l'état à l'instant présent (mouvement réduit : seulement ce qui est en place, immobile).
  const s = statesAt(now);
  const items: StreetNode[] = [...extra];
  const standing: { s: MusicSpectator; dance: boolean }[] = [];
  if (data && s) {
    s.fans.forEach((p, i) => {
      const fan = data.crowd[i]!;
      if (p.mode === 'standing') standing.push({ s: fan, dance: p.dance });
      else if (p.mode === 'walking' && !still) items.push({ depth: band(p.depth) + 0.2, node: <Walker key={fan.id} s={fan} p={p} sky={sky} rainy={rainy} m={metrics} /> });
    });
    // Serveurs en place : derrière les comptoirs ; ceux qui arrivent ou repartent, à leur profondeur.
    const servers = data.servers
      .map((v, i) => [v, s.servers[i]!] as const)
      .filter(([, st]) => st.mode !== 'absent' && (!still || st.mode !== 'walking'));
    for (const [v, st] of servers) {
      if (st.mode === 'walking') items.push({ depth: band(st.depth) + 0.1, node: <Server key={v.id} v={v} st={st} sky={sky} rainy={rainy} still={still} m={metrics} /> });
    }
    for (const sc of data.schedules) {
      const mine = servers.filter(([v, st]) => v.standId === sc.stand.id && st.mode !== 'walking');
      if (mine.length > 0) {
        items.push({
          depth: SERVER_DEPTH,
          node: <g key={`${sc.stand.id}-servers`} data-beer-servers={sc.stand.id}>{mine.map(([v, st]) => <Server key={v.id} v={v} st={st} sky={sky} rainy={rainy} still={still} m={metrics} />)}</g>,
        });
      }
    }
    // Clients en file et au comptoir : devant le comptoir ; ceux qui arrivent ou repartent, à leur profondeur. Mouvement réduit :
    // seulement la file et le comptoir.
    data.schedules.forEach((sc, k) => {
      const all = s.queues[k]!.filter((p) => !still || p.mode === 'waiting' || p.mode === 'being-served');
      for (const p of all) {
        if (p.mode === 'walking-in' || p.mode === 'leaving') items.push({ depth: band(p.depth) + 0.3, node: <Customer key={p.id} c={data.customers.get(p.id)!} st={p} sky={sky} rainy={rainy} still={still} m={metrics} /> });
      }
      const list = all.filter((p) => p.mode === 'waiting' || p.mode === 'being-served');
      if (list.length === 0) return;
      items.push({
        depth: QUEUE_DEPTH - 0.5,
        node: (
          <g key={`${sc.stand.id}-queue`} data-beer-queue={sc.stand.id}>
            {list.map((p) => <Customer key={p.id} c={data.customers.get(p.id)!} st={p} sky={sky} rainy={rainy} still={still} m={metrics} />)}
          </g>
        ),
      });
    });
  }
  const standKey = standing.map((f) => `${f.s.id}${f.dance ? '*' : ''}`).join(',');
  const fanNodes = useMemo(
    () => standing.map((f) => ({ depth: f.s.depth, node: <Fan key={f.s.id} s={f.s} dance={f.dance} sky={sky} still={still} rainy={rainy} m={metrics} /> })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standKey, sky, still, rainy, metrics],
  );
  items.push(...fanNodes);
  items.sort((a, b) => a.depth - b.depth);
  return (
    <g data-music-street="" ref={root}>
      {items.map((i) => i.node)}
    </g>
  );
}
