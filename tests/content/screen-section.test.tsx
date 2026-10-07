// tests/content/screen-section.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCollectionMarks } from '../../src/content/collection-marks-registry';
import { setMusicService } from '../../src/content/music-registry';
import { ScreenSection } from '../../src/content/ScreenSection';
import { setScreenService } from '../../src/content/screen-registry';
import type { ScreenService, ScreenView } from '../../src/content/screen-service';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { screenOwnership } from '../../src/core/collection/work-marks';
import type { FilmographyItem, ScreenDetail } from '../../src/core/screen/tmdb-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const items: FilmographyItem[] = [
  { mediaType: 'movie', id: 1, title: 'Les Petits Mouchoirs', year: 2010, rating: 7 },
  { mediaType: 'movie', id: 27205, title: 'Inception', year: 2010, rating: 8.4 },
];
const detail: ScreenDetail = { mediaType: 'movie', id: 27205, title: 'Inception', genres: [], overview: 'Un voleur de rêves.' } as unknown as ScreenDetail;
const inception: KnownCard = { slug: 'Inception', title: 'Inception', rarity: 'L', copies: 2 };
const onOpenCard = vi.fn();

async function show(view: ScreenView, owned: KnownCard[] = []) {
  const service = { view: vi.fn(async () => view), detail: vi.fn(async () => ({ status: 'detail', detail })) } as unknown as ScreenService;
  setScreenService(service);
  const ownership = screenOwnership(owned, { Inception: { movieId: 27205 } });
  setCollectionMarks({ subscribe: () => () => undefined, ownership: () => ownership, ensure: vi.fn() });
  await act(async () => root.render(<ScreenSection slug="Marion_Cotillard" title="Marion Cotillard" onOpenCard={onOpenCard} />));
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  setMusicService(null);
  onOpenCard.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setScreenService(null);
  setCollectionMarks(null);
});

describe('ScreenSection — filmographie', () => {
  it('sans carte possédée : la filmographie d’avant, sans résumé ni interrupteur', async () => {
    await show({ status: 'filmography', items });
    expect(container.textContent).toContain('Filmographie');
    expect(container.textContent).toContain('Les Petits Mouchoirs');
    expect(container.textContent).not.toContain('dans ma collection');
  });

  it('repère le film dont on possède la carte et ouvre la carte', async () => {
    await show({ status: 'filmography', items }, [inception]);
    expect(container.textContent).toContain('1 / 2 dans ma collection');
    expect(container.textContent).toContain('×2');
    await act(async () => button('Voir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });

  it('ouvrir un film affiche son détail, le rappel de la carte possédée, et le retour restaure la liste', async () => {
    await show({ status: 'filmography', items }, [inception]);
    await act(async () => button('Ouvrir Inception')?.click());
    expect(container.textContent).toContain('Un voleur de rêves.');
    expect(container.textContent).toContain('Tu possèdes cette carte');
    expect((container.querySelector('[data-wmt-work-list]') as HTMLElement).style.display).toBe('none');
    await act(async () => button('Retour à la filmographie')?.click());
    expect((container.querySelector('[data-wmt-work-list]') as HTMLElement).style.display).toBe('block');
    expect(container.textContent).not.toContain('Tu possèdes cette carte');
  });

  it('un film non possédé s’ouvre sans rappel de carte', async () => {
    await show({ status: 'filmography', items }, [inception]);
    await act(async () => button('Ouvrir Les Petits Mouchoirs')?.click());
    expect(container.textContent).not.toContain('Tu possèdes cette carte');
  });

  it('fonctionne sans service de repérage', async () => {
    setScreenService({ view: async () => ({ status: 'filmography', items }), detail: async () => ({ status: 'detail', detail }) } as unknown as ScreenService);
    setCollectionMarks(null);
    await act(async () => root.render(<ScreenSection slug="X" title="X" />));
    expect(container.textContent).toContain('Les Petits Mouchoirs');
  });

  it('rien pour une carte sans cinéma', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });
});
