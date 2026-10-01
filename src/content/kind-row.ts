import type { KindOption } from '../core/kinds/kinds-filter';

export const KIND_ROW_ATTRIBUTE = 'data-wmt-kind-row';

export type KindRowModel = {
  nature: string;
  facet: string;
  natures: KindOption[];
  facets: KindOption[];
  // Texte de l'entrée « aucun choix » du 2ᵉ filtre : « Occupation », « Genre », « Occupation / genre » ou « Aucun choix ».
  facetPlaceholder: string;
  // « 120 / 450 cartes classées » tant que le relevé Wikidata n'est pas fini ; null ensuite.
  progress: string | null;
};

export type KindRowHandlers = { onNature: (value: string) => void; onFacet: (value: string) => void };

const ROW_STYLE = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:0 0 8px;align-items:center';
const SELECT_STYLE =
  'width:100%;min-width:0;height:44px;padding:0 12px;border-radius:12px;box-sizing:border-box;' +
  'border:1px solid var(--color-border, rgba(148,163,184,0.35));background:var(--color-surface, #0d1117);' +
  'color:var(--color-foreground, #e6edf3);font:500 14px system-ui,sans-serif;cursor:pointer';
const PROGRESS_STYLE = 'grid-column:1 / -1;margin:0;font:12px/16px system-ui,sans-serif;opacity:.7';

function makeSelect(kind: 'nature' | 'facet', label: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset.wmtKind = kind;
  select.setAttribute('aria-label', label);
  select.style.cssText = SELECT_STYLE;
  return select;
}

// Les options ne sont reconstruites que si elles changent : une liste ouverte ne se referme pas à chaque mise à jour.
function fillSelect(select: HTMLSelectElement, placeholder: string, options: KindOption[], value: string): void {
  const signature = JSON.stringify([placeholder, options]);
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.replaceChildren(new Option(placeholder, ''), ...options.map((o) => new Option(`${o.label} (${o.count})`, o.id)));
  }
  if (select.value !== value) select.value = value;
}

// Rangée de deux listes (nature, puis occupation ou genre), posée juste avant `target`.
// Idempotent : appelée à chaque changement du DOM, elle ne touche à rien quand tout est déjà en place.
export function ensureKindRow(target: HTMLElement, model: KindRowModel, handlers: KindRowHandlers): HTMLElement {
  const existing = target.previousElementSibling;
  let row: HTMLElement;
  if (existing instanceof HTMLElement && existing.hasAttribute(KIND_ROW_ATTRIBUTE)) {
    row = existing;
  } else {
    row = document.createElement('div');
    row.setAttribute(KIND_ROW_ATTRIBUTE, '');
    row.style.cssText = ROW_STYLE;
    const progress = document.createElement('p');
    progress.dataset.wmtKind = 'progress';
    progress.style.cssText = PROGRESS_STYLE;
    row.append(makeSelect('nature', 'Nature'), makeSelect('facet', 'Occupation ou genre'), progress);
    target.insertAdjacentElement('beforebegin', row);
  }

  const nature = row.querySelector<HTMLSelectElement>('[data-wmt-kind="nature"]');
  const facet = row.querySelector<HTMLSelectElement>('[data-wmt-kind="facet"]');
  const progress = row.querySelector<HTMLElement>('[data-wmt-kind="progress"]');
  if (!nature || !facet || !progress) return row;

  // Aucune écriture sans changement : la surcouche observe le DOM et rappelle `sync()` à chaque mutation,
  // une réécriture identique relancerait la boucle sans fin.
  fillSelect(nature, 'Nature', model.natures, model.nature);
  fillSelect(facet, model.facetPlaceholder, model.facets, model.facet);
  const noChoice = model.facets.length === 0;
  if (facet.disabled !== noChoice) facet.disabled = noChoice;
  nature.onchange = () => handlers.onNature(nature.value);
  facet.onchange = () => handlers.onFacet(facet.value);
  const text = model.progress ?? '';
  if (progress.textContent !== text) progress.textContent = text;
  const hidden = model.progress === null;
  if (progress.hidden !== hidden) progress.hidden = hidden;
  return row;
}

export function removeKindRow(root: ParentNode): void {
  for (const row of root.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)) row.remove();
}
