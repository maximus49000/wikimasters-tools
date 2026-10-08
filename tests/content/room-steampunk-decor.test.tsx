// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteampunkDecor } from '../../src/content/room-steampunk-decor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = () => new Date(2026, 9, 8, 3, 15, 0);

async function render(cols: number, now: () => Date = NOW) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => { root.render(<svg><SteampunkDecor cols={cols} wallH={340} now={now} /></svg>); });
  return { host, root };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('décor Steampunk', () => {
  it('dessine un tuyau vertical par section, une vanne, un manomètre et une horloge à l\'heure', async () => {
    const { host } = await render(24);
    const group = host.querySelector('[data-steampunk-decor]');
    expect(group).not.toBeNull();
    expect((group as SVGElement).style.pointerEvents).toBe('none');
    expect(host.querySelectorAll('[data-pipe="vertical"]')).toHaveLength(2);
    expect(host.querySelector('[data-valve]')).not.toBeNull();
    expect(host.querySelector('[data-gauge]')).not.toBeNull();
    expect(host.querySelector('[data-clock]')).not.toBeNull();
    expect(host.querySelector('[data-hand="minute"]')?.getAttribute('transform')).toMatch(/^rotate\(90 /);
    expect(host.querySelector('[data-hand="hour"]')?.getAttribute('transform')).toMatch(/^rotate\(97\.5 /);
    expect(host.querySelector('animate')).not.toBeNull();
    expect(host.querySelector('animateTransform')).not.toBeNull();
  });

  it('dessine quatre tuyaux verticaux pour 48 colonnes', async () => {
    const { host } = await render(48);
    expect(host.querySelectorAll('[data-pipe="vertical"]')).toHaveLength(4);
  });

  it('ne rend aucune animation sous mouvement réduit', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { host } = await render(24);
    expect(host.querySelector('[data-steampunk-decor]')).not.toBeNull();
    expect(host.querySelector('animate')).toBeNull();
    expect(host.querySelector('animateTransform')).toBeNull();
  });

  it('rafraîchit l\'horloge toutes les 30 s et nettoie son minuteur au démontage', async () => {
    vi.useFakeTimers();
    let minutes = 15;
    const { host, root } = await render(24, () => new Date(2026, 9, 8, 3, minutes, 0));
    minutes = 20;
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(host.querySelector('[data-hand="minute"]')?.getAttribute('transform')).toMatch(/^rotate\(120 /);
    await act(async () => { root.unmount(); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
