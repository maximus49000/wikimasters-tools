// @vitest-environment jsdom
// Bulle d'une carte dans la vue Modifier : toucher une carte sans la glisser l'ouvre (zoom d'une tablette, dessus, bureau) ; présentation
// (tablette : face / tranche / dos ; plateau : trépied / à plat), format (CD, DVD, jeu, livre), ⓘ, 🗑 ; refus avec le message habituel ;
// chaque changement accepté part tout de suite comme une intention (id + changement, jamais une disposition).
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';
import type { Layout } from '../../src/core/library/library-types';
import { setDisplayOf, setPose } from '../../src/core/library/room-grid';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { ArrangeShelf, type ArrangeLevel } from '../../src/content/arrange/ArrangeShelf';
import { ArrangeView } from '../../src/content/arrange/ArrangeView';
import { applyCardChange } from '../../src/content/arrange/CardBubble';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
const all = (selector: string) => Array.from(container.querySelectorAll(selector));
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
// jsdom n'a pas PointerEvent : un MouseEvent du même type, auquel on accroche le `pointerId`.
const pointer = (type: string, target: EventTarget, x: number, y: number, pointerId = 1) =>
  act(async () => {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    target.dispatchEvent(ev);
  });
// Toucher sans glisser (le doigt bouge de 2 px, sous le seuil du glissé).
async function tap(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await pointer('pointerdown', el, 300, 200);
  await pointer('pointerup', el, 302, 200);
  await settle();
}
const bubble = () => q('[data-card-bubble]');
const label = (l: string) => `[data-card-bubble] [aria-label="${l}"]`;

// Étagère s : tablette 0 = 4 CD de face + un livre sur la tranche (63 cm sur 74) ; tablette 1 = une lampe et un jeu.
const SHELF: Layout = [
  { id: 's', kind: 'shelf', col: 0, row: 6 },
  ...[0, 1, 2, 3].map((i): Layout[number] => ({ id: `c${i}`, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: i, slug: `A${i}` })),
  { id: 'bk', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 4, slug: 'Livre' },
  { id: 'l', kind: 'small', item: 'lamp', hostId: 's', level: 1, order: 0 },
  { id: 'g', kind: 'stored', shape: 'game', shelfId: 's', level: 1, order: 1, slug: 'Jeu' },
];
// Bureau : un CD posé sur trépied devant à gauche, une lampe juste derrière (à plat, le CD la chevaucherait).
const DESK: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd' },
  { id: 'k', kind: 'posed', shape: 'cd', hostId: 'd', x: 2, z: 2, slug: 'Kiki' },
  { id: 'lp', kind: 'small', item: 'lamp', hostId: 'd', x: 2, z: 13 },
  { id: 'pl', kind: 'small', item: 'plant', hostId: 'd', x: 100, z: 2 },
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

type Spy = ReturnType<typeof vi.fn<(...args: any[]) => void>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Spies = { onCardEdit: Spy; onCardInfo: Spy; onClose: Spy; onLevel: Spy };
const spiesOf = (): Spies => ({ onCardEdit: vi.fn(), onCardInfo: vi.fn(), onClose: vi.fn(), onLevel: vi.fn() });
function ShelfHost({ layout, spies, initial }: { layout: Layout; spies: Spies; initial: ArrangeLevel }) {
  const [level, setLevel] = useState<ArrangeLevel>(initial);
  return (
    <ArrangeShelf layout={layout} room={{ style: 'scandinave' }} shelfIds={['s']} level={level}
      onLevel={(l) => { spies.onLevel(l); setLevel(l); }} onBoard={() => undefined} onTop={() => undefined} onClose={spies.onClose}
      onCardEdit={spies.onCardEdit} onCardInfo={spies.onCardInfo} />
  );
}
const mountShelf = (layout: Layout = SHELF, initial: ArrangeLevel = 0): Spies => {
  const spies = spiesOf();
  act(() => root.render(<ShelfHost layout={layout} spies={spies} initial={initial} />));
  return spies;
};
const mountDesk = (layout: Layout = DESK): Spies => {
  const spies = spiesOf();
  act(() => root.render(
    <ArrangeView layout={layout} room={{ style: 'scandinave' }} hostId="d" mode="move" onMove={() => undefined} onClose={spies.onClose}
      onCardEdit={spies.onCardEdit} onCardInfo={spies.onCardInfo} />,
  ));
  return spies;
};

describe('bulle d’une carte rangée (zoom d’une tablette)', () => {
  it('toucher une carte ouvre sa bulle : présentation, quatre formats (glyphes), le format actuel pressé', async () => {
    mountShelf();
    await tap('[data-board-card="A1"]');
    expect(bubble()?.getAttribute('data-card-bubble')).toBe('c1');
    expect(q(label('Présenter de face'))?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('Présenter sur la tranche'))?.getAttribute('aria-pressed')).toBe('false');
    expect(q(label('Présenter de dos'))).toBeNull();
    expect(q(label('Sur un trépied'))).toBeNull();
    const formats = [['CD', '💿'], ['DVD', '📀'], ['Jeu vidéo', '🎮'], ['Livre', '📖']];
    for (const [name, glyph] of formats) {
      const b = q(label(name!));
      expect(b, name).not.toBeNull();
      expect(b?.getAttribute('title')).toBe(name);
      expect(b?.textContent).toBe(glyph);
    }
    expect(q(label('CD'))?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('DVD'))?.getAttribute('aria-pressed')).toBe('false');
    for (const b of all('[data-card-bubble] button')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('title')).toBe(b.getAttribute('aria-label'));
    }
  });

  it('un jeu se présente aussi de dos', async () => {
    mountShelf(SHELF, 1);
    await tap('[data-board-card="Jeu"]');
    expect(bubble()?.getAttribute('data-card-bubble')).toBe('g');
    expect(q(label('Présenter de dos'))).not.toBeNull();
    expect(q(label('Jeu vidéo'))?.getAttribute('aria-pressed')).toBe('true');
  });

  it('un changement accepté part tout de suite comme une intention (id + changement)', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A1"]');
    await click(label('Présenter sur la tranche'));
    expect(spies.onCardEdit).toHaveBeenCalledTimes(1);
    expect(spies.onCardEdit).toHaveBeenCalledWith('c1', { display: 'spine' });
    await click(label('DVD'));
    expect(spies.onCardEdit).toHaveBeenLastCalledWith('c1', { shape: 'dvd' });
    // L'intention s'applique à la disposition du moment.
    expect(applyCardChange(SHELF, 'c1', { shape: 'dvd' })?.find((p) => p.id === 'c1')).toMatchObject({ shape: 'dvd' });
  });

  it('un changement refusé affiche « Plus de place sur cette tablette. » et ne change rien', async () => {
    expect(setDisplayOf(SHELF, 'bk', 'cover')).toBeNull();
    const spies = mountShelf();
    await tap('[data-board-card="Livre"]');
    expect(q(label('Présenter sur la tranche'))?.getAttribute('aria-pressed')).toBe('true');
    await click(label('Présenter de face'));
    expect(spies.onCardEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Plus de place sur cette tablette.');
    expect(q(label('Présenter sur la tranche'))?.getAttribute('aria-pressed')).toBe('true');
  });

  it('ⓘ ouvre la fiche de la carte ; 🗑 la retire et ferme la bulle', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A2"]');
    await click(label('Fiche de la carte'));
    expect(spies.onCardInfo).toHaveBeenCalledWith('A2');
    await click(label('Retirer la carte'));
    expect(spies.onCardEdit).toHaveBeenCalledWith('c2', { remove: true });
    expect(bubble()).toBeNull();
  });

  it('glisser une carte n’ouvre pas sa bulle ; toucher un petit objet n’ouvre rien', async () => {
    mountShelf(SHELF, 1);
    const card = q('[data-board-card="Jeu"]')!;
    await pointer('pointerdown', card, 300, 200);
    await pointer('pointermove', window, 340, 200);
    await pointer('pointerup', window, 340, 200);
    await settle();
    expect(bubble()).toBeNull();
    await tap('[data-board-small="l"]');
    expect(bubble()).toBeNull();
  });

  it('✕, Échap et un toucher ailleurs ferment la bulle (la vue reste)', async () => {
    const spies = mountShelf();
    await tap('[data-board-card="A1"]');
    await click(label('Fermer la bulle'));
    expect(bubble()).toBeNull();
    await tap('[data-board-card="A1"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(bubble()).toBeNull();
    expect(spies.onLevel).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    await tap('[data-board-card="A1"]');
    await pointer('pointerdown', q('[data-arrange-shelf]')!, 20, 380);
    expect(bubble()).toBeNull();
  });

  it('au meuble entier, toucher une carte zoome sur sa tablette (pas de bulle)', async () => {
    const spies = mountShelf(SHELF, 'whole');
    const card = q('[data-zoom-card="A1"]')!;
    await pointer('pointerdown', card, 300, 200);
    await pointer('pointerup', card, 300, 200);
    await act(async () => { card.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(spies.onLevel).toHaveBeenCalledWith(0);
    expect(bubble()).toBeNull();
  });
});

describe('bulle d’une carte posée (bureau, dessus)', () => {
  it('trépied / à plat sur un plateau, la pose actuelle pressée ; pas de face / tranche', async () => {
    const spies = mountDesk();
    await tap('[data-arrange-item="k"]');
    expect(bubble()?.getAttribute('data-card-bubble')).toBe('k');
    expect(q(label('Sur un trépied'))?.getAttribute('aria-pressed')).toBe('true');
    expect(q(label('À plat'))?.getAttribute('aria-pressed')).toBe('false');
    expect(q(label('Présenter de face'))).toBeNull();
    expect(q(label('CD'))?.getAttribute('aria-pressed')).toBe('true');
    await click(label('DVD'));
    expect(spies.onCardEdit).toHaveBeenCalledWith('k', { shape: 'dvd' });
  });

  it('à plat refusé (la lampe derrière) : « Pas de place ici sur le dessus. », rien ne change', async () => {
    expect(setPose(DESK, 'k', 'flat')).toBeNull();
    const spies = mountDesk();
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(spies.onCardEdit).not.toHaveBeenCalled();
    expect(q('[data-card-bubble-message]')?.textContent).toBe('Pas de place ici sur le dessus.');
  });

  it('à plat accepté sans la lampe : intention { pose: "flat" }', async () => {
    const spies = mountDesk(DESK.filter((p) => p.id !== 'lp'));
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(spies.onCardEdit).toHaveBeenCalledWith('k', { pose: 'flat' });
  });

  it('toucher un petit objet ou l’ordinateur n’ouvre rien ; glisser la carte non plus', async () => {
    mountDesk();
    await tap('[data-arrange-item="pl"]');
    await tap('[data-arrange-item="pc"]');
    expect(bubble()).toBeNull();
    await pointer('pointerdown', q('[data-arrange-item="k"]')!, 300, 200);
    await pointer('pointermove', window, 330, 200);
    await pointer('pointerup', window, 330, 200);
    await settle();
    expect(bubble()).toBeNull();
  });

  it('la carte en attente du mode ＋ n’ouvre pas de bulle (elle n’est pas encore posée)', async () => {
    const spies = spiesOf();
    act(() => root.render(
      <ArrangeView layout={DESK} room={{ style: 'scandinave' }} hostId="d" mode="add" onMove={() => undefined} onClose={spies.onClose}
        add={{ cards: [{ slug: 'Paris', title: 'Paris' }], categoryOf: () => 'music', initial: { slug: 'Paris', shape: 'cd' }, onAdd: () => undefined }}
        onCardEdit={spies.onCardEdit} onCardInfo={spies.onCardInfo} />,
    ));
    expect(q('[data-pending]')).not.toBeNull();
    await tap('[data-pending]');
    expect(bubble()).toBeNull();
  });

  it('sur le dessus d’une étagère : la bulle s’ouvre aussi', async () => {
    const layout: Layout = [...SHELF, { id: 'pz', kind: 'posed', shape: 'cd', hostId: 's', x: 30, z: 5, slug: 'Haut' }];
    mountShelf(layout, 'top');
    await tap('[data-arrange-item="pz"]');
    expect(bubble()?.getAttribute('data-card-bubble')).toBe('pz');
    expect(q(label('Sur un trépied'))).not.toBeNull();
  });
});

describe('bulle branchée dans LibraryPanel', () => {
  let repo: LibraryRepo;
  const seed = async (layout: Layout) => {
    repo = createLibraryRepo(createMemoryStore());
    await act(async () => { root.render(<LibraryPanel library={repo} />); });
    await act(async () => { await repo.update((st) => updateLayout(st, 'r1', () => layout)); });
    await settle();
  };
  const stored = () => repo.current()!.rooms[0]!.layout;

  it('à plat puis 🗑 : écrits dans le dépôt ; le retour ferme la bulle d’abord, puis la vue', async () => {
    await seed(DESK.filter((p) => p.id !== 'lp'));
    await click('[data-action="edit"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="arrange"]');
    await tap('[data-arrange-item="k"]');
    await click(label('À plat'));
    expect(stored().find((p) => p.id === 'k')).toMatchObject({ pose: 'flat' });
    expect(q(label('À plat'))?.getAttribute('aria-pressed')).toBe('true');
    vi.spyOn(history, 'back').mockImplementation(() => undefined);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(bubble()).toBeNull();
    expect(q('[data-arrange-view]')).not.toBeNull();
    await tap('[data-arrange-item="k"]');
    await click(label('Retirer la carte'));
    expect(stored().some((p) => p.id === 'k')).toBe(false);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(q('[data-arrange-view]')).toBeNull();
  });
});
