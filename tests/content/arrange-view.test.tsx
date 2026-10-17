// @vitest-environment jsdom
// Vue Modifier d'un plateau (✋) : bouton dans la bulle, objets du plateau, glissé au cm avec empreinte verte/rouge, retour à la place.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import { topToScreen } from '../../src/core/library/arrange';
import type { Layout } from '../../src/core/library/library-types';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeView, arrangeFrameFor } from '../../src/content/arrange/ArrangeView';
import { moveOnTop } from '../../src/core/library/arrange';
import { useEffect, useState } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
// jsdom n'a pas PointerEvent : un MouseEvent du même type, auquel on accroche le `pointerId` (1 = le doigt qui tient).
const pointer = (type: string, target: EventTarget, x: number, y: number, pointerId = 1) =>
  act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    target.dispatchEvent(ev);
  });

// Bureau avec écran, lampe (15 × 15) devant à gauche, plante (15 × 15) devant à droite, réveil (18 × 7) devant au milieu.
const DESK: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd' },
  { id: 'l', kind: 'small', item: 'lamp', hostId: 'd', x: 2, z: 2 },
  { id: 'p', kind: 'small', item: 'plant', hostId: 'd', x: 100, z: 2 },
  { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: 40, z: 2 },
];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('bulle d’un meuble porteur', () => {
  let repo: LibraryRepo;
  const seed = async (layout: Layout) => {
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };

  it('✋ « Modifier la disposition » pour un bureau en Aménager, pas pour une chaise', async () => {
    await seed([...DESK, { id: 'ch', kind: 'chair', col: 2, row: 14 }]);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    const btn = q('[data-action-bubble] [data-action="arrange"]');
    expect(btn?.getAttribute('aria-label')).toBe('Modifier la disposition');
    expect(btn?.textContent).toContain('✋');
    await click('[data-furniture="chair"]');
    expect(q('[data-action-bubble]')).not.toBeNull();
    expect(q('[data-action-bubble] [data-action="arrange"]')).toBeNull();
  });

  it('✋ ouvre la vue Modifier avec un élément par objet du plateau, l’ordinateur fixé ; ✓ la ferme', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="arrange"]');
    expect(q('[data-arrange-view]')).not.toBeNull();
    for (const id of ['pc', 'l', 'p', 'a']) expect(q(`[data-arrange-item="${id}"]`), id).not.toBeNull();
    expect(q('[data-arrange-item="pc"]')?.hasAttribute('data-fixed')).toBe(true);
    expect(q('[data-arrange-item="a"]')?.hasAttribute('data-fixed')).toBe(false);
    await click('[data-arrange-view] [aria-label="Terminer"]');
    expect(q('[data-arrange-view]')).toBeNull();
  });

  it('pousse une entrée d’historique ; le retour (popstate) ferme la vue ; ✓ retire l’entrée', async () => {
    await seed(DESK);
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    expect(history.state?.wmtArrange).toBeUndefined();
    await click('[data-action="arrange"]');
    expect(typeof history.state?.wmtArrange).toBe('string');
    // Retour Android : l'entrée est retirée par le navigateur, la vue se ferme sans toucher à l'historique.
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(q('[data-arrange-view]')).toBeNull();
    expect(back).not.toHaveBeenCalled();
    // Le bureau reste sélectionné (sa bulle aussi). ✓ : la vue retire elle-même son entrée (au-dessus de la pile).
    expect(q('[data-action-bubble]')).not.toBeNull();
    await click('[data-action="arrange"]');
    await click('[data-arrange-view] [aria-label="Terminer"]');
    expect(q('[data-arrange-view]')).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe('ArrangeView sur un vrai dépôt : deux lâchers avant l’écriture', () => {
  const frame = arrangeFrameFor('desk', { w: 800, h: 400 });
  const delta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    const a = topToScreen(frame, x0, z0);
    const b = topToScreen(frame, x1, z1);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const item = (id: string) => q(`[data-arrange-item="${id}"]`) as SVGGElement;

  it('les deux déplacements sont enregistrés et dessinés (aucun ne saute en arrière)', async () => {
    // Dépôt dont l'écriture attend une porte (fermée après l'amorçage) : les deux lâchers partent avant la première réponse.
    let release: (() => void) | null = null;
    let gate: Promise<void> | null = null;
    const base = createMemoryStore();
    const slow = { get: base.get, set: async <T,>(k: string, v: T) => { if (gate) await gate; await base.set(k, v); } };
    const repo = createLibraryRepo(slow);
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => DESK)); });
    gate = new Promise<void>((resolve) => { release = resolve; });
    function Host() {
      const [state, setState] = useState(repo.current()!);
      useEffect(() => repo.subscribe(() => setState(repo.current()!)), []);
      return <ArrangeView layout={state.rooms[0]!.layout} room={{ style: 'scandinave' }} hostId="d" mode="move"
        onMove={(id, x, z) => repo.update((st) => updateLayout(st, 'r1', (l) => moveOnTop(l, id, x, z)))} onClose={() => undefined} />;
    }
    act(() => root.render(<Host />));
    const pointerAt = (type: string, target: EventTarget, x: number, y: number) => pointer(type, target, x, y);
    const dragTo = async (id: string, [dx, dy]: [number, number]) => {
      await pointerAt('pointerdown', item(id), 300, 200);
      await pointerAt('pointermove', window, 300 + dx, 200 + dy);
      await pointerAt('pointerup', window, 300 + dx, 200 + dy);
    };
    await dragTo('a', delta(40, 2, 60, 20));
    await dragTo('p', delta(100, 2, 100, 30));
    // Rien n'est encore écrit : les deux objets attendent, dessinés à leur nouvelle place.
    expect(repo.current()!.rooms[0]!.layout.find((p) => p.id === 'a')).toMatchObject({ x: 40, z: 2 });
    expect(item('a').style.transform).toContain('translate');
    expect(item('p').style.transform).toContain('translate');
    await act(async () => { release!(); });
    await settle();
    await settle();
    const layout = repo.current()!.rooms[0]!.layout;
    expect(layout.find((p) => p.id === 'a')).toMatchObject({ x: 60, z: 20 });
    expect(layout.find((p) => p.id === 'p')).toMatchObject({ x: 100, z: 30 });
    expect(item('a').style.transform).toBe('');
    expect(item('p').style.transform).toBe('');
  });
});

describe('ArrangeView : glissé sur le plateau', () => {
  const frame = arrangeFrameFor('desk', { w: 800, h: 400 });
  // Déplacement écran (px) qui fait passer un coin avant gauche de (x0, z0) à (x1, z1) cm.
  const delta = (x0: number, z0: number, x1: number, z1: number): [number, number] => {
    const a = topToScreen(frame, x0, z0);
    const b = topToScreen(frame, x1, z1);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const mount = (layout: Layout = DESK) => {
    const h = { onMove: vi.fn(), onClose: vi.fn() };
    act(() => root.render(<ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    return h;
  };
  const item = (id: string) => q(`[data-arrange-item="${id}"]`) as SVGGElement;
  const drag = async (id: string, [dx, dy]: [number, number], release = true) => {
    await pointer('pointerdown', item(id), 300, 200);
    await pointer('pointermove', window, 300 + dx / 2, 200 + dy / 2);
    await pointer('pointermove', window, 300 + dx, 200 + dy);
    if (release) await pointer('pointerup', window, 300 + dx, 200 + dy);
  };

  it('glisser le réveil vers une place libre puis lâcher : onCommit une fois, réveil à la nouvelle place', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    expect(item('a').style.transform).toContain('translate');
    await pointer('pointerup', window, 0, 0);
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onMove).toHaveBeenCalledWith('a', 60, 20);
    expect(q('[data-footprint]')).toBeNull();
  });

  it('lâché en vert : l’objet reste à sa nouvelle place tant que la disposition écrite n’est pas revenue, puis se pose sans sauter', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20));
    expect(h.onMove).toHaveBeenCalledTimes(1);
    // Le dépôt n'a pas encore répondu : la translation du lâcher tient toujours, sans empreinte.
    const t = item('a').style.transform;
    expect(t).toContain('translate');
    expect(q('[data-footprint]')).toBeNull();
    // Pas de nouvelle prise de cet objet en attendant.
    await pointer('pointerdown', item('a'), 300, 200);
    await pointer('pointermove', window, 400, 200);
    expect(q('[data-footprint]')).toBeNull();
    expect(item('a').style.transform).toBe(t);
    await pointer('pointerup', window, 400, 200);
    // La disposition écrite arrive : l'objet est dessiné à (60, 20), plus de translation.
    const next = moveOnTop(DESK, 'a', 60, 20)!;
    act(() => root.render(<ArrangeView layout={next} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    expect(item('a').style.transform).toBe('');
    expect(h.onMove).toHaveBeenCalledTimes(1);
  });

  it('écriture refusée (promesse rejetée) : l’attente tombe, l’objet revient et se ressaisit à son ancienne place', async () => {
    const h = { onMove: vi.fn(() => Promise.reject(new Error('refusé'))), onClose: vi.fn() };
    act(() => root.render(<ArrangeView layout={DESK} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    await drag('a', delta(40, 2, 60, 20));
    expect(h.onMove).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(item('a').style.transform).toBe('');
    await drag('a', delta(40, 2, 60, 20), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    expect(item('a').style.transform).toContain('translate');
    await pointer('pointerup', window, 0, 0);
    expect(h.onMove).toHaveBeenCalledTimes(2);
  });

  it('écriture sans effet (promesse tenue, disposition inchangée) : l’attente tombe', async () => {
    const h = { onMove: vi.fn(() => Promise.resolve()), onClose: vi.fn() };
    act(() => root.render(<ArrangeView layout={DESK} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    await drag('a', delta(40, 2, 60, 20));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(item('a').style.transform).toBe('');
  });

  it('la disposition reçue met l’objet ailleurs : l’attente tombe, il est dessiné là', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20));
    expect(item('a').style.transform).toContain('translate');
    const elsewhere: Layout = DESK.map((p) => (p.id === 'a' ? { ...p, x: 70, z: 30 } : p));
    act(() => root.render(<ArrangeView layout={elsewhere} room={{ style: 'scandinave' }} hostId="d" mode="move" {...h} />));
    expect(item('a').style.transform).toBe('');
    // Ressaisi depuis (70, 30) : un glissé de +10 cm vise (80, 30).
    await drag('a', delta(70, 30, 80, 30));
    expect(h.onMove).toHaveBeenLastCalledWith('a', 80, 30);
  });

  it('lâcher la plante pendant que le réveil attend ne fait pas revenir le réveil', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20));
    const t = item('a').style.transform;
    expect(t).toContain('translate');
    await drag('p', delta(100, 2, 100, 30));
    expect(h.onMove).toHaveBeenCalledTimes(2);
    expect(item('a').style.transform).toBe(t);
    expect(item('p').style.transform).toContain('translate');
  });

  it('pointercancel ne demande rien : l’objet revient', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 60, 20), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointercancel', window, 0, 0);
    expect(h.onMove).not.toHaveBeenCalled();
    expect(item('a').style.transform).toBe('');
    expect(q('[data-footprint]')).toBeNull();
  });

  it('un glissé se valide contre les déplacements en attente : la place que le réveil vient de prendre est rouge pour la plante', async () => {
    mount();
    await drag('a', delta(40, 2, 60, 20));
    await drag('p', delta(100, 2, 62, 22), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('false');
  });

  it('l’objet soulevé se dessine en dernier', async () => {
    mount();
    const order = () => Array.from(container.querySelectorAll('[data-arrange-item]')).map((el) => el.getAttribute('data-arrange-item'));
    // Au repos : du plus loin (écran) au plus proche ; le réveil (z = 2) n'est pas dernier.
    expect(order()[0]).toBe('pc');
    await drag('a', delta(40, 2, 60, 20), false);
    expect(order()[order().length - 1]).toBe('a');
    await pointer('pointerup', window, 0, 0);
    expect(order()[order().length - 1]).toBe('a');
  });

  it('un autre doigt ne déplace pas l’objet tenu et ne termine pas le glissé', async () => {
    const h = mount();
    const [dx, dy] = delta(40, 2, 60, 20);
    await pointer('pointerdown', item('a'), 300, 200);
    await pointer('pointermove', window, 300 + dx, 200 + dy);
    const t = item('a').style.transform;
    expect(t).toContain('translate');
    await pointer('pointermove', window, 100, 100, 2);
    expect(item('a').style.transform).toBe(t);
    await pointer('pointerup', window, 100, 100, 2);
    expect(h.onMove).not.toHaveBeenCalled();
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('true');
    await pointer('pointerup', window, 300 + dx, 200 + dy);
    expect(h.onMove).toHaveBeenCalledTimes(1);
  });

  it('au-dessus de la lampe : empreinte rouge ; lâcher : rien n’est enregistré, l’objet revient', async () => {
    const h = mount();
    await drag('a', delta(40, 2, 2, 2), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('false');
    await pointer('pointerup', window, 0, 0);
    expect(h.onMove).not.toHaveBeenCalled();
    expect(item('a').style.transform).toBe('');
    expect(q('[data-footprint]')).toBeNull();
  });

  it('hors du plateau : empreinte rouge', async () => {
    mount();
    await drag('a', delta(40, 2, 110, 2), false);
    expect(q('[data-footprint]')?.getAttribute('data-ok')).toBe('false');
  });

  it('toucher sans glisser (moins de 4 px) ne fait rien', async () => {
    const h = mount();
    await pointer('pointerdown', item('a'), 300, 200);
    await pointer('pointermove', window, 302, 201);
    expect(q('[data-footprint]')).toBeNull();
    expect(item('a').style.transform).toBe('');
    await pointer('pointerup', window, 302, 201);
    expect(h.onMove).not.toHaveBeenCalled();
  });

  it('l’ordinateur ne se saisit pas', async () => {
    const h = mount();
    await drag('pc', [80, 0], false);
    expect(q('[data-footprint]')).toBeNull();
    expect(item('pc').style.transform).toBe('');
    await pointer('pointerup', window, 0, 0);
    expect(h.onMove).not.toHaveBeenCalled();
  });

  it('✓ ferme la vue', () => {
    const h = mount();
    act(() => (q('[aria-label="Terminer"]') as HTMLButtonElement).click());
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ArrangeView : cartes posées', () => {
  it('un CD sur trépied et un DVD à plat sont dessinés avec leur pochette', () => {
    const layout: Layout = [
      { id: 'd', kind: 'desk', col: 12, row: 10 },
      { id: 'cd', kind: 'posed', shape: 'cd', hostId: 'd', x: 4, z: 4, slug: 'Daft_Punk' },
      { id: 'dv', kind: 'posed', shape: 'dvd', hostId: 'd', x: 60, z: 4, pose: 'flat', slug: 'Film' },
    ];
    act(() => root.render(<ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="move" imageOf={(s) => `data:image/png;base64,${s}`} onMove={vi.fn()} onClose={vi.fn()} />));
    expect(q('[data-arrange-item="cd"] [data-item3d="cd"] image')?.getAttribute('href')).toBe('data:image/png;base64,Daft_Punk');
    expect(q('[data-arrange-item="dv"] [data-item3d="dvd"] image')?.getAttribute('href')).toBe('data:image/png;base64,Film');
    // À plat : pas de trépied (moins de formes que le même DVD sur trépied).
    const flatCount = q('[data-arrange-item="dv"] [data-item3d="dvd"]')!.querySelectorAll('polygon').length;
    act(() => root.render(<ArrangeView layout={layout.map((p) => (p.id === 'dv' && p.kind === 'posed' ? { ...p, pose: undefined } : p))} room={{ style: 'scandinave' }} hostId="d" mode="move" imageOf={(s) => `data:image/png;base64,${s}`} onMove={vi.fn()} onClose={vi.fn()} />));
    expect(flatCount).toBeLessThan(q('[data-arrange-item="dv"] [data-item3d="dvd"]')!.querySelectorAll('polygon').length);
  });
});
