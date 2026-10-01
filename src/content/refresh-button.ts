import { findCardGrid, findCollectionRoot, findSelectButton } from './collection-dom';

export const REFRESH_HOST_ATTRIBUTE = 'data-wmt-refresh';

export type RefreshHandle = { unmount: () => void };
// `mount` pose le bouton juste après la grille des cartes et renvoie de quoi le retirer.
export type MountRefresh = (grid: HTMLElement) => RefreshHandle;

const handles = new WeakMap<Element, RefreshHandle>();

export function refreshLabel(progress: { remaining: number; total: number }): { text: string; busy: boolean } {
  if (progress.remaining <= 0) return { text: 'Recharger les prix de cette page', busy: false };
  return { text: `Rechargement… ${progress.total - progress.remaining} / ${progress.total}`, busy: true };
}

export function removeRefreshButton(root: ParentNode): void {
  for (const host of root.querySelectorAll(`[${REFRESH_HOST_ATTRIBUTE}]`)) {
    handles.get(host)?.unmount();
    host.remove();
  }
}

// Bouton en bas de la grille des cartes de la Collection. Idempotent : appelé à chaque changement du DOM.
// Pas de bouton quand la grille est masquée (vue Monde, Chronologique) : les cartes ne sont pas à l'écran.
export function ensureRefreshButton(root: ParentNode, mount: MountRefresh): boolean {
  const select = findSelectButton(root);
  const scope = select ? findCollectionRoot(select) : null;
  const grid = select && scope ? findCardGrid(scope, select) : null;
  if (!grid || grid.style.display === 'none') {
    removeRefreshButton(root);
    return false;
  }

  const existing = [...root.querySelectorAll(`[${REFRESH_HOST_ATTRIBUTE}]`)];
  if (existing.length === 1 && existing[0]!.previousElementSibling === grid) return true;

  removeRefreshButton(root);
  const handle = mount(grid);
  const host = grid.nextElementSibling;
  if (host?.hasAttribute(REFRESH_HOST_ATTRIBUTE)) handles.set(host, handle);
  return true;
}
