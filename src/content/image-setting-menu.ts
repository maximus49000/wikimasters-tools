export const IMAGE_SETTING_ATTRIBUTE = 'data-wmt-image-setting';

const LABEL = 'Paramètre d’image';
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'];

// Même ligne que « Paramètres » (menu « Plus » du mobile, barre latérale du bureau), posée juste dessous : le lien est
// copié pour garder le style du site, puis son libellé, son icône et son action sont remplacés.
function buildEntry(settingsLink: HTMLAnchorElement, onOpen: () => void): HTMLElement {
  const entry = settingsLink.cloneNode(true) as HTMLElement;
  entry.setAttribute(IMAGE_SETTING_ATTRIBUTE, '');
  entry.removeAttribute('href');
  entry.removeAttribute('aria-current');
  entry.setAttribute('role', 'button');
  entry.setAttribute('tabindex', '0');
  entry.style.cursor = 'pointer';
  const svg = entry.querySelector('svg');
  if (svg) {
    svg.replaceChildren(
      ...ICON_PATHS.map((d) => {
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
  if (label) label.textContent = LABEL;
  else entry.append(LABEL);
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

// Ajoute « Paramètre d'image » sous chaque lien « Paramètres » de la page. Renvoie le nombre d'entrées posées.
export function decorateImageSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    const next = link.nextElementSibling;
    if (next?.hasAttribute(IMAGE_SETTING_ATTRIBUTE)) continue;
    link.insertAdjacentElement('afterend', buildEntry(link, onOpen));
    added += 1;
  }
  return added;
}
