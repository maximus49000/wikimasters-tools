export const AUCTION_HOST_ATTRIBUTE = 'data-wmt-auction-link';

export type MountAuctionLink = (box: HTMLElement, title: string) => void;

const REMAINING_LABEL = /^temps restant$/i;
// Ce que la boîte « Temps restant » ne contient jamais : le titre, le formulaire de mise.
const OUTSIDE_BOX = 'h1, h2, h3, input, button, textarea, select';

// Le libellé peut porter une icône (le jeu y a mis un marteau) : on tolère les enfants graphiques, pas les autres éléments.
const isIconOnly = (element: Element): boolean => [...element.children].every((child) => child.matches('svg, img'));

function findRemainingLabel(root: ParentNode): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>('span, p, div')) {
    if (isIconOnly(element) && REMAINING_LABEL.test((element.textContent ?? '').trim())) return element;
  }
  return null;
}

// La boîte est repérée par son texte, pas par des classes CSS que le jeu peut changer : c'est le plus grand ancêtre du
// libellé « Temps restant » qui ne contient ni titre ni formulaire. Le titre de la carte est le premier <h1> au-dessus.
export function findAuctionBox(root: ParentNode): { box: HTMLElement; title: string } | null {
  const label = findRemainingLabel(root);
  if (!label) return null;

  let box = label;
  while (box.parentElement && !box.parentElement.matches('body') && !box.parentElement.querySelector(OUTSIDE_BOX)) {
    box = box.parentElement;
  }

  for (let scope = box.parentElement; scope; scope = scope.parentElement) {
    const title = scope.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    if (title) return { box, title };
  }
  return null;
}

export function decorateAuctionLink(root: ParentNode, mount: MountAuctionLink): boolean {
  const found = findAuctionBox(root);
  if (!found || found.box.nextElementSibling?.hasAttribute(AUCTION_HOST_ATTRIBUTE)) return false;
  mount(found.box, found.title);
  return true;
}
