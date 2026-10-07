// tests/core/documentary/commons-api.test.ts
import { describe, expect, it } from 'vitest';
import { searchCommons } from '../../../src/core/documentary/commons-api';

const page = (title: string, duration: number, extra: Record<string, unknown> = {}) => ({
  title,
  videoinfo: [{ url: `https://upload.wikimedia.org/${encodeURIComponent(title)}`, mime: 'video/webm', duration, thumburl: 'https://thumb.test/t.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Felicitas Graßl</a>' }, ImageDescription: { value: 'Un <b>film</b>' } }, ...extra }],
});

describe('searchCommons', () => {
  it('garde les vidéos notées pertinentes, avec licence et auteur nettoyés', async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ query: { pages: [page('File:La Révolution française et Napoléon - Planet Wissen.webm', 100), page('File:Napoleon extrait.webm', 20), page('File:Autre sujet.webm', 600)] } }));
    const found = await searchCommons(fetchFn, ['Napoléon Ier', 'Napoleon'], { qid: 'Q517', kind: 'person', startYear: 1769, endYear: 1821 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'commons',
      id: 'File:La Révolution française et Napoléon - Planet Wissen.webm',
      title: 'La Révolution française et Napoléon - Planet Wissen',
      channel: 'Felicitas Graßl',
      durationSec: 100,
      license: 'CC BY-SA 4.0',
      thumbUrl: 'https://thumb.test/t.jpg',
      url: 'https://commons.wikimedia.org/wiki/File%3ALa%20R%C3%A9volution%20fran%C3%A7aise%20et%20Napol%C3%A9on%20-%20Planet%20Wissen.webm',
    });
  });
  it('rend une liste vide sans résultat', async () => {
    expect(await searchCommons(async () => new Response(JSON.stringify({ batchcomplete: '' })), ['Verdun'], { qid: 'Q1', kind: 'event', startYear: null, endYear: null })).toEqual([]);
  });
  it('lève sur une panne', async () => {
    await expect(searchCommons(async () => new Response('', { status: 500 }), ['Verdun'], { qid: 'Q1', kind: 'event', startYear: null, endYear: null })).rejects.toThrow('Commons : HTTP 500');
  });
});
