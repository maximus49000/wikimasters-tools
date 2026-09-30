import type { CardPreview } from '../core/collection/card-preview';
import { rarityBackground, rarityKey } from './card-rarity';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Icônes Lucide (« swords », « shield ») et étoile, comme dans le jeu.
function icon(className: string, paths: string[], fill = 'none'): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', fill);
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', className);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const SWORDS = ['M14.5 17.5 3 6V3h3l11.5 11.5', 'M13 19l6-6', 'M16 16l4 4', 'M19 21l2-2', 'M14.5 6.5 18 3h3v3l-3.5 3.5', 'M5 14l4 4', 'M7 17l-3 3', 'M3 19l2 2'];
const SHIELD = ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'];
const STAR = ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'];
const div = (className: string, text?: string): HTMLElement =>
  Object.assign(document.createElement('div'), { className, ...(text !== undefined ? { textContent: text } : {}) });



// Un élément (et non une chaîne HTML) : Leaflet assignerait une chaîne via innerHTML.
// Même structure que la carte du jeu : fond de rareté plein cadre, zone image sur 45 % du haut,
// texte sur le reste.
export function buildCardPreview(preview: CardPreview): HTMLElement {
  const card = div('wmt-card');
  if (preview.rarity) {
    card.dataset.rarity = preview.rarity;
    card.classList.add(`glow-${rarityKey(preview.rarity)}`);
    card.style.setProperty('--wmt-rarity', `var(--color-rarity-${rarityKey(preview.rarity)}, #94a3b8)`);
  }

  const background = rarityBackground(preview.rarity);
  if (background) {
    const bg = document.createElement('img');
    bg.className = 'wmt-card-bg';
    bg.src = background;
    bg.alt = '';
    card.append(bg);
  }
  card.append(div('wmt-card-shade'));

  // Zone image : la photo de la carte, ou le logo du site quand elle n'en a pas.
  const art = div('wmt-card-art');
  const image = document.createElement('img');
  image.alt = preview.imageUrl ? '' : 'WikiMasters';
  image.src = preview.imageUrl ?? '/logo.png';
  if (preview.imageUrl) image.referrerPolicy = 'no-referrer';
  else image.className = 'wmt-card-logo';
  art.append(image);
  // Dégradé sombre en pied de photo, comme dans le jeu.
  if (preview.imageUrl) art.append(div('wmt-card-art-fade'));
  card.append(art);

  if (preview.rarity) card.append(Object.assign(div('wmt-card-rarity', preview.rarity)));

  const corner = div('wmt-card-corner');
  corner.append(icon('wmt-card-star', STAR));
  // Même pastille que sur les cartes du jeu (voir PurchaseBadge).
  if (preview.purchase) {
    const price = div('wmt-card-price');
    price.append(div('', '$'), div('', preview.purchase.label));
    corner.append(price);
  }
  card.append(corner);

  const body = div('wmt-card-body');
  body.append(Object.assign(document.createElement('h3'), { className: 'wmt-card-title', textContent: preview.title }));
  if (preview.extract) body.append(Object.assign(document.createElement('p'), { className: 'wmt-card-extract', textContent: preview.extract }));
  if (preview.attack !== null || preview.defense !== null) {
    const stats = div('wmt-card-stats');
    const atk = document.createElement('span');
    atk.className = 'wmt-card-stat';
    atk.append(icon('wmt-card-ico wmt-card-atk', SWORDS), Object.assign(document.createElement('b'), { textContent: formatStat(preview.attack) }));
    const def = document.createElement('span');
    def.className = 'wmt-card-stat';
    def.append(icon('wmt-card-ico wmt-card-def', SHIELD), Object.assign(document.createElement('b'), { textContent: formatStat(preview.defense) }));
    stats.append(atk, def);
    body.append(stats);
  }
  card.append(body);

  // Reflet animé des légendaires : classe du site.
  if (preview.rarity === 'L') {
    const sheen = div('wmt-card-sheen');
    sheen.append(div('legendary-shimmer-sheen'));
    card.append(sheen);
  }
  return card;
}

const formatStat = (value: number | null): string => (value === null ? '–' : value.toLocaleString('fr-FR'));
