import { useMemo, useRef, type ReactElement } from 'react';
import { groupFigures, residentAt, scareAt, scareSpan, doorStateAt, type DoorEvent, type NightFigure, type NightGroup, type NightMember, type NightPlan, type NightScare } from '../core/library/city/halloween-night';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { DOOR_DARK } from '../core/library/city/doorway';
import { entranceScale } from '../core/library/paint/city-plan';
import { phaseIndexOf, YAW_FRONT } from '../core/library/figure/gait';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
// Écrit l'attribut s'il change ; vrai s'il a changé (la figure n'est cachée qu'à la bascule).
const changed = (node: Element | null, name: string, value: string): boolean => {
  if (!node || node.getAttribute(name) === value) return false;
  node.setAttribute(name, value);
  return true;
};
const setIfChanged = (node: Element | null, name: string, value: string): void => void changed(node, name, value);
import { useWallClockLoop } from './use-wallclock-loop';

// Nuit d'Halloween (spec Halloween §5.4) : groupes de la soirée (familles de porte en porte, jeunes, adultes déguisés), habitant
// qui ouvre dans l'embrasure (porte ouverte sur le hall éclairé), farces (sonner et s'enfuir, faire peur). Le plan est pur
// (city/halloween-night.ts) : React rend, à la minute, les groupes et les scènes proches de l'instant ; la boucle pose chaque
// figure à la seconde de la scène (`sceneS`). Le hall des portes est allumé par la boucle de city-life (même minuterie que les
// habitants). Mouvement réduit : les groupes à leur place, debout, sans scène de porte ni farce. Ghibli seulement.
type Props = { plan: NightPlan; width: number; metrics: CityMetrics; sky: Sky; rainy: boolean; still: boolean; minutes: number; sceneS: (now: number) => number; frozenT: number };

// Fenêtre des groupes rendus autour de la minute (secondes avant, après) : un groupe qui entre dans la minute est déjà monté.
const BEFORE = 90;
const AFTER = 150;
// Lumière du hall vue par l'embrasure ouverte (nuit) ; ombre de l'entrée le jour.
const HALL_GLOW = '#F4DFA8';

// Vantaux de l'entrée peinte (paint/shop/entrance.ts, repère de la maquette : ±6 de large, 18 de haut sous l'imposte).
const leafOf = (cx: number, m: CityMetrics): { x: number; y: number; w: number; h: number } => {
  const s = entranceScale(m.unit);
  return { x: cx - 6 * s, y: m.doorY - 18 * s, w: 12 * s, h: 18 * s };
};
const kOf = (m: CityMetrics, member: NightMember): number => m.unit * STREET_SCALE.person * member.scale;
const yOf = (m: CityMetrics, step: number): number => m.walkY + (m.doorY - m.walkY) * step;
const poseOf = (f: { yaw: number; gait: PoseIn['gait']; arms: PoseIn['arms']; head: number; walked: number }, k: number, still: boolean): PoseIn =>
  still ? { yaw: f.yaw, gait: 'stand', phase: 0, head: 0, arms: f.arms === 'hold' ? 'hold' : 'down' } : { yaw: f.yaw, gait: f.gait, phase: phaseIndexOf(f.walked / k), head: f.head, arms: f.arms };

// Seau citrouille ou sac (repère de la main, unités du pantin).
function Bucket({ kind, sky }: { kind: 'bucket' | 'bag'; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  if (kind === 'bag') return <ellipse data-hn-held="bag" cx={0} cy={3.4} rx={2.4} ry={3.2} fill={t('#F2EEE4')} stroke={t('#33241f')} strokeWidth={0.6} />;
  return (
    <g data-hn-held="bucket">
      <path d="M-2.6 2.6 Q0 -1.6 2.6 2.6" fill="none" stroke={t('#33241f')} strokeWidth={0.6} />
      <ellipse cx={0} cy={4.4} rx={3} ry={2.6} fill={t('#F08A2A')} stroke={t('#33241f')} strokeWidth={0.7} />
      <path d="M-1.6 3.6 l0.7 -0.9 l0.7 0.9 Z M0.3 3.6 l0.7 -0.9 l0.7 0.9 Z M-1.4 5.2 h2.8 v0.6 h-2.8 Z" fill={t('#3A1A08')} />
    </g>
  );
}

function Member({ member, sky, rainy, pose, hidden }: { member: NightMember; sky: Sky; rainy: boolean; pose: PoseIn; hidden: boolean }): ReactElement {
  return (
    <GhibliFigure
      outfit={member.outfit}
      sky={sky}
      rainy={rainy}
      umbrella={member.umbrella}
      guise={member.guise}
      initial={pose}
      hidden={hidden}
      held={member.acc ? [{ anchor: 'handR', node: <Bucket kind={member.acc} sky={sky} /> }] : undefined}
    />
  );
}

export function HalloweenNightLayer({ plan, width, metrics, sky, rainy, still, minutes, sceneS, frozenT }: Props): ReactElement | null {
  const figures = useFigureRegistry();
  const root = useRef<SVGGElement | null>(null);
  const s0 = minutes * 60;
  const groups = useMemo(() => plan.groups.filter((g) => g.t1 > s0 - BEFORE && g.t0 < s0 + AFTER), [plan, s0]);
  const scares = useMemo(() => (still ? [] : plan.scares.filter((sc) => { const [a, b] = scareSpan(sc, width); return b > s0 - BEFORE && a < s0 + AFTER; })), [plan, s0, still, width]);
  // Scènes de porte avec habitant (porte-à-porte, sonnette) proches de la minute.
  const doorEvents = useMemo(() => (still ? [] : [...plan.doors.values()].flat().filter((e) => (e.kind === 'treat' || e.kind === 'ring') && e.t0 + 30 > s0 - BEFORE && e.t0 < s0 + AFTER)), [plan, s0, still]);
  // Portes qui peuvent s'ouvrir dans la fenêtre (porte-à-porte, sonnette, embuscade).
  const openDoors = useMemo(() => (still ? [] : [...plan.doors.entries()].filter(([, evs]) => evs.some((e) => e.t0 + 30 > s0 - BEFORE && e.t0 - 30 < s0 + AFTER)).map(([x]) => x)), [plan, s0, still]);

  const t0 = still ? frozenT : Date.now() / 1000;
  const sNow = sceneS(t0);
  const figsAt = (g: NightGroup, s: number): NightFigure[] => groupFigures(g, s, metrics.unit);
  const place = (now: number): void => {
    const el = root.current;
    if (!el) return;
    const s = sceneS(still ? frozenT : now);
    for (const g of groups) {
      const figs = figsAt(g, s);
      g.members.forEach((m) => {
        const node = el.querySelector(`[data-hn-fig="${m.id}"]`);
        if (!node) return;
        const f = figs.find((x) => x.member === m);
        const fig = node.querySelector(':scope > [data-figure]');
        if (!f) {
          if (changed(node, 'opacity', '0')) hideFigure(figures, fig);
          return;
        }
        const k = kOf(metrics, m);
        setIfChanged(node, 'opacity', '1');
        node.setAttribute('transform', `translate(${f.x.toFixed(1)} ${yOf(metrics, f.step).toFixed(1)}) scale(${k.toFixed(3)})`);
        poseFigure(figures, fig, poseOf(f, k, still));
      });
    }
    for (const x of openDoors) {
      const node = el.querySelector(`[data-hn-door="${x}"]`);
      if (!node) continue;
      const st = doorStateAt(plan.doors.get(x), s);
      setIfChanged(node.querySelector('[data-hn-opening]'), 'opacity', (0.92 * st.open).toFixed(2));
      for (const r of node.querySelectorAll('[data-hn-resident]')) {
        const ev = doorEvents[Number(r.getAttribute('data-hn-resident'))];
        const fig = r.querySelector(':scope > [data-figure]');
        const at = ev ? residentAt(ev, s) : null;
        if (!at) {
          if (changed(r, 'opacity', '0')) hideFigure(figures, fig);
          continue;
        }
        setIfChanged(r, 'opacity', '1');
        poseFigure(figures, fig, { yaw: at.yaw, gait: 'stand', phase: 0, head: at.head, arms: at.arms });
      }
      const hid = node.querySelector('[data-hn-lurker]');
      if (hid) {
        const sc = scares[Number(hid.getAttribute('data-hn-lurker'))];
        const on = !!sc && scareAt(sc, s, metrics.unit, width).teen?.hidden === true;
        setIfChanged(hid, 'opacity', on ? '1' : '0');
      }
    }
    scares.forEach((sc, i) => {
      const at = scareAt(sc, s, metrics.unit, width);
      for (const [who, f, m] of [['teen', at.teen, sc.teen], ['victim', at.victim, sc.victim]] as const) {
        const node = el.querySelector(`[data-hn-scare="${i}"][data-hn-who="${who}"]`);
        if (!node) continue;
        const fig = node.querySelector(':scope > [data-figure]');
        if (!f || f.hidden) {
          if (changed(node, 'opacity', '0')) hideFigure(figures, fig);
          continue;
        }
        const k = kOf(metrics, m);
        setIfChanged(node, 'opacity', f.fade.toFixed(2));
        node.setAttribute('transform', `translate(${f.x.toFixed(1)} ${yOf(metrics, f.step).toFixed(1)}) scale(${k.toFixed(3)})`);
        poseFigure(figures, fig, poseOf(f, k, false));
      }
    });
  };
  useWallClockLoop(place, [groups, scares, doorEvents, openDoors, plan, still]);

  if (groups.length === 0 && scares.length === 0 && openDoors.length === 0) return null;
  const night = sky.daylight < 0.45;
  const first = (g: NightGroup): NightFigure[] => figsAt(g, sNow);
  return (
    <g data-halloween-night="" ref={root}>
      {/* Embrasures : porte ouverte sur le hall (éclairé la nuit), habitant qui donne ou qui regarde, jeune tapi dans l'ombre. */}
      {openDoors.map((x) => {
        const o = leafOf(x, metrics);
        const st = doorStateAt(plan.doors.get(x), sNow);
        const k = metrics.unit * STREET_SCALE.person;
        return (
          <svg key={x} data-hn-door={x} x={o.x.toFixed(2)} y={o.y.toFixed(2)} width={o.w.toFixed(2)} height={o.h.toFixed(2)} overflow="hidden">
            <rect data-hn-opening="" x={0} y={0} width={o.w} height={o.h} fill={night ? tone(HALL_GLOW, { ...sky, daylight: 1 }) : DOOR_DARK} opacity={(0.92 * st.open).toFixed(2)} />
            {doorEvents.map((e, i) =>
              e.door === x ? (
                <g key={i} data-hn-resident={i} opacity={residentAt(e, sNow) ? 1 : 0} transform={`translate(${(o.w * 0.4).toFixed(2)} ${(metrics.doorY - o.y).toFixed(2)}) scale(${(k * 0.97).toFixed(3)})`}>
                  <GhibliFigure outfit={e.stop!.resident} sky={sky} rainy={false} umbrella={false} guise={e.stop!.hat ? 'witch-hat' : null} initial={{ yaw: YAW_FRONT, gait: 'stand', phase: 0, head: 0, arms: 'carry' }} hidden={!residentAt(e, sNow)} />
                </g>
              ) : null,
            )}
            {scares.map((sc, i) =>
              sc.door === x ? (
                <g key={`l${i}`} data-hn-lurker={i} opacity={scareAt(sc, sNow, metrics.unit, width).teen?.hidden ? 1 : 0} transform={`translate(${(o.w * 0.3).toFixed(2)} ${(metrics.doorY - o.y).toFixed(2)}) scale(${(kOf(metrics, sc.teen) * 0.95).toFixed(3)})`}>
                  <GhibliFigure outfit={sc.teen.outfit} sky={sky} rainy={false} umbrella={false} guise={sc.teen.guise} silhouette initial={{ yaw: YAW_FRONT, gait: 'crouch', phase: 0, head: 0, arms: 'down' }} />
                </g>
              ) : null,
            )}
          </svg>
        );
      })}
      {groups.map((g) => {
        const figs = first(g);
        return (
          <g key={g.id} data-hn-group={g.id} data-hn-kind={g.kind}>
            {g.members.map((m) => {
              const f = figs.find((x) => x.member === m);
              const k = kOf(metrics, m);
              return (
                <g key={m.id} data-hn-fig={m.id} data-guise={m.guise ?? undefined} opacity={f ? 1 : 0} transform={f ? `translate(${f.x.toFixed(1)} ${yOf(metrics, f.step).toFixed(1)}) scale(${k.toFixed(3)})` : undefined}>
                  <Member member={m} sky={sky} rainy={rainy} pose={f ? poseOf(f, k, still) : { yaw: 0, gait: 'stand', phase: 0, head: 0 }} hidden={!f} />
                </g>
              );
            })}
          </g>
        );
      })}
      {scares.map((sc: NightScare, i) => {
        const at = scareAt(sc, sNow, metrics.unit, width);
        return (['teen', 'victim'] as const).map((who) => {
          const f = at[who];
          const m = sc[who];
          const k = kOf(metrics, m);
          const on = !!f && !f.hidden;
          return (
            <g key={`${i}-${who}`} data-hn-scare={i} data-hn-who={who} opacity={on ? f!.fade : 0} transform={on ? `translate(${f!.x.toFixed(1)} ${yOf(metrics, f!.step).toFixed(1)}) scale(${k.toFixed(3)})` : undefined}>
              <Member member={m} sky={sky} rainy={rainy} pose={on ? poseOf(f!, k, false) : { yaw: 0, gait: 'stand', phase: 0, head: 0 }} hidden={!on} />
            </g>
          );
        });
      })}
    </g>
  );
}

// Fins de minuterie des halls à poser à l'instant `s` (secondes de la scène) : porte (centre x) → seconde de la scène.
export function nightHalls(plan: NightPlan, s: number, out: Map<number, number> = new Map()): Map<number, number> {
  out.clear();
  for (const [x, evs] of plan.doors) {
    const until = doorStateAt(evs as DoorEvent[], s).hallUntil;
    if (until !== null) out.set(x, until);
  }
  return out;
}
