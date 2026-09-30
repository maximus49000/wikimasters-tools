import { wikipediaSlug } from '../core/market/market-book';

export const MARKET_HOST_ATTRIBUTE = 'data-wmt-market-link';

export type MountMarketLink = (anchor: HTMLAnchorElement, slug: string) => void;

// Le lien est repéré par son texte et sa cible, pas par des classes CSS que le jeu peut changer.
function isArticleLink(anchor: HTMLAnchorElement): boolean {
  const text = (anchor.textContent ?? '').replace(/’/g, "'").trim().toLowerCase();
  return text.startsWith("voir l'article sur wikip");
}

export function findWikipediaLinks(root: ParentNode): { anchor: HTMLAnchorElement; slug: string }[] {
  const links: { anchor: HTMLAnchorElement; slug: string }[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (!isArticleLink(anchor)) continue;
    const slug = wikipediaSlug(anchor.href);
    if (slug !== null) links.push({ anchor, slug });
  }
  return links;
}

export function decorateMarketLinks(root: ParentNode, mount: MountMarketLink): number {
  let mounted = 0;
  for (const { anchor, slug } of findWikipediaLinks(root)) {
    if (anchor.nextElementSibling?.hasAttribute(MARKET_HOST_ATTRIBUTE)) continue;
    mount(anchor, slug);
    mounted += 1;
  }
  return mounted;
}
