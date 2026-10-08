// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TelemetrySettings } from '../../src/content/TelemetrySettings';
import { createTelemetry } from '../../src/core/telemetry/telemetry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = () => {
  const data = new Map<string, string>();
  return createTelemetry({
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    send: () => undefined,
    now: () => 0,
    newId: () => '123e4567-e89b-42d3-a456-426614174000',
    platform: 'extension',
    channel: 'prod',
    version: '0.1.0+1',
    defaultEnabled: true,
  });
};
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

describe('TelemetrySettings', () => {
  it('montre l’état, explique ce qui est envoyé et bascule le réglage', () => {
    const telemetry = make();
    const host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    act(() => root!.render(<TelemetrySettings telemetry={telemetry} onClose={() => undefined} />));
    const explain = host.querySelector('[data-wmt-stats-explain]')!.textContent!;
    expect(explain).toContain('anonymes');
    expect(explain).toContain('erreurs');
    const [on, off] = [...host.querySelectorAll<HTMLButtonElement>('[data-wmt-stats-choice] button')];
    expect(on!.getAttribute('aria-pressed')).toBe('true');
    act(() => off!.click());
    expect(telemetry.enabled()).toBe(false);
    expect(off!.getAttribute('aria-pressed')).toBe('true');
    act(() => on!.click());
    expect(telemetry.enabled()).toBe(true);
  });
});
