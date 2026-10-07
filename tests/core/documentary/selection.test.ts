// tests/core/documentary/selection.test.ts
import { describe, expect, it } from 'vitest';
import { parseSelection } from '../../../src/core/documentary/selection';

describe('parseSelection', () => {
  const file = { Q2280: [{ id: 'AAA', title: 'Verdun 14-18', channel: 'INA', durationSec: 1500 }], Q517: [] };
  it('transforme les entrées d’un sujet en candidats « sélection »', () => {
    expect(parseSelection(file, 'Q2280')).toEqual([
      { source: 'selection', id: 'AAA', title: 'Verdun 14-18', channel: 'INA', durationSec: 1500, language: null, description: '', url: 'https://www.youtube.com/watch?v=AAA', thumbUrl: 'https://img.youtube.com/vi/AAA/hqdefault.jpg' },
    ]);
  });
  it('rend une liste vide pour un sujet absent ou sans entrée', () => {
    expect(parseSelection(file, 'Q1')).toEqual([]);
    expect(parseSelection(file, 'Q517')).toEqual([]);
  });
  it('ignore une entrée à la clé invalide et lève sur un fichier mal formé', () => {
    expect(parseSelection({ Q1: [{ id: 'pas une clé !', title: 'x', channel: 'y', durationSec: null }] }, 'Q1')).toEqual([]);
    expect(() => parseSelection('n’importe quoi', 'Q1')).toThrow();
  });
});
