import { describe, expect, it } from 'vitest';
import { ART_VERSION, addCandidates, dropLegacySteamArt, markArtChecked, rejectCurrent, setFound } from '../../../src/core/images/image-book';

describe('image-book', () => {
  it('mémorise le moment où la pochette officielle a été cherchée sans rien trouver', () => {
    expect(setFound({}, 'A', ['u1'], false, 5_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], artCheckedAt: 5_000, artV: ART_VERSION });
    // Pochette trouvée : elle est gardée pour toujours, inutile de dater une recherche.
    expect(setFound({}, 'A', ['u1'], true, 5_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], art: true });
  });
  it("date une recherche de pochette sans toucher à l'image de la carte", () => {
    expect(markArtChecked(setFound({}, 'A', ['u1']), 'A', 7_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], artCheckedAt: 7_000, artV: ART_VERSION });
    expect(markArtChecked({}, 'B', 1)).toEqual({});
  });
  it('affiche le premier candidat', () => {
    expect(setFound({}, 'A', ['u1', 'u2']).A).toEqual({ url: 'u1', candidates: ['u1', 'u2'], rejected: [] });
  });
  it('mémorise « rien trouvé » avec url null', () => {
    expect(setFound({}, 'A', []).A?.url).toBeNull();
  });
  it('« Mauvaise image » écarte l’image affichée et passe à la suivante', () => {
    const next = rejectCurrent(setFound({}, 'A', ['u1', 'u2']), 'A');
    expect(next.A).toEqual({ url: 'u2', candidates: ['u1', 'u2'], rejected: ['u1'] });
  });
  it('plus de candidat : url null, les écartés restent écartés', () => {
    const next = rejectCurrent(rejectCurrent(setFound({}, 'A', ['u1']), 'A'), 'A');
    expect(next.A?.url).toBeNull();
    expect(addCandidates(next, 'A', ['u1', 'u3']).A).toMatchObject({ url: 'u3', rejected: ['u1'] });
  });
});

describe('dropLegacySteamArt', () => {
  const OLD = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2483190/library_600x900.jpg';
  const OLD_HEADER = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2483190/header.jpg';
  const NEW = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg?t=1790187113';

  it('oublie les cartes dont une image est une ancienne adresse Steam fabriquée (introuvable pour les jeux récents)', () => {
    const state = {
      Forza: { url: OLD, candidates: [OLD, OLD_HEADER, 'https://wiki/a.jpg'], rejected: [], art: true as const },
      Bandeau: { url: 'https://wiki/b.jpg', candidates: ['https://wiki/b.jpg', OLD_HEADER], rejected: [] },
      Portal: { url: NEW, candidates: [NEW], rejected: [], art: true as const },
      Livre: { url: 'https://covers/c.jpg', candidates: ['https://covers/c.jpg'], rejected: [] },
    };
    expect(Object.keys(dropLegacySteamArt(state))).toEqual(['Portal', 'Livre']);
  });

  it('rend le même état quand il n’y a rien à oublier', () => {
    const state = { Livre: { url: 'https://covers/c.jpg', candidates: [], rejected: [] } };
    expect(dropLegacySteamArt(state)).toBe(state);
  });
});
