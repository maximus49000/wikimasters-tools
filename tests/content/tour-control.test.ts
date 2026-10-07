import { describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { createTourController, type TourControllerDeps } from '../../src/content/tour-control';
import { loadTourSession, saveTourSession, type TourSession } from '../../src/content/tour-session';
import type { TourStep } from '../../src/core/whats-new/types';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

const steps: TourStep[] = [
  { target: '#a', title: 'Un', text: 'x', scene: { card: 'game' } },
  { target: '#b', title: 'Deux', text: 'y' },
];

function setup(overrides: Partial<TourControllerDeps> = {}, path = { pathname: '/marketplace', search: '?q=1' }) {
  const storage = memory();
  const assign = vi.fn();
  const openWindow = vi.fn();
  const closeCard = vi.fn();
  const screen = new Map<string, Element>();
  const deps: TourControllerDeps = {
    storage,
    now: () => 1_000,
    location: () => path,
    assign,
    env: () => ({ cards: async () => [], pick: async () => null, openCard: vi.fn(), closeCard }),
    openWindow,
    find: (selector) => screen.get(selector) ?? null,
    findText: () => null,
    click: vi.fn(),
    wait: async (read) => read(),
    ...overrides,
  };
  return { controller: createTourController(deps), storage, assign, openWindow, closeCard, screen };
}

describe('contrôleur de visite', () => {
  it('start enregistre la session (page de départ comprise) et ouvre la fenêtre', () => {
    const { controller, storage, openWindow } = setup();
    controller.start(steps);
    expect(loadTourSession(storage, 1_000)).toEqual({ steps, index: 0, origin: '/marketplace?q=1' });
    expect(openWindow).toHaveBeenCalledWith({ steps, index: 0, origin: '/marketplace?q=1' });
  });

  it('resume ne fait rien sans session, reprend sinon à l’étape enregistrée', () => {
    const { controller, storage, openWindow } = setup();
    expect(controller.resume()).toBe(false);
    saveTourSession(storage, { steps, index: 1, origin: '/' }, 1_000);
    expect(controller.resume()).toBe(true);
    expect(openWindow).toHaveBeenCalledWith({ steps, index: 1, origin: '/' });
  });

  it('persistIndex change l’étape et oublie la carte, sauf si l’étape est la même', () => {
    const { controller, storage } = setup();
    const session: TourSession = { steps, index: 0, origin: '/', cardSlug: 'Hades' };
    saveTourSession(storage, session, 1_000);
    controller.persistIndex(0);
    expect(loadTourSession(storage, 1_000)?.cardSlug).toBe('Hades');
    controller.persistIndex(1);
    expect(loadTourSession(storage, 1_000)).toEqual({ steps, index: 1, origin: '/' });
  });

  it('finish ferme la fiche ouverte, efface la session et revient à la page de départ', () => {
    const { controller, storage, assign, closeCard } = setup({}, { pathname: '/collection', search: '' });
    saveTourSession(storage, { steps, index: 1, origin: '/marketplace?q=1', cardSlug: 'Hades' }, 1_000);
    controller.finish();
    expect(closeCard).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith('/marketplace?q=1');
    expect(loadTourSession(storage, 1_000)).toBeNull();
  });

  it('finish ne navigue pas quand on est déjà sur la page de départ et ne ferme rien sans carte', () => {
    const { controller, storage, assign, closeCard } = setup({}, { pathname: '/collection', search: '' });
    saveTourSession(storage, { steps, index: 0, origin: '/collection', }, 1_000);
    controller.finish();
    expect(assign).not.toHaveBeenCalled();
    expect(closeCard).not.toHaveBeenCalled();
  });

  describe('prepare', () => {
    const card: KnownCard = { slug: 'Hades', title: 'Hades' };

    it('une carte réelle donne une note verte', async () => {
      const { controller, storage, screen } = setup({
        env: () => ({ cards: async () => [card], pick: async () => card, openCard: () => void screen.set('#a', {} as Element), closeCard: vi.fn() }),
      });
      saveTourSession(storage, { steps, index: 0, origin: '/' }, 1_000);
      expect(await controller.prepare(steps[0]!, 0)).toEqual({ note: { tone: 'real', text: 'Carte de votre Collection : Hades' } });
    });

    it('sans carte adaptée, c’est la démonstration', async () => {
      const { controller, storage } = setup();
      saveTourSession(storage, { steps, index: 0, origin: '/' }, 1_000);
      expect(await controller.prepare(steps[0]!, 0)).toEqual({ demo: 'game' });
    });

    it('une mauvaise page annonce la navigation', async () => {
      const { controller, storage, assign } = setup({}, { pathname: '/marketplace', search: '' });
      const step: TourStep = { target: '#z', title: 'z', text: 'z', scene: { page: '/collection' } };
      saveTourSession(storage, { steps: [step], index: 0, origin: '/marketplace' }, 1_000);
      expect(await controller.prepare(step, 0)).toEqual({ navigating: true });
      expect(assign).toHaveBeenCalledWith('/collection');
    });

    it('une cible introuvable sans scène donne une note d’information', async () => {
      const { controller, storage } = setup();
      saveTourSession(storage, { steps, index: 1, origin: '/' }, 1_000);
      expect(await controller.prepare(steps[1]!, 1)).toEqual({ note: { tone: 'info', text: 'Ouvrez la page concernée pour voir l’élément éclairé.' } });
    });
  });
});
