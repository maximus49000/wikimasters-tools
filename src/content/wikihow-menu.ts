import { buildEntry, type EntrySpec } from './image-setting-menu';
import { EXTENSION_SETTING_ATTRIBUTE } from './extension-setting-menu';

export const WIKIHOW_SETTING_ATTRIBUTE = 'data-wmt-wikihow-setting';

const SPEC: EntrySpec = {
  attribute: WIKIHOW_SETTING_ATTRIBUTE,
  label: 'WikiHow',
  iconPaths: ['M22 10 12 5 2 10l10 5 10-5z', 'M6 12v5c3 3 9 3 12 0v-5'],
};

// Ajoute « WikiHow » sous « Paramètre d'extension » (ou sous « Paramètres » à défaut), une seule fois par menu.
export function decorateWikiHowSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    const extension = link.nextElementSibling?.hasAttribute(EXTENSION_SETTING_ATTRIBUTE) ? link.nextElementSibling : link;
    if (extension.nextElementSibling?.hasAttribute(WIKIHOW_SETTING_ATTRIBUTE)) continue;
    extension.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
