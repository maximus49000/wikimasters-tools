import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibraryState, setWeatherSetting } from '../../../src/core/library/library-book';

describe('réglage météo', () => {
  it('démarre en aléatoire, version 5', () => {
    const state = createInitialState();
    expect(state.version).toBe(5);
    expect(state.weather).toEqual({ mode: 'random' });
  });
  it('change de réglage', () => {
    const state = setWeatherSetting(createInitialState(), { mode: 'forced', state: 'storm' });
    expect(state.weather).toEqual({ mode: 'forced', state: 'storm' });
    expect(setWeatherSetting(state, { mode: 'real' }).weather).toEqual({ mode: 'real' });
  });
  it('migre un état v4 en ajoutant la météo aléatoire', () => {
    const v4 = { ...createInitialState(), version: 4 } as Record<string, unknown>;
    delete v4.weather;
    const parsed = parseLibraryState(v4);
    expect(parsed.version).toBe(5);
    expect(parsed.weather).toEqual({ mode: 'random' });
  });
  it('relit un réglage forcé valide', () => {
    const ok = setWeatherSetting(createInitialState(), { mode: 'forced', state: 'snow' });
    expect(parseLibraryState(ok).weather).toEqual({ mode: 'forced', state: 'snow' });
  });
  it('refuse un état forcé sur un état inconnu (retour à l état initial)', () => {
    const bad = { ...createInitialState(), weather: { mode: 'forced', state: 'tornado' } };
    expect(parseLibraryState(bad)).toEqual(createInitialState());
  });
});
