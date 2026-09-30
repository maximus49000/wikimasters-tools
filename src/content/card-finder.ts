const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

export type CardMount = { title: string; container: HTMLElement };

function headingCount(element: Element): number {
  return element.querySelectorAll(HEADING_SELECTOR).length + (element.matches(HEADING_SELECTOR) ? 1 : 0);
}

function isBoundary(element: Element | null): boolean {
  return element === null || ['MAIN', 'BODY', 'HTML'].includes(element.tagName);
}

// Les cartes sont repérées par la structure (un titre, une image), pas par des
// noms de classes CSS que le jeu peut changer à tout moment.
export function findCardMounts(
  root: ParentNode,
  isKnownTitle: (title: string) => boolean,
): CardMount[] {
  const mounts: CardMount[] = [];
  for (const heading of root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) {
    const title = heading.textContent?.trim() ?? '';
    if (!title || !isKnownTitle(title)) continue;

    let container: HTMLElement = heading;
    while (
      container.parentElement &&
      !isBoundary(container.parentElement) &&
      headingCount(container.parentElement) === 1
    ) {
      container = container.parentElement;
    }

    if (container === heading) continue;
    if (!container.querySelector('img')) continue;
    mounts.push({ title, container });
  }
  return mounts;
}
