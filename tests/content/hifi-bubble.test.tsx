// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HifiBubble } from '../../src/content/hifi/HifiBubble';
import { setPlayerSource } from '../../src/content/music-registry';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';
import { hiddenAtHome, hifiState } from '../../src/core/library/hifi';
import type { Layout } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = (playing: boolean) => ({ uri: 'u', title: 'One More Time', artist: 'Daft Punk', imageUrl: null, playing });
const viewOf = (playing: boolean | null, withCard = true): PlayerView => ({ linked: true, hidden: false, enabled: true, card: withCard ? { slug: 'Daft_Punk', title: 'Discovery' } : null, track: playing === null ? null : track(playing) });

let root: Root | null = null;
let container: HTMLElement;
const toggle = vi.fn(async () => undefined);
const setCard = vi.fn();
function mount(view: PlayerView, onClose = vi.fn(), onEject = vi.fn()) {
  setPlayerSource({ current: () => view, subscribe: () => () => undefined, toggle, setCard } as unknown as PlayerSource);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<HifiBubble view={view} albumTitle="Discovery" onClose={onClose} onEject={onEject} />));
  return { onClose, onEject };
}
const btn = (a: string) => container.querySelector<HTMLButtonElement>(`[data-action="${a}"]`);
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); setPlayerSource(null); toggle.mockClear(); setCard.mockClear(); });

describe('bulle de la chaîne hi-fi', () => {
  it('montre la piste, l’artiste et l’album', () => {
    mount(viewOf(true));
    expect(container.textContent).toContain('One More Time');
    expect(container.textContent).toContain('Daft Punk');
    expect(container.textContent).toContain('Discovery');
    expect(btn('toggle')!.getAttribute('aria-label')).toBe('Lecture / pause');
    expect(btn('eject')!.getAttribute('title')).toBe('Éjecter le disque');
  });
  it('⏯ bascule la lecture', () => {
    mount(viewOf(true));
    act(() => btn('toggle')!.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(setCard).not.toHaveBeenCalled();
  });
  it('⏏ met en pause puis retire la carte : l’objet revient à sa place', () => {
    const { onEject } = mount(viewOf(true));
    act(() => btn('eject')!.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(setCard).toHaveBeenCalledWith(null);
    expect(toggle.mock.invocationCallOrder[0]).toBeLessThan(setCard.mock.invocationCallOrder[0]!);
    expect(onEject).toHaveBeenCalled();
    const layout: Layout = [{ id: 'd', kind: 'desk', col: 12, row: 10 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', slot: 0 }, { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' }];
    expect(hiddenAtHome(hifiState(layout, { card: { slug: 'Daft_Punk' }, track: { playing: true } })).size).toBe(1);
    expect(hiddenAtHome(hifiState(layout, { card: null, track: null })).size).toBe(0);
  });
  it('⏏ en pause : pas de bascule, seulement la carte retirée', () => {
    mount(viewOf(false));
    act(() => btn('eject')!.click());
    expect(toggle).not.toHaveBeenCalled();
    expect(setCard).toHaveBeenCalledWith(null);
  });
  it('disque au poste sans piste (Tidal, Spotify à l’arrêt) : titre de l’album, ⏏ sans ⏯', () => {
    const { onEject } = mount(viewOf(null));
    expect(container.textContent).toContain('Discovery');
    expect(container.textContent).toContain('Rien en lecture');
    expect(btn('toggle')).toBeNull();
    act(() => btn('eject')!.click());
    expect(toggle).not.toHaveBeenCalled();
    expect(setCard).toHaveBeenCalledWith(null);
    expect(onEject).toHaveBeenCalled();
  });
  it('rien en lecture ni disque : message et ✕ seulement', () => {
    const { onClose } = mount(viewOf(null, false));
    expect(container.textContent).toContain('Rien en lecture');
    expect(btn('toggle')).toBeNull();
    expect(btn('eject')).toBeNull();
    act(() => btn('close')!.click());
    expect(onClose).toHaveBeenCalled();
  });
  it('Échap ferme la bulle', () => {
    const { onClose } = mount(viewOf(true));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalled();
  });
});
