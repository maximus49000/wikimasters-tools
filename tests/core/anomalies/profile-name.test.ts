// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getProfileName, readProfileName, rememberProfileName } from '../../../src/core/anomalies/profile-name';

const PAGE = '<h1>WikiMasters</h1><h1>Mon Profil</h1><h1>joueur-fictif</h1><h2>Vitrine</h2>';

describe('nom du profil', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
    localStorage.clear();
  });
  it('lit le titre qui suit « Mon Profil »', () => {
    expect(readProfileName(document)).toBe('joueur-fictif');
  });
  it('ne trouve rien ailleurs', () => {
    document.body.innerHTML = '<h1>WikiMasters</h1>';
    expect(readProfileName(document)).toBeNull();
  });
  it('mémorise seulement sur la page Profil', () => {
    rememberProfileName(document, localStorage, '/collection');
    expect(getProfileName(localStorage)).toBeNull();
    rememberProfileName(document, localStorage, '/profile');
    expect(getProfileName(localStorage)).toBe('joueur-fictif');
  });
});
