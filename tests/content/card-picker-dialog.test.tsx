// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import type { Category } from '../../src/core/kinds/kinds-category';
import { CardPickerDialog, type CardChoice } from '../../src/content/CardPickerDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const q = (s: string) => container.querySelector<HTMLElement>(s);
const qa = (s: string) => [...container.querySelectorAll<HTMLElement>(s)];
async function click(s: string) {
  const el = q(s);
  if (!el) throw new Error(`introuvable : ${s}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function type(s: string, value: string) {
  const el = q(s) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const DAFT: KnownCard = { slug: 'Daft_Punk', title: 'Daft Punk' };
const SATIE: KnownCard = { slug: 'Eric_Satie', title: 'Éric Satie' };

type Props = Partial<Parameters<typeof CardPickerDialog>[0]>;
async function mount(props: Props = {}) {
  const onChoose = vi.fn<(c: CardChoice) => void>();
  const onClose = vi.fn();
  await act(async () => {
    root.render(
      <CardPickerDialog cards={[DAFT]} taken={new Set()} categoryOf={(): Category => 'music'} allowed={['shelf']} onChoose={onChoose} onClose={onClose} {...props} />,
    );
  });
  return { onChoose, onClose };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CardPickerDialog', () => {
  it('choisit la carte puis la forme conseillée', async () => {
    const { onChoose } = await mount();
    await click('[data-card-option="Daft_Punk"]');
    expect(q('[data-shape="cd"]')?.getAttribute('data-suggested')).toBe('true');
    expect(q('[data-shape="book"]')?.getAttribute('data-suggested')).toBeNull();
    await click('[data-shape="cd"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'shelf', shape: 'cd', slug: 'Daft_Punk' });
  });

  it('grise une carte déjà posée', async () => {
    await mount({ taken: new Set(['Daft_Punk']) });
    expect(q('[data-card-option="Daft_Punk"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('filtre par la recherche sans tenir compte des accents', async () => {
    await mount({ cards: [SATIE, DAFT] });
    expect(qa('[data-card-option]')).toHaveLength(2);
    await type('input[type="search"]', 'eric');
    expect(qa('[data-card-option]').map((e) => e.getAttribute('data-card-option'))).toEqual(['Eric_Satie']);
  });

  it('limite à 60 cartes et trie par titre', async () => {
    const cards = Array.from({ length: 70 }, (_, i) => ({ slug: `C${i}`, title: `Carte ${String(i).padStart(2, '0')}` }));
    await mount({ cards: [...cards].reverse() });
    const shown = qa('[data-card-option]');
    expect(shown).toHaveLength(60);
    expect(shown[0]?.getAttribute('data-card-option')).toBe('C0');
  });

  it('écran seul : valide aussitôt sans étape de forme', async () => {
    const { onChoose } = await mount({ allowed: ['screen'] });
    await click('[data-card-option="Daft_Punk"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'screen', slug: 'Daft_Punk' });
  });

  it('mur et vinyle : demande la couleur (noir par défaut)', async () => {
    const { onChoose } = await mount({ allowed: ['wall'] });
    await click('[data-card-option="Daft_Punk"]');
    expect(q('[data-shape="vinyl"]')?.getAttribute('data-suggested')).toBe('true');
    await click('[data-shape="vinyl"]');
    expect(onChoose).not.toHaveBeenCalled();
    expect(qa('[data-color]')).toHaveLength(5);
    await click('[data-color="red"]');
    await click('[data-action="confirm"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'wall', shape: 'vinyl', slug: 'Daft_Punk', color: 'red' });
  });

  it('vinyle : couleur noire par défaut', async () => {
    const { onChoose } = await mount({ allowed: ['wall'] });
    await click('[data-card-option="Daft_Punk"]');
    await click('[data-shape="vinyl"]');
    await click('[data-action="confirm"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'wall', shape: 'vinyl', slug: 'Daft_Punk', color: 'black' });
  });

  it('plusieurs cibles : un sélecteur précède les formes', async () => {
    const { onChoose } = await mount({ allowed: ['wall', 'shelf', 'screen'], categoryOf: () => 'film' });
    await click('[data-card-option="Daft_Punk"]');
    expect(q('[data-shape]')).toBeNull();
    await click('[data-target="shelf"]');
    await click('[data-shape="dvd"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'shelf', shape: 'dvd', slug: 'Daft_Punk' });
  });

  it('plusieurs cibles : l’écran valide aussitôt', async () => {
    const { onChoose } = await mount({ allowed: ['wall', 'screen'] });
    await click('[data-card-option="Daft_Punk"]');
    await click('[data-target="screen"]');
    expect(onChoose).toHaveBeenCalledWith({ target: 'screen', slug: 'Daft_Punk' });
  });

  it('ferme par la croix et par le fond', async () => {
    const { onClose } = await mount();
    await click('[data-action="close"]');
    expect(onClose).toHaveBeenCalledTimes(1);
    await click('.wmt-lib-dialog');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('filtres : s’ouvrent par le glyphe, restreignent la liste et s’effacent', async () => {
    const rare: KnownCard = { slug: 'Rare', title: 'Rare', rarity: 'UR' };
    const common: KnownCard = { slug: 'Common', title: 'Common', rarity: 'C' };
    await mount({ cards: [rare, common] });
    expect(q('[data-filters]')).toBeNull();
    await click('[data-action="filters"]');
    const select = q('[data-filter="rarity"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'UR';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(qa('[data-card-option]').map((e) => e.getAttribute('data-card-option'))).toEqual(['Rare']);
    expect(q('[data-filter="duplicates"]')).toBeNull();
    await click('[data-action="clear-filters"]');
    expect(qa('[data-card-option]')).toHaveLength(2);
  });
});
