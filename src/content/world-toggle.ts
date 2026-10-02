import type { CollectionView } from './collection-view';

export const TOGGLE_ATTRIBUTE = 'data-wmt-view-switch';
const DUPLICATES_ATTRIBUTE = 'data-wmt-duplicates';
const DUPLICATES_LABEL = 'Doubles : seulement les cartes en 2 exemplaires ou plus';

// Le filtre « ×2 » ; absent en vue Grille du site (les panneaux seuls le lisent).
export type DuplicatesToggle = { on: boolean; onToggle: () => void } | null;
const VIEW_ATTRIBUTE = 'data-wmt-view';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Icônes Lucide (« house », « globe », « chart-no-axes-gantt », « network », « layout-grid »), comme celles du site.
const HOUSE = ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'];
const GLOBE = ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'];
const GANTT = ['M8 6h10', 'M6 12h9', 'M11 18h7'];
// « network » : trois nœuds reliés (ses rectangles sont tracés en chemins, comme ceux de GRID).
const NETWORK = [
  'M17 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  'M3 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  'M10 2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3',
  'M12 12V8',
];
const GRID = [
  'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  'M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  'M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  'M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
];

// De gauche à droite : Homemade d'abord (vue par défaut), la Grille du site tout à droite.
const VIEWS: { view: CollectionView; label: string; glyph: string[] }[] = [
  { view: 'homemade', label: 'Homemade : grille paginée et filtrable', glyph: HOUSE },
  { view: 'world', label: 'Monde : la Collection sur une carte du monde', glyph: GLOBE },
  { view: 'timeline', label: 'Chronologique : la Collection sur une frise', glyph: GANTT },
  { view: 'web', label: 'Toile : les cartes reliées par les articles Wikipédia qu’elles citent', glyph: NETWORK },
  { view: 'list', label: 'Grille du site', glyph: GRID },
];

function glyphElement(paths: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// Le sélecteur reprend les classes d'un bouton du site (« Sélectionner ») : il épouse son style sans en dépendre.
export function ensureViewSwitch(
  anchor: HTMLElement,
  template: HTMLButtonElement,
  view: CollectionView,
  onSelect: (view: CollectionView) => void,
  duplicates: DuplicatesToggle = null,
): HTMLElement {
  let group: Element | null = anchor.nextElementSibling;
  if (!(group instanceof HTMLElement) || !group.hasAttribute(TOGGLE_ATTRIBUTE)) {
    group = document.createElement('div');
    group.setAttribute(TOGGLE_ATTRIBUTE, '');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Vue de la Collection');
    (group as HTMLElement).style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center';
    const doubles = template.cloneNode(false) as HTMLButtonElement;
    for (const attr of ['id', 'disabled', 'aria-label', 'aria-describedby', 'aria-controls', 'aria-expanded']) {
      doubles.removeAttribute(attr);
    }
    doubles.setAttribute(DUPLICATES_ATTRIBUTE, '');
    doubles.setAttribute('aria-label', DUPLICATES_LABEL);
    doubles.title = DUPLICATES_LABEL;
    doubles.textContent = '×2';
    group.append(doubles);
    for (const { view: name, label, glyph } of VIEWS) {
      const button = template.cloneNode(false) as HTMLButtonElement;
      for (const attr of ['id', 'disabled', 'aria-label', 'aria-describedby', 'aria-controls', 'aria-expanded']) {
        button.removeAttribute(attr);
      }
      button.setAttribute(VIEW_ATTRIBUTE, name);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.append(glyphElement(glyph));
      group.append(button);
    }
    anchor.insertAdjacentElement('afterend', group);
  }

  const root = group as HTMLElement;
  for (const button of root.querySelectorAll<HTMLButtonElement>(`[${VIEW_ATTRIBUTE}]`)) {
    const name = button.getAttribute(VIEW_ATTRIBUTE) as CollectionView;
    const on = name === view;
    button.disabled = false;
    button.onclick = () => onSelect(name);
    button.setAttribute('aria-pressed', String(on));
    button.style.borderColor = on ? 'var(--color-accent, #34d399)' : '';
    button.style.color = on ? 'var(--color-accent, #34d399)' : '';
  }

  const doubles = root.querySelector<HTMLButtonElement>(`[${DUPLICATES_ATTRIBUTE}]`);
  if (doubles) {
    doubles.style.display = duplicates ? '' : 'none';
    doubles.disabled = false;
    doubles.onclick = () => duplicates?.onToggle();
    doubles.setAttribute('aria-pressed', String(duplicates?.on === true));
    doubles.style.borderColor = duplicates?.on ? 'var(--color-accent, #34d399)' : '';
    doubles.style.color = duplicates?.on ? 'var(--color-accent, #34d399)' : '';
  }
  return root;
}
