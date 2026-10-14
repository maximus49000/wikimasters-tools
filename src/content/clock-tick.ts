// Seconde partagée des horloges : UN seul minuteur pour toute la page, lancé au premier abonné et arrêté au dernier, suspendu
// quand la page est cachée (batterie Android). Seules les horloges s'y abonnent : la pièce, elle, n'est pas redessinée à chaque seconde.
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

const emit = (): void => {
  nowMs = Date.now();
  for (const l of listeners) l();
};
const start = (): void => {
  if (timer !== undefined || document.visibilityState === 'hidden') return;
  // Heure relue au départ : pas d'heure périmée quand une horloge apparaît ou que la page revient.
  nowMs = Date.now();
  timer = window.setInterval(emit, 1000);
};
const stop = (): void => {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
};
const onVisibility = (): void => {
  if (document.visibilityState === 'hidden') stop();
  else {
    emit();
    start();
  }
};

export function subscribeClockTick(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    start();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

// Instant de la dernière seconde ; sans abonné, relu tout de suite (premier dessin d'une horloge à l'heure juste).
export function clockNowMs(): number {
  if (listeners.size === 0) nowMs = Date.now();
  return nowMs;
}
