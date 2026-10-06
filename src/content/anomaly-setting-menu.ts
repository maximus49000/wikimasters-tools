import { buildEntry, type EntrySpec } from './image-setting-menu';

export const ANOMALY_SETTING_ATTRIBUTE = 'data-wmt-anomaly-setting';

const SPEC: EntrySpec = {
  attribute: ANOMALY_SETTING_ATTRIBUTE,
  label: 'Remonter une anomalie',
  iconPaths: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
};

const isOurEntry = (element: Element | null): element is Element =>
  !!element && element.getAttributeNames().some((name) => /^data-wmt-.+-setting$/.test(name));

// Ajoute « Remonter une anomalie » à la fin des lignes de la surcouche sous « Paramètres », une seule fois par menu.
export function decorateAnomalySetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    let last: Element = link;
    while (isOurEntry(last.nextElementSibling)) {
      last = last.nextElementSibling;
      if (last.hasAttribute(ANOMALY_SETTING_ATTRIBUTE)) break;
    }
    if (last.hasAttribute(ANOMALY_SETTING_ATTRIBUTE)) continue;
    last.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
