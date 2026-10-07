// Même ligne que « Paramètres » (menu « Plus » du mobile, barre latérale du bureau), posée juste dessous : le lien est
// copié pour garder le style du site, puis son libellé, son icône et son action sont remplacés.
const SVG_NS = 'http://www.w3.org/2000/svg';

export type EntrySpec = { attribute: string; label: string; iconPaths: string[] };

// Le site met « Paramètres » en surbrillance (classes, aria-current) quand on l'ouvre : les lignes copiées en font autant.
function mirrorHighlight(link: HTMLElement, entry: HTMLElement): void {
  const sync = () => {
    entry.className = link.className;
    const current = link.getAttribute('aria-current');
    if (current === null) entry.removeAttribute('aria-current');
    else entry.setAttribute('aria-current', current);
  };
  const observer = new MutationObserver(() => {
    if (!link.isConnected) observer.disconnect();
    else sync();
  });
  observer.observe(link, { attributes: true, attributeFilter: ['class', 'aria-current'] });
  sync();
}

export function buildEntry(settingsLink: HTMLAnchorElement, onOpen: () => void, spec: EntrySpec): HTMLElement {
  const entry = settingsLink.cloneNode(true) as HTMLElement;
  entry.setAttribute(spec.attribute, '');
  entry.removeAttribute('href');
  entry.removeAttribute('aria-current');
  entry.setAttribute('role', 'button');
  entry.setAttribute('tabindex', '0');
  entry.style.cursor = 'pointer';
  const svg = entry.querySelector('svg');
  if (svg) {
    svg.replaceChildren(
      ...spec.iconPaths.map((d) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        return path;
      }),
    );
  }
  // Le libellé est le dernier nœud texte de la ligne (après l'icône).
  const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
  let label: Node | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.trim()) label = node;
  if (label) label.textContent = spec.label;
  else entry.append(spec.label);
  mirrorHighlight(settingsLink, entry);
  entry.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });
  entry.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
  });
  return entry;
}
