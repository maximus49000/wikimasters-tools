// @vitest-environment jsdom
// tests/content/moving-ghibli.test.tsx — déménageurs : pantins (Ghibli), seuil de la porte et caisse du camion au lieu du fondu
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { MovingCrew, collectMovers, frameAt, placeMovers, type CrewScript, type MoverPos } from '../../src/content/moving-truck';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber, ymdOfDay } from '../../src/core/library/city/shops/hours';
import { streetOn, type SlotDay } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { changePlans, movingOffsets, shopViewAt } from '../../src/core/library/city/shops/view';
import { anchorsOf, type FigureKey } from '../../src/core/library/figure/bake';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const EPOCH = dayNumber({ y: 2026, m: 10, d: 6 });
const metrics = cityMetrics(H);
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
// Début du jour de la scène sur l'horloge murale (s, multiple de 60) : la minute m de la scène est l'instant D0 + 60 m.
const D0 = 1_789_948_800;

// Premier jour de relocation (graines 1 à 4).
const found = ((): { seed: number; day: number; s: SlotDay; offset: number } => {
  for (const seed of [1, 2, 3, 4]) {
    const slots = shopSlotsFor(W, H, seed);
    for (let day = EPOCH + 1; day < EPOCH + 300; day++) {
      const street = streetOn(slots, seed, EPOCH, day, {});
      const s = street.find((x) => x.change?.kind === 'relet');
      if (s) return { seed, day, s, offset: movingOffsets(street, seed, day).get(s.slot.id)! };
    }
  }
  throw new Error('aucune relocation');
})();
const plan = changePlans(found.seed, found.s.slot.id, found.day, 'relet', found.offset).moving;
const ymd = ymdOfDay(found.day);
const frame = shopFrame(found.s.slot, metrics.ground);
const stepOf = (name: string) => plan.steps.find((x) => x.step === name)!;
const midMinute = (name: string): number => Math.round((stepOf(name).from + stepOf(name).to) / 2);

const mount = (minutes: number, ghibli: boolean, figures = new FigureRegistry('t8m', { perFrame: 200 })): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const node: ReactNode = (
    <FigureContext.Provider value={figures}>
      <svg>
        <MovingCrew
          view={shopViewAt(found.s, found.seed, ymd, minutes, found.offset)}
          frame={frame}
          day={found.day}
          seed={found.seed}
          width={W}
          metrics={metrics}
          sky={skyAt(minutes, times)}
          rainy={false}
          still={false}
          t0={D0 + minutes * 60}
          minutes={minutes}
          offset={found.offset}
          ghibli={ghibli}
        />
      </svg>
    </FigureContext.Provider>
  );
  act(() => root.render(node));
  return host;
};
const scriptOf = (c: Element): CrewScript => JSON.parse(c.querySelector('[data-moving-crew]')!.getAttribute('data-script')!) as CrewScript;
const keyOf = (fig: Element): FigureKey => {
  const [sig, yaw, gait, phase, head, arms, lean] = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
  return { sig: sig!, yaw: Number(yaw), gait: gait as FigureKey['gait'], phase: Number(phase), head: Number(head), arms: arms as FigureKey['arms'], lean: Number(lean) };
};
const translateOf = (tr: string): [number, number] => {
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(tr)!;
  return [Number(m[1]), Number(m[2])];
};

describe('déménageurs au pantin (Ghibli)', () => {
  it('portage : pantins sans miroir, bras « carry », carton posé entre les deux mains ; par le seuil de la porte', () => {
    const figures = new FigureRegistry('t8m', { perFrame: 200 });
    const minute = midMinute('carry-out');
    const c = mount(minute, true, figures);
    const crews = collectMovers(c);
    expect(crews).toHaveLength(1);
    expect(c.querySelector('[data-mover="porter"] [data-crew-worker], [data-mover="porter"] [data-head]')).toBeNull();
    let boxes = 0;
    let sills = 0;
    for (let t = D0 + minute * 60; t < D0 + minute * 60 + 4 * 24; t += 0.5) {
      placeMovers(crews, t, metrics, figures);
      figures.flush();
      placeMovers(crews, t, metrics, figures);
      for (const node of c.querySelectorAll('[data-mover="porter"][visibility="visible"], svg[data-mover-door][visibility="visible"]')) {
        expect(node.getAttribute('transform') ?? '').not.toMatch(/scale\(-/);
        if (node.tagName.toLowerCase() === 'svg') {
          sills++;
          expect(node.querySelector('[data-door-fig]')!.getAttribute('transform')).not.toMatch(/scale\(-/);
        }
        const fig = node.querySelector('[data-figure]')!;
        const box = fig.querySelector(':scope > [data-held="hands"] > [data-mover-box]')!;
        expect(box).not.toBeNull();
        if (box.getAttribute('visibility') !== 'visible') continue;
        boxes++;
        const key = keyOf(fig);
        expect(key.arms).toBe('carry');
        const a = anchorsOf(key);
        const [x, y] = translateOf(fig.querySelector(':scope > [data-held="hands"]')!.getAttribute('transform')!);
        expect(x).toBeCloseTo((a.handR[0] + a.handL[0]) / 2, 5);
        expect(y).toBeCloseTo((a.handR[1] + a.handL[1]) / 2, 5);
      }
    }
    expect(boxes).toBeGreaterThan(0);
    expect(sills).toBeGreaterThan(0);
  });
});

describe('déménageurs : entrées et sorties sans fondu (les deux graphismes)', () => {
  // Une silhouette n'apparaît ni ne disparaît dans la rue : hors de vue seulement au fond du seuil (profondeur 1), ou derrière la
  // caisse du camion (son arrière `b` ou `hide`, au milieu de la caisse) ; jamais de saut d'un instant au suivant.
  const near = (p: MoverPos, q: { x: number; y: number }, tol: number): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  const checkJoin = (sc: CrewScript, before: MoverPos, after: MoverPos, tag: string): void => {
    const tol = 1e-6;
    if (before.where === after.where) return;
    const pair = [before, after];
    const off = pair.find((p) => p.where === 'off');
    const street = pair.find((p) => p.where === 'street');
    const door = pair.find((p) => p.where === 'door');
    if (off && street) expect(near(street, sc.geom.b, sc.speed * 0.05 + tol) || near(street, sc.hide, sc.speed * 0.05 + tol), `${tag} : apparu dans la rue (${street.x}, ${street.y})`).toBe(true);
    if (off && door) expect(door.depth, `${tag} : seuil`).toBeGreaterThan(0.9);
    if (street && door) {
      expect(door.depth, `${tag} : seuil → rue`).toBeLessThan(0.1);
      expect(near(street, sc.geom.a, sc.speed * 0.05 + 0.5), `${tag} : sortie loin de la porte`).toBe(true);
    }
  };
  for (const ghibli of [false, true]) {
    it(`${ghibli ? 'Ghibli' : 'classique'} : de l'ouverture du hayon à la remontée dans le camion, continu d'un instant au suivant et d'une étape à la suivante`, () => {
      const names = ['open-back', 'carry-out', 'pause', 'carry-in', 'close-back'];
      const scripts = names.map((n) => scriptOf(mount(midMinute(n), ghibli)));
      let last: MoverPos[] | null = null;
      for (const sc of scripts) {
        if (last) last.forEach((p, i) => checkJoin(sc, p, frameAt(sc, sc.t0).movers[i]!, `${sc.step} (début)`));
        let prev = frameAt(sc, sc.t0).movers;
        for (let t = sc.t0; t < sc.t1; t += 0.05) {
          const cur = frameAt(sc, t).movers;
          cur.forEach((p, i) => {
            const q = prev[i]!;
            const tag = `${sc.step} ${(t - sc.t0).toFixed(2)} s, porteur ${i}`;
            if (p.where === q.where && p.where !== 'off') expect(Math.hypot(p.x - q.x, p.y - q.y), `${tag} : saut`).toBeLessThanOrEqual(sc.speed * 0.05 + 1e-6);
            checkJoin(sc, q, p, tag);
          });
          prev = cur;
        }
        last = prev;
      }
      // Fin de la fermeture : tous remontés dans le camion.
      expect(last!.every((p) => p.where === 'off')).toBe(true);
    }, 30000);
    it(`${ghibli ? 'Ghibli' : 'classique'} : aucune opacité sur un porteur (seul le seuil de la porte en a une)`, () => {
      const figures = new FigureRegistry('t8o', { perFrame: 200 });
      const c = mount(midMinute('carry-out'), ghibli, figures);
      const crews = collectMovers(c);
      const t0 = scriptOf(c).t0;
      for (let t = t0; t < t0 + 48; t += 0.5) {
        placeMovers(crews, t, metrics, ghibli ? figures : null);
        for (const e of c.querySelectorAll('[data-moving-crew], [data-moving-crew] *')) {
          if (!e.hasAttribute('opacity')) continue;
          expect(e.matches('[data-door-fig], [data-door-dark]') || e.closest('[data-pose-body], [data-head]') !== null, e.outerHTML.slice(0, 80)).toBe(true);
        }
      }
    });
  }
});
