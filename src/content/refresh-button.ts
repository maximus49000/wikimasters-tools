import { findCardGrid, findCollectionRoot, findSelectButton } from './collection-dom';

export const REFRESH_HOST_ATTRIBUTE = 'data-wmt-refresh';

export type RefreshHandle = { unmount: () => void };
// `mount` pose le bouton juste après la grille des cartes et renvoie de quoi le retirer.
export type MountRefresh = (grid: HTMLElement) => RefreshHandle;

const handles = new WeakMap<Element, RefreshHandle>();

export type RefreshState = 'idle' | 'running' | 'queued';

export function refreshLabel(status: { remaining: number; total: number; queued: boolean }): {
  text: string;
  state: RefreshState;
} {
  if (status.remaining <= 0) return { text: 'Recharger les prix de cette page', state: 'idle' };
  if (status.queued) return { text: 'Rechargement en attente : passer en premier', state: 'queued' };
  return { text: `Rechargement… ${status.total - status.remaining} / ${status.total}`, state: 'running' };
}

// Numéro de la page de Collection affichée (« Page 2 / 36 »), 1 à défaut.
export function readCollectionPage(root: Node): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const match = /^\s*Page\s+(\d+)\s*\/\s*\d+\s*$/.exec(node.textContent ?? '');
    if (match) return Number(match[1]);
  }
  return 1;
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
