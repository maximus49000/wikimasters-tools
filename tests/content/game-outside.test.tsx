// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameBox } from '../../src/content/game-box-service';
import { GameOutside, MadeBack } from '../../src/content/opened-item/game-outside';
import { gameGeometry, ItemCase } from '../../src/content/opened-item/item-case';
import { BOX_FORMATS, caseStyleOfPlatformName } from '../../src/core/game/platform-boxes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RDR2: GameBox = {
  format: 'bluray', style: caseStyleOfPlatformName('Sony Playstation 4'), platformName: 'Sony Playstation 4',
  frontUrl: 'https://img/front.jpg', backUrl: 'https://img/back.jpg', shots: [], title: 'Red Dead Redemption 2', studio: 'Rockstar',
};
const HOLLOW: GameBox = {
  format: 'switch', style: caseStyleOfPlatformName('Nintendo Switch'), platformName: 'Nintendo Switch',
  frontUrl: 'https://img/hk.jpg', shots: [], title: 'Hollow Knight', summary: 'Sous la ville déchue d’Hallownest, un chevalier explore un royaume oublié.',
};

let container: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(() => root.render(el));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('GameOutside (face extérieure de la boîte retournée)', () => {
  it('dos, tranche, devant dans cet ordre ; la tranche a l’épaisseur du gabarit', () => {
    render(<GameOutside box={RDR2} geometry={gameGeometry('bluray')} onMagnify={vi.fn()} />);
    const zones = [...container.querySelectorAll<HTMLElement>('[data-outside-zone]')];
    expect(zones.map((z) => z.dataset.outsideZone)).toEqual(['back', 'spine', 'front']);
    const g = gameGeometry('bluray');
    const d = BOX_FORMATS.bluray.d * 10;
    expect(parseFloat(zones[1]!.style.width)).toBeCloseTo((d / (2 * g.w + d)) * 100, 1);
    expect(parseFloat(zones[0]!.style.width)).toBeCloseTo((g.w / (2 * g.w + d)) * 100, 1);
    // Tranche : celle de la tâche 7b (bandeau PS4).
    expect(zones[1]!.querySelector('[data-spine-logo-mark], [data-spine-band-label]')).not.toBeNull();
    expect(zones[0]!.querySelector('image')!.getAttribute('href')).toBe('https://img/back.jpg');
    expect(zones[2]!.querySelector('image')!.getAttribute('href')).toBe('https://img/front.jpg');
    expect(container.querySelector('[data-made-back]')).toBeNull();
  });
  it('sans dos scanné ni captures : dos fabriqué avec le titre et la description (Review Focus 3)', () => {
    render(<GameOutside box={HOLLOW} geometry={gameGeometry('switch')} onMagnify={vi.fn()} />);
    const made = container.querySelector('[data-outside-zone="back"] [data-made-back]')!;
    expect(made).not.toBeNull();
    expect(made.querySelector('[data-made-back-title]')!.textContent).toContain('Hollow Knight');
    expect(made.querySelector('[data-made-back-summary]')!.textContent).toContain('Hallownest');
    expect(made.querySelectorAll('[data-made-back-shot]')).toHaveLength(0);
  });
  it('toucher le dos appelle la loupe', () => {
    const onMagnify = vi.fn();
    render(<GameOutside box={RDR2} geometry={gameGeometry('bluray')} onMagnify={onMagnify} />);
    act(() => container.querySelector<HTMLElement>('[data-outside-zone="back"]')!.click());
    expect(onMagnify).toHaveBeenCalledTimes(1);
  });
});

describe('MadeBack (dos fabriqué)', () => {
  it('bandeau console, logo à la place du titre, au plus 4 captures', () => {
    const box: GameBox = { ...HOLLOW, logoUrl: 'https://img/logo.png', shots: ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => `https://img/${s}.jpg`) };
    render(<svg><MadeBack box={box} /></svg>);
    expect(container.querySelector('[data-made-back-band]')!.textContent).toBe('Switch');
    expect(container.querySelector('[data-made-back-logo]')!.getAttribute('href')).toBe('https://img/logo.png');
    expect(container.querySelector('[data-made-back-title]')).toBeNull();
    expect(container.querySelectorAll('[data-made-back-shot]')).toHaveLength(4);
  });
  it('PS4 : bandeau à la couleur de la console', () => {
    render(<svg><MadeBack box={{ ...RDR2, backUrl: undefined }} /></svg>);
    expect(container.querySelector('[data-made-back-band]')!.textContent).toBe('PS4');
    expect(container.querySelector('[data-made-back-band-rect]')!.getAttribute('fill')).toBe('#1F4C9E');
  });
});

describe('ItemCase retourné', () => {
  const outside = <div data-test-outside="" />;
  const draw = (flipped: boolean, reduced = false, phase: 'open' | 'closing' = 'open') => render(
    <ItemCase opening="game-case" format="bluray" phase={phase} from={null} to={null} cover={null} color="#c33" title="RDR2" disc="in"
      reduced={reduced} selector={null} outside={outside} flipped={flipped} />,
  );
  const flipper = () => container.querySelector<HTMLElement>('[data-case-flipper]')!;
  it('pivote d’un demi-tour autour de la charnière en 700 ms', () => {
    draw(false);
    expect(flipper().style.transform).toContain('rotateY(0deg)');
    draw(true);
    expect(container.querySelector('[data-item-case]')!.getAttribute('data-flipped')).toBe('true');
    expect(flipper().style.transform).toContain('rotateY(180deg)');
    expect(flipper().style.transition).toContain('700ms');
    expect(container.querySelector('[data-case-outside] [data-test-outside]')).not.toBeNull();
  });
  it('mouvement réduit : fondu, pas de pivot', () => {
    draw(true, true);
    expect(flipper().style.transform ?? '').not.toContain('rotateY');
    const out = container.querySelector<HTMLElement>('[data-case-outside]')!;
    expect(out.style.opacity).toBe('1');
    expect(out.style.transition).toContain('opacity');
    expect(container.querySelector<HTMLElement>('[data-case-tray]')!.style.opacity).toBe('0');
  });
  it('fermeture depuis l’extérieur : retour à l’intérieur sans animation', () => {
    draw(true);
    draw(true, false, 'closing');
    expect(container.querySelector('[data-item-case]')!.getAttribute('data-flipped')).toBe('false');
    expect(flipper().style.transform).toContain('rotateY(0deg)');
    expect(flipper().style.transition).toBe('none');
  });
});
