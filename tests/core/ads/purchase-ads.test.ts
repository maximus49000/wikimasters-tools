import { describe, expect, it, vi } from 'vitest';
import { createPurchaseAds } from '../../../src/core/ads/purchase-ads';

const storage = (initial?: string) => {
  const data = new Map<string, string>(initial ? [['wmt:purchaseAds', initial]] : []);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe('createPurchaseAds', () => {
  it('est désactivé par défaut', () => {
    expect(createPurchaseAds(storage()).enabled()).toBe(false);
  });
  it('mémorise le choix et prévient les abonnés une seule fois par changement', () => {
    const settings = storage();
    const ads = createPurchaseAds(settings);
    const listener = vi.fn();
    ads.subscribe(listener);
    ads.setEnabled(true);
    ads.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createPurchaseAds(settings).enabled()).toBe(true);
    ads.setEnabled(false);
    expect(createPurchaseAds(settings).enabled()).toBe(false);
  });
  it('un stockage illisible laisse les offres masquées', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const ads = createPurchaseAds(broken);
    expect(ads.enabled()).toBe(false);
    expect(() => ads.setEnabled(true)).not.toThrow();
  });
});
