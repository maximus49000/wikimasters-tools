import type { WhatsNewRepo } from '../core/whats-new/seen';
import type { Entry, Fix } from '../core/whats-new/types';
import type { WhatsNewDialogProps } from './WhatsNewDialog';

// Au démarrage : s'il y a des nouveautés ou corrections jamais annoncées, ouvre la fenêtre, puis les marque annoncées.
export async function showPendingWhatsNew(
  repo: WhatsNewRepo,
  entries: Entry[],
  fixes: Fix[],
  open: (props: Omit<WhatsNewDialogProps, 'onTour' | 'onClose'>) => void,
): Promise<void> {
  const pending = await repo.pending(entries, fixes);
  if (pending.entries.length === 0 && pending.fixes.length === 0) return;
  const consulted = [...(await repo.consulted())];
  await repo.markAnnounced([...pending.entries.map((e) => e.id), ...pending.fixes.map((f) => f.id)]);
  open({ entries: pending.entries, fixes: pending.fixes, consulted, onConsult: (id) => void repo.markConsulted(id) });
}
