import type { CardPreview } from '../core/collection/card-preview';
import { titleToSlug } from '../core/market/market-book';
import { rarityBackground, rarityKey } from './card-rarity';
import { getImageService } from './image-registry';

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
const SHORT_EXTRACT_MAX = 100;
const TREND_GLYPH = { up: '▲', down: '▼', flat: '=' } as const;
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
  else void replaceMissingArt(preview.title, image, art);
  card.append(art);

  if (preview.rarity) card.append(Object.assign(div('wmt-card-rarity', preview.rarity)));

  // Même pastille que sous la rareté sur la liste (voir HistoryBadge) : moyenne des enchères et tendance.
  const { history, loading } = preview.market;
  if (history) {
    const chip = div(`wmt-card-market wmt-card-market-${history.kind}`, history.label);
    chip.title = history.tooltip;
    if (history.trend) {
      const arrow = document.createElement('span');
      arrow.className = `wmt-card-trend wmt-card-trend-${history.trend}`;
      arrow.textContent = TREND_GLYPH[history.trend];
      chip.append(arrow);
    }
    card.append(chip);
  }
  // Même glyphe que sur la liste (voir LoadingGlyph) : relevé du marché en attente.
  if (loading) {
    const glyph = div('wmt-card-loading');
    glyph.setAttribute('role', 'status');
    glyph.title = 'Prix du marché en cours de chargement';
    glyph.setAttribute('aria-label', glyph.title);
    glyph.append(div('wmt-card-spinner'));
    card.append(glyph);
  }

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
  if (preview.extract) {
    // Une simple description d'une ligne (« navire de guerre ») est composée en plus gros que les extraits.
    const short = !preview.extract.includes('\n') && preview.extract.length <= SHORT_EXTRACT_MAX;
    body.append(Object.assign(document.createElement('p'), { className: short ? 'wmt-card-extract wmt-card-extract-short' : 'wmt-card-extract', textContent: preview.extract }));
  }
  if (preview.tags.length > 0) {
    const tags = div('wmt-card-tags');
    for (const tag of preview.tags) {
      const chip = div('wmt-card-tag', tag.name);
      if (tag.color) chip.style.setProperty('--wmt-tag', tag.color);
      tags.append(chip);
    }
    body.append(tags);
  }
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
  // Un titre de cette carte joue sur Spotify : égaliseur vert, au-dessus de l'attaque.
  if (preview.playing) card.append(playingGlyph());

  // Au-dessus de la défense : le lien avec le cinéma, les jeux vidéo ou la musique (bobine, manette ou note, sans fond), puis la marque d'exemplaires.
  // Les deux sont dans un même conteneur aligné à droite : seul, chacun garde le bord droit. La bobine l'emporte sur la manette, puis sur la note.
  const marks = div('wmt-card-marks');
  if (preview.film || preview.game || preview.music) {
    card.classList.add('wmt-card-linked');
    marks.append(preview.film ? filmGlyph() : preview.game ? gameGlyph() : musicGlyph());
  }
  if (preview.copies !== null) {
    card.classList.add('wmt-card-multi');
    marks.append(div('wmt-card-copies', `X${preview.copies}`));
  }
  if (marks.childElementCount > 0) card.append(marks);

  // Reflet animé des légendaires : classe du site.
  if (preview.rarity === 'L') {
    const sheen = div('wmt-card-sheen');
    sheen.append(div('legendary-shimmer-sheen'));
    card.append(sheen);
  }
  return card;
}

// Égaliseur de trois barres dans une pastille ; les barres bougent (voir `.wmt-card-playing` dans PANEL_CSS).
function playingGlyph(): HTMLElement {
  const glyph = div('wmt-card-playing');
  glyph.setAttribute('role', 'img');
  glyph.title = 'En cours de lecture';
  glyph.setAttribute('aria-label', glyph.title);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  [4, 10, 16].forEach((x, index) => {
    const bar = document.createElementNS(SVG_NS, 'rect');
    for (const [name, value] of Object.entries({ x: String(x), y: '4', width: '4', height: '16', rx: '1', class: `wmt-eq wmt-eq-${index}` })) bar.setAttribute(name, value);
    svg.append(bar);
  });
  glyph.append(svg);
  return glyph;
}

// Note de musique (Lucide « music »), sans fond ni animation.
function musicGlyph(): HTMLElement {
  const glyph = div('wmt-card-link wmt-card-music');
  glyph.setAttribute('role', 'img');
  glyph.title = 'Lien avec la musique';
  glyph.setAttribute('aria-label', glyph.title);
  const svg = icon('', ['M9 18V5l12-2v13']);
  svg.setAttribute('class', 'wmt-card-music-note');
  for (const [cx, cy] of [[6, 18], [18, 16]]) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    for (const [name, value] of Object.entries({ cx: String(cx), cy: String(cy), r: '3' })) dot.setAttribute(name, value);
    svg.append(dot);
  }
  glyph.append(svg);
  return glyph;
}

// Bobine de cinéma (disque, moyeu et quatre trous), sans fond ni animation.
function filmGlyph(): HTMLElement {
  const glyph = div('wmt-card-link wmt-card-film');
  glyph.setAttribute('role', 'img');
  glyph.title = 'Lien avec le cinéma';
  glyph.setAttribute('aria-label', glyph.title);
  const svg = icon('', []);
  svg.setAttribute('class', 'wmt-card-film-reel');
  for (const [cx, cy, r] of [[12, 12, 10], [12, 12, 1.5], [12, 6.5, 1.5], [12, 17.5, 1.5], [6.5, 12, 1.5], [17.5, 12, 1.5]]) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    for (const [name, value] of Object.entries({ cx: String(cx), cy: String(cy), r: String(r) })) circle.setAttribute(name, value);
    svg.append(circle);
  }
  glyph.append(svg);
  return glyph;
}

// Manette de jeu (même dessin que le glyphe « gamepad » des fiches), sans fond ni animation.
function gameGlyph(): HTMLElement {
  const glyph = div('wmt-card-link wmt-card-game');
  glyph.setAttribute('role', 'img');
  glyph.title = 'Jeu vidéo';
  glyph.setAttribute('aria-label', glyph.title);
  const svg = icon('', ['M7 10.5v4', 'M5 12.5h4']);
  svg.setAttribute('class', 'wmt-card-game-pad');
  const body = document.createElementNS(SVG_NS, 'rect');
  for (const [name, value] of Object.entries({ x: '2', y: '7', width: '20', height: '11', rx: '5' })) body.setAttribute(name, value);
  svg.prepend(body);
  for (const [cx, cy] of [[15.5, 11.5], [18, 13.5]]) {
    const button = document.createElementNS(SVG_NS, 'circle');
    for (const [name, value] of Object.entries({ cx: String(cx), cy: String(cy), r: '1' })) button.setAttribute(name, value);
    svg.append(button);
  }
  glyph.append(svg);
  return glyph;
}

// Carte sans image : le logo est remplacé par l'image trouvée (si l'option est active), dès qu'elle arrive.
async function replaceMissingArt(title: string, image: HTMLImageElement, art: HTMLElement): Promise<void> {
  const images = getImageService();
  if (!images?.enabled()) return;
  const url = await images.resolve(titleToSlug(title) || title, title).catch(() => null);
  if (!url || !images.enabled()) return;
  image.alt = '';
  image.className = '';
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  art.append(div('wmt-card-art-fade'));
}

const formatStat = (value: number | null): string => (value === null ? '–' : value.toLocaleString('fr-FR'));
