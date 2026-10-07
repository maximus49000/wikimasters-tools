import { describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { createSceneResolver, type SceneDeps } from '../../src/content/scene';
import type { TourSession } from '../../src/content/tour-session';
import type { TourStep } from '../../src/core/whats-new/types';

const el = (name: string) => ({ name }) as unknown as Element;
const session = (extra: Partial<TourSession> = {}): TourSession => ({ steps: [], index: 0, origin: '/marketplace', ...extra });

// Dépendances simulées : `present` = éléments à l'écran (par sélecteur), `appear` = éléments qui apparaissent après un clic ou une ouverture.
function setup(overrides: Partial<SceneDeps> = {}, present: Record<string, Element> = {}) {
  const screen: Record<string, Element> = { ...present };
  const deps: SceneDeps = {
    pathname: () => '/collection',
    assign: vi.fn(),
    find: (selector) => screen[selector] ?? null,
    findText: (text) => screen[`text:${text}`] ?? null,
    click: vi.fn(),
    wait: async (read) => read(),
    cards: async () => [],
    pick: async () => null,
    openCard: vi.fn(),
    save: vi.fn(),
    closeWindows: vi.fn(),
    ...overrides,
  };
  return { deps, screen, resolver: createSceneResolver(deps) };
}
const card: KnownCard = { slug: 'Hades', title: 'Hades' };
const step = (scene?: TourStep['scene']): TourStep => ({ target: '#cible', title: 't', text: 'x', ...(scene ? { scene } : {}) });

describe('createSceneResolver', () => {
  it('une étape sans cible est prête', async () => {
    const { resolver } = setup();
    expect(await resolver.ensure({ target: null, title: 't', text: 'x' }, session())).toEqual({ kind: 'ready' });
  });

  it('une cible déjà à l’écran est prête, sans rien toucher', async () => {
    const { resolver, deps } = setup({}, { '#cible': el('c') });
    expect(await resolver.ensure(step({ page: '/marketplace', card: 'game' }), session())).toEqual({ kind: 'ready' });
    expect(deps.assign).not.toHaveBeenCalled();
  });

  it('sans scène et sans cible : texte seul', async () => {
    const { resolver } = setup();
    expect(await resolver.ensure(step(), session())).toEqual({ kind: 'text', missing: true });
  });

  it('mauvaise page : mémorise la visite puis y va', async () => {
    const { resolver, deps } = setup({ pathname: () => '/marketplace' });
    const current = session({ index: 2 });
    expect(await resolver.ensure(step({ page: '/collection' }), current)).toEqual({ kind: 'navigating' });
    expect(deps.save).toHaveBeenCalledWith(current);
    expect(deps.assign).toHaveBeenCalledWith('/collection');
  });

  it('révèle par un sélecteur puis par un libellé (le second n’apparaît qu’après le premier clic)', async () => {
    const { resolver, deps, screen } = setup();
    screen['#mode'] = el('mode');
    (deps.click as ReturnType<typeof vi.fn>).mockImplementation((element: Element) => {
      const name = (element as unknown as { name: string }).name;
      if (name === 'mode') screen['text:Sélectionner'] = el('texte');
      if (name === 'texte') screen['#cible'] = el('c');
    });
    expect(await resolver.ensure(step({ page: '/collection', reveal: ['#mode', { text: 'Sélectionner' }] }), session())).toEqual({ kind: 'ready' });
    expect(deps.click).toHaveBeenCalledTimes(2);
  });

  it('ouvre la première carte réelle de la bonne nature', async () => {
    const { resolver, deps, screen } = setup({
      cards: async () => [card],
      pick: async () => card,
    });
    (deps.openCard as ReturnType<typeof vi.fn>).mockImplementation(() => {
      screen['#cible'] = el('c');
    });
    expect(await resolver.ensure(step({ card: 'game' }), session())).toEqual({ kind: 'card', slug: 'Hades', title: 'Hades' });
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ cardSlug: 'Hades' }));
    expect(deps.openCard).toHaveBeenCalledWith('Hades');
  });

  it('sans carte adaptée : démonstration', async () => {
    const { resolver } = setup();
    expect(await resolver.ensure(step({ card: 'game' }), session())).toEqual({ kind: 'demo', card: 'game' });
  });

  it('carte ouverte mais cible jamais apparue : démonstration', async () => {
    const { resolver } = setup({ cards: async () => [card], pick: async () => card });
    expect(await resolver.ensure(step({ card: 'music' }), session())).toEqual({ kind: 'demo', card: 'music' });
  });

  it('ouverture déjà demandée avant une navigation : on l’attend sans rechoisir', async () => {
    const pick = vi.fn(async () => card);
    // La cible apparaît pendant l'attente : la fiche s'ouvre pendant le chargement de la page.
    const { resolver, screen } = setup({ cards: async () => [card], pick });
    const waiting = createSceneResolver({
      pathname: () => '/collection',
      assign: vi.fn(),
      find: (selector) => screen[selector] ?? null,
      findText: () => null,
      click: vi.fn(),
      wait: async (read) => {
        screen['#cible'] = el('c');
        return read();
      },
      cards: async () => [card],
      pick,
      openCard: vi.fn(),
      save: vi.fn(),
      closeWindows: vi.fn(),
    });
    expect(await waiting.ensure(step({ card: 'game' }), session({ cardSlug: 'Hades' }))).toEqual({ kind: 'card', slug: 'Hades', title: 'Hades' });
    expect(pick).not.toHaveBeenCalled();
    void resolver;
  });

  it('ferme d’abord les fenêtres de réglage quand la scène le demande, même si l’élément est déjà à l’écran', async () => {
    const { resolver, deps } = setup({}, { '#cible': el('c') });
    expect(await resolver.ensure(step({ closeWindows: true }), session())).toEqual({ kind: 'ready' });
    expect(deps.closeWindows).toHaveBeenCalledOnce();
  });

  it('ne ferme rien sans cette option', async () => {
    const { resolver, deps } = setup({}, { '#cible': el('c') });
    await resolver.ensure(step({ page: '/collection' }), session());
    expect(deps.closeWindows).not.toHaveBeenCalled();
  });

  it('ferme puis rouvre : après la fermeture l’élément manque, la révélation rouvre le chemin', async () => {
    const { resolver, deps, screen } = setup({}, { '#cible': el('ancienne vue'), '#entree': el('entrée') });
    (deps.closeWindows as ReturnType<typeof vi.fn>).mockImplementation(() => void delete screen['#cible']);
    (deps.click as ReturnType<typeof vi.fn>).mockImplementation(() => void (screen['#cible'] = el('rouverte')));
    expect(await resolver.ensure(step({ closeWindows: true, reveal: ['#entree'] }), session())).toEqual({ kind: 'ready' });
    expect(deps.click).toHaveBeenCalledTimes(1);
  });

  it('ne touche pas une étape de la révélation quand une étape plus loin est déjà à l’écran (menu déjà ouvert)', async () => {
    const { resolver, deps, screen } = setup();
    screen['text:Plus'] = el('Plus');
    screen['#entree'] = el('entrée');
    (deps.click as ReturnType<typeof vi.fn>).mockImplementation((element: Element) => {
      if ((element as unknown as { name: string }).name === 'entrée') screen['#cible'] = el('c');
    });
    expect(await resolver.ensure(step({ reveal: [{ text: 'Plus' }, '#entree'] }), session())).toEqual({ kind: 'ready' });
    expect(deps.click).toHaveBeenCalledTimes(1);
    expect((deps.click as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(screen['#entree']);
  });

  it('touche chaque étape de la révélation, dans l’ordre, quand rien n’est encore à l’écran', async () => {
    const { resolver, deps, screen } = setup();
    screen['text:Plus'] = el('Plus');
    const clicked: string[] = [];
    (deps.click as ReturnType<typeof vi.fn>).mockImplementation((element: Element) => {
      const name = (element as unknown as { name: string }).name;
      clicked.push(name);
      if (name === 'Plus') screen['#entree'] = el('entrée');
      if (name === 'entrée') screen['#cible'] = el('c');
    });
    expect(await resolver.ensure(step({ reveal: [{ text: 'Plus' }, '#entree'] }), session())).toEqual({ kind: 'ready' });
    expect(clicked).toEqual(['Plus', 'entrée']);
  });
});
