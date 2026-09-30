import type { CardPreview } from '../core/collection/card-preview';

// Un élément (et non une chaîne HTML) : Leaflet assignerait une chaîne via innerHTML.
export function buildCardPreview(preview: CardPreview): HTMLElement {
  const card = document.createElement('div');
  card.className = 'wmt-card';

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

  // Même pastille que sur les cartes du jeu (voir PurchaseBadge).
  if (preview.purchase) {
    const price = document.createElement('div');
    price.className = 'wmt-card-price';
    price.append(Object.assign(document.createElement('div'), { textContent: '$' }));
    price.append(Object.assign(document.createElement('div'), { textContent: preview.purchase.label }));
    card.append(price);
  }

  const title = document.createElement('div');
  title.className = 'wmt-card-title';
  title.textContent = preview.title;
  card.append(title);
  return card;
}
