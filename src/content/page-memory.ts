// Page affichée pour chaque sélection de filtres. Ouvrir une carte pose une recherche sur le site, retirée à la
// fermeture de la fiche : revenir à la sélection d'avant retrouve donc la page où l'on était.
export function createPageMemory() {
  const pages = new Map<string, number>();
  return {
    get: (key: string): number => pages.get(key) ?? 1,
    set(key: string, page: number): void {
      if (page <= 1) pages.delete(key);
      else pages.set(key, page);
    },
  };
}

export type PageMemory = ReturnType<typeof createPageMemory>;
