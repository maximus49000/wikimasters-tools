import { buildEntry, IMAGE_SETTING_ATTRIBUTE, type EntrySpec } from './image-setting-menu';

export const PLAYER_SETTING_ATTRIBUTE = 'data-wmt-player-setting';

const SPEC: EntrySpec = { attribute: PLAYER_SETTING_ATTRIBUTE, label: 'Lecteur', iconPaths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm10 8 6 4-6 4z'] };

// Ajoute « Lecteur » sous « Paramètre d'image » (ou sous « Paramètres » à défaut), une seule fois par menu.
export function decoratePlayerSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    const image = link.nextElementSibling?.hasAttribute(IMAGE_SETTING_ATTRIBUTE) ? link.nextElementSibling : link;
    if (image.nextElementSibling?.hasAttribute(PLAYER_SETTING_ATTRIBUTE)) continue;
    image.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
