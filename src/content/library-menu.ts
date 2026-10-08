import { buildEntry, type EntrySpec } from './image-setting-menu';

export const LIBRARY_ENTRY_ATTRIBUTE = 'data-wmt-library-entry';

const SPEC: EntrySpec = {
  attribute: LIBRARY_ENTRY_ATTRIBUTE,
  label: 'Ma Pièce',
  iconPaths: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
};

// La barre du mobile ne défile pas : avec une entrée de plus, les entrées se partagent la largeur au lieu de déborder (sans rogner : le menu « Plus » s'ouvre hors de la barre).
function fitOnOnePage(bar: HTMLElement): void {
  if (getComputedStyle(bar).display !== 'flex') return;
  for (const child of Array.from(bar.children)) {
    if (!(child instanceof HTMLElement)) continue;
    child.style.flex = '1 1 0';
    child.style.minWidth = '0';
  }
}

// Ajoute « Ma Pièce » juste après « Collection » (barre du bas du mobile, barre latérale du bureau), une seule fois par menu.
export function decorateLibraryEntry(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/collection"]')) {
    if (link.nextElementSibling?.hasAttribute(LIBRARY_ENTRY_ATTRIBUTE)) continue;
    link.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    if (link.parentElement) fitOnOnePage(link.parentElement);
    added += 1;
  }
  return added;
}
