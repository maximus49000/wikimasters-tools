import type { KnownCard } from '../core/collection/collection-book';
import { titleToSlug } from '../core/market/market-book';
import { findCardMounts } from './card-finder';
import { TOGGLE_ATTRIBUTE } from './world-toggle';

const HIDDEN_ATTRIBUTE = 'data-wmt-grid-hidden';
const SELECT_LABEL = 'sélectionner';

function normalize(text: string | null): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Repéré par son texte, sinon par son icône : pas de classes CSS que le site peut changer.
export function findSelectButton(root: ParentNode): HTMLButtonElement | null {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
  return (
    buttons.find((button) => normalize(button.textContent) === SELECT_LABEL) ??
    buttons.find((button) => button.querySelector('.lucide-square-check-big') !== null) ??
    null
  );
}

const RARITY_LABELS = new Set(['L', 'UR', 'SR', 'R', 'PC', 'C']);

// Dernière pastille du groupe de rareté (L, UR, SR, R, PC, C) : le sélecteur de vue se place derrière, dans la même
// rangée. Repérée par le texte des boutons, sans dépendre des classes CSS du site ; nos propres éléments sont ignorés.
export function findRarityFilterAnchor(root: ParentNode): HTMLButtonElement | null {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
    const parent = button.parentElement;
    if (!parent || button !== parent.firstElementChild) continue;
    const pills = [...parent.children].filter((child) => !child.hasAttribute(TOGGLE_ATTRIBUTE));
    if (pills.length >= 2 && pills.every((child) => child instanceof HTMLButtonElement && RARITY_LABELS.has((child.textContent ?? '').trim()))) {
      return pills[pills.length - 1] as HTMLButtonElement;
    }
  }
  return null;
}

const allCards = () => true;

// Premier ancêtre du bouton qui contient des cartes : c'est la zone « Collection ».
export function findCollectionRoot(button: HTMLElement): HTMLElement | null {
  for (let node = button.parentElement; node; node = node.parentElement) {
    if (findCardMounts(node, allCards).length > 0) return node;
  }
  return null;
}

export function scanCollectionCards(root: ParentNode): KnownCard[] {
  const cards = new Map<string, KnownCard>();
  for (const { title } of findCardMounts(root, allCards)) {
    const slug = titleToSlug(title);
    if (!cards.has(slug)) cards.set(slug, { slug, title });
  }
  return [...cards.values()];
}

function commonAncestor(elements: HTMLElement[]): HTMLElement | null {
  const [first, ...rest] = elements;
  if (!first) return null;
  for (let node = first.parentElement; node; node = node.parentElement) {
    const candidate = node;
    if (rest.every((element) => candidate.contains(element))) return candidate;
  }
  return null;
}

// Conteneur commun des cartes, à masquer en vue Monde. On refuse tout ce qui contiendrait
// aussi le bouton (la barre d'outils disparaîtrait) ou la page entière.
export function findCardGrid(root: ParentNode, button: HTMLElement): HTMLElement | null {
  const grid = commonAncestor(findCardMounts(root, allCards).map((mount) => mount.container));
  if (!grid || ['MAIN', 'BODY', 'HTML'].includes(grid.tagName) || grid.contains(button)) return null;
  return grid;
}

const PAGE_LABEL = /^\s*Page\s+\d+\s*\/\s*\d+\s*$/;

// Navigation entre les pages (« ← Précédent  Page 2 / 36  Suivant → »), repérée par son libellé de page : le plus petit
// bloc qui contient aussi des boutons. Jamais un bloc qui contient des cartes, la barre d'outils ou la page entière.
export function findPagination(root: ParentNode, button: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const label of root.querySelectorAll<HTMLElement>('*')) {
    if (label.children.length > 0 || !PAGE_LABEL.test(label.textContent ?? '')) continue;
    for (let node = label.parentElement; node && !['MAIN', 'BODY', 'HTML'].includes(node.tagName); node = node.parentElement) {
      if (!node.querySelector('button, a')) continue;
      if (!node.contains(button) && findCardMounts(node, allCards).length === 0) found.push(node);
      break;
    }
  }
  return found;
}

export function setGridHidden(grid: HTMLElement, hidden: boolean): void {
  if (hidden) {
    if (grid.hasAttribute(HIDDEN_ATTRIBUTE)) return;
    grid.setAttribute(HIDDEN_ATTRIBUTE, grid.style.display);
    grid.style.display = 'none';
  } else if (grid.hasAttribute(HIDDEN_ATTRIBUTE)) {
    grid.style.display = grid.getAttribute(HIDDEN_ATTRIBUTE) ?? '';
    grid.removeAttribute(HIDDEN_ATTRIBUTE);
  }
}

export function restoreHiddenGrids(root: ParentNode): void {
  for (const grid of root.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}]`)) {
    setGridHidden(grid, false);
  }
}
