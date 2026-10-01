import { describe, expect, it } from 'vitest';
import source from '../../src/entrypoints/content.tsx?raw';

const start = source.indexOf('createMarketCollector({');
const wiring = source.slice(start, source.indexOf('// Une recherche demandée'));
const creation = source.slice(start, source.indexOf('});', start) + 3);

describe('câblage du relevé du marché', () => {
  it('le script de contenu est chargé sur toutes les pages du site', () => {
    expect(source).toMatch(/matches:\s*\['https:\/\/www\.wiki-masters\.com\/\*'\]/);
  });

  it('le relevé ne dépend d’aucune page : ni /collection ni aucun autre chemin', () => {
    expect(creation.length).toBeGreaterThan(100);
    expect(creation).not.toMatch(/pathname|location|\/collection|\/marketplace/);
    expect(wiring).not.toMatch(/pathname|\/collection|\/marketplace/);
  });

  it('libère le relevé quand la page se décharge et le reprend au retour du cache', () => {
    expect(wiring).toContain("'pagehide'");
    expect(wiring).toContain('collector.release()');
    expect(wiring).toContain("'pageshow'");
    expect(wiring).toContain('collector.activate()');
  });

  it('seules les cartes affichées dans la Collection sont demandées au collecteur', () => {
    expect(source).toMatch(/onVisibleCards:[\s\S]*collector[\s\S]*\.want\(/);
  });

  it('plus aucun parcours du marché entier', () => {
    expect(source).not.toMatch(/getMarketPage|fetchFullMarket/);
  });

  it('le glyphe de chargement suit les cartes en attente du collecteur', () => {
    expect(source).toMatch(/collector\.pendingSlugs\(\)/);
    expect(source).toMatch(/collector\.subscribe\(/);
    expect(source).toMatch(/decorateLoading\(document, pending, mountLoadingGlyph\)/);
  });

  it('les cartes de la Collection affichent leur case de prix même sans donnée', () => {
    expect(source).toMatch(/collectionRepo\.list\(\)/);
    expect(source).toMatch(/\(slug\) => owned\.has\(slug\)/);
  });

  it('le bouton de rechargement est branché sur le collecteur', () => {
    expect(source).toMatch(/syncRefreshButton\(collector, \{/);
    expect(source).toMatch(/getFilter: \(\) => filterSource\.current\(\)/);
  });
});
