// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnomalyDialog } from '../../src/content/AnomalyDialog';
import { ANOMALY_SETTING_ATTRIBUTE, decorateAnomalySetting } from '../../src/content/anomaly-setting-menu';
import { decorateUpdateSetting } from '../../src/content/update-setting-menu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('entrée de menu', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a><a href="/x">Autre</a></div>';
  });
  it('se pose une seule fois, sous Paramètres, et ouvre la fenêtre', () => {
    const open = vi.fn();
    expect(decorateAnomalySetting(document, open)).toBe(1);
    expect(decorateAnomalySetting(document, open)).toBe(0);
    decorateUpdateSetting(document, () => undefined);
    expect(decorateAnomalySetting(document, open)).toBe(0);
    const entry = document.querySelector<HTMLElement>(`[${ANOMALY_SETTING_ATTRIBUTE}]`)!;
    expect(entry.textContent).toBe('Remonter une anomalie');
    entry.click();
    expect(open).toHaveBeenCalledOnce();
  });
});

describe('AnomalyDialog', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  const render = async (props: Partial<Parameters<typeof AnomalyDialog>[0]> = {}) => {
    const send = vi.fn().mockResolvedValue({ ok: true, number: 12, url: '' });
    const onClose = vi.fn();
    await act(async () => createRoot(container).render(<AnomalyDialog profileName="joueur" send={send} onClose={onClose} {...props} />));
    return { send, onClose };
  };
  const type = async (text: string) => {
    const area = container.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(area, text);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = (label: string) => act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click());

  it('Envoyer est bloqué tant que la description est vide', async () => {
    await render();
    expect([...container.querySelectorAll('button')].find((b) => b.textContent === 'Envoyer')!.disabled).toBe(true);
  });
  it('envoie avec le nom (case cochée par défaut) puis affiche le numéro', async () => {
    const { send } = await render();
    await type('Le bouton plante');
    await click('Envoyer');
    expect(send).toHaveBeenCalledWith('Le bouton plante', 'joueur');
    expect(container.textContent).toContain('Anomalie n° 12');
  });
  it('envoie sans nom si la case est décochée', async () => {
    const { send } = await render();
    await type('Bug');
    await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await click('Envoyer');
    expect(send).toHaveBeenCalledWith('Bug', null);
  });
  it('désactive la case quand le nom est inconnu', async () => {
    await render({ profileName: null });
    expect(container.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
  });
  it('garde le texte et affiche l’erreur en cas d’échec', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: 'Envoi impossible' });
    await render({ send });
    await type('Bug');
    await click('Envoyer');
    expect(container.textContent).toContain('Envoi impossible');
    expect(container.querySelector('textarea')!.value).toBe('Bug');
  });
  it('Annuler ferme sans envoyer', async () => {
    const { send, onClose } = await render();
    await click('Annuler');
    expect(onClose).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
