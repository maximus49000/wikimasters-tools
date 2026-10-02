import { describe, expect, it, vi } from 'vitest';
import { LEAD_BATCH, extractLeadLinks, fetchLeadLinks } from '../../../src/core/links/wiki-links';

const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const page = (title: string, content: string | null, extra: Record<string, unknown> = {}) => ({
  title,
  ...(content === null ? { missing: true } : { revisions: [{ slots: { main: { content } } }] }),
  ...extra,
});

describe('extractLeadLinks', () => {
  it('lit la cible des liens, sans le texte affiché ni l’ancre, et sans doublon', () => {
    const links = extractLeadLinks("Du [[Pop (musique)|pop]] et du [[rock]], voir [[Jazz#Histoire|le jazz]], encore [[Pop (musique)]].");
    // La première lettre est mise en majuscule, comme le fait MediaWiki.
    expect(links).toEqual(['Pop_(musique)', 'Rock', 'Jazz']);
  });

  it('lit les liens des paramètres d’une infobox', () => {
    const text = '{{Infobox Musique (artiste)\n | nom = Kamini\n | genre = [[Hip-hop français]], [[Funk]]\n | label = [[RCA Records]]\n}}';
    expect(extractLeadLinks(text)).toEqual(['Hip-hop_français', 'Funk', 'RCA_Records']);
  });

  it('ignore les autres espaces de noms, les catégories et les liens vers un autre wiki', () => {
    const text = '[[Fichier:Photo.jpg|vignette|Légende]] [[Image:A.png]] [[Catégorie:Chanteur]] [[:Catégorie:Chanteur]] [[en:Kamini]] [[:en:Kamini]] [[wikt:mot]] [[Wikipédia:Aide]] [[Pop]]';
    expect(extractLeadLinks(text)).toEqual(['Pop']);
  });

  it('garde les liens d’une légende, même dans un fichier', () => {
    expect(extractLeadLinks('[[Fichier:A.jpg|vignette|Un [[concert]] à [[Paris]]]]')).toEqual(['Concert', 'Paris']);
  });

  it('garde un titre qui contient « : » quand ce n’est pas un espace de noms', () => {
    expect(extractLeadLinks('[[Star Wars : Épisode IV]] [[Mars: la planète]]')).toEqual(['Star_Wars_:_Épisode_IV', 'Mars:_la_planète']);
  });

  it('ignore les commentaires, les notes de bas de page et le texte non interprété', () => {
    const text = 'A [[Pop]]<!-- [[Caché]] --> B<ref>Voir [[Le Monde]]</ref> C<ref name="x" /> D<nowiki>[[Brut]]</nowiki> E<ref group="n">[[Note]]</ref>';
    expect(extractLeadLinks(text)).toEqual(['Pop']);
  });

  it('ignore un lien vers la même page (ancre seule) et un texte sans lien', () => {
    expect(extractLeadLinks('[[#Biographie]] rien d’autre')).toEqual([]);
    expect(extractLeadLinks('')).toEqual([]);
  });

  it('normalise les espaces, les soulignés et les accents composés', () => {
    expect(extractLeadLinks('[[  chanson_française  ]] [[Édith Piaf]]')).toEqual(['Chanson_française', 'Édith_Piaf']);
  });
});

describe('fetchLeadLinks', () => {
  it('lit l’introduction de plusieurs articles en une requête et rend leurs liens par article', async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      respond({
        batchcomplete: true,
        query: {
          pages: [page('Kamini', '[[Chanteur]] [[France]]'), page('Daft Punk', '[[Musique électronique]]'), page('Inconnue', null), page('Vide', 'Rien ici')],
        },
      }),
    );

    const result = await fetchLeadLinks(fetchFn, ['Kamini', 'Daft_Punk', 'Inconnue', 'Vide']);

    expect(result).toEqual({ Kamini: ['Chanteur', 'France'], Daft_Punk: ['Musique_électronique'], Inconnue: [], Vide: [] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('action')).toBe('query');
    expect(url.searchParams.get('prop')).toBe('revisions');
    expect(url.searchParams.get('rvprop')).toBe('content');
    expect(url.searchParams.get('rvslots')).toBe('main');
    expect(url.searchParams.get('rvsection')).toBe('0');
    expect(url.searchParams.get('redirects')).toBe('1');
    expect(url.searchParams.get('titles')).toBe('Kamini|Daft Punk|Inconnue|Vide');
  });

  it('rattache les liens à l’article demandé malgré normalisation et redirection', async () => {
    const fetchFn = vi.fn(async () =>
      respond({
        batchcomplete: true,
        query: {
          normalized: [{ from: 'edith piaf', to: 'Edith piaf' }],
          redirects: [{ from: 'Edith piaf', to: 'Édith Piaf' }],
          pages: [page('Édith Piaf', '[[Chanson française]]')],
        },
      }),
    );
    expect(await fetchLeadLinks(fetchFn, ['edith_piaf'])).toEqual({ edith_piaf: ['Chanson_française'] });
  });

  it('rend une liste vide pour un titre invalide, ou une page dont le contenu est masqué', async () => {
    const fetchFn = vi.fn(async () =>
      respond({
        batchcomplete: true,
        query: { pages: [{ title: 'A|B', invalid: true, invalidreason: 'mauvais' }, { title: 'Masquée', revisions: [{ slots: { main: {} } }] }] },
      }),
    );
    expect(await fetchLeadLinks(fetchFn, ['A|B', 'Masquée'])).toEqual({ 'A|B': [], Masquée: [] });
  });

  it('suit la suite de la réponse quand elle est trop grosse pour tenir en une fois', async () => {
    const fetchFn = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(respond({ continue: { rvcontinue: 'abc|1', continue: '||' }, query: { pages: [page('A', '[[Pop]]'), page('B', null)] } }))
      .mockResolvedValueOnce(respond({ batchcomplete: true, query: { pages: [page('A', null, { missing: undefined }), page('C', '[[Rock]]')] } }));

    const result = await fetchLeadLinks(fetchFn, ['A', 'B', 'C']);

    expect(result).toEqual({ A: ['Pop'], B: [], C: ['Rock'] });
    const second = new URL(fetchFn.mock.calls[1]?.[0] as string);
    expect(second.searchParams.get('rvcontinue')).toBe('abc|1');
    expect(second.searchParams.get('continue')).toBe('||');
  });

  it('coupe en plusieurs requêtes un lot dont les titres rendraient l’adresse trop longue', async () => {
    // 50 titres de 150 lettres accentuées : plus de 15 000 caractères une fois encodés, bien au-delà de ce qu'une adresse accepte.
    const long = Array.from({ length: 50 }, (_, i) => `É${'é'.repeat(148)}${i}`);
    const fetchFn = vi.fn(async (url: string) => {
      const titles = (new URL(url).searchParams.get('titles') ?? '').split('|');
      expect(url.length).toBeLessThan(7000);
      return respond({ batchcomplete: true, query: { pages: titles.map((title) => page(title, `[[Lien ${title.replace(/[^0-9]/g, '')}]]`)) } });
    });

    const result = await fetchLeadLinks(fetchFn, long);

    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
    expect(Object.keys(result)).toHaveLength(50);
    expect(result[long[7] as string]).toEqual(['Lien_7']);
    expect(result[long[49] as string]).toEqual(['Lien_49']);
  });

  it('refuse plus de 50 titres, la limite de l’API', async () => {
    expect(LEAD_BATCH).toBe(50);
    await expect(fetchLeadLinks(vi.fn(), Array.from({ length: 51 }, (_, i) => `A${i}`))).rejects.toThrow('50');
  });

  it('rend un objet vide sans titre, sans requête', async () => {
    const fetchFn = vi.fn();
    expect(await fetchLeadLinks(fetchFn, [])).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('lève sur une erreur HTTP, une erreur de l’API et une réponse inattendue (pour ne pas les mémoriser comme « sans lien »)', async () => {
    await expect(fetchLeadLinks(vi.fn(async () => ({ ok: false, status: 429 }) as Response), ['A'])).rejects.toThrow('429');
    await expect(fetchLeadLinks(vi.fn(async () => respond({ error: { code: 'toomanyvalues', info: 'trop' } })), ['A'])).rejects.toThrow('toomanyvalues');
    await expect(fetchLeadLinks(vi.fn(async () => respond({})), ['A'])).rejects.toThrow('inattendue');
    await expect(fetchLeadLinks(vi.fn(async () => respond({ query: {} })), ['A'])).rejects.toThrow('inattendue');
  });

  it('abandonne si la suite ne se termine jamais', async () => {
    const endless = vi.fn(async () => respond({ continue: { rvcontinue: 'x', continue: '||' }, query: { pages: [page('A', '[[Pop]]')] } }));
    await expect(fetchLeadLinks(endless, ['A'])).rejects.toThrow('trop de pages');
  });
});
