import { describe, expect, it, vi } from 'vitest';
import { NO_KINDS, fetchWikidataKinds, parseCardKinds, parseLabels } from '../../../src/core/kinds/wikidata-kinds';

const item = (id: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: { 'entity-type': 'item', id } } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([id, claims]) => [id, { claims }])),
});

describe('parseCardKinds', () => {
  it('lit toutes les natures, occupations et genres', () => {
    const kinds = parseCardKinds(
      entities({ Q1: { P31: [item('Q5')], P106: [item('Q177220'), item('Q33999')], P136: [item('Q11399')] } }),
    );
    expect(kinds.Q1).toEqual({ natures: ['Q5'], occupations: ['Q177220', 'Q33999'], genres: ['Q11399'] });
  });

  it('met le rang préféré en premier et ignore les rangs dépréciés', () => {
    const kinds = parseCardKinds(entities({ Q1: { P106: [item('Q1', 'normal'), item('Q2', 'preferred'), item('Q3', 'deprecated')] } }));
    expect(kinds.Q1?.occupations).toEqual(['Q2', 'Q1']);
  });

  it('ignore les valeurs qui ne sont pas des éléments et les doublons', () => {
    const time = { rank: 'normal', mainsnak: { datavalue: { value: { time: '+1889-01-01T00:00:00Z', precision: 9 } } } };
    const kinds = parseCardKinds(entities({ Q1: { P31: [item('Q5'), item('Q5'), time] } }));
    expect(kinds.Q1?.natures).toEqual(['Q5']);
  });

  it('rend des listes vides pour un élément sans ces propriétés', () => {
    expect(parseCardKinds(entities({ Q1: {} })).Q1).toEqual(NO_KINDS);
  });

  it('lève sur une réponse inattendue (pour ne pas la mémoriser comme « sans valeur »)', () => {
    expect(() => parseCardKinds({})).toThrow();
  });
});

describe('parseLabels', () => {
  it('préfère le français, puis l’anglais, et saute les éléments sans libellé', () => {
    const labels = parseLabels({
      entities: {
        Q1: { labels: { fr: { value: 'chanteur' }, en: { value: 'singer' } } },
        Q2: { labels: { en: { value: 'actor' } } },
        Q3: {},
      },
    });
    expect(labels).toEqual({ Q1: 'chanteur', Q2: 'actor' });
  });
});

describe('fetchWikidataKinds', () => {
  const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
  const pages = { query: { pages: [{ title: 'Piaf', pageprops: { wikibase_item: 'Q1' } }, { title: 'Inconnue' }] } };
  const claims = entities({ Q1: { P31: [item('Q5')], P106: [item('Q177220')] } });
  const labels = { entities: { Q5: { labels: { fr: { value: 'être humain' } } }, Q177220: { labels: { fr: { value: 'chanteur' } } } } };

  it('renvoie les valeurs par article, les libellés, et des listes vides sans élément Wikidata', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('wikipedia.org') ? respond(pages) : url.includes('props=claims') ? respond(claims) : respond(labels),
    );

    const result = await fetchWikidataKinds(fetchFn, ['Piaf', 'Inconnue']);

    expect(result.kinds.Piaf).toEqual({ natures: ['Q5'], occupations: ['Q177220'], genres: [] });
    expect(result.kinds.Inconnue).toEqual(NO_KINDS);
    expect(result.labels).toEqual({ Q5: 'être humain', Q177220: 'chanteur' });
  });

  it('ne demande que les libellés des identifiants rencontrés, par lots de 50', async () => {
    const many = Array.from({ length: 120 }, (_, i) => item(`Q${1000 + i}`));
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('wikipedia.org')
        ? respond({ query: { pages: [{ title: 'A', pageprops: { wikibase_item: 'Q1' } }] } })
        : url.includes('props=claims')
          ? respond(entities({ Q1: { P106: many } }))
          : respond({ entities: {} }),
    );

    await fetchWikidataKinds(fetchFn, ['A']);

    const labelCalls = fetchFn.mock.calls.filter(([url]) => url.includes('props=labels'));
    expect(labelCalls).toHaveLength(3);
  });

  it('propage une erreur HTTP', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    await expect(fetchWikidataKinds(fetchFn, ['A'])).rejects.toThrow('429');
  });
});
