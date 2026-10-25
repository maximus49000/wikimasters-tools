// @vitest-environment jsdom
// tests/content/window-life.test.tsx — calque de la vie derrière les fenêtres (chantier « vie au-dessus de la rue », tâche 9) :
// nœuds montés pour la journée, borne des 8 pantins animés, remontage au changement de largeur ou de jour, pluie qui commence
// pendant une scène de balcon, mouvement réduit, pantins toujours en 2D.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIREN_LOOK_S, WindowLifeLayer, bakeHooks, sirenLook, sirenPresent, sirenSegments, windowOutfit } from '../../src/content/window-life';
import { cityDwellings } from '../../src/core/library/city/households';
import type { Schedule, Segment } from '../../src/core/library/city/schedules';
import { sharedSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { dayContext } from '../../src/core/library/city/calendar';
import { cityFacades, type Facade } from '../../src/core/library/city/facades';
import { homeState } from '../../src/core/library/city/home-state';
import { windowPose } from '../../src/core/library/city/window-choreo';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = 340;
const SEED = 7;
// Mardi 20 octobre 2026, et le mercredi qui suit (lendemain).
const DATE = { y: 2026, m: 10, d: 20 };
const NEXT = { y: 2026, m: 10, d: 21 };
const skyOf = (minutes: number, d = DATE) => skyAt(minutes, sunTimes(d, { lat: 48.85, lon: 2.35 }, 120));
// Instant mural multiple de 60 s : la minute de la scène est exactement `minutes` (aucune fraction).
const NOW_S = Math.floor(1.8e9 / 86400) * 86400;

type Mount = { host: HTMLDivElement; reg: FigureRegistry; render: (o: { minutes: number; life?: SceneLife; facades?: Facade[]; width?: number; still?: boolean; d?: typeof DATE }) => void; layer: () => Element };
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const lifeOf = (facades: Facade[], d = DATE, wet = false): SceneLife => sharedSceneLife(facades, dayContext(d, []), wet, SEED, false);

function mount(width: number, reg = new FigureRegistry('twl', { perFrame: 400 })): Mount {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const base = { facades: cityFacades(width, H, SEED), width };
  const render: Mount['render'] = (o) => {
    const facades = o.facades ?? base.facades;
    const life = o.life ?? lifeOf(facades, o.d ?? DATE);
    act(() =>
      root.render(
        <FigureContext.Provider value={reg}>
          <svg>
            <WindowLifeLayer facades={facades} life={life} sky={skyOf(o.minutes, o.d ?? DATE)} minutes={o.minutes} still={o.still ?? false} width={o.width ?? width} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
  };
  return { host, reg, render, layer: () => host.querySelector('[data-window-life]')! };
}

// Ajouts et retraits de nœuds observés sous le calque.
function watch(el: Element): () => number {
  const obs = new MutationObserver(() => undefined);
  obs.observe(el, { childList: true, subtree: true });
  return () => obs.takeRecords().reduce((n, r) => n + r.addedNodes.length + r.removedNodes.length, 0);
}

const shown = (layer: Element): Element[] => [...layer.querySelectorAll('[data-wl-fig]')].filter((g) => g.getAttribute('display') !== 'none');

describe('calque de la vie derrière les fenêtres', () => {
  it('windowOutfit : jamais de jupe ni de robe pour un homme, jamais chauve pour une femme', () => {
    const seen = { f: new Set<string>(), m: new Set<string>() };
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const d of cityDwellings(cityFacades(1440, H, seed), seed)) {
        d.hh.members.forEach((mem, i) => {
          const o = windowOutfit(d, i);
          expect(o).toEqual(windowOutfit(d, i));
          seen[mem.who.sex].add(o.bottom);
          if (mem.who.sex === 'm') {
            expect(['skirt', 'dress'], `${d.id}#${i}`).not.toContain(o.bottom);
            expect(['long', 'bun'], `${d.id}#${i}`).not.toContain(o.hair);
          } else expect(o.hair, `${d.id}#${i}`).not.toBe('bald');
        });
      }
    }
    expect(seen.f.has('skirt') || seen.f.has('dress')).toBe(true);
  });

  it('nœuds constants de 6 h à 2 h (aucune création ni suppression)', () => {
    const m = mount(1080);
    m.render({ minutes: 6 * 60 });
    const layer = m.layer();
    expect(layer.querySelectorAll('[data-wl-fig]').length).toBeGreaterThan(0);
    const changes = watch(m.host);
    let seen = 0;
    for (let t = 6 * 60; t < 1440; t += 7) {
      m.render({ minutes: t });
      seen = Math.max(seen, shown(m.layer()).length);
    }
    expect(changes()).toBe(0);
    expect(seen).toBeGreaterThan(0);
    // Minuit : nouveau jour de scène (un seul remontage), puis plus rien jusqu'à 2 h.
    m.render({ minutes: 0, d: NEXT });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 1; t <= 120; t += 3) m.render({ minutes: t, d: NEXT });
    expect(changes()).toBe(0);
  });

  it('au plus 8 pantins animés visibles', () => {
    const width = 2000;
    const m = mount(width);
    const facades = cityFacades(width, H, SEED);
    const life = lifeOf(facades);
    let busiest = 0;
    let maxShown = 0;
    for (let t = 6 * 60; t < 1440; t += 5) {
      // Candidats : chorégraphies animées dont la pose bouge à cette minute, sur toute la ville.
      let candidates = 0;
      for (const d of life.dwellings) {
        const st = homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, t);
        for (const a of st.actors) {
          const p = windowPose(a, d);
          if (a.animated && p && !p.still) candidates++;
        }
      }
      busiest = Math.max(busiest, candidates);
      m.render({ minutes: t, facades, life });
      const anim = shown(m.layer()).filter((g) => g.getAttribute('data-anim') === '1').length;
      maxShown = Math.max(maxShown, anim);
      expect(anim).toBeLessThanOrEqual(8);
    }
    expect(busiest).toBeGreaterThan(8);
    expect(maxShown).toBeGreaterThan(0);
  });

  it("borne décidée une fois par scène : personne n'apparaît ni ne disparaît sans marcher (11 s)", () => {
    const width = 2000;
    const reg = new FigureRegistry('twlb', { perFrame: 400 });
    let now = NOW_S * 1000;
    let perf = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const facades = cityFacades(width, H, SEED);
    const life = lifeOf(facades);
    // De jour (pantins dedans visibles à 0,3 derrière la vitre), heure de pointe du matin.
    const minutes = 7 * 60 + 40;
    act(() => root.render(<FigureContext.Provider value={reg}><svg><WindowLifeLayer facades={facades} life={life} sky={skyOf(13 * 60)} minutes={minutes} still={false} width={width} /></svg></FigureContext.Provider>));
    // Pas de 0,5 s, plus fin que la relecture complète (2 s) : un marcheur qui surgirait entre deux relectures est vu.
    const STEP_MS = 500;
    const WINDOW = Math.ceil(11_000 / STEP_MS);
    const history = new Map<string, boolean[]>(); // marche des dernières images visibles
    const wasShown = new Map<string, boolean>();
    let appear = 0, vanish = 0, revealed = 0;
    // Pantin dévoilé ou caché par ses volets (franchissant la mi-course dans les 11 s) : naturel, accepté.
    const byShutters = (k: string): boolean => {
      const [id, mm] = k.split('/');
      const d = life.dwellings.find((x) => x.id === id)!;
      const t = minutes + (now - NOW_S * 1000) / 60000;
      const at = (u: number) => homeState(d, life.today.get(id!)!, life.yesterday.get(id!)!, u);
      const a = [...at(t).actors, ...at(t - 11 / 60).actors].find((x) => x.m === Number(mm));
      if (!a || !d.shutters) return false;
      const s0 = at(t - 11 / 60).shut[a.room] ?? 1, s1 = at(t).shut[a.room] ?? 1;
      const ok = Math.min(s0, s1) < 0.5 && Math.max(s0, s1) >= 0.5;
      if (ok) revealed++;
      return ok;
    };
    const read = (first: boolean): void => {
      const now = new Map<string, string | null>();
      for (const g of host.querySelectorAll('[data-wl-fig]')) {
        const k = g.getAttribute('data-wl-fig')!;
        if (g.getAttribute('display') !== 'none') now.set(k, g.getAttribute('data-gait'));
        else if (!now.has(k)) now.set(k, null);
      }
      for (const [k, key] of now) {
        const shown = key !== null;
        const walking = key === 'walk';
        const h = history.get(k) ?? [];
        if (!first && shown && !wasShown.get(k)) {
          appear++;
          expect(walking || byShutters(k), `${k} apparaît sans marcher`).toBe(true);
        }
        if (!first && !shown && wasShown.get(k)) {
          vanish++;
          expect(h.slice(-WINDOW).some(Boolean) || byShutters(k), `${k} disparaît sans marcher`).toBe(true);
        }
        if (shown) history.set(k, [...h, walking].slice(-WINDOW));
        else history.delete(k);
        wasShown.set(k, shown);
      }
    };
    read(true);
    for (let f = 0; f < 1200; f++) {
      now += STEP_MS;
      perf += STEP_MS;
      const cbs = queue.splice(0);
      act(() => { for (const cb of cbs) cb(perf); reg.flush(); });
      read(false);
    }
    expect(appear).toBeGreaterThan(0);
    expect(vanish).toBeGreaterThan(0);
  });

  it('ambulance : environ 45 % des foyers présents se penchent, puis rentrent en marchant', () => {
    const width = 2000;
    let now = NOW_S * 1000;
    let perf = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const facades = cityFacades(width, H, SEED);
    // Dimanche après-midi : foyers chez eux, volets ouverts (le soir, volets fermés et cuisiniers à la cuisine en retiennent
    // une partie : la part visible tombe vers 30 %).
    const SUNDAY = { y: 2026, m: 10, d: 25 };
    const life = lifeOf(facades, SUNDAY);
    const reg = new FigureRegistry('twlsir', { perFrame: 400 });
    const minutes = 15 * 60;
    let keys: string[] = [];
    act(() => root.render(<FigureContext.Provider value={reg}><svg><WindowLifeLayer facades={facades} life={life} sky={skyOf(minutes, SUNDAY)} minutes={minutes} still={false} width={width} seed={SEED} sirens={() => keys} /></svg></FigureContext.Provider>));
    // Pantins montrés (où, allure), et ceux de dehors (penchés, balcon).
    const shownAll = (): Map<string, { where: string | null; gait: string | null }> => {
      const out = new Map<string, { where: string | null; gait: string | null }>();
      for (const g of host.querySelectorAll('[data-wl-fig]')) {
        if (g.getAttribute('display') !== 'none') out.set(g.getAttribute('data-wl-fig')!, { where: g.getAttribute('data-where'), gait: g.getAttribute('data-gait') });
      }
      return out;
    };
    const isOut = (s: { where: string | null } | undefined): boolean => s?.where === 'lean' || s?.where === 'balcony';
    const tick = (ms: number): void => {
      now += ms;
      perf += ms;
      const cbs = queue.splice(0);
      act(() => { for (const cb of cbs) cb(perf); reg.flush(); });
    };
    // Allures des 11 dernières secondes par pantin (toutes places : un membre assis qui se lève marche dans la pièce).
    const WINDOW = 22;
    const history = new Map<string, string[]>();
    const record = (all: Map<string, { gait: string | null }>): void => {
      for (const k of new Set([...history.keys(), ...all.keys()])) history.set(k, [...(history.get(k) ?? []), all.get(k)?.gait ?? ''].slice(-WINDOW));
    };
    for (let f = 0; f < 6; f++) { tick(500); record(shownAll()); }
    const before = new Set([...shownAll()].filter(([, s]) => isOut(s)).map(([k]) => k));
    // Foyers présents et éveillés à cet instant (sans la sirène, personne ne réagit).
    const m0 = minutes + (now / 1000 - NOW_S) / 60;
    const awake = life.dwellings.filter((d) => sirenPresent(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, m0)).length;
    expect(awake).toBeGreaterThan(20);
    keys = ['amb-1'];
    // Arrivées : chacun a marché jusqu'à sa fenêtre (au plus 8 s de réaction + 11 s de marche).
    const reactors = new Set<string>();
    for (let f = 0; f < 50; f++) {
      tick(500);
      const all = shownAll();
      record(all);
      for (const [k, s] of all) {
        if (!isOut(s) || before.has(k) || reactors.has(k)) continue;
        expect(history.get(k)!.includes('walk'), `${k} arrive sans marcher`).toBe(true);
        reactors.add(k);
      }
    }
    const homes = new Set([...reactors].map((k) => k.split('/')[0]));
    const share = homes.size / awake;
    expect(share).toBeGreaterThan(0.33);
    expect(share).toBeLessThan(0.57);
    // Départs : après 72 s, chacun repart en marchant (dehors ou dans la pièce, vers sa place).
    const back = new Set<string>();
    for (let f = 0; f < 140; f++) {
      tick(500);
      const all = shownAll();
      record(all);
      for (const k of reactors) {
        if (back.has(k) || isOut(all.get(k))) continue;
        back.add(k);
        expect(history.get(k)!.includes('walk'), `${k} rentre sans marcher`).toBe(true);
      }
    }
    expect(back.size).toBe(reactors.size);
    // La même ambulance, encore dans le champ, ne refait réagir personne.
    for (let f = 0; f < 20; f++) {
      tick(500);
      for (const [k, s] of shownAll()) if (isOut(s)) expect(back.has(k), `${k} ressort`).toBe(false);
    }
  });


  describe('sirène : qui réagit, et comment (emplois du temps construits)', () => {
    const facades = cityFacades(2000, H, SEED);
    const life = lifeOf(facades);
    // Logement à volets avec un salon ; le membre 0 seul est candidat.
    const d = life.dwellings.find((x) => x.shutters !== null && x.rooms.includes('salon'))!;
    const M = 900;
    const sched = (...segments: Segment[]): Schedule => ({ dwelling: d.id, segments: [{ k: 'lit', room: 'salon', t0: 480, t1: 1320, tone: 'warm' }, ...segments], shutUser: false, maxActors: 2 });
    const o = { members: [0], room: 'salon' as const, balcony: false, wet: false };
    // Ambulance dont le tirage fait réagir ce logement (le tirage seul, 45 % des clés).
    const key = Array.from({ length: 50 }, (_, i) => `amb-${i}`).find((k) => sirenLook(d, sched(), null, M, SEED, k, o) !== null)!;
    const look = (...segments: Segment[]) => sirenLook(d, sched(...segments), null, M, SEED, key, o);
    it('membre libre : il réagit ; pas si une scène ou un départ commence avant la fin de la réaction', () => {
      expect(key).toBeDefined();
      const free = look()!;
      expect(free.m).toBe(0);
      expect(free.from).toBeUndefined();
      expect(free.t1 - free.t0).toBeCloseTo(SIREN_LOOK_S / 60, 6);
      // Scène qui commence pendant la réaction (ou pendant sa sortie) : il ne réagit pas.
      expect(look({ k: 'act', t0: M + 0.6, t1: M + 10, room: 'cuisine', where: 'in', choreo: 'cook', m: 0 })).toBeNull();
      expect(look({ k: 'act', t0: free.t1 + 0.1, t1: M + 10, room: 'cuisine', where: 'in', choreo: 'cook', m: 0 })).toBeNull();
      // Départ pendant la réaction : non plus ; une scène bien après : si.
      expect(look({ k: 'depart', t: M + 1, m: 0 })).toBeNull();
      expect(look({ k: 'act', t0: M + 20, t1: M + 30, room: 'cuisine', where: 'in', choreo: 'cook', m: 0 })).not.toBeNull();
    });
    it('fenêtre fermée : ouverte puis refermée ; déjà ouverte : on n\'y touche pas', () => {
      const shut = look()!;
      expect(shut.opens).toBe(true);
      expect(sirenSegments(shut).filter((g) => g.k === 'win')).toHaveLength(2);
      const open = look({ k: 'win', room: 'salon', t: 800, to: 1, dur: 0.25 })!;
      expect(open.opens).toBe(false);
      const segs = sirenSegments(open);
      expect(segs.filter((g) => g.k === 'win')).toHaveLength(0);
      const merged = sched(...segs, { k: 'win', room: 'salon', t: 800, to: 1, dur: 0.25 });
      for (let t = M; t < open.t1 + 2; t += 0.1) expect(homeState(d, merged, null, t).win.salon).toBeCloseTo(1, 6);
    });
    it('volets fermés : personne ne se penche', () => {
      expect(look({ k: 'shut', room: 'salon', t: 800, to: 0, dur: 1.2 })).toBeNull();
    });
    it('membre assis : il se lève de sa place, va à la fenêtre et y revient ; sa scène reprend', () => {
      const tv: Segment = { k: 'act', t0: 880, t1: 960, room: 'salon', where: 'in', choreo: 'tv', m: 0 };
      const seat = look(tv)!;
      expect(seat).not.toBeNull();
      const before = homeState(d, sched(tv), null, M).actors.find((a) => a.m === 0)!;
      expect(seat.from).toBeCloseTo(windowPose(before, d)!.dx, 6);
      // Scène assise qui finit avant la réaction : il ne se lève pas.
      expect(look({ ...tv, t1: M + 1 })).toBeNull();
      const merged = sched(...sirenSegments(seat), tv);
      const first = (t: number) => homeState(d, merged, null, t).actors.find((a) => a.m === 0)!;
      // Début : il marche dans la pièce depuis sa place ; milieu : penché ; fin : il revient à sa place en marchant.
      const p0 = windowPose(first(seat.t0 + 0.01), d)!;
      expect(p0.gait).toBe('walk');
      expect(p0.where).toBe('in');
      expect(p0.dx).toBeCloseTo(seat.from!, 1);
      expect(windowPose(first((seat.t0 + seat.t1) / 2), d)!.where).toBe('lean');
      const p1 = windowPose(first(seat.t1 - 0.005), d)!;
      expect(p1.gait).toBe('walk');
      expect(p1.dx).toBeCloseTo(seat.from!, 1);
      // Après : sa scène assise, à la même place.
      const after = first(seat.t1 + 0.01);
      expect(after.choreo).toBe('tv');
      expect(windowPose(after, d)!.dx).toBeCloseTo(seat.from!, 6);
    });
  });
  it('changement de largeur ou de jour : remontage unique', () => {
    const m = mount(1080);
    m.render({ minutes: 12 * 60 });
    let changes = watch(m.host);
    const wide = cityFacades(1440, H, SEED);
    m.render({ minutes: 12 * 60 + 1, facades: wide, width: 1440 });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 12 * 60 + 2; t < 12 * 60 + 40; t += 3) m.render({ minutes: t, facades: wide, width: 1440 });
    expect(changes()).toBe(0);
    changes = watch(m.host);
    m.render({ minutes: 12 * 60 + 40, facades: wide, width: 1440, d: NEXT });
    expect(changes()).toBeGreaterThan(0);
    for (let t = 12 * 60 + 41; t < 12 * 60 + 60; t += 3) m.render({ minutes: t, facades: wide, width: 1440, d: NEXT });
    expect(changes()).toBe(0);
  });

  it('pluie en cours de scène : le pantin du balcon finit sa sortie', () => {
    const width = 2000;
    const facades = cityFacades(width, H, SEED);
    const dry = lifeOf(facades, DATE, false);
    const wet = lifeOf(facades, DATE, true);
    // Une scène de balcon assez longue de la journée sèche, absente de la journée humide ; accoudé au garde-corps (pose fixe :
    // jamais écartée par la borne des animées).
    let found: { id: string; m: number; t0: number; t1: number } | null = null;
    for (const d of dry.dwellings) {
      for (const g of dry.today.get(d.id)!.segments) {
        if (g.k !== 'act' || g.where !== 'balcony' || g.choreo !== 'leanRail' || g.t1 - g.t0 < 4 || g.t0 < 480 || g.t1 > 1380) continue;
        const rainy = wet.today.get(d.id)!.segments.some((s) => s.k === 'act' && s.where === 'balcony' && s.t0 < g.t1 && s.t1 > g.t0);
        if (!rainy) {
          found = { id: d.id, m: g.m, t0: g.t0, t1: g.t1 };
          break;
        }
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    const { id, m: who, t0, t1 } = found!;
    const m = mount(width);
    // Pantin du membre (nœud en pose fixe ou vivant) : 'none' si aucun des deux n'est montré.
    const node = (): { getAttribute: (n: string) => string | null } => {
      const on = [...m.layer().querySelectorAll(`[data-wl-fig="${id}/${who}"]`)].some((g) => g.getAttribute('display') !== 'none');
      return { getAttribute: () => (on ? 'inline' : 'none') };
    };
    const at = Math.ceil(t0 + 1);
    m.render({ minutes: at, facades, life: dry });
    expect(node().getAttribute('display')).not.toBe('none');
    // La pluie commence : nouvel emploi du temps, la scène commencée continue jusqu'à sa fin.
    m.render({ minutes: at + 1, facades, life: wet });
    expect(node().getAttribute('display')).not.toBe('none');
    for (let t = at + 2; t < Math.floor(t1); t++) {
      m.render({ minutes: t, facades, life: wet });
      expect(node().getAttribute('display')).not.toBe('none');
    }
    m.render({ minutes: Math.ceil(t1) + 1, facades, life: wet });
    expect(node().getAttribute('display')).toBe('none');
  });

  it('mouvement réduit : aucune transition, poses fixes', () => {
    const m = mount(1080);
    let seen = 0;
    for (let t = 7 * 60; t < 23 * 60; t += 11) {
      m.render({ minutes: t, still: true });
      const layer = m.layer();
      for (const el of layer.querySelectorAll('[style]')) expect((el as HTMLElement).style.transition).toBe('');
      expect(layer.querySelectorAll('animate, animateTransform, animateMotion')).toHaveLength(0);
      for (const g of shown(layer)) {
        seen++;
        expect(g.getAttribute('data-anim')).toBe('0');
        const key = g.querySelector('[data-figure]')!.getAttribute('data-key') ?? '';
        expect(key).not.toMatch(/\|walk\|/);
      }
      // Même minute rendue deux fois : rien ne bouge.
      const pos = (g: Element): string | null => g.querySelector('[data-wl-pos]')!.getAttribute('transform');
      const before = shown(layer).map(pos);
      m.render({ minutes: t, still: true });
      expect(shown(m.layer()).map(pos)).toEqual(before);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('tapis secoué à une lucarne et à une fenêtre : visible et jamais coupé pendant toute la scène (pas de 0,25 s)', () => {
    const width = 1080;
    const facades = cityFacades(width, H, SEED);
    const life = lifeOf(facades);
    const lucarne = (id: string): boolean => {
      const d = life.dwellings.find((x) => x.id === id)!;
      return facades[d.facade]!.homes[d.home]!.level < 0;
    };
    // Première scène « tapis » d'une lucarne et d'une fenêtre ordinaire (début à la seconde près).
    const scenes: { id: string; start: number }[] = [];
    for (const want of [true, false]) {
      for (const d of life.dwellings) {
        if (lucarne(d.id) !== want) continue;
        const shaking = (t: number): boolean => homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, t).actors.some((a) => a.choreo === 'shake');
        // Repérée par pas de 15 s (la scène dure 1,5 min), puis à la seconde.
        let start = -1;
        for (let t = 10 * 60; t < 13 * 60 && start < 0; t += 0.25) if (shaking(t)) start = t;
        if (start >= 0) while (shaking(start - 1 / 60)) start -= 1 / 60;
        if (start >= 0) { scenes.push({ id: d.id, start }); break; }
      }
    }
    expect(scenes.length).toBe(2);
    const reg = new FigureRegistry('twlr', { perFrame: 400 });
    let checked = 0;
    for (const { id, start } of scenes) {
      const d = life.dwellings.find((x) => x.id === id)!;
      // Montage à la minute entière, horloge murale avancée jusqu'au début de la scène.
      const minutes = Math.floor(start);
      let now = NOW_S * 1000 + Math.round((start - minutes) * 60) * 1000;
      let perf = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const queue: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
      vi.stubGlobal('cancelAnimationFrame', () => {});
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      mounted.push({ root, host });
      act(() => root.render(<FigureContext.Provider value={reg}><svg><WindowLifeLayer facades={facades} life={life} sky={skyOf(13 * 60)} minutes={minutes} still={false} width={width} /></svg></FigureContext.Provider>));
      let seen = 0;
      // Nœuds constants pendant la journée : cherchés une fois (un querySelector par image coûterait 0,1 s dans jsdom).
      const figs = [...host.querySelectorAll(`[data-wl-fig^="${id}/"]`)];
      const rug = host.querySelector(`[data-wl-out="${id}"] > [data-wl-held="rug"]`)!;
      const rugPos = rug.querySelector('[data-wl-pos]')!;
      const clips = new Map<string, number[]>();
      for (let f = 0; f < 1.6 * 240; f++) {
        now += 250;
        perf += 250;
        const cbs = queue.splice(0);
        act(() => { for (const cb of cbs) cb(perf); reg.flush(); });
        const t = minutes + (now - NOW_S * 1000) / 60000;
        const a = homeState(d, life.today.get(id)!, life.yesterday.get(id)!, t).actors.find((x) => x.choreo === 'shake');
        const pose = a ? windowPose(a, d) : null;
        if (!a || !pose?.props.includes('rug')) continue;
        // Pantin effectivement montré (pas écarté par la borne des 8 animés).
        if (!figs.some((g) => g.getAttribute('data-wl-fig') === `${id}/${a.m}` && g.getAttribute('display') !== 'none')) continue;
        seen++;
        const at = `${id} à ${t.toFixed(3)} min (${pose.arms})`;
        expect(rug.getAttribute('display'), `${at} : tapis caché`).toBe('inline');
        const [hx = NaN, hy = NaN] = rugPos.getAttribute('transform')!.match(/-?[\d.]+/g)!.map(Number);
        const clip = rug.getAttribute('clip-path');
        if (clip && clip !== 'none') {
          if (!clips.has(clip)) {
            const r = host.querySelector(`[id="${clip.slice(5, -1)}"] rect`)!;
            clips.set(clip, ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k))));
          }
          const [x = NaN, y = NaN, w = NaN, h = NaN] = clips.get(clip)!;
          const inside = x <= hx - 1.6 && hx + 1.6 <= x + w && y <= hy && hy + 5 <= y + h;
          expect(inside, `${at} : tapis [${hx - 1.6}, ${hx + 1.6}] × [${hy}, ${hy + 5}] coupé par ${clip} [${x}, ${x + w}] × [${y}, ${y + h}]`).toBe(true);
        }
      }
      expect(seen, `${id} : scène du tapis jamais vue`).toBeGreaterThan(0);
      checked += seen;
      act(() => root.unmount());
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('pantins toujours en 2D (aucune image 3D demandée)', () => {
    const reg = new FigureRegistry('twl3', { perFrame: 400 });
    const citizen = vi.spyOn(reg, 'citizen');
    const m = mount(1080, reg);
    for (let t = 6 * 60; t < 1440; t += 17) m.render({ minutes: t });
    const figs = [...m.layer().querySelectorAll('[data-figure]')];
    expect(figs.length).toBeGreaterThan(0);
    expect(citizen).not.toHaveBeenCalled();
    for (const f of figs) expect(reg.wants3D(f.getAttribute('data-palette')!)).toBe(false);
  });

  it('de nuit, silhouettes unies ; de jour, pièce éteinte vue à 0,3 sous le reflet', () => {
    const m = mount(1080);
    m.render({ minutes: 21 * 60 });
    const nightFig = m.layer().querySelector('[data-figure]')!;
    // Clé de palette = ses couleurs dans un ordre fixe : toutes celles de la silhouette.
    expect(new Set(nightFig.getAttribute('data-palette')!.split(',').filter(Boolean))).toEqual(new Set(['#1A1422']));
    // De jour : chaque pantin dedans visible a l'opacité de sa pièce (0,3 éteinte et fermée, 0,9 fenêtre ouverte).
    let checked = 0;
    for (let t = 9 * 60; t < 16 * 60 && checked < 3; t += 4) {
      m.render({ minutes: t });
      for (const g of shown(m.layer())) {
        // Dedans : coupé à la vitre de sa pièce (<clipPath> rectangulaire).
        if (g.getAttribute('data-where') !== 'in') continue;
        expect(g.getAttribute('clip-path')).toMatch(/^url\(#/);
        expect(['0.30', '0.90']).toContain(g.getAttribute('data-alpha'));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rideau tiré : le marcheur passe derrière (ombre à 0,28 sur le tissu), jamais par-dessus un rideau ouvert', () => {
    const m = mount(1080);
    let checked = 0;
    for (let t = 18 * 60; t < 23 * 60; t += 3) {
      m.render({ minutes: t });
      for (const g of shown(m.layer())) {
        if (g.getAttribute('data-where') !== 'in') continue;
        checked++;
        // Sous la façade cuite (rideaux ouverts devant lui) : jamais l'ombre du rideau tiré ; par-dessus : seulement elle.
        if (g.getAttribute('data-slot') === 'in') expect(g.getAttribute('data-alpha')).not.toBe('0.28');
        if (g.getAttribute('data-slot') === 'out') expect(g.getAttribute('data-alpha')).toBe('0.28');
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("de jour, pièce éteinte : pantin sous les rideaux (jamais l'ombre par-dessus un rideau tiré)", () => {
    const width = 2000;
    const facades = cityFacades(width, H, SEED);
    // Dimanche (foyers chez eux en journée).
    const SUNDAY = { y: 2026, m: 10, d: 25 };
    const life = lifeOf(facades, SUNDAY);
    // Minutes de jour où un pantin est dans une pièce aux rideaux tirés (salon, rideaux du logement).
    const minutes: number[] = [];
    for (let t = 10 * 60; t < 16 * 60 && minutes.length < 12; t += 2) {
      const hit = life.dwellings.some((d) => {
        const home = facades[d.facade]!.homes[d.home]!;
        if (!home.curtain) return false;
        const st = homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id)!, t);
        return st.actors.some((a) => a.where === 'in' && (st.curt[a.room] ?? 0) > 0.6 && windowPose(a, d));
      });
      if (hit) minutes.push(t);
    }
    expect(minutes.length).toBeGreaterThan(0);
    const m = mount(width);
    let checked = 0;
    for (const t of minutes) {
      m.render({ minutes: t, facades, life, d: SUNDAY });
      for (const g of shown(m.layer())) {
        if (g.getAttribute('data-where') !== 'in') continue;
        checked++;
        expect(['still', 'in']).toContain(g.getAttribute('data-slot'));
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('pantin qui bouge dans une pièce meublée : le meuble passe dessous, dans la page (jamais le meuble cuit par-dessus)', () => {
    const m = mount(1080);
    let checked = 0;
    for (let t = 18 * 60; t < 22 * 60; t += 3) {
      m.render({ minutes: t });
      const layer = m.layer();
      const rooms = new Set(shown(layer).filter((g) => g.getAttribute('data-slot') === 'in').map((g) => g.getAttribute('data-room')));
      if (rooms.size === 0) continue;
      for (const p of layer.querySelectorAll('[data-wl-prop]')) {
        if (p.getAttribute('display') === 'none') continue;
        expect(rooms.has(p.parentElement!.getAttribute('data-wl-room'))).toBe(false);
      }
      for (const p of layer.querySelectorAll('[data-wl-lprop]')) if (p.getAttribute('display') === 'inline' && rooms.has(p.getAttribute('data-wl-lprop')!.split('/').slice(0, 2).join('/'))) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('télé allumée : écran vivant hors de la façade cuite, qui scintille', () => {
    const width = 2000;
    let now = NOW_S * 1000;
    let perf = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const facades = cityFacades(width, H, SEED);
    const life = lifeOf(facades);
    const reg = new FigureRegistry('twltv', { perFrame: 400 });
    act(() => root.render(<FigureContext.Provider value={reg}><svg><WindowLifeLayer facades={facades} life={life} sky={skyOf(21 * 60 + 30)} minutes={21 * 60 + 30} still={false} width={width} /></svg></FigureContext.Provider>));
    const tvs = (): Element[] => [...host.querySelectorAll('[data-wl-tv]')].filter((g) => g.getAttribute('display') === 'inline');
    expect(tvs().length).toBeGreaterThan(0);
    // L'écran du meuble (cuit) est caché là où l'écran vivant est montré.
    for (const g of tvs()) {
      const prop = host.querySelector(`[data-wl-room="${g.getAttribute('data-wl-tv')}"] [data-wl-prop="tv"] [data-tv-screen]`)!;
      expect(prop.getAttribute('display')).toBe('none');
    }
    const glow = tvs()[0]!.querySelector('[data-screen]')!;
    const seen = new Set<string | null>();
    for (let f = 0; f < 20; f++) {
      now += 150;
      perf += 150;
      const cbs = queue.splice(0);
      act(() => { for (const cb of cbs) cb(perf); });
      seen.add(glow.getAttribute('opacity'));
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  describe('façades cuites (cuisson simulée)', () => {
    type Pic = { onload: (() => void) | null; onerror: (() => void) | null; removeAttribute: () => void };
    let pending: Pic[] = [];
    let svgs: string[] = [];
    afterEach(() => {
      bakeHooks.enabled = null;
      bakeHooks.onSvg = null;
      vi.unstubAllGlobals();
    });
    const setup = (): void => {
      pending = [];
      svgs = [];
      bakeHooks.enabled = true;
      bakeHooks.onSvg = (svg) => svgs.push(svg);
      vi.stubGlobal('Image', class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        removeAttribute(): void {}
        set src(_v: string) { pending.push(this); }
      });
      vi.stubGlobal('Blob', class { constructor(public parts: unknown[]) {} });
      let n = 0;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:t${++n}`);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as RenderingContext);
      (HTMLCanvasElement.prototype as unknown as { toBlob: (cb: (b: unknown) => void) => void }).toBlob = function (cb) { cb({}); };
    };
    const resolve = (): void => {
      const list = pending.splice(0);
      act(() => { for (const p of list) p.onload?.(); });
    };

    it('calque caché jusqu\'aux premières images ; pose fixe : le double vivant cède la place à l\'image qui le montre', () => {
      setup();
      const m = mount(1080);
      m.render({ minutes: 21 * 60 });
      const layer = m.layer();
      expect(layer.getAttribute('display')).toBe('none');
      expect(pending.length).toBeGreaterThan(0);
      // Avant l'image : les pantins assis (pose fixe, cuite) sont montrés par leur double vivant.
      const mirrors = (): Element[] => shown(layer).filter((g) => g.getAttribute('data-slot') === 'in' && g.getAttribute('data-gait') === 'seated');
      expect(mirrors().length).toBeGreaterThan(0);
      resolve();
      expect(layer.getAttribute('display')).toBe('inline');
      const imgs = [...layer.querySelectorAll('[data-wl-baked]')];
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        expect(img.getAttribute('href')).toMatch(/^blob:/);
        expect(img.getAttribute('display')).toBe('inline');
      }
      expect(mirrors()).toHaveLength(0);
      // Minute suivante, même lumière : pas de rafale de cuissons (seulement ce qui a changé).
      const before = svgs.length;
      m.render({ minutes: 21 * 60 + 1 });
      expect(svgs.length - before).toBeLessThan(imgs.length / 2);
    });

    it('cuisson ratée : nouvel essai, puis le calque paraît sans attendre cet immeuble', () => {
      setup();
      const m = mount(1080);
      m.render({ minutes: 21 * 60 });
      const layer = m.layer();
      const fail = (): number => {
        const list = pending.splice(0);
        act(() => { for (const p of list) p.onerror?.(); });
        return list.length;
      };
      expect(fail()).toBeGreaterThan(0);
      expect(layer.getAttribute('display')).toBe('none');
      // Après le délai : nouvel essai de chaque immeuble raté (deux au plus), puis plus d'attente.
      for (let k = 1; k <= 3; k++) {
        vi.spyOn(Date, 'now').mockReturnValue((NOW_S + 2 * k) * 1000);
        m.render({ minutes: 21 * 60 + k });
        if (k <= 2) expect(fail()).toBeGreaterThan(0);
      }
      expect(layer.getAttribute('display')).not.toBe('none');
    });

    it('cuisson qui échoue toujours : après les essais, le groupe vivant revient dans la page (volets, rideaux, pantins)', () => {
      setup();
      const m = mount(1080);
      m.render({ minutes: 21 * 60 });
      const layer = m.layer();
      const fail = (): number => {
        const list = pending.splice(0);
        act(() => { for (const p of list) p.onerror?.(); });
        return list.length;
      };
      const fronts = layer.querySelectorAll('[data-wl-facade]').length;
      expect(fronts).toBeGreaterThan(0);
      // Hors du document tant que la cuisson est tentée.
      expect(layer.querySelectorAll('[data-wl-live]')).toHaveLength(0);
      fail();
      for (let k = 1; k <= 3; k++) {
        vi.spyOn(Date, 'now').mockReturnValue((NOW_S + 2 * k) * 1000);
        m.render({ minutes: 21 * 60 + k });
        fail();
      }
      expect(layer.getAttribute('display')).not.toBe('none');
      // Chaque immeuble : groupe vivant dans la page, montré, image cuite cachée.
      for (const g of layer.querySelectorAll('[data-wl-facade]')) {
        const live = g.querySelector(':scope > [data-wl-live]');
        expect(live, g.getAttribute('data-wl-facade')!).not.toBeNull();
        expect(live!.getAttribute('display')).not.toBe('none');
        expect(g.querySelector(':scope > [data-wl-baked]')!.getAttribute('display')).toBe('none');
      }
      expect(layer.querySelectorAll('[data-wl-live] [data-shutters]').length).toBeGreaterThan(0);
      expect(layer.querySelectorAll('[data-wl-live] [data-curtain-panel]').length).toBeGreaterThan(0);
      // Pantins en pose fixe montrés dans le groupe vivant (plus de double vivant qui attend une image).
      expect(shown(layer).filter((f) => f.closest('[data-wl-live]')).length).toBeGreaterThan(0);
      // Plus aucune tentative ensuite.
      vi.spyOn(Date, 'now').mockReturnValue((NOW_S + 20) * 1000);
      m.render({ minutes: 21 * 60 + 10 });
      expect(pending).toHaveLength(0);
    });

    it('image cuite : les nœuds cachés le restent (seule la racine perd son display)', () => {
      setup();
      const m = mount(1080);
      m.render({ minutes: 21 * 60 });
      expect(svgs.length).toBeGreaterThan(0);
      for (const svg of svgs) {
        // Chaque meuble et chaque pantin de la façade porte son display (inline ou none), tel que la boucle l'a écrit.
        const tags = svg.match(/<g [^>]*data-(?:wl-prop|slot)="[^"]*"[^>]*>/g) ?? [];
        expect(tags.length).toBeGreaterThan(0);
        for (const t of tags) expect(t).toMatch(/display="(none|inline)"/);
        expect(svg).toMatch(/display="none"/);
      }
    });
  });
});
