// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateImageSetting, IMAGE_SETTING_ATTRIBUTE } from '../../src/content/image-setting-menu';
import { decoratePlayerSetting, PLAYER_SETTING_ATTRIBUTE } from '../../src/content/player-setting-menu';

const MENU = '<div><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a></div>';

describe('decoratePlayerSetting', () => {
  beforeEach(() => {
    document.body.innerHTML = MENU;
  });

  it('ajoute « Lecteur » sous « Paramètre d’image », une seule fois', () => {
    decorateImageSetting(document, () => undefined);
    expect(decoratePlayerSetting(document, () => undefined)).toBe(1);
    expect(decoratePlayerSetting(document, () => undefined)).toBe(0);
    const entry = document.querySelector(`[${PLAYER_SETTING_ATTRIBUTE}]`);
    expect(entry?.previousElementSibling?.hasAttribute(IMAGE_SETTING_ATTRIBUTE)).toBe(true);
    expect(entry?.textContent).toBe('Lecteur');
    expect(document.querySelectorAll(`[${IMAGE_SETTING_ATTRIBUTE}]`)).toHaveLength(1);
  });
  it('se pose sous « Paramètres » sans réglage d’image, et ouvre le réglage au clic', () => {
    const open = vi.fn();
    decoratePlayerSetting(document, open);
    const entry = document.querySelector(`[${PLAYER_SETTING_ATTRIBUTE}]`);
    expect(entry?.previousElementSibling?.getAttribute('href')).toBe('/settings');
    entry?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
