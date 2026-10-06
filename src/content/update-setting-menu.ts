import { buildEntry, type EntrySpec } from './image-setting-menu';

export const UPDATE_SETTING_ATTRIBUTE = 'data-wmt-update-setting';

const SPEC: EntrySpec = {
  attribute: UPDATE_SETTING_ATTRIBUTE,
  label: 'Vérifier la mise à jour',
  iconPaths: ['M21 12a9 9 0 1 1-3-6.7', 'M21 4v5h-5'],
};

const isOurEntry = (element: Element | null): element is Element =>
  !!element && element.getAttributeNames().some((name) => /^data-wmt-.+-setting$/.test(name));

// Ajoute « Vérifier la mise à jour » à la fin des lignes de la surcouche sous « Paramètres », une seule fois par menu.
// Réservé à l'application Android : l'appelant ne l'utilise que si le pont `WmtUpdate` existe.
export function decorateUpdateSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    let last: Element = link;
    while (isOurEntry(last.nextElementSibling)) {
      last = last.nextElementSibling;
      if (last.hasAttribute(UPDATE_SETTING_ATTRIBUTE)) break;
    }
    if (last.hasAttribute(UPDATE_SETTING_ATTRIBUTE)) continue;
    last.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
