import { describe, expect, it } from 'vitest';
import { fetchSubject } from '../../../src/core/documentary/subject';

const claim = (time: string) => [{ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { type: 'time', value: { time, precision: 11 } } } }];

function fakeFetch(entity: Record<string, unknown>, item: string | null) {
  const urls: string[] = [];
  const fetchFn = async (url: string) => {
    urls.push(url);
    if (url.includes('fr.wikipedia.org')) {
      return new Response(JSON.stringify({ query: { pages: [{ title: 'Napoléon Ier', pageprops: item ? { wikibase_item: item } : undefined }] } }));
    }
    return new Response(JSON.stringify({ entities: { [item ?? 'Q0']: entity } }));
  };
  return { fetchFn, urls };
}

describe('fetchSubject', () => {
  it('lit les noms (fr, en, alias) et les dates', async () => {
    const { fetchFn } = fakeFetch(
      {
        labels: { fr: { value: 'Napoléon Ier' }, en: { value: 'Napoleon' } },
        aliases: { fr: [{ value: 'Napoléon Bonaparte' }] },
        claims: { P569: claim('+1769-08-15T00:00:00Z'), P570: claim('+1821-05-05T00:00:00Z') },
      },
      'Q517',
    );
    const subject = await fetchSubject(fetchFn, 'Napoléon_Ier');
    expect(subject).toEqual({ qid: 'Q517', names: ['Napoléon Ier', 'Napoleon', 'Napoléon Bonaparte'], birth: 1769, death: 1821, start: null, end: null });
  });

  it('rend null pour un article sans élément Wikidata', async () => {
    const { fetchFn, urls } = fakeFetch({}, null);
    expect(await fetchSubject(fetchFn, 'Napoléon_Ier')).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it('laisse remonter une panne réseau (jamais mémorisée comme « sans valeur »)', async () => {
    await expect(fetchSubject(async () => new Response('', { status: 429 }), 'X')).rejects.toThrow('HTTP 429');
  });
});
