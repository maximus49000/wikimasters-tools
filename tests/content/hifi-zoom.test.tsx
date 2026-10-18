// @vitest-environment jsdom
// Zoom de la chaîne hi-fi : pochette debout, CD qui tourne dans le puits (arrêté en pause), afficheur, commandes ⏸/▶ ⏏ ⓘ ✕
// (reprises de l'ancienne bulle du lecteur).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HifiZoom } from '../../src/content/hifi/HifiZoom';
import { setPlayerSource } from '../../src/content/music-registry';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';
import { hiddenAtHome, hifiState } from '../../src/core/library/hifi';
import type { Layout } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMG = 'data:image/png;base64,AAAA';
const LAYOUT: Layout = [
  { id: 'd', kind: 'desk', col: 12, row: 10 },
  { id: 'h', kind: 'small', item: 'hifi', hostId: 'd', x: 10, z: 2.5 },
  { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
  { id: 's', kind: 'shelf', col: 2, row: 4 },
];
const track = (playing: boolean) => ({ uri: 'u', title: 'One More Time', artist: 'Daft Punk', imageUrl: null, playing });
const viewOf = (playing: boolean | null, withCard = true): PlayerView => ({ linked: true, hidden: false, enabled: true, card: withCard ? { slug: 'Daft_Punk', title: 'Discovery' } : null, track: playing === null ? null : track(playing) });

let root: Root | null = null;
let container: HTMLElement;
const toggle = vi.fn(async () => undefined);
const setCard = vi.fn();
function mount(view: PlayerView, extra: { onInfo?: (slug: string) => void } = {}, layout: Layout = LAYOUT) {
  const onClose = vi.fn();
  const onEject = vi.fn();
  setPlayerSource({ current: () => view, subscribe: () => () => undefined, toggle, setCard } as unknown as PlayerSource);
  Object.assign(window, { innerWidth: 800, innerHeight: 400 });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<HifiZoom layout={layout} room={{ style: 'scandinave' }} view={view} albumTitle="Discovery" imageOf={() => IMG} onClose={onClose} onEject={onEject} {...extra} />));
  return { onClose, onEject };
}
const btn = (a: string) => container.querySelector<HTMLButtonElement>(`[data-hifi-zoom] [data-action="${a}"]`);
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); setPlayerSource(null); toggle.mockClear(); setCard.mockClear(); });

describe('zoom de la chaîne hi-fi', () => {
  it('en lecture : pochette debout, le CD tourne, l’afficheur fait défiler la piste', () => {
    mount(viewOf(true));
    const zoom = container.querySelector('[data-hifi-zoom]')!;
    expect(zoom).not.toBeNull();
    expect(zoom.querySelector('[data-hifi-disc]')!.getAttribute('data-spinning')).toBe('true');
    expect(zoom.querySelector('[data-hifi-display]')!.textContent).toContain('One More Time');
    const sleeve = zoom.querySelector('[data-hifi-sleeve-stand]')!;
    expect(sleeve.getAttribute('data-hifi-sleeve-stand')).toBe('Daft_Punk');
    expect(sleeve.querySelector('image')!.getAttribute('href')).toBe(IMG);
  });
  it('la pochette choisie pour l’objet passe devant l’image de la carte', () => {
    const chosen = 'data:image/png;base64,CHOSEN';
    const layout = LAYOUT.map((p) => (p.id === 'a' ? { ...p, cover: chosen } : p)) as Layout;
    mount(viewOf(true), {}, layout);
    expect(container.querySelector('[data-hifi-sleeve-stand] image')!.getAttribute('href')).toBe(chosen);
  });
  it('en pause : le disque s’arrête', () => {
    mount(viewOf(false));
    expect(container.querySelector('[data-hifi-zoom] [data-hifi-disc]')!.getAttribute('data-spinning')).toBe('false');
  });
  it('commandes en glyphes : ⏸/▶, ⏏, ⓘ, ✕ (aria-label et title en français)', () => {
    mount(viewOf(true), { onInfo: vi.fn() });
    expect(btn('toggle')!.getAttribute('aria-label')).toBe('Lecture / pause');
    expect(btn('toggle')!.textContent).toBe('⏸');
    expect(btn('eject')!.getAttribute('title')).toBe('Éjecter le disque');
    expect(btn('eject')!.textContent).toBe('⏏');
    expect(btn('info')!.getAttribute('aria-label')).toBe('Fiche de la carte');
    expect(btn('info')!.textContent).toBe('ⓘ');
    expect(btn('close')!.getAttribute('aria-label')).toBe('Fermer');
    expect(btn('close')!.textContent).toBe('✕');
    expect(container.textContent).toContain('Daft Punk');
    expect(container.textContent).toContain('Discovery');
  });
  it('en pause, ▶ relance', () => {
    mount(viewOf(false));
    expect(btn('toggle')!.textContent).toBe('▶');
    act(() => btn('toggle')!.click());
    expect(toggle).toHaveBeenCalledTimes(1);
  });
  it('⏸ bascule la lecture sans retirer la carte', () => {
    mount(viewOf(true));
    act(() => btn('toggle')!.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(setCard).not.toHaveBeenCalled();
  });
  it('ⓘ ouvre la fiche de la carte en lecture', () => {
    const onInfo = vi.fn();
    mount(viewOf(true), { onInfo });
    act(() => btn('info')!.click());
    expect(onInfo).toHaveBeenCalledWith('Daft_Punk');
  });
  it('⏏ met en pause puis retire la carte : l’objet revient à sa place', () => {
    const { onEject } = mount(viewOf(true));
    act(() => btn('eject')!.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(setCard).toHaveBeenCalledWith(null);
    expect(toggle.mock.invocationCallOrder[0]).toBeLessThan(setCard.mock.invocationCallOrder[0]!);
    expect(onEject).toHaveBeenCalled();
    expect(hiddenAtHome(hifiState(LAYOUT, { card: { slug: 'Daft_Punk' }, track: { playing: true } })).size).toBe(1);
    expect(hiddenAtHome(hifiState(LAYOUT, { card: null, track: null })).size).toBe(0);
  });
  it('⏏ en pause : pas de bascule, seulement la carte retirée', () => {
    mount(viewOf(false));
    act(() => btn('eject')!.click());
    expect(toggle).not.toHaveBeenCalled();
    expect(setCard).toHaveBeenCalledWith(null);
  });
  it('disque au poste sans piste (Tidal, Spotify à l’arrêt) : titre de l’album, ⏏ sans ⏸/▶', () => {
    const { onEject } = mount(viewOf(null));
    expect(container.textContent).toContain('Discovery');
    expect(container.textContent).toContain('Rien en lecture');
    expect(btn('toggle')).toBeNull();
    act(() => btn('eject')!.click());
    expect(toggle).not.toHaveBeenCalled();
    expect(setCard).toHaveBeenCalledWith(null);
    expect(onEject).toHaveBeenCalled();
  });
  it('rien en lecture ni disque : message, poste vide, ✕ seulement', () => {
    const { onClose } = mount(viewOf(null, false), { onInfo: vi.fn() });
    expect(container.textContent).toContain('Rien en lecture');
    expect(container.querySelector('[data-hifi-zoom] [data-hifi-disc]')).toBeNull();
    expect(container.querySelector('[data-hifi-sleeve-stand]')).toBeNull();
    expect(btn('toggle')).toBeNull();
    expect(btn('eject')).toBeNull();
    expect(btn('info')).toBeNull();
    act(() => btn('close')!.click());
    expect(onClose).toHaveBeenCalled();
  });
  it('Échap ferme le zoom', () => {
    const { onClose } = mount(viewOf(true));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalled();
  });
});
