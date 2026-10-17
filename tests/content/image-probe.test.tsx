// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureImage, resetImageProbes, useImageProbe, usableImage } from '../../src/content/image-probe';

// Image factice : chaque image créée est gardée pour déclencher son chargement ou son échec.
class FakeImage {
  static made: FakeImage[] = [];
  referrerPolicy = '';
  src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.made.push(this);
  }
}

describe('image-probe', () => {
  beforeEach(() => {
    FakeImage.made = [];
    resetImageProbes();
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('essaie une adresse une seule fois ; utilisable tant qu’elle n’a pas échoué', () => {
    expect(usableImage('https://a/1.jpg')).toBe(true);
    expect(usableImage('https://a/1.jpg')).toBe(true);
    expect(FakeImage.made).toHaveLength(1);
    expect(FakeImage.made[0]?.src).toBe('https://a/1.jpg');
    expect(FakeImage.made[0]?.referrerPolicy).toBe('no-referrer');
    FakeImage.made[0]?.onload?.();
    expect(usableImage('https://a/1.jpg')).toBe(true);
  });

  it('une adresse en échec est sautée et redessine les composants abonnés', () => {
    const seen: number[] = [];
    function Probe() {
      seen.push(useImageProbe());
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    usableImage('https://a/404.jpg');
    act(() => FakeImage.made[0]?.onerror?.());
    expect(usableImage('https://a/404.jpg')).toBe(false);
    expect(seen.at(-1)).toBe(seen[0]! + 1);
    act(() => root.unmount());
  });

  it('measureImage : taille réelle à la fin du chargement, null en cas d’échec', async () => {
    const size = measureImage('https://a/b.jpg');
    const img = FakeImage.made[0]!;
    img.naturalWidth = 1540;
    img.naturalHeight = 720;
    img.onload?.();
    expect(await size).toEqual({ w: 1540, h: 720 });
    const failed = measureImage('https://a/404.jpg');
    FakeImage.made[1]?.onerror?.();
    expect(await failed).toBeNull();
  });
});
