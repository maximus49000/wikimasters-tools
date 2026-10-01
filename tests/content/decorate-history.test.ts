// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decorateHistory,
  HISTORY_HOST_ATTRIBUTE,
  type MountHistory,
} from '../../src/content/decorate-history';
import type { CardHistory } from '../../src/core/market/price-history';

const NOW = Date.parse('2026-09-30T10:00:00Z');
const card = (avgs: number[]): CardHistory => ({
  slug: 'Mad_Max',
  rarity: 'SR',
  hours: {},
  samples: avgs.map((avgBid, i) => ({ t: NOW - (avgs.length - i) * 1000, avgBid, bidCount: 1 })),
});

describe('decorateHistory', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="card">
        <div class="frame" style="position:relative"><img alt="x"><div style="position:absolute">SR</div></div>
        <h3>Mad Max</h3>
      </div>`;
  });

  function setup() {
    const labels: string[] = [];
    const mount: MountHistory = (frame, _chip, model) => {
      labels.push(model.label + (model.trend ?? ''));
      const host = document.createElement('div');
      host.setAttribute(HISTORY_HOST_ATTRIBUTE, '');
      frame.appendChild(host);
      return { update: (next) => labels.push('maj:' + next.label + (next.trend ?? '')) };
    };
    return { labels, mount };
  }

  it('pose la pastille sur le cadre, avec la flèche de tendance', () => {
    const { labels, mount } = setup();
    decorateHistory(document, () => [card([100, 150])], NOW, mount);
    expect(labels).toEqual(['≈ 125up']);
    expect(document.querySelectorAll(`[${HISTORY_HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('met à jour la pastille existante au lieu d’en poser une seconde', () => {
    const { labels, mount } = setup();
    decorateHistory(document, () => [card([100, 150])], NOW, mount);
    decorateHistory(document, () => [card([100, 150, 90])], NOW, mount);
    expect(document.querySelectorAll(`[${HISTORY_HOST_ATTRIBUTE}]`)).toHaveLength(1);
    expect(labels[1]).toBe('maj:≈ 113down');
  });

  it('affiche un = gris quand le prix est stable', () => {
    const { labels, mount } = setup();
    decorateHistory(document, () => [card([100, 100])], NOW, mount);
    expect(labels).toEqual(['≈ 100flat']);
  });

  it('ne pose rien pour une carte sans historique', () => {
    const { labels, mount } = setup();
    decorateHistory(document, () => [], NOW, mount);
    expect(labels).toEqual([]);
  });
});
