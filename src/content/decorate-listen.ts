import { titleToSlug } from '../core/market/market-book';
import { findWikipediaLinks } from './market-link';

export const LISTEN_HOST_ATTRIBUTE = 'data-wmt-listen';
export const SCREEN_HOST_ATTRIBUTE = 'data-wmt-screen';

export type MountListen = (anchor: HTMLElement, slug: string, title: string) => void;

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
// Sections de l'extension posées les unes sous les autres, juste sous le bloc d'étiquettes.
const NATIVE_HOSTS = [LISTEN_HOST_ATTRIBUTE, SCREEN_HOST_ATTRIBUTE];

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

// Les sections de l'extension déjà posées sous le bloc, dans l'ordre.
function hostsAfter(block: HTMLElement): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  for (let node = block.nextElementSibling; node instanceof HTMLElement && NATIVE_HOSTS.some((name) => node?.hasAttribute(name)); node = node.nextElementSibling) {
    hosts.push(node);
  }
  return hosts;
}

// Pose une section sous la zone d'étiquettes de la fiche native de la carte, une seule fois par fiche. `after` la place
// après les sections déjà posées (sinon juste sous les étiquettes) ; titleToSlug garde le slug du titre affiché pour
// retrouver la carte dans la collection.
function decorateNative(root: ParentNode, attribute: string, after: boolean, mount: MountListen): number {
  let mounted = 0;
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    if (!normalize(input.placeholder).includes('étiquette')) continue;
    const block = findTagsBlock(input);
    if (!block) continue;
    const hosts = hostsAfter(block);
    if (hosts.some((host) => host.hasAttribute(attribute))) continue;
    const card = readCard(block);
    if (!card) continue;
    mount(after ? (hosts[hosts.length - 1] ?? block) : block, titleToSlug(card.title) || card.slug, card.title);
    mounted += 1;
  }
  return mounted;
}

// Section « Écouter » : juste sous les étiquettes.
export const decorateListen = (root: ParentNode, mount: MountListen): number => decorateNative(root, LISTEN_HOST_ATTRIBUTE, false, mount);

// Section film / série / filmographie : sous « Écouter » si elle est là.
export const decorateScreen = (root: ParentNode, mount: MountListen): number => decorateNative(root, SCREEN_HOST_ATTRIBUTE, true, mount);
