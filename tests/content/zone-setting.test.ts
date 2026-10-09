// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readZone, writeZone } from '../../src/content/zone-setting';

beforeEach(() => window.localStorage.clear());

describe('réglage de zone', () => {
  it('vaut Automatique par défaut', () => {
    expect(readZone()).toBe('auto');
  });
  it('mémorise A, B, C et Corse', () => {
    for (const zone of ['A', 'B', 'C', 'Corse'] as const) {
      writeZone(zone);
      expect(readZone()).toBe(zone);
    }
  });
  it('retombe sur Automatique pour une valeur inconnue', () => {
    window.localStorage.setItem('wmt:library-zone', 'Z');
    expect(readZone()).toBe('auto');
  });
});
