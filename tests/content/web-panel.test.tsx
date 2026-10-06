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
import { setImageService } from '../../src/content/image-registry';
import type { ImageService } from '../../src/core/images/image-service';
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
        filterSource={{ current: () => '', subscribe: noSubscribe } as unknown as CollectionFilterSource}
        loadFiltered={async () => new Set()}
        onOpen={onOpen}
        onOpenCard={onOpenCard}
      />,
    );
  });
}

const click = (element: Element | null) => act(async () => (element as SVGElement | HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
const card = (slug: string) => container.querySelector(`[data-card="${slug}"]`);
const hub = (slug: string) => container.querySelector(`[data-hub="${slug}"]`);
const actions = () => container.querySelector('[data-wmt-web-actions]');
const button = (label: string) => container.querySelector(`[data-wmt-web-actions] button[aria-label="${label}"]`);
const opacity = (element: Element | null) => (element as SVGElement).style.opacity;

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
    // Les traits sont regroupés par style en un seul chemin : un segment (« M… L… ») par trait.
    const segments = [...container.querySelectorAll('svg > g > path')].reduce((sum, path) => sum + (path.getAttribute('d')?.match(/M/g)?.length ?? 0), 0);
    expect(segments).toBe(4);
    expect(container.querySelectorAll('line')).toHaveLength(0);
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

  it('invite à parcourir la Collection quand aucune carte n’est connue', async () => {
    await mount(EMPTY_LINKS, false, []);
    expect(container.textContent).toContain('Aucune carte connue');
  });
});

describe('WebPanel, images', () => {
  const withImages = (found: Record<string, string | null>, enabled = true) =>
    setImageService({ enabled: () => enabled, peek: (slug: string) => found[slug], subscribe: () => () => undefined } as unknown as ImageService);
  const art = (slug: string) => card(slug)?.querySelector('image')?.getAttribute('href') ?? null;

  afterEach(() => setImageService(null));

  it('montre l’image du jeu, sinon l’image de remplacement déjà trouvée, sinon les initiales', async () => {
    withImages({ ChansonB: 'https://images.test/chanson.jpg', Air: null });
    await mount();
    // Les cartes du test n'ont pas d'image du jeu : seule ChansonB en a une de remplacement.
    expect(art('ChansonB')).toBe('https://images.test/chanson.jpg');
    expect(art('Kamini')).toBeNull();
    expect(art('Air')).toBeNull();
    expect(card('Kamini')?.textContent).toContain('Ka');
  });

  it('ignore les images de remplacement quand l’option est coupée', async () => {
    withImages({ ChansonB: 'https://images.test/chanson.jpg' }, false);
    await mount();
    expect(art('ChansonB')).toBeNull();
  });
});

describe('WebPanel, toucher une carte', () => {
  it('pose les boutons marché et carte au-dessus d’elle, sans afficher la carte en grand', async () => {
    await mount();
    expect(actions()).toBeNull();
    await click(card('Kamini'));

    expect(actions()?.getAttribute('aria-label')).toBe('Ouvrir Kamini');
    expect([...(actions()?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label'))).toEqual(['Voir le marché', 'Ouvrir la carte']);
    // La toile reste entièrement visible : ni fenêtre, ni carte en grand.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.wmt-card')).toBeNull();
  });

  it('le bouton « carte » ouvre la carte du jeu et referme la barre', async () => {
    await mount();
    await click(card('Kamini'));
    await click(button('Ouvrir la carte'));
    expect(onOpenCard).toHaveBeenCalledWith('Kamini');
    expect(onOpen).not.toHaveBeenCalled();
    expect(actions()).toBeNull();
  });

  it('le bouton « marché » ouvre la fiche du marché et referme la barre', async () => {
    await mount();
    await click(card('ChansonB'));
    await click(button('Voir le marché'));
    expect(onOpen).toHaveBeenCalledWith('ChansonB');
    expect(actions()).toBeNull();
  });

  it('met en avant la carte, ses points et leurs voisines, et atténue le reste', async () => {
    await mount();
    await click(card('Kamini'));
    expect(opacity(card('Kamini'))).toBe('1');
    expect(opacity(hub('Pop'))).toBe('1');
    expect(opacity(card('ChansonB'))).toBe('0.2');
    expect(opacity(hub('Musique_électronique'))).toBe('0.2');
    expect(opacity(card('Air'))).toBe('0.2');
  });

  it('passe d’une carte à l’autre, et toucher la même carte referme la barre', async () => {
    await mount();
    await click(card('Kamini'));
    await click(card('Air'));
    expect(actions()?.getAttribute('aria-label')).toBe('Ouvrir Air');
    await click(card('Air'));
    expect(actions()).toBeNull();
    expect(opacity(card('Kamini'))).toBe('1');
  });

  it('se referme en touchant le fond, un point, ou avec Échap', async () => {
    await mount();
    await click(card('Kamini'));
    await click(container.querySelector('svg'));
    expect(actions()).toBeNull();

    await click(card('Kamini'));
    await click(hub('Pop'));
    expect(actions()).toBeNull();

    await click(card('Kamini'));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(actions()).toBeNull();
  });
});

describe('WebPanel, toucher un point', () => {
  it('met en avant ses cartes et atténue le reste', async () => {
    await mount();
    await click(hub('Pop'));
    expect(opacity(card('Kamini'))).toBe('1');
    expect(opacity(card('Air'))).toBe('0.2');
    expect(container.textContent).toContain('Pop');
    expect(container.textContent).toContain('Kamini, ChansonB');
    await click(container.querySelector('svg'));
    expect(opacity(card('Air'))).toBe('1');
  });
});

describe('WebPanel en mode grand', () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  // jsdom ne dessine pas : sans contexte 2D, le canvas ne dessine rien (sans planter).
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('dessine un canvas (et plus de SVG de nœuds) au-delà de 1500 cartes reliées', async () => {
    const many: KnownCard[] = Array.from({ length: 1600 }, (_, i) => ({ slug: `Carte_${i}`, title: `Carte ${i}` }));
    const state = setLinks(EMPTY_LINKS, Object.fromEntries(many.map((c) => [c.slug, ['Pop', 'Rock']])), Date.now());
    await mount(state, false, many);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelectorAll('[data-card]')).toHaveLength(0);
    expect(container.textContent).toContain('1600 cartes reliées');
  });
});
