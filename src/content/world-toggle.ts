import type { CollectionView } from './collection-view';

export const TOGGLE_ATTRIBUTE = 'data-wmt-view-switch';
const VIEW_ATTRIBUTE = 'data-wmt-view';

const VIEWS: { view: CollectionView; label: string; title: string }[] = [
  { view: 'list', label: 'Grille', title: 'Afficher la Collection en grille' },
  { view: 'world', label: 'Monde', title: 'Afficher la Collection sur une carte du monde' },
  { view: 'timeline', label: 'Chronologique', title: 'Afficher la Collection sur une frise chronologique' },
];

// Le sélecteur reprend les classes d'un bouton du site (« Sélectionner ») : il épouse son style sans en dépendre.
export function ensureViewSwitch(
  anchor: HTMLElement,
  template: HTMLButtonElement,
  view: CollectionView,
  onSelect: (view: CollectionView) => void,
): HTMLElement {
  let group: Element | null = anchor.nextElementSibling;
  if (!(group instanceof HTMLElement) || !group.hasAttribute(TOGGLE_ATTRIBUTE)) {
    group = document.createElement('div');
    group.setAttribute(TOGGLE_ATTRIBUTE, '');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Vue de la Collection');
    (group as HTMLElement).style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center';
    for (const { view: name, label, title } of VIEWS) {
      const button = template.cloneNode(false) as HTMLButtonElement;
      for (const attr of ['id', 'disabled', 'aria-label', 'aria-describedby', 'aria-controls', 'aria-expanded']) {
        button.removeAttribute(attr);
      }
      button.setAttribute(VIEW_ATTRIBUTE, name);
      button.textContent = label;
      button.title = title;
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
  return root;
}
