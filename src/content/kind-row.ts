import type { KindOption } from '../core/kinds/kinds-filter';

export const KIND_ROW_ATTRIBUTE = 'data-wmt-kind-row';

export type KindRowModel = {
  nature: string;
  facet: string;
  natures: KindOption[];
  facets: KindOption[];
  // Texte affiché par le 2ᵉ filtre quand rien n'est choisi : « Occupation », « Genre », « Occupation / genre » ou « Aucun choix ».
  facetPlaceholder: string;
  // « 120 / 450 cartes classées » tant que le relevé Wikidata n'est pas fini ; null ensuite.
  progress: string | null;
};

export type KindRowHandlers = { onNature: (value: string) => void; onFacet: (value: string) => void };

// position + z-index : la rangée forme sa propre couche au-dessus des cartes et de la pagination, que les listes ouvertes recouvrent.
const ROW_STYLE = 'position:relative;z-index:1000;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:0 0 8px;align-items:center';
const PROGRESS_STYLE = 'grid-column:1 / -1;margin:0;font:12px/16px system-ui,sans-serif;opacity:.7';
const WRAP_STYLE = 'position:relative;min-width:0';
// Même habillage que les listes du site (étiquettes, rareté) : bouton + liste déroulante, pas de <select> natif.
const TRIGGER_STYLE =
  'display:flex;width:100%;min-width:0;min-height:42px;box-sizing:border-box;align-items:center;justify-content:space-between;gap:8px;' +
  'padding:8px 8px 8px 12px;border-radius:8px;border:1px solid var(--color-border, rgba(148,163,184,0.35));' +
  'background:var(--color-surface-light, #161b22);color:var(--color-foreground, #e6edf3);font:500 14px system-ui,sans-serif;' +
  'text-align:left;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05)';
const LABEL_STYLE = 'min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1';
const CHEVRON_STYLE = 'width:16px;height:16px;flex:none;opacity:.4;transition:transform .2s';
const LIST_STYLE =
  'position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:60;margin:0;padding:4px 0;list-style:none;max-height:208px;overflow-y:auto;' +
  'border-radius:12px;border:1px solid var(--color-border, rgba(148,163,184,0.35));background:var(--color-background, #0d1117);' +
  'box-shadow:0 20px 25px -5px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.25)';
const OPTION_STYLE =
  'display:flex;width:100%;box-sizing:border-box;align-items:center;padding:8px 12px;border:0;background:transparent;' +
  'color:var(--color-foreground, #e6edf3);font:14px system-ui,sans-serif;text-align:left;cursor:pointer';
const SELECTED_BACKGROUND = 'color-mix(in srgb, var(--color-accent, #34d399) 12%, transparent)';
const HOVER_BACKGROUND = 'var(--color-surface-light, #161b22)';
const SVG_NS = 'http://www.w3.org/2000/svg';
// Première entrée de chaque liste : elle retire le filtre de cette liste.
const ALL_LABEL = 'Tout';

const handlersByRow = new WeakMap<HTMLElement, KindRowHandlers>();

function triggerOf(wrap: Element): HTMLButtonElement | null {
  return wrap.querySelector<HTMLButtonElement>('button[data-wmt-kind]');
}

function listOf(wrap: Element): HTMLElement | null {
  return wrap.querySelector<HTMLElement>('[data-wmt-kind-list]');
}

function setOpen(wrap: Element, open: boolean): void {
  const trigger = triggerOf(wrap);
  const list = listOf(wrap);
  if (!trigger || !list || list.hidden === !open) return;
  list.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  const chevron = trigger.querySelector<SVGElement>('svg');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function closeAll(except?: Element): void {
  for (const wrap of document.querySelectorAll('[data-wmt-kind-wrap]')) if (wrap !== except) setOpen(wrap, false);
}

function makeDropdown(kind: 'nature' | 'facet', label: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.dataset.wmtKindWrap = kind;
  wrap.style.cssText = WRAP_STYLE;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.dataset.wmtKind = kind;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', label);
  trigger.style.cssText = TRIGGER_STYLE;
  const text = document.createElement('span');
  text.style.cssText = LABEL_STYLE;
  const chevron = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: CHEVRON_STYLE,
  })) {
    chevron.setAttribute(name, value);
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  chevron.append(path);
  trigger.append(text, chevron);

  const list = document.createElement('ul');
  list.setAttribute('role', 'listbox');
  list.dataset.wmtKindList = kind;
  list.style.cssText = LIST_STYLE;
  list.hidden = true;
  wrap.append(trigger, list);

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    const opening = list.hidden;
    closeAll(wrap);
    setOpen(wrap, opening);
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || list.hidden) return;
    setOpen(wrap, false);
    trigger.focus();
  });
  const closeOnOutside = (event: Event) => {
    if (!wrap.isConnected) document.removeEventListener('pointerdown', closeOnOutside, true);
    else if (!wrap.contains(event.target as Node)) setOpen(wrap, false);
  };
  document.addEventListener('pointerdown', closeOnOutside, true);
  return wrap;
}

// Les options ne sont reconstruites que si elles changent : une liste ouverte ne se referme pas à chaque mise à jour.
// « Tout » est toujours proposé en premier, même quand la liste n'a aucune autre valeur.
function fillDropdown(wrap: HTMLElement, placeholder: string, options: KindOption[], value: string, onPick: (value: string) => void): void {
  const trigger = triggerOf(wrap);
  const list = listOf(wrap);
  const text = trigger?.firstElementChild;
  if (!trigger || !list || !text) return;
  const entries = [{ id: '', text: ALL_LABEL }, ...options.map((o) => ({ id: o.id, text: `${o.label} (${o.count})` }))];
  const signature = JSON.stringify(entries);
  if (list.dataset.signature !== signature) {
    list.dataset.signature = signature;
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.dataset.value = entry.id;
        button.textContent = entry.text;
        button.style.cssText = OPTION_STYLE;
        button.addEventListener('pointerenter', () => {
          if (button.getAttribute('aria-selected') !== 'true') button.style.background = HOVER_BACKGROUND;
        });
        button.addEventListener('pointerleave', () => {
          button.style.background = button.getAttribute('aria-selected') === 'true' ? SELECTED_BACKGROUND : 'transparent';
        });
        button.addEventListener('click', () => {
          setOpen(wrap, false);
          trigger.focus();
          onPick(entry.id);
        });
        item.append(button);
        return item;
      }),
    );
  }
  for (const button of list.querySelectorAll<HTMLButtonElement>('[role="option"]')) {
    const selected = button.dataset.value === value;
    if (button.getAttribute('aria-selected') !== String(selected)) {
      button.setAttribute('aria-selected', String(selected));
      button.style.background = selected ? SELECTED_BACKGROUND : 'transparent';
    }
  }
  const shown = (value === '' ? undefined : entries.find((entry) => entry.id === value)?.text) ?? placeholder;
  if (text.textContent !== shown) text.textContent = shown;
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
    row.append(makeDropdown('nature', 'Nature'), makeDropdown('facet', 'Occupation ou genre'), progress);
    target.insertAdjacentElement('beforebegin', row);
  }

  const nature = row.querySelector<HTMLElement>('[data-wmt-kind-wrap="nature"]');
  const facet = row.querySelector<HTMLElement>('[data-wmt-kind-wrap="facet"]');
  const progress = row.querySelector<HTMLElement>('p[data-wmt-kind="progress"]');
  if (!nature || !facet || !progress) return row;

  // Aucune écriture sans changement : la surcouche observe le DOM et rappelle `sync()` à chaque mutation,
  // une réécriture identique relancerait la boucle sans fin.
  handlersByRow.set(row, handlers);
  fillDropdown(nature, 'Nature', model.natures, model.nature, (value) => handlersByRow.get(row)?.onNature(value));
  fillDropdown(facet, model.facetPlaceholder, model.facets, model.facet, (value) => handlersByRow.get(row)?.onFacet(value));
  const noChoice = model.facets.length === 0;
  const facetTrigger = triggerOf(facet);
  if (facetTrigger && facetTrigger.disabled !== noChoice) facetTrigger.disabled = noChoice;
  const text = model.progress ?? '';
  if (progress.textContent !== text) progress.textContent = text;
  const hidden = model.progress === null;
  if (progress.hidden !== hidden) progress.hidden = hidden;
  return row;
}

export function removeKindRow(root: ParentNode): void {
  for (const row of root.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)) row.remove();
}
