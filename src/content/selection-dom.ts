import { titleToSlug } from '../core/market/market-book';
import { findCardMounts, type CardMount } from './card-finder';
import { NETWORK, glyphElement } from './world-toggle';

const WEB_ACTION_ATTRIBUTE = 'data-wmt-selection-web';
const WEB_LABEL = 'Toile : la liaison entre les deux cartes cochées';
const WEB_HINT = 'Cochez exactement deux cartes pour voir leur liaison sur la Toile';

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

// Le bouton Toile, posé dans la barre du site et repris sur son style ; actif seulement avec deux cartes cochées.
export function ensureWebAction(root: ParentNode, enabled: boolean, onClick: () => void): void {
  const found = findSelectionBar(root);
  if (!found) return;
  let button = found.bar.querySelector<HTMLButtonElement>(`[${WEB_ACTION_ATTRIBUTE}]`);
  if (!button) {
    button = found.anchor.cloneNode(false) as HTMLButtonElement;
    for (const attr of ['id', 'aria-describedby', 'aria-controls', 'aria-expanded']) button.removeAttribute(attr);
    button.setAttribute(WEB_ACTION_ATTRIBUTE, '');
    button.setAttribute('aria-label', WEB_LABEL);
    button.append(glyphElement(NETWORK));
    found.anchor.insertAdjacentElement('afterend', button);
  }
  button.disabled = !enabled;
  button.title = enabled ? WEB_LABEL : WEB_HINT;
  button.onclick = enabled ? onClick : null;
}

export function removeWebAction(root: ParentNode): void {
  for (const button of root.querySelectorAll(`[${WEB_ACTION_ATTRIBUTE}]`)) button.remove();
}
