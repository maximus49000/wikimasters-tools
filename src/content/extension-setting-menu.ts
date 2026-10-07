import { buildEntry, type EntrySpec } from './image-setting-menu';

export const EXTENSION_SETTING_ATTRIBUTE = 'data-wmt-extension-setting';

const SPEC: EntrySpec = {
  attribute: EXTENSION_SETTING_ATTRIBUTE,
  label: 'Paramètre d’extension',
  iconPaths: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M8 10v4', 'M18 16v4'],
};

// Ajoute « Paramètre d'extension » juste sous « Paramètres » (menu « Plus » du mobile, barre latérale du bureau), une seule fois par menu.
export function decorateExtensionSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    if (link.nextElementSibling?.hasAttribute(EXTENSION_SETTING_ATTRIBUTE)) continue;
    link.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
