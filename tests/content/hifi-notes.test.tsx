// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicNotes, NOTE_EVERY_MS, NOTE_LIFE_MS, NOTE_INK } from '../../src/content/hifi/music-notes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const anchor = { x: 200, y: 300, w: 80 };
const ACCENT = '#C0504D';
let root: Root;
let container: HTMLElement;

function render(active: boolean, reduced = false) {
  act(() => {
    root.render(<svg><MusicNotes anchor={anchor} active={active} accent={ACCENT} reduced={reduced} /></svg>);
  });
}
const notes = () => [...container.querySelectorAll('[data-music-note]')];
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('notes de musique au-dessus du poste', () => {
  it('une note toutes les 700 ms, chacune retirée après 3400 ms', () => {
    expect(NOTE_EVERY_MS).toBe(700);
    expect(NOTE_LIFE_MS).toBe(3400);
    render(true);
    expect(notes()).toHaveLength(0);
    tick(700);
    expect(notes()).toHaveLength(1);
    tick(700);
    expect(notes()).toHaveLength(2);
    // 4 100 ms : la première (née à 700) s'efface ; nées à 1 400, 2 100, 2 800, 3 500.
    tick(4100 - 1400);
    expect(notes()).toHaveLength(4);
  });

  it('chaque note part au-dessus du haut du poste, dans sa largeur, sans capter les touchers', () => {
    render(true);
    tick(700 * 4);
    for (const n of notes()) {
      expect(Number(n.getAttribute('data-y'))).toBeLessThan(anchor.y);
      const x = Number(n.getAttribute('data-x'));
      expect(x).toBeGreaterThanOrEqual(anchor.x);
      expect(x).toBeLessThanOrEqual(anchor.x + anchor.w);
    }
    expect(container.querySelector('[data-music-notes]')!.getAttribute('pointer-events')).toBe('none');
  });

  it('couleurs : encre ou couleur de la pochette (environ une sur quatre)', () => {
    render(true);
    tick(700 * 4);
    const colors = notes().map((n) => n.getAttribute('data-color'));
    for (const c of colors) expect([NOTE_INK, ACCENT]).toContain(c);
    expect(NOTE_INK).toBe('#2C2C2A');
    expect(colors.filter((c) => c === ACCENT)).toHaveLength(1);
  });

  it('pause : plus aucune nouvelle note, celles en vol finissent leur course', () => {
    render(true);
    tick(1400);
    expect(notes()).toHaveLength(2);
    render(false);
    tick(700);
    expect(notes()).toHaveLength(2);
    tick(3400);
    expect(notes()).toHaveLength(0);
  });

  it('mouvement réduit : aucune note', () => {
    render(true, true);
    tick(700 * 5);
    expect(notes()).toHaveLength(0);
  });
});
