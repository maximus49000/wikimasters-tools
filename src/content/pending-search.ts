export type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'wmt:pendingSearch';
const MAX_AGE_MS = 60_000;

// Recherche demandée depuis une fiche : elle survit à la navigation vers la page Marché,
// puis s'efface d'elle-même. Le stockage de session est propre à l'onglet.
export function setPendingSearch(storage: PendingStorage, slug: string, now: number): void {
  try {
    storage.setItem(KEY, JSON.stringify({ slug, at: now }));
  } catch {
    // stockage indisponible : la recherche ne sera simplement pas reprise
  }
}

export function takePendingSearch(storage: PendingStorage, now: number): string | null {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return null;
    storage.removeItem(KEY);
    const value = JSON.parse(raw) as { slug?: unknown; at?: unknown };
    if (typeof value.slug !== 'string' || typeof value.at !== 'number') return null;
    return now - value.at <= MAX_AGE_MS ? value.slug : null;
  } catch {
    return null;
  }
}
