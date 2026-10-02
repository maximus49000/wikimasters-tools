// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTradeAction, ensureWebAction, isSelecting, quitSelection, readNativeCards, removeWebAction } from '../../src/content/selection-dom';

const CHECK_OFF = '<span aria-hidden="true"><svg class="lucide lucide-square opacity-0"></svg></span>';
const CHECK_ON = '<span aria-hidden="true"><svg class="lucide lucide-check"></svg></span>';
const card = (title: string, mark: string) => `<div class="card"><div class="inner"><img src="x.png">${mark}<h3>${title}</h3></div></div>`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isSelecting', () => {
  it('reconnaît le mode sélection à son bouton « Quitter la sélection »', () => {
    document.body.innerHTML = '<button>Sélectionner</button>';
    expect(isSelecting(document)).toBe(false);
    document.body.innerHTML = '<button>Quitter la sélection</button>';
    expect(isSelecting(document)).toBe(true);
  });
});

describe('quitSelection', () => {
  it('clique sur « Quitter la sélection » du site', () => {
    document.body.innerHTML = '<button id="a">Sélectionner</button><button id="q">Quitter la sélection</button>';
    const quit = vi.fn();
    document.getElementById('q')?.addEventListener('click', quit);
    quitSelection(document);
    expect(quit).toHaveBeenCalledOnce();
  });
});

describe('readNativeCards', () => {
  it("lit l'état de la case de chaque carte du site et la bascule par un clic", () => {
    document.body.innerHTML = `<div id="grid">${card('Ted Lasso', CHECK_ON)}${card('Ovide', CHECK_OFF)}</div>`;
    const clicked = vi.fn();
    document.querySelector('.inner')?.addEventListener('click', clicked);
    const cards = readNativeCards(document);
    expect(cards.get('Ted_Lasso')?.selected).toBe(true);
    expect(cards.get('Ovide')?.selected).toBe(false);
    cards.get('Ted_Lasso')?.toggle();
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});

describe('ensureWebAction', () => {
  const bar = () =>
    (document.body.innerHTML =
      '<div id="bar"><button class="site">Tout sélectionner (page)</button><button class="site">Étiqueter</button></div>');
  const action = () => document.querySelector<HTMLButtonElement>('[data-wmt-selection-web]');

  it("pose le bouton Toile après « Tout sélectionner », une seule fois, actif selon l'état", () => {
    bar();
    const onClick = vi.fn();
    ensureWebAction(document, false, onClick);
    ensureWebAction(document, false, onClick);
    expect(document.querySelectorAll('[data-wmt-selection-web]')).toHaveLength(1);
    expect(action()?.previousElementSibling?.textContent).toContain('Tout sélectionner');
    expect(action()?.disabled).toBe(true);
    ensureWebAction(document, true, onClick);
    expect(action()?.disabled).toBe(false);
    action()?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('retire le bouton', () => {
    bar();
    ensureWebAction(document, true, vi.fn());
    removeWebAction(document);
    expect(action()).toBeNull();
  });

  it("ne fait rien sans barre d'actions", () => {
    document.body.innerHTML = '<button>Sélectionner</button>';
    ensureWebAction(document, true, vi.fn());
    expect(action()).toBeNull();
  });
});

describe('ensureTradeAction', () => {
  const bar = () =>
    (document.body.innerHTML = '<div id="bar"><button class="site">Tout sélectionner (page)</button><button class="site">Étiqueter</button></div>');
  const trade = () => document.querySelector<HTMLButtonElement>('[data-wmt-selection-trade]');

  it('pose le bouton après la Toile, actif selon l’état, et le retire avec elle', () => {
    bar();
    const onClick = vi.fn();
    ensureTradeAction(document, false, onClick);
    ensureWebAction(document, false, vi.fn());
    ensureTradeAction(document, false, onClick);
    expect(document.querySelectorAll('[data-wmt-selection-trade]')).toHaveLength(1);
    expect(trade()?.previousElementSibling?.hasAttribute('data-wmt-selection-web')).toBe(true);
    expect(trade()?.disabled).toBe(true);
    ensureTradeAction(document, true, onClick);
    trade()?.click();
    expect(onClick).toHaveBeenCalledOnce();
    removeWebAction(document);
    expect(trade()).toBeNull();
  });
});
