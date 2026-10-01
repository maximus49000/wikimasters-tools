import { describe, expect, it } from 'vitest';
import source from '../../src/entrypoints/content.tsx?raw';

const wiring = source.slice(source.indexOf('createMarketCollector({'), source.indexOf('// Une recherche demandée'));

describe('câblage du relevé du marché', () => {
  it('le script de contenu est chargé sur toutes les pages du site', () => {
    expect(source).toMatch(/matches:\s*\['https:\/\/www\.wiki-masters\.com\/\*'\]/);
  });

  it('le relevé ne dépend d’aucune page : ni /collection ni aucun autre chemin', () => {
    expect(wiring.length).toBeGreaterThan(100);
    expect(wiring).not.toMatch(/pathname|location|\/collection|\/marketplace/);
  });

  it('libère le relevé quand la page se décharge et le reprend au retour du cache', () => {
    expect(wiring).toContain("'pagehide'");
    expect(wiring).toContain('collector.release()');
    expect(wiring).toContain("'pageshow'");
    expect(wiring).toContain('collector.activate()');
  });
});
