// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildCardPreview } from '../../src/content/card-preview-dom';
import type { CardPreview } from '../../src/core/collection/card-preview';

const base: CardPreview = { title: 'Paris', rarity: 'SR', imageUrl: null, extract: null, attack: null, defense: null, tags: [], purchase: null, market: { history: null, loading: false }, copies: null };

describe('buildCardPreview : étiquettes', () => {
  it('affiche chaque étiquette avec sa couleur', () => {
    const card = buildCardPreview({ ...base, tags: [{ name: '#CVIDEUH', color: '#818cf8' }, { name: '#SANS' }] });
    const chips = [...card.querySelectorAll<HTMLElement>('.wmt-card-tag')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['#CVIDEUH', '#SANS']);
    expect(chips[0]?.style.getPropertyValue('--wmt-tag')).toBe('#818cf8');
    expect(chips[1]?.style.getPropertyValue('--wmt-tag')).toBe('');
  });

  it('n’ajoute rien sans étiquette', () => {
    expect(buildCardPreview(base).querySelector('.wmt-card-tags')).toBeNull();
  });
});

describe('buildCardPreview : prix du marché', () => {
  const history = { kind: 'average', label: '≈ 40', trend: 'up', rarity: 'SR', tooltip: 'Moyenne' } as const;

  it('affiche la moyenne, la tendance et l’infobulle de la liste', () => {
    const chip = buildCardPreview({ ...base, market: { history, loading: false } }).querySelector<HTMLElement>('.wmt-card-market');
    expect(chip?.textContent).toBe('≈ 40▲');
    expect(chip?.title).toBe('Moyenne');
    expect(chip?.querySelector('.wmt-card-trend-up')).not.toBeNull();
  });

  it('affiche le glyphe de chargement quand le relevé est en attente', () => {
    expect(buildCardPreview({ ...base, market: { history: null, loading: true } }).querySelector('.wmt-card-loading')).not.toBeNull();
  });

  it('n’ajoute rien sans prix ni relevé en attente', () => {
    const card = buildCardPreview(base);
    expect(card.querySelector('.wmt-card-market')).toBeNull();
    expect(card.querySelector('.wmt-card-loading')).toBeNull();
  });
});

describe('buildCardPreview : exemplaires', () => {
  it('affiche « X2 » au-dessus de la défense quand il y a plusieurs exemplaires', () => {
    const card = buildCardPreview({ ...base, copies: 2 });
    expect(card.querySelector('.wmt-card-copies')?.textContent).toBe('X2');
  });

  it('n’affiche rien pour un seul exemplaire', () => {
    expect(buildCardPreview(base).querySelector('.wmt-card-copies')).toBeNull();
  });
});

describe('buildCardPreview : bobine de cinéma', () => {
  it('marque une carte liée au cinéma', () => {
    const reel = buildCardPreview({ ...base, film: true }).querySelector<HTMLElement>('.wmt-card-film');
    expect(reel?.title).toBe('Lien avec le cinéma');
    expect(reel?.classList.contains('wmt-card-link')).toBe(true);
    expect(reel?.closest('.wmt-card-marks')).not.toBeNull();
  });

  it('l’emporte sur la note de musique (bande originale d’un film)', () => {
    const card = buildCardPreview({ ...base, film: true, music: true });
    expect(card.querySelector('.wmt-card-music')).toBeNull();
    expect(card.querySelectorAll('.wmt-card-link')).toHaveLength(1);
  });

  it('garde l’égaliseur à gauche et la bobine à droite quand un titre joue', () => {
    const card = buildCardPreview({ ...base, film: true, playing: true });
    expect(card.querySelectorAll('.wmt-card-playing')).toHaveLength(1);
    expect(card.querySelector('.wmt-card-marks .wmt-card-film')).not.toBeNull();
  });
});

describe('buildCardPreview : manette de jeu vidéo', () => {
  it('marque une carte de jeu vidéo', () => {
    const pad = buildCardPreview({ ...base, game: true }).querySelector<HTMLElement>('.wmt-card-game');
    expect(pad?.title).toBe('Jeu vidéo');
    expect(pad?.classList.contains('wmt-card-link')).toBe(true);
    expect(pad?.closest('.wmt-card-marks')).not.toBeNull();
  });

  it('l’emporte sur la note de musique (bande originale d’un jeu), mais pas sur la bobine', () => {
    const withMusic = buildCardPreview({ ...base, game: true, music: true });
    expect(withMusic.querySelector('.wmt-card-music')).toBeNull();
    expect(withMusic.querySelectorAll('.wmt-card-link')).toHaveLength(1);
    expect(buildCardPreview({ ...base, game: true, film: true }).querySelector('.wmt-card-game')).toBeNull();
  });
});

describe('buildCardPreview : livre', () => {
  it('un livre porte un glyphe livre, titré « Livre » ; la bobine, la manette et la note l’emportent', () => {
    const glyph = buildCardPreview({ ...base, book: true }).querySelector<HTMLElement>('.wmt-card-book');
    expect(glyph?.getAttribute('aria-label')).toBe('Livre');
    expect(glyph?.title).toBe('Livre');
    for (const other of [{ film: true }, { game: true }, { music: true }]) {
      expect(buildCardPreview({ ...base, book: true, ...other }).querySelector('.wmt-card-book')).toBeNull();
    }
    expect(buildCardPreview({ ...base, book: true }).classList.contains('wmt-card-linked')).toBe(true);
  });
});

describe('buildCardPreview : note de musique', () => {
  it('marque une carte liée à la musique, à la place du glyphe de lecture', () => {
    const note = buildCardPreview({ ...base, music: true }).querySelector<HTMLElement>('.wmt-card-music');
    expect(note?.title).toBe('Lien avec la musique');
    expect(note?.classList.contains('wmt-card-link')).toBe(true);
  });

  it('garde l’égaliseur à gauche et la note à droite quand un titre joue', () => {
    const card = buildCardPreview({ ...base, music: true, playing: true });
    expect(card.querySelectorAll('.wmt-card-playing')).toHaveLength(1);
    expect(card.querySelector('.wmt-card-marks .wmt-card-music')).not.toBeNull();
  });

  it('place le glyphe avant « X2 » dans le même conteneur', () => {
    const marks = buildCardPreview({ ...base, music: true, copies: 2 }).querySelector('.wmt-card-marks');
    expect(marks?.children[0]?.classList.contains('wmt-card-music')).toBe(true);
    expect(marks?.children[1]?.classList.contains('wmt-card-copies')).toBe(true);
  });

  it('n’ajoute rien aux autres cartes', () => {
    expect(buildCardPreview(base).querySelector('.wmt-card-marks')).toBeNull();
  });
});
