// tests/relay/youtube.test.ts  (3A : durée, page de vidéos ; 3B ajoute searchYoutube)
import { describe, expect, it } from 'vitest';
import { fetchUploadsPage, parseDuration } from '../../relay/src/youtube';

describe('parseDuration', () => {
  it('lit les durées ISO 8601', () => {
    expect(parseDuration('PT52M')).toBe(3120);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('PT45S')).toBe(45);
    expect(parseDuration('P0D')).toBe(0);
    expect(parseDuration('n’importe quoi')).toBeNull();
  });
});

describe('fetchUploadsPage', () => {
  it('rend les vidéos d’une page avec leur durée, sans les vidéos supprimées ou privées', async () => {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      if (url.includes('/playlistItems?')) {
        return new Response(
          JSON.stringify({
            nextPageToken: 'P2',
            items: [
              { snippet: { title: 'Verdun' }, contentDetails: { videoId: 'AAA' } },
              { snippet: { title: 'Private video' }, contentDetails: { videoId: 'BBB' } },
              { snippet: { title: 'Deleted video' }, contentDetails: { videoId: 'CCC' } },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ items: [{ id: 'AAA', contentDetails: { duration: 'PT52M' } }] }));
    };
    const page = await fetchUploadsPage(fetchFn, 'CLE', 'UUplaylist', 'P1');
    expect(page).toEqual({ videos: [{ id: 'AAA', title: 'Verdun', durationSec: 3120 }], next: 'P2' });
    expect(urls[0]).toContain('playlistId=UUplaylist');
    expect(urls[0]).toContain('pageToken=P1');
    expect(urls[1]).toContain('id=AAA%2CBBB%2CCCC');
  });
  it('ne demande pas les durées d’une page vide, et rend next = null en fin de liste', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return new Response(JSON.stringify({ items: [] }));
    };
    expect(await fetchUploadsPage(fetchFn, 'CLE', 'UUplaylist')).toEqual({ videos: [], next: null });
    expect(calls).toBe(1);
  });
  it('lève sur une réponse en erreur (quota)', async () => {
    await expect(fetchUploadsPage(async () => new Response('', { status: 403 }), 'CLE', 'UUplaylist')).rejects.toThrow('YouTube : HTTP 403');
  });
});
