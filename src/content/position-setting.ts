const SETTING_KEY = 'wmt:positionEnabled';

const listeners = new Set<() => void>();
// Stockage refusé (fenêtre privée) : le choix reste respecté pour la session.
let memory: boolean | null = null;

const read = (): boolean => {
  try {
    // Actif par défaut : seul un « off » écrit explicitement par le joueur désactive la position.
    return window.localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return memory ?? true;
  }
};

// Réglage « Position » : actif par défaut (météo réelle, lever et coucher du soleil) ; relu à chaque appel.
export const positionSetting = {
  enabled: read,
  setEnabled(next: boolean): void {
    if (next === read()) return;
    memory = next;
    try {
      window.localStorage.setItem(SETTING_KEY, next ? 'on' : 'off');
    } catch {
      // Stockage indisponible : la mémoire de session suffit.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};
