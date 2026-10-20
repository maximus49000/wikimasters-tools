import { memo, useMemo, type ReactElement } from 'react';
import type { Facade } from '../core/library/city/facades';
import type { FacadeWindow } from '../core/library/city/facade-layout';
import { decorLit, decorShown, type HwItem } from '../core/library/city/halloween';
import { dayNumber } from '../core/library/city/shops/hours';
import { nightness } from '../core/library/city/window-lights';
import { INK } from '../core/library/paint/cel';
import type { Sky } from '../core/library/sky';
import { BAR_STEP, balconyOf, type Balcony } from './ghibli-window-art';
import { Crow, Pumpkin, Skeleton, Spider, Witch } from './halloween-art';
import type { SceneLife } from './use-scene-life';
import { figureHeight } from './window-life-art';

// Calque des décors d'Halloween des habitants (spec 2026-10-20 « Halloween » §2-3) : citrouilles sur les appuis et les
// rambardes, sorcière sur la dalle du balcon (garde-corps redessiné devant elle), squelette assis et corbeau perché sur la
// lisse, araignée pendue sous la dalle. Monté au-dessus de la vie aux fenêtres (window-life.tsx) : l'habitant penché qui pose
// une citrouille la tient sous le décor posé. L'état (posé ou non, allumé ou non) est relu à la minute sur le plan et les
// emplois du temps (city/halloween.ts) ; rendu React à la minute, aucune boucle, aucune animation.

// Une nuit « noire » (citrouilles allumées, voiles) au-delà de cette obscurité, comme le calque de la vie aux fenêtres.
const NIGHT_AT = 0.2;
// Épaisseur de la dalle d'un balcon (le fil de l'araignée part de dessous), longueur du fil.
const SLAB = 2.4;
const THREAD = 7;

type Geo = { item: HwItem; win: FacadeWindow; bal: Balcony | null; x: number };

// Fenêtre de la pièce du décor et balcon devant elle, position du décor (px du monde).
function geometry(items: readonly HwItem[], life: SceneLife, facades: readonly Facade[]): Geo[] {
  const out: Geo[] = [];
  for (const item of items) {
    const d = life.byFacadeHome.get(item.dwelling);
    const f = facades[item.facade];
    if (!d || !f) continue;
    const win = f.lamps.find((w) => w.home === d.home && w.kind !== 'stair' && d.roomOfWindow.get(w.bay) === item.room);
    if (!win) continue;
    const level = win.level >= 0 ? (f.layout?.levels[win.level] ?? null) : null;
    const bal = balconyOf(win, level, f.layout?.x);
    if (item.place !== 'sill' && !bal) continue;
    out.push({ item, win, bal, x: win.x + win.w / 2 + item.dx * win.w });
  }
  return out;
}

// Garde-corps redessiné devant la sorcière (lisse et barreaux, sur la portée du dessin), alignés sur ceux du balcon.
function railOver(x0: number, x1: number, bal: Balcony): string {
  const top = bal.by - bal.rh;
  let d = `M${x0.toFixed(2)} ${(top + 0.35).toFixed(2)}H${x1.toFixed(2)}`;
  const first = bal.x0 + Math.ceil((x0 - bal.x0) / BAR_STEP) * BAR_STEP;
  for (let k = first; k < x1; k += BAR_STEP) d += `M${(k + 0.22).toFixed(2)} ${top.toFixed(2)}V${bal.by.toFixed(2)}`;
  return d;
}

const DecorNode = memo(function DecorNode({ g, lit, dark }: { g: Geo; lit: boolean; dark: number }): ReactElement | null {
  const { item, win, bal, x } = g;
  const attrs = { 'data-hw-decor': item.id, 'data-hw-kind': item.kind, 'data-hw-place': item.place };
  const at = (y: number): string => `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
  if (item.kind === 'pumpkin') {
    const y = item.place === 'sill' || !bal ? win.y + win.h : bal.by - bal.rh + 0.2;
    const r = item.place === 'sill' ? Math.min(2.1, win.w * 0.3) : 1.9;
    return <g {...attrs} transform={at(y)}><Pumpkin v={item.v} r={r} lit={lit} dark={dark} /></g>;
  }
  if (!bal) return null;
  const h = figureHeight(win);
  switch (item.kind) {
    case 'witch': {
      const wh = h * 0.92;
      return (
        <g {...attrs}>
          <g transform={at(bal.by - 0.4)}><Witch h={wh} dir={item.dx < 0 ? -1 : 1} dark={dark} /></g>
          <path d={railOver(x - wh * 0.45, x + wh * 0.25, bal)} fill="none" stroke={INK} strokeWidth={0.5} />
        </g>
      );
    }
    case 'skeleton':
      return <g {...attrs} transform={at(bal.by - bal.rh + 0.3)}><Skeleton h={h * 0.62} dark={dark} /></g>;
    case 'crow':
      return <g {...attrs} transform={at(bal.by - bal.rh + 0.2)}><Crow s={1.5} look={item.v < 0.5 ? -1 : 1} dark={dark} /></g>;
    case 'spider':
      return <g {...attrs} transform={at(bal.by + SLAB)}><Spider s={1.2} len={THREAD} eyes={lit} dark={dark} /></g>;
  }
});

export function HalloweenLayer({ facades, life, sky, minutes }: { facades: readonly Facade[]; life: SceneLife; sky: Sky; minutes: number }): ReactElement | null {
  const plan = life.halloween;
  const geo = useMemo(() => (plan ? geometry(plan.items, life, facades) : []), [plan, life, facades]);
  if (!plan) return null;
  const [y, m, d] = life.day.iso.split('-').map(Number) as [number, number, number];
  const day = dayNumber({ y, m, d });
  const minute = Math.floor(minutes);
  // Voile de nuit au huitième de jour près (comme la vie aux fenêtres) : un re-rendu par palier au crépuscule.
  const dark = Math.round(nightness(Math.round(sky.daylight * 8) / 8) * 100) / 100;
  const night = nightness(sky.daylight) > NIGHT_AT;
  return (
    <g data-halloween="">
      {geo.map((g) => {
        const today = life.today.get(g.item.dwelling) ?? null;
        if (!decorShown(g.item, day, minute, today)) return null;
        return <DecorNode key={g.item.id} g={g} lit={decorLit(g.item, day, minute, night, today)} dark={dark} />;
      })}
    </g>
  );
}
