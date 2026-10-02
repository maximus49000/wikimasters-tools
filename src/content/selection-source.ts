export type SelectedCard = { slug: string; title: string };

export type SelectionState = {
  // Le mode « Sélectionner » du site est actif.
  selecting: boolean;
  // Les cartes cochées (slug → titre), dans l'ordre où elles l'ont été.
  cards: ReadonlyMap<string, string>;
};

const IDLE: SelectionState = { selecting: false, cards: new Map() };

// Sélection de la vue Homemade. La grille du site est masquée : ses cases ne se voient pas, donc la vue montre les siennes.
// Les cartes présentes dans la grille du site y sont cochées aussi (voir `syncNative`) pour que « Étiqueter » et
// « Défausser » les atteignent ; les autres ne sont connues que d'ici.
export function createSelectionSource() {
  let state: SelectionState = IDLE;
  const listeners = new Set<() => void>();
  const publish = (next: SelectionState): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    snapshot: (): SelectionState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Quitter la sélection vide aussi les cartes cochées.
    setSelecting(selecting: boolean): void {
      if (selecting === state.selecting) return;
      publish(selecting ? { selecting, cards: state.cards } : IDLE);
    },
    toggle(card: SelectedCard): void {
      const cards = new Map(state.cards);
      if (!cards.delete(card.slug)) cards.set(card.slug, card.title);
      publish({ ...state, cards });
    },
    // Reflète la case de chaque carte de la grille du site : celle-ci fait foi pour les cartes qu'elle contient.
    syncNative(native: Map<string, { title: string; selected: boolean }>): void {
      let cards: Map<string, string> | null = null;
      for (const [slug, { title, selected }] of native) {
        if (state.cards.has(slug) === selected) continue;
        cards ??= new Map(state.cards);
        if (selected) cards.set(slug, title);
        else cards.delete(slug);
      }
      if (cards) publish({ ...state, cards });
    },
  };
}

export type SelectionSource = ReturnType<typeof createSelectionSource>;

// Les deux cartes d'une recherche de liaison, posées par le bouton Toile et lues une seule fois à l'ouverture de la vue.
export type PathRequest = { from: SelectedCard; to: SelectedCard };

export function createPathRequestSource() {
  let pending: PathRequest | null = null;
  return {
    set(request: PathRequest): void {
      pending = request;
    },
    take(): PathRequest | null {
      const request = pending;
      pending = null;
      return request;
    },
  };
}

export type PathRequestSource = ReturnType<typeof createPathRequestSource>;
