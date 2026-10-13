// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacementBar } from '../../src/content/placement-bar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('PlacementBar', () => {
  it('✓ grisé quand refusé, ✗ toujours actif', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await act(async () => { root.render(<PlacementBar stage={null} scroll={null} targetId="f1" ok={false} onCancel={onCancel} onConfirm={onConfirm}><span data-extra /></PlacementBar>); });
    const confirm = container.querySelector<HTMLButtonElement>('[data-action="place-confirm"]')!;
    expect(confirm.disabled).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-action="place-cancel"]')!.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-extra]')).not.toBeNull();
  });

  it('✓ actif quand l’emplacement est valide', async () => {
    const onConfirm = vi.fn();
    await act(async () => { root.render(<PlacementBar stage={null} scroll={null} targetId="f1" ok onCancel={() => undefined} onConfirm={onConfirm}>{null}</PlacementBar>); });
    container.querySelector<HTMLButtonElement>('[data-action="place-confirm"]')!.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
