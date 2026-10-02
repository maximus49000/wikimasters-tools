import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { buildWeb, cardId, hubId } from '../../../src/core/links/web-graph';
import { chooseLabels, shortTitle } from '../../../src/core/links/web-labels';

const cards: KnownCard[] = ['Kamini', 'ChansonB', 'Daft_Punk', 'Air'].map((slug) => ({ slug, title: slug.replace(/_/g, ' ') }));
// Pop (2 cartes), Électro (2 cartes), France (3 cartes) : France est le plus partagé.
const web = buildWeb(
  cards,
  setLinks(EMPTY_LINKS, { Kamini: ['Pop', 'France'], ChansonB: ['Pop', 'France'], Daft_Punk: ['Électro', 'France'], Air: ['Électro'] }, 1),
  null,
);
const spread = {
  [hubId('France')]: { x: 0, y: 0 },
  [hubId('Pop')]: { x: 300, y: 0 },
  [hubId('Électro')]: { x: 0, y: 300 },
  [cardId('Kamini')]: { x: 300, y: 100 },
  [cardId('ChansonB')]: { x: 600, y: 0 },
  [cardId('Daft_Punk')]: { x: 0, y: 500 },
  [cardId('Air')]: { x: 300, y: 300 },
};

describe('chooseLabels', () => {
  it('nomme les points éloignés les uns des autres, pas les cartes tant qu’elles sont petites', () => {
    const labels = chooseLabels(web, spread, null, 0.6);
    expect([...labels].sort()).toEqual([hubId('France'), hubId('Pop'), hubId('Électro')].sort());
  });

  it('nomme aussi les cartes quand le zoom les écarte assez', () => {
    const labels = chooseLabels(web, spread, null, 1.2);
    for (const slug of ['Kamini', 'ChansonB', 'Daft_Punk', 'Air']) expect(labels.has(cardId(slug))).toBe(true);
  });

  it('ne garde, entre deux noms qui se chevauchent, que le plus partagé', () => {
    const packed = { ...spread, [hubId('Pop')]: { x: 5, y: 0 } };
    const labels = chooseLabels(web, packed, null, 0.6);
    expect(labels.has(hubId('France'))).toBe(true);
    expect(labels.has(hubId('Pop'))).toBe(false);
    expect(labels.has(hubId('Électro'))).toBe(true);
  });

  it('un zoom plus fort écarte les nœuds et rend les noms écartés', () => {
    const packed = { ...spread, [hubId('Pop')]: { x: 30, y: 0 } };
    expect(chooseLabels(web, packed, null, 0.6).has(hubId('Pop'))).toBe(false);
    expect(chooseLabels(web, packed, null, 3).has(hubId('Pop'))).toBe(true);
  });

  it('donne la priorité aux nœuds mis en avant, même moins partagés', () => {
    const packed = { ...spread, [hubId('Pop')]: { x: 5, y: 0 } };
    const labels = chooseLabels(web, packed, new Set([hubId('Pop')]), 0.6);
    expect(labels.has(hubId('Pop'))).toBe(true);
    expect(labels.has(hubId('France'))).toBe(false);
  });

  it('nomme une carte mise en avant même dézoomée', () => {
    const labels = chooseLabels(web, spread, new Set([cardId('Kamini')]), 0.3);
    expect(labels.has(cardId('Kamini'))).toBe(true);
  });

  it('ignore un nœud sans position', () => {
    expect(() => chooseLabels(web, {}, null, 1)).not.toThrow();
    expect(chooseLabels(web, {}, null, 1).size).toBe(0);
  });
});

describe('shortTitle', () => {
  it('coupe les titres trop longs', () => {
    expect(shortTitle('Pop')).toBe('Pop');
    expect(shortTitle('Christine and the Queens et leurs amis')).toHaveLength(24);
    expect(shortTitle('Christine and the Queens et leurs amis').endsWith('…')).toBe(true);
  });
});
