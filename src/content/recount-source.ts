import type { ScanState } from '../core/collection/collection-scan';

export type RecountView = { running: boolean; error: string | null };

// Recomptage des exemplaires lancé par le filtre « ×2 » : en cours, ou terminé (avec l'erreur éventuelle du scan).
export function createRecountSource(task: () => Promise<ScanState>) {
  const listeners = new Set<() => void>();
  let view: RecountView = { running: false, error: null };

  const set = (next: RecountView) => {
    view = next;
    listeners.forEach((listener) => listener());
  };

  return {
    current: (): RecountView => view,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start(): void {
      if (view.running) return;
      set({ running: true, error: null });
      task().then(
        (state) => set({ running: false, error: state.status === 'error' ? (state.error ?? 'erreur inconnue') : state.status === 'running' ? 'scan interrompu' : null }),
        (error) => set({ running: false, error: error instanceof Error ? error.message : String(error) }),
      );
    },
  };
}

export type RecountSource = ReturnType<typeof createRecountSource>;
