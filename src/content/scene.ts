import type { KnownCard } from '../core/collection/collection-book';
import type { CardKind, RevealItem, TourStep } from '../core/whats-new/types';
import type { TourSession } from './tour-session';

export type SceneResult =
  | { kind: 'ready' }
  | { kind: 'navigating' }
  | { kind: 'card'; slug: string; title: string }
  | { kind: 'demo'; card: CardKind }
  | { kind: 'text'; missing: boolean };

export type SceneDeps = {
  pathname(): string;
  assign(path: string): void;
  find(selector: string): Element | null;
  findText(text: string): Element | null;
  click(element: Element): void;
  wait<T>(read: () => T | null, ms: number): Promise<T | null>;
  cards(): Promise<KnownCard[]>;
  pick(kind: CardKind, cards: KnownCard[]): Promise<KnownCard | null>;
  openCard(slug: string): void;
  save(session: TourSession): void;
  closeWindows(): void;
};

const REVEAL_MS = 2_000;
const CARD_MS = 10_000;
const LATE_MS = 1_500;

// Prépare l'écran pour une étape et dit ce que l'interface doit montrer : élément présent, navigation en cours,
// carte réelle de la Collection, fiche de démonstration ou texte seul (voir la spec, dans cet ordre).
export function createSceneResolver(deps: SceneDeps) {
  const target = (step: TourStep) => (step.target ? deps.find(step.target) : null);
  const reveal = (item: RevealItem) => (typeof item === 'string' ? deps.find(item) : deps.findText(item.text));

  return {
    async ensure(step: TourStep, session: TourSession): Promise<SceneResult> {
      if (!step.target) return { kind: 'ready' };
      const scene = step.scene;
      if (scene?.closeWindows) deps.closeWindows();
      if (target(step)) return { kind: 'ready' };
      if (!scene) return { kind: 'text', missing: true };

      if (scene.page && !deps.pathname().startsWith(scene.page)) {
        deps.save(session);
        deps.assign(scene.page);
        return { kind: 'navigating' };
      }

      const items = scene.reveal ?? [];
      for (const [i, item] of items.entries()) {
        if (target(step)) break;
        // Un élément plus loin dans le chemin est déjà à l'écran (menu déjà ouvert, ordinateur) : on ne touche pas celui-ci,
        // sinon on refermerait ce que l'étape précédente a ouvert.
        const later = items.slice(i + 1).some((next) => reveal(next));
        if (later) continue;
        const element = await deps.wait(() => reveal(item), REVEAL_MS);
        if (element) deps.click(element);
      }
      if (scene.reveal?.length && (await deps.wait(() => target(step), LATE_MS))) return { kind: 'ready' };

      if (scene.card) {
        // Une ouverture déjà demandée avant une navigation : on l'attend, on ne rechoisit pas.
        if (session.cardSlug === undefined) {
          const card = await deps.pick(scene.card, await deps.cards());
          if (!card) return { kind: 'demo', card: scene.card };
          deps.save({ ...session, cardSlug: card.slug });
          deps.openCard(card.slug);
          return (await deps.wait(() => target(step), CARD_MS)) ? { kind: 'card', slug: card.slug, title: card.title } : { kind: 'demo', card: scene.card };
        }
        const known = (await deps.cards()).find((card) => card.slug === session.cardSlug);
        return (await deps.wait(() => target(step), CARD_MS)) && known ? { kind: 'card', slug: known.slug, title: known.title } : { kind: 'demo', card: scene.card };
      }
      return { kind: 'text', missing: true };
    },
  };
}
