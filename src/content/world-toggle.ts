import type { CollectionView } from './collection-view';

export const TOGGLE_ATTRIBUTE = 'data-wmt-world-toggle';

// Icône « globe » (Lucide), même gabarit que l'icône du bouton voisin.
const GLOBE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" ' +
  'aria-hidden="true"><circle cx="12" cy="12" r="10"></circle>' +
  '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>';

// Le bouton reprend les classes de « Sélectionner » : il épouse le style du site sans en dépendre.
export function ensureWorldToggle(
  selectButton: HTMLButtonElement,
  view: CollectionView,
  onToggle: () => void,
): HTMLButtonElement {
  let toggle: Element | null = selectButton.nextElementSibling;
  if (!(toggle instanceof HTMLButtonElement) || !toggle.hasAttribute(TOGGLE_ATTRIBUTE)) {
    toggle = selectButton.cloneNode(false) as HTMLButtonElement;
    for (const name of ['id', 'disabled', 'aria-label', 'aria-describedby', 'aria-controls', 'aria-expanded']) {
      toggle.removeAttribute(name);
    }
    toggle.setAttribute(TOGGLE_ATTRIBUTE, '');
    toggle.innerHTML = `${GLOBE_ICON}Monde`;
    (toggle as HTMLElement).title = 'Afficher la Collection sur une carte du monde';
    selectButton.insertAdjacentElement('afterend', toggle);
  }

  const button = toggle as HTMLButtonElement;
  const on = view === 'world';
  button.disabled = false;
  button.onclick = onToggle;
  button.setAttribute('aria-pressed', String(on));
  button.style.borderColor = on ? 'var(--color-accent, #34d399)' : '';
  button.style.color = on ? 'var(--color-accent, #34d399)' : '';
  return button;
}
