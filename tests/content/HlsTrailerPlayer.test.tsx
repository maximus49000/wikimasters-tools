// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HlsTrailerPlayer } from '../../src/content/HlsTrailerPlayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const instances: { handlers: Record<string, (event: string, data: { fatal: boolean }) => void>; loadSource: ReturnType<typeof vi.fn>; attachMedia: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];

vi.mock('hls.js', () => {
  class FakeHls {
    static Events = { ERROR: 'error' };
    static isSupported = () => true;
    handlers: Record<string, (event: string, data: { fatal: boolean }) => void> = {};
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    constructor() {
      instances.push(this);
    }
    on(name: string, handler: (event: string, data: { fatal: boolean }) => void) {
      this.handlers[name] = handler;
    }
  }
  return { default: FakeHls };
});

let container: HTMLDivElement;
let root: Root;
const play = () => container.querySelector<HTMLButtonElement>('[aria-label="Lire la bande-annonce"]');
const click = (element: HTMLElement) => act(async () => element.click());

beforeEach(() => {
  instances.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('HlsTrailerPlayer', () => {
  it('le clic sur ▶ affiche la vidéo et attache le flux', async () => {
    await act(async () => root.render(<HlsTrailerPlayer url="https://x/a.m3u8" pageUrl="https://x/page" />));
    expect(container.querySelector('video')).toBeNull();
    await click(play()!);
    expect(container.querySelector('video')).not.toBeNull();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.loadSource).toHaveBeenCalledWith('https://x/a.m3u8');
    expect(instances[0]!.attachMedia).toHaveBeenCalled();
  });

  it('erreur fatale : l’instance est détruite, ▶ revient et un second clic relance le chargement', async () => {
    await act(async () => root.render(<HlsTrailerPlayer url="https://x/a.m3u8" pageUrl="https://x/page" />));
    await click(play()!);
    await act(async () => instances[0]!.handlers['error']!('error', { fatal: true }));
    expect(instances[0]!.destroy).toHaveBeenCalled();
    expect(container.querySelector('video')).toBeNull();
    expect(play()).not.toBeNull();
    await click(play()!);
    expect(instances).toHaveLength(2);
    expect(instances[1]!.attachMedia).toHaveBeenCalled();
    expect(container.querySelector('video')).not.toBeNull();
  });
});
