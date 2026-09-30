// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decorate,
  HOST_ATTRIBUTE,
  PURCHASE_HOST_ATTRIBUTE,
  type MountBadge,
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

function recordingMount() {
  const mounted: string[] = [];
  const mount: MountBadge = (container, model) => {
    mounted.push(model.label);
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTRIBUTE, '');
    container.appendChild(host);
  };
  return { mount, mounted };
}

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

  it('monte un badge seulement sur les cartes dont le prix est connu', () => {
    const { mount, mounted } = recordingMount();
    expect(decorate(document, book, mount)).toBe(1);
    expect(mounted).toEqual(['5 WB']);
  });

  it('est idempotent : un second passage ne remonte pas le badge', () => {
    const { mount, mounted } = recordingMount();
    decorate(document, book, mount);
    expect(decorate(document, book, mount)).toBe(0);
    expect(mounted).toHaveLength(1);
  });

  it('remonte le badge si la carte a été recréée par la page', () => {
    const { mount, mounted } = recordingMount();
    decorate(document, book, mount);
    document.querySelector(`[${HOST_ATTRIBUTE}]`)?.remove();
    expect(decorate(document, book, mount)).toBe(1);
    expect(mounted).toHaveLength(2);
  });

  it("ne monte rien quand la carte n'a aucune donnée exploitable", () => {
    const emptyBook: PriceBook = {
      byTitle: () => ({
        cardId: 'c1',
        rarity: 'SR',
        isShiny: false,
        stats: { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' },
        purchase: null,
      }),
    };
    const { mount } = recordingMount();
    expect(decorate(document, emptyBook, mount)).toBe(0);
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

    it("monte la pastille sur le cadre d'une carte achetée, et le badge texte aussi", () => {
      withFrame();
      const { mount, mounted } = recordingMount();
      const { mountPurchase, labels } = purchaseMount();
      expect(decorate(document, boughtBook, mount, mountPurchase)).toBe(2);
      expect(labels).toEqual(['3–6']);
      expect(mounted).toEqual(['5 WB']);
      expect(document.querySelector(`.frame > [${PURCHASE_HOST_ATTRIBUTE}]`)).not.toBeNull();
    });

    it("n'en monte pas pour une carte seulement vendue", () => {
      withFrame();
      const { mount } = recordingMount();
      const { mountPurchase, labels } = purchaseMount();
      expect(decorate(document, book, mount, mountPurchase)).toBe(1);
      expect(labels).toEqual([]);
    });

    it('ne duplique pas la pastille au second passage', () => {
      withFrame();
      const { mount } = recordingMount();
      const { mountPurchase, labels } = purchaseMount();
      decorate(document, boughtBook, mount, mountPurchase);
      expect(decorate(document, boughtBook, mount, mountPurchase)).toBe(0);
      expect(labels).toHaveLength(1);
    });

    it('fonctionne sans mountPurchase', () => {
      withFrame();
      const { mount } = recordingMount();
      expect(decorate(document, boughtBook, mount)).toBe(1);
    });

    it('monte la pastille même si le badge texte existe déjà', () => {
      withFrame();
      const { mount } = recordingMount();
      decorate(document, boughtBook, mount);
      const { mountPurchase, labels } = purchaseMount();
      expect(decorate(document, boughtBook, mount, mountPurchase)).toBe(1);
      expect(labels).toEqual(['3–6']);
    });
  });
});
