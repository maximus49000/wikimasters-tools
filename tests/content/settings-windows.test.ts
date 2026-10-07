import { describe, expect, it, vi } from 'vitest';
import { closeSettingsWindows, registerSettingsWindow, unregisterSettingsWindow } from '../../src/content/settings-windows';

describe('fenêtres de réglage ouvertes', () => {
  it('ferme toutes les fenêtres enregistrées, sauf celles à garder', () => {
    const settings = vi.fn();
    const ads = vi.fn();
    const tour = vi.fn();
    registerSettingsWindow('settings', settings);
    registerSettingsWindow('ads', ads);
    registerSettingsWindow('tour', tour);
    closeSettingsWindows(['tour']);
    expect(settings).toHaveBeenCalledOnce();
    expect(ads).toHaveBeenCalledOnce();
    expect(tour).not.toHaveBeenCalled();
    unregisterSettingsWindow('settings');
    unregisterSettingsWindow('ads');
    unregisterSettingsWindow('tour');
  });

  it('n’appelle plus une fenêtre désinscrite', () => {
    const close = vi.fn();
    registerSettingsWindow('x', close);
    unregisterSettingsWindow('x');
    closeSettingsWindows();
    expect(close).not.toHaveBeenCalled();
  });

  it('une fenêtre qui se ferme en cours de route ne gêne pas les autres', () => {
    const a = vi.fn(() => unregisterSettingsWindow('a'));
    const b = vi.fn();
    registerSettingsWindow('a', a);
    registerSettingsWindow('b', b);
    closeSettingsWindows();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    unregisterSettingsWindow('b');
  });
});
