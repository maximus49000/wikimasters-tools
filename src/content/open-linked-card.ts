import { findFicheClose } from './decorate-linked';
import { waitFor } from './market-search';

const CLOSE_TIMEOUT_MS = 2_000;

// La fiche d'une carte liée : la fiche actuelle est refermée (son bouton « Fermer »), puis l'autre s'ouvre comme depuis le lecteur.
export async function openLinkedCard(from: Element, slug: string, open: (slug: string) => void): Promise<void> {
  findFicheClose(from)?.click();
  await waitFor(() => !from.isConnected, CLOSE_TIMEOUT_MS);
  open(slug);
}
