import type { CardPreview } from '../core/collection/card-preview';

// Un élément (et non une chaîne HTML) : Leaflet assignerait une chaîne via innerHTML.
export function buildCardPreview(preview: CardPreview): HTMLElement {
  const card = document.createElement('div');
  card.className = 'wmt-card';
  if (preview.rarity) card.dataset.rarity = preview.rarity;

  const art = document.createElement('div');
  art.className = 'wmt-card-art';
  if (preview.imageUrl) {
    const image = document.createElement('img');
    image.src = preview.imageUrl;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    art.append(image);
  }
  card.append(art);

  if (preview.rarity) {
    const rarity = document.createElement('span');
    rarity.className = 'wmt-card-rarity';
    rarity.textContent = preview.rarity;
    card.append(rarity);
  }

  // Même pastille que sur les cartes du jeu (voir PurchaseBadge), à côté de l'étoile.
  if (preview.purchase) {
    const price = document.createElement('div');
    price.className = 'wmt-card-price';
    price.append(Object.assign(document.createElement('div'), { textContent: '$' }));
    price.append(Object.assign(document.createElement('div'), { textContent: preview.purchase.label }));
    card.append(price);
  }
  card.append(Object.assign(document.createElement('span'), { className: 'wmt-card-star', textContent: '☆' }));

  const body = document.createElement('div');
  body.className = 'wmt-card-body';
  body.append(Object.assign(document.createElement('div'), { className: 'wmt-card-title', textContent: preview.title }));
  if (preview.extract) {
    body.append(Object.assign(document.createElement('div'), { className: 'wmt-card-extract', textContent: preview.extract }));
  }
  if (preview.attack !== null || preview.defense !== null) {
    const stats = document.createElement('div');
    stats.className = 'wmt-card-stats';
    stats.append(
      Object.assign(document.createElement('span'), { className: 'wmt-card-atk', textContent: `⚔ ${preview.attack ?? '–'}` }),
      Object.assign(document.createElement('span'), { className: 'wmt-card-def', textContent: `⛨ ${preview.defense ?? '–'}` }),
    );
    body.append(stats);
  }
  card.append(body);
  return card;
}
