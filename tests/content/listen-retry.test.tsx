// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenSection } from '../../src/content/ListenSection';
import { setMusicService } from '../../src/content/music-registry';
import type { ListenView, MusicService } from '../../src/content/music-service';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABEL = 'Réessayer maintenant';
const LIMITED = 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.';

const limited = (retryAfterMs = 30_000): ListenView => ({ status: 'error', message: LIMITED, retryAfterMs });
const ready: ListenView = { status: 'ready', listen: { kind: 'album', items: [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }] } };

let container: HTMLDivElement;
let root: Root;

function serve(view: ListenView, retry: ReturnType<typeof vi.fn> = vi.fn()) {
  const service = { view: vi.fn(async () => view), retry, refresh: vi.fn(), subscribe: () => () => undefined, play: vi.fn(), link: vi.fn(), unlink: vi.fn() };
  setMusicService(service as unknown as MusicService);
  return service;
}

async function render(slug = 'Abbey_Road') {
  await act(async () => {
    root.render(<ListenSection slug={slug} title={slug} />);
  });
}

const button = () => container.querySelector<HTMLButtonElement>(`button[aria-label="${LABEL}"]`);
const text = () => container.textContent ?? '';
const click = () =>
  act(async () => {
    button()?.click();
  });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  vi.useRealTimers();
});

describe('ListenSection, réessayer maintenant après une limite de Spotify', () => {
  it("propose le bouton sous le message d'une limite, avec un glyphe et sans texte", async () => {
    serve(limited());
    await render();
    expect(text()).toContain(LIMITED);
    expect(button()).not.toBeNull();
    expect(button()?.querySelector('svg')).not.toBeNull();
    expect(button()?.textContent).toBe('');
  });

  it("n'en propose pas pour une autre erreur, ni pour une liste, ni sans compte lié", async () => {
    for (const view of [{ status: 'error', message: 'Spotify est indisponible pour le moment.' }, ready, { status: 'unlinked' }, { status: 'notfound' }] as ListenView[]) {
      serve(view);
      await render(`card_${view.status}`);
      expect(button()).toBeNull();
    }
  });

  it('recharge la fiche avec la liste que le service rend, sans attendre le délai', async () => {
    const service = serve(limited(), vi.fn(async () => ready));
    await render();
    await click();
    expect(service.retry).toHaveBeenCalledWith('Abbey_Road', 'Abbey_Road');
    expect(text()).toContain('Come Together');
    expect(text()).not.toContain(LIMITED);
    expect(button()).toBeNull();
  });

  it("garde le message et le bouton quand Spotify limite encore, et la nouvelle attente remplace l'ancienne", async () => {
    const service = serve(limited(30_000), vi.fn(async () => limited(60_000)));
    await render();
    await click();
    expect(text()).toContain(LIMITED);
    expect(button()?.disabled).toBe(false);

    // Relance automatique à la nouvelle échéance (60 s + marge), pas à l'ancienne (30 s).
    service.view.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(service.view).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(service.view).toHaveBeenCalledTimes(1);
  });

  it("n'envoie qu'une demande à la fois : le bouton est inactif pendant le rechargement", async () => {
    let answer: (view: ListenView) => void = () => undefined;
    const service = serve(limited(), vi.fn(() => new Promise<ListenView>((resolve) => (answer = resolve))));
    await render();
    await click();
    expect(button()?.disabled).toBe(true);
    await click();
    expect(service.retry).toHaveBeenCalledTimes(1);
    await act(async () => answer(ready));
    expect(text()).toContain('Come Together');
  });

  it("la relance automatique n'interfère pas avec une demande en cours", async () => {
    let answer: (view: ListenView) => void = () => undefined;
    const service = serve(limited(5_000), vi.fn(() => new Promise<ListenView>((resolve) => (answer = resolve))));
    await render();
    await click();
    service.view.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(service.view).not.toHaveBeenCalled();
    await act(async () => answer(ready));
  });

  it('ignore la réponse arrivée après un changement de carte', async () => {
    let answer: (view: ListenView) => void = () => undefined;
    serve(limited(), vi.fn(() => new Promise<ListenView>((resolve) => (answer = resolve))));
    await render();
    await click();
    await render('Revolver');
    await act(async () => answer(ready));
    expect(text()).not.toContain('Come Together');
  });
});
