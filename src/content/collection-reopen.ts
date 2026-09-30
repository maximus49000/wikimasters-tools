import { slugToTitle } from '../core/market/market-book';
import { fillInput, waitFor } from './market-search';

export type ReopenOutcome = 'opened' | 'not-found';

const CARD_TITLE_SELECTOR = 'h3';

function normalizeTitle(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Repéré par son placeholder, pas par des classes CSS que le site peut changer.
export function findCollectionSearch(root: ParentNode): HTMLInputElement | null {
  return (
    [...root.querySelectorAll<HTMLInputElement>('input[type="text"]')].find((el) =>
      /rechercher par titre/i.test(el.placeholder),
    ) ?? null
  );
}

// Titre exact d'une carte de la grille (un titre plus long ne correspond pas).
export function findCardTitle(root: ParentNode, title: string): HTMLElement | null {
  const wanted = normalizeTitle(title);
  return (
    [...root.querySelectorAll<HTMLElement>(CARD_TITLE_SELECTOR)].find(
      (el) => normalizeTitle(el.textContent ?? '') === wanted,
    ) ?? null
  );
}

// Rouvre la fiche d'une carte comme le ferait l'utilisateur : recherche dans la Collection
// (elle compte des dizaines de pages), puis un clic sur la carte.
export async function reopenCard(
  root: ParentNode,
  slug: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<ReopenOutcome> {
  const title = slugToTitle(slug);
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - Date.now());

  const visible = findCardTitle(root, title);
  if (visible) {
    visible.click();
    return 'opened';
  }

  const input = await waitFor(() => findCollectionSearch(root), remaining());
  if (!input) return 'not-found';
  fillInput(input, title);

  // Le clic sur le titre remonte jusqu'aux gestionnaires de la carte.
  const heading = await waitFor(() => findCardTitle(root, title), remaining());
  if (!heading) return 'not-found';
  heading.click();
  return 'opened';
}
