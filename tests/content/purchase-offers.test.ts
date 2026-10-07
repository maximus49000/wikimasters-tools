// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { syncPurchaseOffers } from '../../src/content/purchase-offers';

let hidden = true;

describe('syncPurchaseOffers', () => {
  beforeEach(() => {
    hidden = true;
    document.body.innerHTML =
      '<button aria-label="Ouvrir la boutique WikiBidous">1 609</button>' +
      '<main><section id="pro"><h2>WikiMasters PRO</h2><button>S’abonner au PRO</button></section>' +
      '<section id="wb"><div><span>Acheter des WikiBidous</span></div><button>4,99 $</button></section>' +
      '<section id="autre"><h2>Notifications</h2></section></main>' +
      '<div role="dialog" aria-label="Boutique" id="shop"></div><button aria-label="Vue du marché" id="view"></button>';
  });
  const display = (id: string) => document.getElementById(id)!.style.display;

  it('masque les offres, la fenêtre Boutique et laisse le reste', () => {
    expect(syncPurchaseOffers(document, () => hidden)).toBe(4);
    expect(display('pro')).toBe('none');
    expect(display('wb')).toBe('none');
    expect(display('shop')).toBe('none');
    expect(display('view')).toBe('none');
    expect(display('autre')).toBe('');
  });
  it('remet tout quand les offres sont affichées', () => {
    syncPurchaseOffers(document, () => hidden);
    hidden = false;
    syncPurchaseOffers(document, () => hidden);
    expect(display('pro')).toBe('');
    expect(display('wb')).toBe('');
    expect(display('shop')).toBe('');
    expect(display('view')).toBe('');
  });
  it('la pastille du solde n’ouvre pas la boutique tant que les offres sont masquées', () => {
    let opened = 0;
    document.body.addEventListener('click', () => (opened += 1));
    syncPurchaseOffers(document, () => hidden);
    document.querySelector<HTMLElement>('button[aria-label]')!.click();
    expect(opened).toBe(0);
    hidden = false;
    document.querySelector<HTMLElement>('button[aria-label]')!.click();
    expect(opened).toBe(1);
  });
});
