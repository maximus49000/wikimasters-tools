import type { CardKind, TourStep } from '../core/whats-new/types';
import { createSceneResolver, type SceneResult } from './scene';
import { clearTourSession, loadTourSession, saveTourSession, type TourSession } from './tour-session';
import type { SlotStorage } from './session-slot';
import type { TourEnv } from './tour-registry';

// Ce que le projecteur doit montrer pour une étape, en plus de l'élément éclairé.
export type ScenePrep = {
  note?: { tone: 'real' | 'info'; text: string };
  demo?: CardKind;
  navigating?: boolean;
};

export type TourControllerDeps = {
  storage: SlotStorage;
  now(): number;
  location(): { pathname: string; search: string };
  assign(path: string): void;
  env(): TourEnv | null;
  openWindow(session: TourSession): void;
  find(selector: string): Element | null;
  findText(text: string): Element | null;
  click(element: Element): void;
  wait<T>(read: () => T | null, ms: number): Promise<T | null>;
};

const MISSING_NOTE = 'Ouvrez la page concernée pour voir l’élément éclairé.';

export function createTourController(deps: TourControllerDeps) {
  const here = () => {
    const { pathname, search } = deps.location();
    return pathname + search;
  };

  // Les cartes et ouvertures de fiche viennent de l'environnement de la surcouche ; sans lui (page non prête), rien à ouvrir.
  const resolver = createSceneResolver({
    pathname: () => deps.location().pathname,
    assign: deps.assign,
    find: deps.find,
    findText: deps.findText,
    click: deps.click,
    wait: deps.wait,
    cards: async () => deps.env()?.cards() ?? [],
    pick: async (kind, cards) => deps.env()?.pick(kind, cards) ?? null,
    openCard: (slug) => deps.env()?.openCard(slug),
    save: (session) => saveTourSession(deps.storage, session, deps.now()),
  });

  const translate = (result: SceneResult): ScenePrep => {
    switch (result.kind) {
      case 'ready':
        return {};
      case 'navigating':
        return { navigating: true };
      case 'card':
        return { note: { tone: 'real', text: `Carte de votre Collection : ${result.title}` } };
      case 'demo':
        return { demo: result.card };
      case 'text':
        return result.missing ? { note: { tone: 'info', text: MISSING_NOTE } } : {};
    }
  };

  return {
    start(steps: TourStep[]): void {
      const session: TourSession = { steps, index: 0, origin: here() };
      saveTourSession(deps.storage, session, deps.now());
      deps.openWindow(session);
    },

    // Au chargement d'une page : reprend la visite en cours, s'il y en a une.
    resume(): boolean {
      const session = loadTourSession(deps.storage, deps.now());
      if (!session) return false;
      deps.openWindow(session);
      return true;
    },

    // Changement d'étape : on la retient, et on oublie la carte de l'étape précédente (pas à la reprise de la même étape).
    persistIndex(index: number): void {
      const session = loadTourSession(deps.storage, deps.now());
      if (!session || session.index === index) return;
      saveTourSession(deps.storage, { steps: session.steps, index, origin: session.origin }, deps.now());
    },

    async prepare(step: TourStep, index: number): Promise<ScenePrep> {
      const session = loadTourSession(deps.storage, deps.now()) ?? { steps: [step], index, origin: here() };
      return translate(await resolver.ensure(step, session));
    },

    // Fin ou abandon : on ferme la fiche ouverte pour la visite, puis on revient là où l'on était.
    finish(): void {
      const session = loadTourSession(deps.storage, deps.now());
      clearTourSession(deps.storage);
      if (!session) return;
      if (session.cardSlug !== undefined) deps.env()?.closeCard();
      if (session.origin !== here()) deps.assign(session.origin);
    },
  };
}
