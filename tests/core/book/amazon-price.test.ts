// tests/core/book/amazon-price.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAmazonPrice, parseAmazonPrice } from '../../../src/core/book/amazon-price';
import { BookError } from '../../../src/core/book/errors';

// Extraits de la forme réelle de la page produit (titre, ISBN-13 avec tiret, premier prix = celui de l'édition).
const PAGE = `<html><head><title>Amazon.fr - L&#x27;étranger - Camus, Albert - Livres</title></head><body>
<div id="corePrice_feature_div"><span class="a-offscreen">7,60€</span></div>
<li><span>ISBN-13</span> <span>978-2070360024</span></li>
<script>{"priceAmount":7.60,"currency":"EUR"} {"priceAmount":2.04}</script></body></html>`;

describe('parseAmazonPrice', () => {
  it('lit le premier prix de la page de l’édition demandée', () => {
    expect(parseAmazonPrice(PAGE, '9782070360024')).toBe(7.6);
  });
  it('se rabat sur le prix affiché quand le prix structuré manque', () => {
    const page = PAGE.replace(/\{"priceAmount":7\.60[^}]*\} \{"priceAmount":2\.04\}/, '');
    expect(parseAmazonPrice(page, '9782070360024')).toBe(7.6);
  });
  it('refuse une page qui ne mentionne pas l’ISBN-13 demandé (autre édition)', () => {
    expect(parseAmazonPrice(PAGE, '9780679720201')).toBeUndefined();
  });
  it('refuse une page de vérification anti-robot', () => {
    expect(parseAmazonPrice(`${PAGE}<form action="/errors/validateCaptcha">`, '9782070360024')).toBeUndefined();
  });
  it('refuse un prix nul, absurde ou absent', () => {
    const zero = PAGE.replace('"priceAmount":7.60', '"priceAmount":0').replace('7,60€', '0,00€');
    expect(parseAmazonPrice(zero, '9782070360024')).toBeUndefined();
    expect(parseAmazonPrice(PAGE.replace('"priceAmount":7.60', '"priceAmount":99999'), '9782070360024')).toBeUndefined();
    expect(parseAmazonPrice('<p>978-2070360024</p>', '9782070360024')).toBeUndefined();
  });
  it('refuse une page dont le premier prix structuré et le premier prix affiché diffèrent', () => {
    expect(parseAmazonPrice(PAGE.replace('"priceAmount":7.60', '"priceAmount":12.90'), '9782070360024')).toBeUndefined();
  });
  it('un prix structuré nul ne retombe pas sur le prix affiché', () => {
    expect(parseAmazonPrice(PAGE.replace('"priceAmount":7.60', '"priceAmount":0'), '9782070360024')).toBeUndefined();
  });
  it('garde le prix structuré seul quand aucun prix n’est affiché', () => {
    const page = PAGE.replace('<span class="a-offscreen">7,60€</span>', '');
    expect(parseAmazonPrice(page, '9782070360024')).toBe(7.6);
  });
});

const respond = (status: number, body = '') => vi.fn(async (_url: string) => new Response(body, { status }));

describe('createAmazonPrice', () => {
  it('lit la page produit par l’ISBN-10 et rend le prix', async () => {
    const fetchFn = respond(200, PAGE);
    expect(await createAmazonPrice({ fetch: fetchFn }).read('9782070360024')).toBe(7.6);
    expect(fetchFn).toHaveBeenCalledWith('https://www.amazon.fr/dp/2070360024');
  });

  it('lève une BookError, sans rien mémoriser comme « pas de prix », quand la page est illisible', async () => {
    await expect(createAmazonPrice({ fetch: respond(200, '<html>autre chose</html>') }).read('9782070360024')).rejects.toBeInstanceOf(BookError);
    await expect(createAmazonPrice({ fetch: respond(503) }).read('9782070360024')).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(createAmazonPrice({ fetch: respond(404) }).read('9782070360024')).rejects.toMatchObject({ code: 'not-found' });
    await expect(createAmazonPrice({ fetch: respond(500) }).read('9782070360024')).rejects.toMatchObject({ code: 'http' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createAmazonPrice({ fetch: down }).read('9782070360024')).rejects.toMatchObject({ code: 'http' });
  });

  it('lève une BookError « http » quand le corps de la réponse est illisible', async () => {
    const broken = vi.fn(async (_url: string) => ({ ok: true, status: 200, text: async () => { throw new TypeError('x'); } }) as unknown as Response);
    await expect(createAmazonPrice({ fetch: broken }).read('9782070360024')).rejects.toMatchObject({ name: 'BookError', code: 'http' });
  });

  it('refuse un ISBN sans équivalent ISBN-10, sans appel réseau', async () => {
    const fetchFn = respond(200, PAGE);
    await expect(createAmazonPrice({ fetch: fetchFn }).read('9791032000000')).rejects.toMatchObject({ code: 'not-found' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
