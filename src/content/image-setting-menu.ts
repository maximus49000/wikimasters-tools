// Même ligne que « Paramètres » (menu « Plus » du mobile, barre latérale du bureau), posée juste dessous : le lien est
// copié pour garder le style du site, puis son libellé, son icône et son action sont remplacés.
const SVG_NS = 'http://www.w3.org/2000/svg';

export type EntrySpec = { attribute: string; label: string; iconPaths: string[] };

export function buildEntry(settingsLink: HTMLAnchorElement, onOpen: () => void, spec: EntrySpec): HTMLElement {
  const entry = settingsLink.cloneNode(true) as HTMLElement;
  entry.setAttribute(spec.attribute, '');
  entry.removeAttribute('href');
  entry.removeAttribute('aria-current');
  // Sur la page des paramètres le lien est en surbrillance : la ligne reprend le style d'un lien voisin au repos,
  // pour rester indépendante de « Paramètres ».
  if (settingsLink.hasAttribute('aria-current')) {
    const resting = Array.from(settingsLink.parentElement?.querySelectorAll('a') ?? []).find(
      (a) => a !== settingsLink && !a.hasAttribute('aria-current') && !a.getAttributeNames().some((n) => /^data-wmt-.+-setting$/.test(n)),
    );
    if (resting) entry.className = resting.className;
  }
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
