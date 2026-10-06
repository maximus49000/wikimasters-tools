import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import type { KindFilterSource } from './kind-filter';
import { isRecounting, type RecountSource } from './recount-source';

const note: CSSProperties = { margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.45)', font: '500 14px/20px system-ui, sans-serif' };

// Le recomptage des exemplaires (filtre « ×2 ») se fait en coulisses : la Collection garde ses anciens nombres jusqu'à la fin du
// parcours, la vue reste utilisable et une simple ligne d'avancement s'affiche. Seul le tout premier comptage (aucun nombre connu)
// remplace la vue par l'avancement ; elle reste alors montée (cachée) pour garder sa page et son zoom.
export function RecountGate({ recount, scanner, kindFilterSource, children }: { recount: RecountSource; scanner: Pick<CollectionScanner, 'state' | 'snapshot' | 'subscribe'>; kindFilterSource: KindFilterSource; children: ReactNode }) {
  const view = useSyncExternalStore(recount.subscribe, recount.current);
  const duplicatesOn = useSyncExternalStore(kindFilterSource.subscribe, () => kindFilterSource.current().duplicates === true);
  const [scan, setScan] = useState<ScanState>(() => scanner.snapshot() ?? IDLE_SCAN);

  useEffect(() => {
    let alive = true;
    const load = () => void scanner.state().then((state) => alive && setScan(state));
    load();
    const off = scanner.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [scanner]);

  const counting = isRecounting(view, scan, duplicatesOn, Date.now());
  const blocking = counting && scan.fullAt === undefined;
  return (
    <>
      {counting && (
        <p role="status" style={note}>
          {blocking ? 'Recomptage des exemplaires…' : 'Mise à jour des exemplaires en arrière-plan…'} page {scan.nextPage + 1}, {scan.entries} cartes lues.
        </p>
      )}
      {view.error && !counting && (
        <p role="alert" style={note}>
          Recomptage interrompu : {view.error}. Les nombres d’exemplaires peuvent être incomplets.
        </p>
      )}
      <div style={{ display: blocking ? 'none' : 'block' }}>{children}</div>
    </>
  );
}
