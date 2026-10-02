// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setPlatformChoice } from '../../src/content/music-registry';
import { usePlatform } from '../../src/content/usePlatform';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [['wmt:musicPlatform', initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

function Show() {
  return <span>{usePlatform()}</span>;
}

async function shown(): Promise<string> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Show />));
  const text = container.textContent ?? '';
  await act(async () => root.unmount());
  return text;
}

afterEach(() => setPlatformChoice(null));

describe('usePlatform', () => {
  it('vaut Spotify sans choix enregistré', async () => {
    expect(await shown()).toBe('spotify');
  });

  it('rend la plateforme choisie quand elle est disponible, Spotify sinon', async () => {
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting(memory('tidal')) });
    expect(await shown()).toBe('tidal');
    setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(memory('tidal')) });
    expect(await shown()).toBe('spotify');
  });
});
