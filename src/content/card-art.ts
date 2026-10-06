import { titleToSlug } from '../core/market/market-book';

export const ART_ATTRIBUTE = 'data-wmt-art';

// Ce que la synchronisation demande au service d'images (voir createImageService).
export type ArtSource = {
  enabled: () => boolean;
  peek: (slug: string) => string | null | undefined;
  request: (slug: string, title: string) => unknown;
  // Affiche d'un jeu vidéo pour une carte qui a déjà une image.
  peekGameArt: (slug: string) => string | null | undefined;
  requestGameArt: (slug: string, title: string) => unknown;
};

// Images qui n'ont pas pu se charger : on ne les repose pas (le retrait relancerait la synchronisation à l'infini).
const broken = new Set<string>();

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
// Zone image d'une carte du jeu : les 45 % du haut (même repère que l'aperçu, voir card-preview-dom).
const ART_ZONE = '[class*="h-[45%]"]';

// Une carte sans image affiche le logo du site (`/logo.png`, directement ou via /_next/image?url=…).
function isPlaceholder(img: HTMLImageElement): boolean {
  if (img.getAttribute('alt') !== 'WikiMasters') return false;
  try {
    const url = new URL(img.src, window.location.href);
    return (url.searchParams.get('url') ?? url.pathname) === '/logo.png';
  } catch {
    return false;
  }
}

// Le titre de la carte : le premier intitulé de la carte qui contient la zone image.
function readTitle(zone: Element): string | null {
  for (let node = zone.parentElement; node && !['MAIN', 'BODY', 'HTML'].includes(node.tagName); node = node.parentElement) {
    const title = node.querySelector(HEADING_SELECTOR)?.textContent?.trim();
    if (title) return title;
  }
  return null;
}

function overlayOf(zone: Element): HTMLElement | null {
  return zone.querySelector<HTMLElement>(`:scope > [${ART_ATTRIBUTE}]`);
}

function buildOverlay(url: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.setAttribute(ART_ATTRIBUTE, url);
  overlay.style.cssText = 'position:absolute; inset:0; z-index:1; background:#0d1117; overflow:hidden';
  const image = document.createElement('img');
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  image.style.cssText = 'width:100%; height:100%; object-fit:cover; object-position:center; display:block';
  // Image introuvable : on retombe sur le logo plutôt que sur un cadre noir.
  image.addEventListener('error', () => {
    broken.add(url);
    overlay.remove();
  });
  const fade = document.createElement('div');
  fade.style.cssText = 'position:absolute; left:0; right:0; bottom:0; height:3rem; background:linear-gradient(to top, rgba(0,0,0,0.5), transparent)';
  overlay.append(image, fade);
  return overlay;
}

// Pose, sur chaque carte sans image de la page, l'image de remplacement trouvée par le service (grille, fiche, achat…).
// Option coupée : les images posées sont retirées et le logo du site reste. Renvoie le nombre d'images posées.
export function syncCardArt(root: ParentNode, source: ArtSource): number {
  let placed = 0;
  if (!source.enabled()) {
    for (const overlay of root.querySelectorAll(`[${ART_ATTRIBUTE}]`)) overlay.remove();
    return 0;
  }
  const gameZones = new Set<Element>();
  for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
    const zone = img.closest(ART_ZONE);
    if (!zone) continue;
    if (!isPlaceholder(img)) {
      // Carte qui a déjà une image : si c'est un jeu vidéo, l'affiche officielle (Steam, IGDB) passe devant celle de Wikipédia.
      if (img.closest(`[${ART_ATTRIBUTE}]`) || gameZones.has(zone) || [...zone.querySelectorAll<HTMLImageElement>('img')].some(isPlaceholder)) continue;
      gameZones.add(zone);
      const gameTitle = readTitle(zone);
      const gameSlug = gameTitle ? titleToSlug(gameTitle) : null;
      if (!gameTitle || !gameSlug) continue;
      const gameUrl = source.peekGameArt(gameSlug);
      const current = overlayOf(zone);
      if (gameUrl === undefined) {
        source.requestGameArt(gameSlug, gameTitle);
        continue;
      }
      if (gameUrl === null || broken.has(gameUrl)) {
        current?.remove();
        continue;
      }
      if (current?.getAttribute(ART_ATTRIBUTE) === gameUrl) {
        placed += 1;
        continue;
      }
      current?.remove();
      zone.append(buildOverlay(gameUrl));
      placed += 1;
      continue;
    }
    const title = readTitle(zone);
    if (!title) continue;
    const slug = titleToSlug(title);
    if (!slug) continue;
    const url = source.peek(slug);
    const existing = overlayOf(zone);
    if (url === undefined) {
      source.request(slug, title);
      continue;
    }
    if (url === null || broken.has(url)) {
      existing?.remove();
      continue;
    }
    if (existing?.getAttribute(ART_ATTRIBUTE) === url) {
      placed += 1;
      continue;
    }
    existing?.remove();
    zone.append(buildOverlay(url));
    placed += 1;
  }
  return placed;
}
