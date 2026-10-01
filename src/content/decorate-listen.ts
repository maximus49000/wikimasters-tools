import { titleToSlug } from '../core/market/market-book';
import { findWikipediaLinks } from './market-link';

export const LISTEN_HOST_ATTRIBUTE = 'data-wmt-listen';

export type MountListen = (anchor: HTMLElement, slug: string, title: string) => void;

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

function normalize(text: string | null): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Bloc « Étiquettes » de la fiche : le plus petit ancêtre du champ d'ajout qui porte le libellé. Repéré par le
// texte, pas par des classes CSS que le jeu peut changer.
function findTagsBlock(input: HTMLInputElement): HTMLElement | null {
  for (let node = input.parentElement; node && !['MAIN', 'BODY', 'HTML'].includes(node.tagName); node = node.parentElement) {
    if (normalize(node.textContent).startsWith('étiquette')) return node;
  }
  return null;
}

// Fiche de la carte : le plus petit ancêtre qui contient le lien de l'article, d'où l'on tire le slug et le titre.
function readCard(block: HTMLElement): { slug: string; title: string } | null {
  for (let node = block.parentElement; node && !['MAIN', 'BODY', 'HTML'].includes(node.tagName); node = node.parentElement) {
    const link = findWikipediaLinks(node)[0];
    if (!link) continue;
    const heading = node.querySelector(HEADING_SELECTOR)?.textContent?.trim();
    return { slug: link.slug, title: heading || link.slug.replace(/_/g, ' ') };
  }
  return null;
}

// Pose la section « Écouter » juste sous la zone d'étiquettes de la fiche native de la carte ; titleToSlug garde
// le slug du titre affiché pour retrouver la carte dans la collection.
export function decorateListen(root: ParentNode, mount: MountListen): number {
  let mounted = 0;
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    if (!normalize(input.placeholder).includes('étiquette')) continue;
    const block = findTagsBlock(input);
    if (!block || block.nextElementSibling?.hasAttribute(LISTEN_HOST_ATTRIBUTE)) continue;
    const card = readCard(block);
    if (!card) continue;
    mount(block, titleToSlug(card.title) || card.slug, card.title);
    mounted += 1;
  }
  return mounted;
}
