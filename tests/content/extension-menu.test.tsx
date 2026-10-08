// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateAnomalySetting } from '../../src/content/anomaly-setting-menu';
import { EXTENSION_SETTING_ATTRIBUTE, decorateExtensionSetting } from '../../src/content/extension-setting-menu';
import { WIKIHOW_SETTING_ATTRIBUTE, decorateWikiHowSetting } from '../../src/content/wikihow-menu';
import { ExtensionSettings } from '../../src/content/ExtensionSettings';

import { createPurchaseAds } from '../../src/core/ads/purchase-ads';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe('entrées de Plus', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a><a href="/x">Autre</a></div>';
  });
  it('« Paramètre d’extension » puis « WikiHow » se posent une seule fois, dans cet ordre, avant l’anomalie', () => {
    const open = vi.fn();
    expect(decorateExtensionSetting(document, open)).toBe(1);
    expect(decorateExtensionSetting(document, open)).toBe(0);
    expect(decorateWikiHowSetting(document, open)).toBe(1);
    expect(decorateWikiHowSetting(document, open)).toBe(0);
    decorateAnomalySetting(document, () => undefined);
    const labels = [...document.querySelectorAll('.row')].map((e) => e.textContent);
    expect(labels).toEqual(['Paramètres', 'Paramètre d’extension', 'WikiHow', 'Remonter une anomalie']);
    document.querySelector<HTMLElement>(`[${EXTENSION_SETTING_ATTRIBUTE}]`)!.click();
    document.querySelector<HTMLElement>(`[${WIKIHOW_SETTING_ATTRIBUTE}]`)!.click();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('ExtensionSettings', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  it('liste Images et n’affiche pas WikiHow ; sans lecteur, pas de ligne Lecteur', () => {
    act(() => root.render(<ExtensionSettings images={null as never} player={null} ads={createPurchaseAds(memoryStorage())} telemetry={null as never} onClose={() => undefined} />));
    const text = container.textContent ?? '';
    expect(text).toContain('Paramètre d’extension');
    expect(text).toContain('Images');
    expect(text).toContain('Publicité d’achat');
    expect(text).toContain('Statistiques d’usage');
    expect(text).not.toContain('Lecteur');
    expect(text).not.toContain('WikiHow');
  });
});
