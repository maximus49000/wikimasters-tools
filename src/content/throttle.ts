// Rechargement groupé : au plus un chargement par délai, sans jamais être repoussé
// par un flux continu d'événements (contrairement à un debounce).
export function createThrottledLoader(load: () => void, delayMs: number): { call(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        load();
      }, delayMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
