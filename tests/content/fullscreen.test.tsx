// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentaryPlayer } from '../../src/content/DocumentaryPlayer';
import { HlsTrailerPlayer } from '../../src/content/HlsTrailerPlayer';
import { TrailerPlayer } from '../../src/content/TrailerPlayer';
import type { DocCandidate } from '../../src/core/documentary/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const youtube: DocCandidate = { source: 'youtube', id: 'dQw4w9WgXcQ', title: 'Verdun', channel: 'ARTE', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
const commons: DocCandidate = { source: 'commons', id: 'File:A.webm', title: 'A', channel: 'Auteur', durationSec: 100, language: null, description: '', url: 'https://commons.wikimedia.org/wiki/File%3AA.webm', mediaUrl: 'https://upload.wikimedia.org/A.webm' };

// jsdom ne connaît pas l'API plein écran : on la simule avec un état partagé.
function stubFullscreen() {
  let current: Element | null = null;
  const request = vi.fn(function (this: HTMLElement) {
    current = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  return { request, exit };
}

describe('plein écran de tous les lecteurs vidéo', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const players: [string, () => ReactElement][] = [
    ['documentaire YouTube', () => <DocumentaryPlayer candidate={youtube} />],
    ['documentaire Commons', () => <DocumentaryPlayer candidate={commons} />],
    ['bande-annonce d’un film', () => <TrailerPlayer trailerKey="dQw4w9WgXcQ" />],
    ['bande-annonce d’un jeu vidéo', () => <HlsTrailerPlayer url="https://exemple.test/flux.m3u8" pageUrl="https://store.steampowered.com/app/1" />],
  ];

  it.each(players)('%s : un bouton met le lecteur en plein écran, un second en sort', async (_name, render) => {
    const { request, exit } = stubFullscreen();
    await act(async () => root.render(render()));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Plein écran"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(request).toHaveBeenCalledTimes(1);
    // Le conteneur du lecteur lui-même passe en plein écran, avec une taille qui remplit l'écran.
    const frame = (request.mock.contexts[0] as HTMLElement);
    expect(frame.contains(button)).toBe(true);
    expect(frame.style.maxHeight).toBe('none');
    const leave = container.querySelector<HTMLButtonElement>('button[aria-label="Quitter le plein écran"]');
    expect(leave).not.toBeNull();
    await act(async () => leave!.click());
    expect(exit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[aria-label="Plein écran"]')).not.toBeNull();
  });

  it('un refus du plein écran (WebView, site) ne casse pas le lecteur', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: () => Promise.reject(new Error('refusé')) });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    await act(async () => root.render(<DocumentaryPlayer candidate={youtube} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Plein écran"]')!.click());
    expect(container.querySelector('button[aria-label="Plein écran"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Lire le documentaire"]')).not.toBeNull();
  });
});
