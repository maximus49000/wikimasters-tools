import { describe, expect, it, vi } from 'vitest';
import { createPlatformSetting } from '../../../src/core/music/platform';

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [['wmt:musicPlatform', initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe('createPlatformSetting', () => {
  it('vaut Spotify par défaut et pour une valeur inconnue', () => {
    expect(createPlatformSetting(memory()).current()).toBe('spotify');
    expect(createPlatformSetting(memory('deezer')).current()).toBe('spotify');
  });

  it('retrouve le choix mémorisé', () => {
    expect(createPlatformSetting(memory('tidal')).current()).toBe('tidal');
  });

  it('mémorise le choix et prévient les abonnés une seule fois par changement', () => {
    const storage = memory();
    const setting = createPlatformSetting(storage);
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.set('tidal');
    setting.set('tidal');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createPlatformSetting(storage).current()).toBe('tidal');
  });

  it('se désabonne, et résiste à un stockage inaccessible', () => {
    const broken = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    const setting = createPlatformSetting(broken);
    expect(setting.current()).toBe('spotify');
    const listener = vi.fn();
    const off = setting.subscribe(listener);
    off();
    setting.set('tidal');
    expect(setting.current()).toBe('tidal');
    expect(listener).not.toHaveBeenCalled();
  });
});
