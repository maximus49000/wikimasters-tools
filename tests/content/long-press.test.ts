import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLongPress } from '../../src/content/long-press';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createLongPress', () => {
  it('se déclenche après la durée et fait ignorer le clic suivant, une seule fois', () => {
    const onLong = vi.fn();
    const press = createLongPress(onLong, 500);
    press.start(10, 10);
    vi.advanceTimersByTime(499);
    expect(onLong).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLong).toHaveBeenCalledOnce();
    expect(press.consumeClick()).toBe(true);
    expect(press.consumeClick()).toBe(false);
  });

  it('un appui court ne déclenche rien et son clic passe', () => {
    const onLong = vi.fn();
    const press = createLongPress(onLong, 500);
    press.start(10, 10);
    vi.advanceTimersByTime(200);
    press.cancel();
    vi.advanceTimersByTime(1000);
    expect(onLong).not.toHaveBeenCalled();
    expect(press.consumeClick()).toBe(false);
  });

  it('un déplacement de plus de 10 px (défilement) annule, un petit tremblement non', () => {
    const onLong = vi.fn();
    const press = createLongPress(onLong, 500);
    press.start(0, 0);
    press.move(4, 3);
    vi.advanceTimersByTime(500);
    expect(onLong).toHaveBeenCalledOnce();

    const scrolled = vi.fn();
    const other = createLongPress(scrolled, 500);
    other.start(0, 0);
    other.move(0, 25);
    vi.advanceTimersByTime(1000);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it('un nouvel appui repart de zéro', () => {
    const onLong = vi.fn();
    const press = createLongPress(onLong, 500);
    press.start(0, 0);
    vi.advanceTimersByTime(400);
    press.start(0, 0);
    vi.advanceTimersByTime(400);
    expect(onLong).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onLong).toHaveBeenCalledOnce();
  });
});
