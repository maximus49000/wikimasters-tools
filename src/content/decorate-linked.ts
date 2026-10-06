import { titleToSlug } from '../core/market/market-book';
import { readCard } from './decorate-listen';

export const LINKED_HOST_ATTRIBUTE = 'data-wmt-linked';

// `tiles` : la rangée des tuiles ATK / DEF, devant laquelle le bloc se pose.
export type MountLinked = (tiles: HTMLElement, slug: string, title: string) => void;

const isLabel = (element: Element, label: string): boolean => element.children.length === 0 && element.textContent?.trim() === label;

// La rangée ATK / DEF de la fiche : le plus petit ancêtre du libellé « ATK » qui porte aussi « DEF ». Repérée par le texte, pas par des
// classes CSS que le jeu peut changer ; la grille et l'aperçu n'ont pas ces libellés.
function findStatsRow(label: Element): HTMLElement | null {
  for (let node = label.parentElement; node && !['MAIN', 'BODY', 'HTML'].includes(node.tagName); node = node.parentElement) {
    if ([...node.querySelectorAll('*')].some((element) => isLabel(element, 'DEF'))) return node;
  }
  return null;
}

// Bloc « Cartes liées » : juste au-dessus des tuiles ATK / DEF de la fiche, une seule fois par fiche.
export function decorateLinked(root: ParentNode, mount: MountLinked): number {
  let mounted = 0;
  for (const label of root.querySelectorAll('*')) {
    if (!isLabel(label, 'ATK')) continue;
    const tiles = findStatsRow(label);
    if (!tiles || tiles.previousElementSibling?.hasAttribute(LINKED_HOST_ATTRIBUTE)) continue;
    const card = readCard(tiles);
    if (!card) continue;
    mount(tiles, titleToSlug(card.title) || card.slug, card.title);
    mounted += 1;
  }
  return mounted;
}

// Le bouton « Fermer » de la fiche qui contient cet élément.
export function findFicheClose(from: Element): HTMLButtonElement | null {
  for (let node = from.parentElement; node && node.tagName !== 'BODY'; node = node.parentElement) {
    for (const child of node.children) {
      if (child instanceof HTMLButtonElement && /^(fermer|close)$/i.test(child.getAttribute('aria-label') ?? '')) return child;
    }
  }
  return null;
}
