// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_ATTRIBUTE, syncCardArt, type ArtSource } from '../../src/content/card-art';

const CARD = (title: string, logo = true) => `
<div class="card">
  <div class="absolute top-0 left-0 right-0 h-[45%] z-20">
    <div class="relative flex">${logo ? '<div class="aspect"><img alt="WikiMasters" src="/_next/image?url=%2Flogo.png&w=64&q=75"></div>' : '<img alt="" src="https://upload.wikimedia.org/x.jpg">'}</div>
  </div>
  <div class="absolute"><h3>${title}</h3></div>
</div>`;

const source = (url: string | null | undefined, enabled = true, gameUrl?: string | null) => ({
  enabled: () => enabled,
  peek: () => url,
  request: vi.fn<(slug: string, title: string) => void>(),
  peekGameArt: () => gameUrl,
  requestGameArt: vi.fn<(slug: string, title: string) => void>(),
}) satisfies ArtSource;

describe('syncCardArt', () => {
  beforeEach(() => {
    document.body.innerHTML = CARD('Marie de Frise Orientale');
  });

  it('pose l’image trouvée sur une carte au logo, une seule fois', () => {
    const art = source('https://upload.wikimedia.org/m.jpg');
    expect(syncCardArt(document, art)).toBe(1);
    expect(syncCardArt(document, art)).toBe(1);
    expect(document.querySelectorAll(`[${ART_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector(`[${ART_ATTRIBUTE}] img`)?.getAttribute('src')).toBe('https://upload.wikimedia.org/m.jpg');
  });
  it('demande la recherche de la carte (slug du titre) quand elle est inconnue', () => {
    const art = source(undefined);
    syncCardArt(document, art);
    expect(art.request).toHaveBeenCalledWith('Marie_de_Frise_Orientale', 'Marie de Frise Orientale');
    expect(document.querySelector(`[${ART_ATTRIBUTE}]`)).toBeNull();
  });
  it('ne touche pas une carte qui a déjà sa photo', () => {
    document.body.innerHTML = CARD('Ted Lasso', false);
    const art = source('https://upload.wikimedia.org/m.jpg');
    expect(syncCardArt(document, art)).toBe(0);
    expect(art.request).not.toHaveBeenCalled();
  });
  it('jeu vidéo : l’affiche Steam passe devant la photo Wikipédia de la carte', () => {
    document.body.innerHTML = CARD('The Secret World', false);
    const art = source(undefined, true, 'https://steam/215280.jpg');
    expect(syncCardArt(document, art)).toBe(1);
    expect(syncCardArt(document, art)).toBe(1);
    expect(document.querySelectorAll(`[${ART_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector(`[${ART_ATTRIBUTE}] img`)?.getAttribute('src')).toBe('https://steam/215280.jpg');
  });
  it('carte avec photo : demande l’affiche du jeu quand elle est inconnue, rien si ce n’est pas un jeu', () => {
    document.body.innerHTML = CARD('The Secret World', false);
    const unknown = source(undefined, true, undefined);
    syncCardArt(document, unknown);
    expect(unknown.requestGameArt).toHaveBeenCalledWith('The_Secret_World', 'The Secret World');
    expect(syncCardArt(document, source(undefined, true, null))).toBe(0);
    expect(document.querySelector(`[${ART_ATTRIBUTE}]`)).toBeNull();
  });
  it('carte au logo sans affiche de jeu : l’image de remplacement n’est pas retirée', () => {
    const art = source('https://upload.wikimedia.org/m.jpg', true, null);
    syncCardArt(document, art);
    syncCardArt(document, art);
    expect(document.querySelectorAll(`[${ART_ATTRIBUTE}]`)).toHaveLength(1);
    expect(art.requestGameArt).not.toHaveBeenCalled();
  });
  it('carte au logo d’un jeu : l’affiche du jeu remplace l’image de remplacement déjà trouvée', () => {
    syncCardArt(document, source('https://upload.wikimedia.org/faux.jpg', true, undefined));
    expect(document.querySelector(`[${ART_ATTRIBUTE}] img`)?.getAttribute('src')).toBe('https://upload.wikimedia.org/faux.jpg');
    syncCardArt(document, source('https://upload.wikimedia.org/faux.jpg', true, 'https://steam/a.jpg'));
    expect(document.querySelectorAll(`[${ART_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector(`[${ART_ATTRIBUTE}] img`)?.getAttribute('src')).toBe('https://steam/a.jpg');
  });
  it('option coupée : retire les images posées et ne cherche rien', () => {
    syncCardArt(document, source('https://upload.wikimedia.org/m.jpg'));
    const off = source(undefined, false);
    expect(syncCardArt(document, off)).toBe(0);
    expect(document.querySelector(`[${ART_ATTRIBUTE}]`)).toBeNull();
    expect(off.request).not.toHaveBeenCalled();
  });
  it('remplace l’image quand le service en choisit une autre', () => {
    syncCardArt(document, source('https://upload.wikimedia.org/1.jpg'));
    syncCardArt(document, source('https://upload.wikimedia.org/2.jpg'));
    expect(document.querySelectorAll(`[${ART_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector(`[${ART_ATTRIBUTE}] img`)?.getAttribute('src')).toBe('https://upload.wikimedia.org/2.jpg');
  });
  it('ignore un logo hors d’une carte (en-tête du site)', () => {
    document.body.innerHTML = '<header><h1>WikiMasters</h1><img alt="WikiMasters" src="/logo.png"></header>';
    const art = source(undefined);
    syncCardArt(document, art);
    expect(art.request).not.toHaveBeenCalled();
  });
});
