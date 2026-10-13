// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, ENGINE_VIEW, readArt, subscribeArt, writeArt } from '../../src/content/art-setting';

afterEach(() => {
  vi.restoreAllMocks();
  try { localStorage.removeItem(ART_KEY); } catch { /* */ }
});

describe('réglage du graphisme', () => {
  it('vaut la valeur par défaut des tests (« classic », le moteur) ; en production Ghibli (__WMT_ART_DEFAULT__ absent)', () => {
    expect(readArt()).toBe('classic');
  });
  it('l’ancien choix « classic » d’un utilisateur ne l’est plus (valeur par défaut) ; seule la valeur interne montre le moteur', () => {
    localStorage.setItem(ART_KEY, 'classic');
    expect(readArt()).toBe(__WMT_ART_DEFAULT__);
    localStorage.setItem(ART_KEY, ENGINE_VIEW);
    expect(readArt()).toBe('classic');
  });
  it('écrit puis relit « ghibli »', () => {
    writeArt('ghibli');
    expect(localStorage.getItem(ART_KEY)).toBe('ghibli');
    expect(readArt()).toBe('ghibli');
  });
  it('une valeur inconnue vaut « classic »', () => {
    localStorage.setItem(ART_KEY, 'manga');
    expect(readArt()).toBe('classic');
  });
  it('stockage inaccessible : « classic », et l’écriture ne lève rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqué'); });
    expect(readArt()).toBe('classic');
    expect(() => writeArt('ghibli')).not.toThrow();
  });
  it('prévient les abonnés à chaque écriture', () => {
    const listener = vi.fn();
    const stop = subscribeArt(listener);
    writeArt('ghibli');
    stop();
    writeArt('classic');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
