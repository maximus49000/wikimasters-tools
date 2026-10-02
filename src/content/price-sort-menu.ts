import type { SortMode, SortSource } from './sort-source';

export const PRICE_SORT_ATTRIBUTE = 'data-wmt-price-sort';

const PRICE_LABEL = 'Prix de vente décroissant';
const TRIGGER_SELECTOR = 'button[aria-label="Trier la collection"]';
const REMEMBERED = 'data-wmt-sort-label';
const WIRED = 'data-wmt-sort-wired';
const DEMOTED = 'data-wmt-demoted';
const OPTION = 'button';
const INITIALISED = 'data-wmt-sort-init';

// Tri correspondant à une entrée de la liste du site, d'après son libellé (« Rareté » si inconnu).
export function sortModeOf(label: string | null | undefined): SortMode {
  const text = (label ?? '').trim().toLowerCase();
  if (text.startsWith('nom')) return 'name';
  if (text.startsWith('favori')) return 'starred';
  if (text.startsWith('date')) return 'added';
  return 'rarity';
}

function lastText(root: Element): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let found: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.trim()) found = node as Text;
  return found;
}

// Le site colore l'entrée choisie (classe + aria-selected) : on reprend sa classe « choisie » et sa classe « normale »
// tant qu'elles sont visibles, pour que notre entrée ne soit colorée que lorsqu'elle est choisie.
function paintSelection(list: HTMLElement, active: boolean): void {
  const ours = list.querySelector<HTMLElement>(`[${PRICE_SORT_ATTRIBUTE}] ${OPTION}`);
  if (!ours) return;
  const siteOptions = [...list.querySelectorAll<HTMLElement>(OPTION)].filter((option) => option !== ours);
  const chosen = siteOptions.find((option) => option.getAttribute('aria-selected') === 'true' && !option.hasAttribute(DEMOTED));
  const normal = siteOptions.find((option) => option.getAttribute('aria-selected') === 'false');
  if (chosen && !list.dataset.wmtClsSel) list.dataset.wmtClsSel = chosen.className;
  if (normal && !list.dataset.wmtClsNormal) list.dataset.wmtClsNormal = normal.className;
  const selectedClass = list.dataset.wmtClsSel;
  const normalClass = list.dataset.wmtClsNormal;
  if (!selectedClass || !normalClass) return;
  const set = (element: HTMLElement, className: string, selected: boolean) => {
    if (element.className !== className) element.className = className;
    if (element.getAttribute('aria-selected') !== String(selected)) element.setAttribute('aria-selected', String(selected));
  };
  set(ours, active ? selectedClass : normalClass, active);
  if (active) {
    // Notre tri a été posé après un clic sur « Rareté » : le site la croit choisie, elle ne doit pas le paraître.
    if (chosen) {
      chosen.setAttribute(DEMOTED, '');
      set(chosen, normalClass, false);
    }
  } else {
    // Retour au tri du site : on rend sa couleur à l'entrée qu'on avait éteinte, sauf si le site en a choisi une autre.
    const demoted = siteOptions.find((option) => option.hasAttribute(DEMOTED));
    if (demoted) {
      demoted.removeAttribute(DEMOTED);
      if (!chosen) set(demoted, selectedClass, true);
    }
  }
}

function buildEntry(model: HTMLElement): HTMLElement {
  const entry = model.cloneNode(true) as HTMLElement;
  entry.setAttribute(PRICE_SORT_ATTRIBUTE, '');
  const label = lastText(entry);
  if (label) label.nodeValue = PRICE_LABEL;
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
        const target = event.target as Element;
        if (target.closest(`[${PRICE_SORT_ATTRIBUTE}]`)) return;
        // Le tri se lit sur l'entrée choisie, pas sur les requêtes du site (les nôtres s'y mêlent sur Android).
        const option = target.closest(OPTION);
        if (option) source.set(sortModeOf(option.textContent));
        queueMicrotask(() => syncPriceSort(root, true, source));
      },
      true,
    );
  }

  // Premier affichage : le site peut avoir gardé un tri autre que « Rareté » (le libellé du bouton le dit).
  if (!trigger.hasAttribute(INITIALISED)) {
    trigger.setAttribute(INITIALISED, '');
    if (source.current() === 'rarity' && text?.nodeValue !== PRICE_LABEL) source.set(sortModeOf(text?.nodeValue));
  }

  paintSelection(list, source.current() === 'price');

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
