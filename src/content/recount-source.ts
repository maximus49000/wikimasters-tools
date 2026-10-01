import { LOCK_MS, type ScanState } from '../core/collection/collection-scan';

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

// Faut-il remplacer la vue par l'avancement ? Pendant un recomptage demandé par « ×2 », ou quand « ×2 » est actif et qu'un
// parcours complet est en cours (automatique, ou premier scan) : les nombres d'exemplaires sont alors incomplets.
// Un scan « en cours » sans activité depuis le verrou est considéré comme interrompu.
export function isRecounting(view: RecountView, scan: ScanState, duplicatesOn: boolean, now: number): boolean {
  if (view.running) return true;
  return duplicatesOn && scan.status === 'running' && scan.pass !== 'incremental' && now - scan.updatedAt < LOCK_MS;
}
