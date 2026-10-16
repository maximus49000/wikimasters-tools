// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicNotes, NOTE_EVERY_MS, NOTE_LIFE_MS, NOTE_INK, noteTiming } from '../../src/content/hifi/music-notes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const anchor = { x: 200, y: 300, w: 80 };
const ACCENT = '#C0504D';
let root: Root;
let container: HTMLElement;

function render(active: boolean, reduced = false, bpm: number | null = null) {
  act(() => {
    root.render(<svg><MusicNotes anchor={anchor} active={active} accent={ACCENT} reduced={reduced} bpm={bpm} /></svg>);
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

  it('noteTiming : 120 BPM = rythme actuel, borné à [60, 180], inconnu = 120', () => {
    expect(noteTiming(120)).toEqual({ everyMs: 700, lifeMs: 3400 });
    expect(noteTiming(60)).toEqual({ everyMs: 1400, lifeMs: 6800 });
    expect(noteTiming(180).everyMs).toBeCloseTo(466.67, 1);
    expect(noteTiming(180).lifeMs).toBeCloseTo(2266.67, 1);
    expect(noteTiming(240)).toEqual(noteTiming(180));
    expect(noteTiming(30)).toEqual(noteTiming(60));
    expect(noteTiming(null)).toEqual(noteTiming(120));
  });

  it('60 BPM : une note après 1400 ms (pas 700), retirée après 6800 ms, animation de 6800 ms', () => {
    render(true, false, 60);
    tick(700);
    expect(notes()).toHaveLength(0);
    tick(700);
    expect(notes()).toHaveLength(1);
    expect(container.querySelector<SVGGElement>('[data-music-note] > g')!.style.animation).toContain('6800ms');
    tick(6799);
    expect(notes().length).toBeGreaterThan(0);
    // naissances à 1400, 2800, 4200, 5600, 7000 ; la première part à 8200 (1400 + 6800).
    tick(8200 - 1400 - 6799);
    expect(notes().map((n) => n.getAttribute('data-x'))).toHaveLength(4);
  });

  it('passage de 60 à 180 BPM : la note suivante naît 467 ms après la précédente', () => {
    render(true, false, 60);
    tick(1400);
    expect(notes()).toHaveLength(1);
    tick(100);
    render(true, false, 180);
    tick(366);
    expect(notes()).toHaveLength(1);
    tick(1);
    expect(notes()).toHaveLength(2);
    const anims = [...container.querySelectorAll<SVGGElement>('[data-music-note] > g')].map((g) => g.style.animation);
    expect(anims[0]).toContain('6800ms');
    expect(anims[1]).toContain('2267ms');
  });

  it('moment déjà passé après un changement de BPM : naissance immédiate', () => {
    render(true, false, 60);
    tick(1400);
    tick(900);
    render(true, false, 180);
    tick(0);
    expect(notes()).toHaveLength(2);
  });
});
