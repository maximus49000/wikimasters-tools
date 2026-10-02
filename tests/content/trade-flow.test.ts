// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTradeFlow } from '../../src/content/trade-flow';

const card = (title: string) => `<button class="card"><h3>${title}</h3></button>`;
const tradeDialog = (titles: string[]) =>
  `<div class="fixed inset-0"><h2>Échanger avec Ami</h2><input placeholder="Rechercher..."><div>${titles.map(card).join('')}</div></div>`;

let path = '/collection';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  path = '/collection';
});
afterEach(() => vi.useRealTimers());

const run = (titles: string[], notify = vi.fn()) => ({
  notify,
  stop: startTradeFlow(titles, { path: () => path, now: () => Date.now(), notify }),
});

describe('startTradeFlow', () => {
  it('va sur la page Échanges, ouvre « Proposer un échange », attend l’ami, puis clique chaque carte cherchée', () => {
    document.body.innerHTML = '<a href="/trades">Échanges</a>';
    const link = document.querySelector<HTMLAnchorElement>('a');
    link?.addEventListener('click', (event) => {
      event.preventDefault();
      path = '/trades';
      document.body.innerHTML = '<button id="propose">+ Proposer un échange</button>';
      document.getElementById('propose')?.addEventListener('click', () => {
        document.body.innerHTML = '<div class="fixed inset-0"><h2>Choisir un ami</h2><button id="friend">Échanger →</button></div>';
        document.getElementById('friend')?.addEventListener('click', () => {
          document.body.innerHTML = tradeDialog(['Ted Lasso', 'Rodez']);
          const picked = vi.fn();
          document.querySelectorAll('.card').forEach((button) => button.addEventListener('click', () => picked(button.textContent)));
          (window as unknown as { picked: typeof picked }).picked = picked;
        });
      });
    });

    const { notify } = run(['Rodez', 'Ted Lasso']);
    expect(document.getElementById('propose')).not.toBeNull();
    vi.advanceTimersByTime(250);
    expect(document.querySelector('h2')?.textContent).toBe('Choisir un ami');
    // L'utilisateur choisit son ami ; le dialogue d'échange s'ouvre.
    vi.advanceTimersByTime(5000);
    expect(document.querySelector('h2')?.textContent).toBe('Choisir un ami');
    document.getElementById('friend')?.click();
    vi.advanceTimersByTime(5000);
    const picked = (window as unknown as { picked: ReturnType<typeof vi.fn> }).picked;
    expect(picked.mock.calls.map((call) => call[0])).toEqual(['Rodez', 'Ted Lasso']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('cherche chaque titre dans le champ de recherche', () => {
    path = '/trades';
    document.body.innerHTML = tradeDialog(['Rodez']);
    const input = document.querySelector<HTMLInputElement>('input');
    const seen: string[] = [];
    input?.addEventListener('input', () => seen.push(input.value));
    run(['Rodez']);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual(['Rodez', '']);
  });

  it('signale une carte introuvable et passe à la suivante', () => {
    path = '/trades';
    document.body.innerHTML = tradeDialog(['Rodez']);
    const rodez = vi.fn();
    document.querySelector('.card')?.addEventListener('click', rodez);
    const { notify } = run(['Absente', 'Rodez']);
    vi.advanceTimersByTime(10_000);
    expect(rodez).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Absente'));
  });

  it('s’arrête si l’utilisateur ferme le choix de l’ami', () => {
    path = '/trades';
    document.body.innerHTML = '<div class="fixed inset-0"><h2>Choisir un ami</h2></div><button>+ Proposer un échange</button>';
    const again = vi.fn();
    document.querySelector('button')?.addEventListener('click', again);
    run(['Rodez']);
    vi.advanceTimersByTime(500);
    document.querySelector('.fixed')?.remove();
    vi.advanceTimersByTime(5000);
    expect(again).not.toHaveBeenCalled();
  });

  it('prévient quand le lien vers la page Échanges manque', () => {
    document.body.innerHTML = '';
    const { notify } = run(['Rodez']);
    expect(notify).toHaveBeenCalledWith('Page Échanges introuvable.');
  });
});
