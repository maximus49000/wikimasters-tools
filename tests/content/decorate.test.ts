// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decorate,
  PURCHASE_HOST_ATTRIBUTE,
  type MountPurchase,
} from '../../src/content/decorate';
import type { PriceBook } from '../../src/core/pricing/price-book';

const book: PriceBook = {
  byTitle: (title) =>
    title === 'Mad Max'
      ? {
          cardId: 'c1',
          rarity: 'SR',
          isShiny: false,
          stats: { count: 2, median: 5, min: 3, max: 6, trend: null, reliability: 'low' },
          purchase: null,
        }
      : null,
};

describe('decorate', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card"><img alt="x"><h3>Mad Max</h3></div>
          <div class="card"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`;
  });

  describe("pastille de prix d'achat", () => {
    const boughtBook: PriceBook = {
      byTitle: (title) =>
        title === 'Mad Max'
          ? {
              cardId: 'c1',
              rarity: 'SR',
              isShiny: false,
              stats: { count: 2, median: 5, min: 3, max: 6, trend: null, reliability: 'low' },
              purchase: { min: 3, max: 6 },
            }
          : null,
    };

    function withFrame() {
      document.body.innerHTML = `
        <div class="card">
          <div class="frame" style="position:relative"><img alt="x"><div style="position:absolute">SR</div></div>
          <h3>Mad Max</h3>
        </div>`;
    }

    function purchaseMount() {
      const labels: string[] = [];
      const mountPurchase: MountPurchase = (frame, model) => {
        labels.push(model.label);
        const host = document.createElement('div');
        host.setAttribute(PURCHASE_HOST_ATTRIBUTE, '');
        frame.appendChild(host);
      };
      return { mountPurchase, labels };
    }

    it("monte la pastille sur le cadre d'une carte achetée", () => {
      withFrame();
      const { mountPurchase, labels } = purchaseMount();
      expect(decorate(document, boughtBook, mountPurchase)).toBe(1);
      expect(labels).toEqual(['3–6']);
      expect(document.querySelector(`.frame > [${PURCHASE_HOST_ATTRIBUTE}]`)).not.toBeNull();
    });

    it("n'en monte pas pour une carte seulement vendue", () => {
      withFrame();
      const { mountPurchase, labels } = purchaseMount();
      expect(decorate(document, book, mountPurchase)).toBe(0);
      expect(labels).toEqual([]);
    });

    it('ne duplique pas la pastille au second passage', () => {
      withFrame();
      const { mountPurchase, labels } = purchaseMount();
      decorate(document, boughtBook, mountPurchase);
      expect(decorate(document, boughtBook, mountPurchase)).toBe(0);
      expect(labels).toHaveLength(1);
    });
  });
});
