import type { SortSource } from './sort-source';

export const PRICE_SORT_ATTRIBUTE = 'data-wmt-price-sort';

const PRICE_LABEL = 'Prix de vente décroissant';
const TRIGGER_SELECTOR = 'button[aria-label="Trier la collection"]';
const REMEMBERED = 'data-wmt-sort-label';
const WIRED = 'data-wmt-sort-wired';

function lastText(root: Element): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let found: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.trim()) found = node as Text;
  return found;
}

function buildEntry(model: HTMLElement): HTMLElement {
  const entry = model.cloneNode(true) as HTMLElement;
  entry.setAttribute(PRICE_SORT_ATTRIBUTE, '');
  const label = lastText(entry);
  if (label) label.nodeValue = PRICE_LABEL;
  entry.querySelector('button')?.removeAttribute('aria-selected');
  return entry;
}

// Ajoute « Prix de vente décroissant » à la liste de tri du site (vue Homemade seulement) et garde le libellé du
// bouton d'accord avec le tri choisi. Idempotent : appelé à chaque changement du DOM. Repéré par l'étiquette du bouton
// et le rôle de la liste, sans classes CSS du site.
export function syncPriceSort(root: ParentNode, enabled: boolean, source: SortSource): void {
  const trigger = root.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  if (!trigger) return;
  // La liste est affichée dans un portail, hors du parent du bouton : elle s'y rattache par `aria-controls`.
  const controlled = trigger.getAttribute('aria-controls');
  const list =
    (controlled ? trigger.ownerDocument.getElementById(controlled) : null) ??
    trigger.parentElement?.querySelector<HTMLElement>('[role="listbox"]') ??
    null;
  const text = lastText(trigger);

  if (!enabled || !list) {
    list?.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`)?.remove();
    if (source.current() === 'price') source.set('rarity');
    if (text?.nodeValue === PRICE_LABEL) text.nodeValue = trigger.getAttribute(REMEMBERED) ?? 'Rareté';
    return;
  }

  const first = list.firstElementChild as HTMLElement | null;
  if (!first) return;
  if (!list.querySelector(`[${PRICE_SORT_ATTRIBUTE}]`)) {
    const entry = buildEntry(first);
    entry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // La ligne « Rareté » du site referme la liste et remet son état ; notre tri est posé juste après.
      first.querySelector<HTMLElement>('button')?.click();
      source.set('price');
      syncPriceSort(root, true, source);
    });
    list.append(entry);
  }
  if (!list.hasAttribute(WIRED)) {
    list.setAttribute(WIRED, '');
    // Un tri du site (Rareté, Nom…) remplace le nôtre.
    list.addEventListener(
      'click',
      (event) => {
        if (!(event.target as Element).closest(`[${PRICE_SORT_ATTRIBUTE}]`)) source.set('rarity');
        queueMicrotask(() => syncPriceSort(root, true, source));
      },
      true,
    );
  }

  if (!text) return;
  if (source.current() === 'price') {
    if (text.nodeValue !== PRICE_LABEL) {
      trigger.setAttribute(REMEMBERED, first.textContent?.trim() || 'Rareté');
      text.nodeValue = PRICE_LABEL;
    }
  } else if (text.nodeValue === PRICE_LABEL) {
    text.nodeValue = trigger.getAttribute(REMEMBERED) ?? 'Rareté';
  }
}
