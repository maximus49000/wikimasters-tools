// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner } from '../../src/core/collection/collection-scan';
import { EMPTY_KINDS } from '../../src/core/kinds/kinds-book';
import type { KindsRepo } from '../../src/core/kinds/kinds-repo';
import { EMPTY_LINKS, setLinks, type LinksState } from '../../src/core/links/links-book';
import type { LinksRepo } from '../../src/core/links/links-repo';
import type { CollectionFilterSource } from '../../src/content/collection-filter';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { createMarketSource } from '../../src/content/market-source';
import { WebPanel } from '../../src/content/WebPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cards: KnownCard[] = ['Kamini', 'ChansonB', 'Daft_Punk', 'Air', 'Isolee'].map((slug) => ({ slug, title: slug.replace(/_/g, ' '), rarity: 'C' }));
const linked: LinksState = setLinks(
  EMPTY_LINKS,
  { Kamini: ['Pop'], ChansonB: ['Pop'], Daft_Punk: ['Musique_électronique'], Air: ['Musique_électronique'], Isolee: ['Solo'] },
  Date.now(),
);

let container: HTMLDivElement;
let root: Root;
const onOpen = vi.fn();
const onOpenCard = vi.fn();
const resolveMissing = vi.fn(async (_slugs: string[]) => undefined);

async function mount(state: LinksState = linked, failed = false, collected: KnownCard[] = cards) {
  const noSubscribe = () => () => undefined;
  root = createRoot(container);
  await act(async () => {
    root.render(
      <WebPanel
        collection={{ snapshot: () => collected, list: async () => collected, subscribe: noSubscribe } as unknown as CollectionRepo}
        links={{ load: async () => state, subscribe: noSubscribe, resolveMissing, failed: () => failed } as unknown as LinksRepo}
        scanner={{ snapshot: () => IDLE_SCAN, state: async () => IDLE_SCAN, subscribe: noSubscribe } as unknown as CollectionScanner}
        kinds={{ load: async () => EMPTY_KINDS, subscribe: noSubscribe } as unknown as KindsRepo}
        kindFilterSource={createKindFilterSource({ getItem: () => null, setItem: () => undefined })}
        book={null}
        market={createMarketSource().source}
        filterSource={{ current: () => '', subscribe: noSubscribe } as unknown as CollectionFilterSource}
        loadFiltered={async () => new Set()}
        onOpen={onOpen}
        onOpenCard={onOpenCard}
        onWantCards={vi.fn()}
      />,
    );
  });
}

const click = (element: Element | null) => act(async () => (element as SVGElement | HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
const card = (slug: string) => container.querySelector(`[data-card="${slug}"]`);
const hub = (slug: string) => container.querySelector(`[data-hub="${slug}"]`);

beforeEach(() => {
  onOpen.mockClear();
  onOpenCard.mockClear();
  resolveMissing.mockClear();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WebPanel', () => {
  it('dessine les cartes reliées par un article partagé, sans la carte isolée', async () => {
    await mount();
    expect([...container.querySelectorAll('[data-card]')].map((el) => el.getAttribute('data-card')).sort()).toEqual(['Air', 'ChansonB', 'Daft_Punk', 'Kamini']);
    expect([...container.querySelectorAll('[data-hub]')].map((el) => el.getAttribute('data-hub')).sort()).toEqual(['Musique_électronique', 'Pop']);
    expect(container.querySelectorAll('line')).toHaveLength(4);
  });

  it('demande la lecture des liens des cartes pas encore lues', async () => {
    await mount(setLinks(EMPTY_LINKS, { Kamini: ['Pop'] }, Date.now()));
    expect(resolveMissing).toHaveBeenCalledWith(['ChansonB', 'Daft_Punk', 'Air', 'Isolee']);
  });

  it('annonce la progression de la lecture', async () => {
    await mount(setLinks(EMPTY_LINKS, { Kamini: ['Pop'], ChansonB: ['Pop'] }, Date.now()));
    expect(container.textContent).toContain('2 / 5');
  });

  it('signale quand Wikipédia est indisponible', async () => {
    await mount(EMPTY_LINKS, true);
    expect(container.textContent).toContain('indisponible');
  });

  it('toucher une carte affiche la carte comme dans la vue Monde, avec le marché et la carte du jeu', async () => {
    await mount();
    await click(card('Kamini'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Kamini');

    await click(document.querySelector('button[aria-label="Ouvrir la carte"]'));
    expect(onOpenCard).toHaveBeenCalledWith('Kamini');
    await click(card('Kamini'));
    await click(document.querySelector('button[aria-label="Voir le marché"]'));
    expect(onOpen).toHaveBeenCalledWith('Kamini');
  });

  it('toucher un point met en avant ses cartes et atténue le reste', async () => {
    await mount();
    await click(hub('Pop'));
    expect((card('Kamini') as SVGElement).style.opacity).toBe('1');
    expect((card('Air') as SVGElement).style.opacity).toBe('0.2');
    expect(container.textContent).toContain('Pop');
    expect(container.textContent).toContain('Kamini, ChansonB');
    await click(container.querySelector('svg'));
    expect((card('Air') as SVGElement).style.opacity).toBe('1');
  });

  it('invite à parcourir la Collection quand aucune carte n’est connue', async () => {
    await mount(EMPTY_LINKS, false, []);
    expect(container.textContent).toContain('Aucune carte connue');
  });
});
