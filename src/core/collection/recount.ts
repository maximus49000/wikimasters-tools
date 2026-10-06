import { LOCK_MS, type CollectionScanner, type ScanState } from './collection-scan';

const POLL_MS = 2_000;

export type RecountDeps = {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// Met les exemplaires à jour : la Collection suit les ventes, échanges et gains au fil de l'eau, donc le scan choisit lui-même
// son parcours (incrémental tant que le dernier parcours complet est récent). Si un autre onglet scanne déjà, on attend la fin de son parcours.
// Rend l'état final du scan (`error` : le recomptage est incomplet).
export async function recountCopies(
  scanner: Pick<CollectionScanner, 'run' | 'state'>,
  { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() }: RecountDeps = {},
): Promise<ScanState> {
  await scanner.run();
  for (;;) {
    const state = await scanner.state();
    // Un scan « en cours » sans activité depuis le verrou est considéré comme interrompu.
    if (state.status !== 'running' || now() - state.updatedAt >= LOCK_MS) return state;
    await sleep(POLL_MS);
  }
}
