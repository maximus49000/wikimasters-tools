const SETTING_KEY = 'wmt:purchaseAds';

// Réglage « Publicité d'achat » : Désactivé par défaut (les offres payantes du site sont masquées) ; un stockage illisible les laisse masquées.
export function createPurchaseAds(settings: Pick<Storage, 'getItem' | 'setItem'>) {
  let enabled = ((): boolean => {
    try {
      return settings.getItem(SETTING_KEY) === 'on';
    } catch {
      return false;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    enabled: (): boolean => enabled,
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      try {
        settings.setItem(SETTING_KEY, next ? 'on' : 'off');
      } catch {
        // stockage indisponible
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type PurchaseAds = ReturnType<typeof createPurchaseAds>;
