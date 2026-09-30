export type SlotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Petit emplacement en stockage de session (propre à l'onglet) avec durée de vie.
// Toute erreur de stockage (accès bloqué…) est absorbée : la fonctionnalité s'éteint sans casser la page.
export function writeSlot(storage: SlotStorage, key: string, value: object, now: number): void {
  try {
    storage.setItem(key, JSON.stringify({ ...value, at: now }));
  } catch {
    // stockage indisponible
  }
}

export function readSlot<T extends object>(
  storage: SlotStorage,
  key: string,
  maxAgeMs: number,
  now: number,
  consume: boolean,
): T | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    if (consume) storage.removeItem(key);
    const value = JSON.parse(raw) as T & { at?: unknown };
    if (typeof value.at !== 'number' || now - value.at > maxAgeMs) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearSlot(storage: SlotStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // stockage indisponible
  }
}
