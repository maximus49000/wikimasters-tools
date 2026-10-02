import { titleToSlug } from '../core/market/market-book';
import { findCardMounts, type CardMount } from './card-finder';
import { NETWORK, glyphElement } from './world-toggle';

const WEB_ACTION_ATTRIBUTE = 'data-wmt-selection-web';
const WEB_LABEL = 'Toile : la liaison entre les deux cartes cochées';
const WEB_HINT = 'Cochez exactement deux cartes pour voir leur liaison sur la Toile';
const TRADE_ACTION_ATTRIBUTE = 'data-wmt-selection-trade';
const TRADE_LABEL = 'Échanger avec un ami : les cartes cochées sont déjà posées dans l’offre';
const TRADE_HINT = 'Cochez au moins une carte pour la proposer en échange à un ami';
// Icône Lucide « handshake ».
const HANDSHAKE = [
  'm11 17 2 2a1 1 0 1 0 3-3',
  'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4',
  'm21 3 1 11h-2',
  'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3',
  'M3 4h8',
];

function normalize(text: string | null): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

const buttonsOf = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>('button')];

// Le mode « Sélectionner » du site est actif : son bouton devient « Quitter la sélection ».
export function isSelecting(root: ParentNode): boolean {
  return buttonsOf(root).some((button) => normalize(button.textContent).startsWith('quitter la sélection'));
}

// Quitte le mode « Sélectionner » du site en cliquant sur son bouton « Quitter la sélection ».
export function quitSelection(root: ParentNode): void {
  buttonsOf(root).find((button) => normalize(button.textContent).startsWith('quitter la sélection'))?.click();
}

// La barre d'actions du site (« Tout sélectionner (page) », « Étiqueter »…), repérée par son premier bouton.
function findSelectionBar(root: ParentNode): { bar: HTMLElement; anchor: HTMLButtonElement } | null {
  const anchor = buttonsOf(root).find((button) => normalize(button.textContent).startsWith('tout sélectionner'));
  return anchor?.parentElement ? { bar: anchor.parentElement, anchor } : null;
}

// Les cartes de la grille du site ont une case dessinée en haut à droite : coche (« lucide-check ») quand elle est prise.
function isNativeSelected(mount: CardMount): boolean {
  for (const mark of mount.container.querySelectorAll('svg.lucide-check')) {
    if (mark.parentElement?.getAttribute('aria-hidden') === 'true') return true;
  }
  return false;
}

export type NativeCard = { title: string; selected: boolean; toggle: () => void };

// Les cartes de la grille du site, par slug, avec l'état de leur case et de quoi la basculer.
export function readNativeCards(root: ParentNode): Map<string, NativeCard> {
  const cards = new Map<string, NativeCard>();
  for (const mount of findCardMounts(root, () => true)) {
    const slug = titleToSlug(mount.title);
    if (cards.has(slug)) continue;
    // Le clic est capté par le premier bloc de la carte ; la grille masquée le reçoit quand même.
    const target = mount.container.firstElementChild instanceof HTMLElement ? mount.container.firstElementChild : mount.container;
    cards.set(slug, { title: mount.title, selected: isNativeSelected(mount), toggle: () => target.click() });
  }
  return cards;
}

type BarAction = { attribute: string; label: string; hint: string; glyph: string[] };

const WEB_ACTION: BarAction = { attribute: WEB_ACTION_ATTRIBUTE, label: WEB_LABEL, hint: WEB_HINT, glyph: NETWORK };
const TRADE_ACTION: BarAction = {
  attribute: TRADE_ACTION_ATTRIBUTE,
  label: TRADE_LABEL,
  hint: TRADE_HINT,
  glyph: HANDSHAKE,
};

// Un bouton posé dans la barre du site et repris sur son style, à la suite de « Tout sélectionner » et des boutons déjà posés.
function ensureBarAction(root: ParentNode, action: BarAction, enabled: boolean, onClick: () => void): void {
  const found = findSelectionBar(root);
  if (!found) return;
  let button = found.bar.querySelector<HTMLButtonElement>(`[${action.attribute}]`);
  if (!button) {
    button = found.anchor.cloneNode(false) as HTMLButtonElement;
    for (const attr of ['id', 'aria-describedby', 'aria-controls', 'aria-expanded']) button.removeAttribute(attr);
    button.setAttribute(action.attribute, '');
    button.setAttribute('aria-label', action.label);
    button.append(glyphElement(action.glyph));
    const previous = [...found.bar.querySelectorAll(`[${WEB_ACTION_ATTRIBUTE}]`)].pop() ?? found.anchor;
    previous.insertAdjacentElement('afterend', button);
  }
  button.disabled = !enabled;
  button.title = enabled ? action.label : action.hint;
  button.onclick = enabled ? onClick : null;
}

// Le bouton Toile ; actif seulement avec deux cartes cochées.
export const ensureWebAction = (root: ParentNode, enabled: boolean, onClick: () => void): void =>
  ensureBarAction(root, WEB_ACTION, enabled, onClick);

// Le bouton « Échanger avec un ami » ; actif dès qu'une carte est cochée.
export const ensureTradeAction = (root: ParentNode, enabled: boolean, onClick: () => void): void =>
  ensureBarAction(root, TRADE_ACTION, enabled, onClick);

export function removeWebAction(root: ParentNode): void {
  for (const button of root.querySelectorAll(`[${WEB_ACTION_ATTRIBUTE}], [${TRADE_ACTION_ATTRIBUTE}]`)) button.remove();
}
