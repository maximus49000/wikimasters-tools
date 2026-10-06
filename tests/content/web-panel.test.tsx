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

describe('WebPanel en mode grand, pendant la lecture des liens', () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    vi.useFakeTimers();
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
    vi.useRealTimers();
  });

  it('ne reconstruit la toile qu’une fois par fenêtre pendant la lecture, et tout de suite à la fin', async () => {
    const many: KnownCard[] = Array.from({ length: 1700 }, (_, i) => ({ slug: `Carte_${i}`, title: `Carte ${i}` }));
    const linksOf = (from: number, to: number) => Object.fromEntries(many.slice(from, to).map((c) => [c.slug, ['Pop', 'Rock']]));
    let current = setLinks(EMPTY_LINKS, linksOf(0, 1600), Date.now());
    const listeners = new Set<() => void>();
    const noSubscribe = () => () => undefined;
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WebPanel
          collection={{ snapshot: () => many, list: async () => many, subscribe: noSubscribe } as unknown as CollectionRepo}
          links={{ load: async () => current, subscribe: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)), resolveMissing, failed: () => false } as unknown as LinksRepo}
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
    expect(container.textContent).toContain('1600 cartes reliées');
    const relies = () => /(\d+) cartes reliées/.exec(container.textContent ?? '')?.[1];
    // Une vague de liens par seconde pendant 9 s (le chargement des liens est regroupé par seconde) ; on regarde la toile tous les 250 ms.
    const changes: { at: number; count: string | undefined }[] = [];
    let last = relies();
    let now = 0;
    for (let from = 1600; from < 1690; from += 10) {
      current = setLinks(current, linksOf(from, from + 10), Date.now());
      for (const listener of listeners) listener();
      for (let step = 0; step < 4; step++) {
        await act(async () => vi.advanceTimersByTime(250));
        now += 250;
        if (relies() !== last) changes.push({ at: now, count: (last = relies()) });
      }
    }
    expect(container.textContent).toContain('Liens lus : 1690 / 1700');
    // La toile a suivi la lecture, mais par paliers : bien moins de reconstructions que de vagues, espacées d'au moins 2 s.
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < changes.length; i++) expect(changes[i]!.at - changes[i - 1]!.at).toBeGreaterThanOrEqual(2000);
    // Dernière vague : la lecture est finie, la toile suit sans attendre (le temps du seul chargement des liens).
    current = setLinks(current, linksOf(1690, 1700), Date.now());
    for (const listener of listeners) listener();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(container.textContent).toContain('Liens lus : 1700 / 1700');
    expect(container.textContent).toContain('1700 cartes reliées');
  });
});
