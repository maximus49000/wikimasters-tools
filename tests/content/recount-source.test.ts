import { describe, expect, it, vi } from 'vitest';
import { createRecountSource } from '../../src/content/recount-source';
import type { ScanState } from '../../src/core/collection/collection-scan';

const state = (status: ScanState['status'], error?: string): ScanState => ({ status, nextPage: 0, entries: 0, updatedAt: 0, ...(error ? { error } : {}) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRecountSource', () => {
  it('est en cours le temps du recomptage, puis rend la main sans erreur', async () => {
    let finish: (value: ScanState) => void = () => undefined;
    const task = vi.fn(() => new Promise<ScanState>((resolve) => (finish = resolve)));
    const source = createRecountSource(task);
    const onChange = vi.fn();
    source.subscribe(onChange);

    expect(source.current()).toEqual({ running: false, error: null });
    source.start();
    expect(source.current()).toEqual({ running: true, error: null });
    finish(state('done'));
    await settle();
    expect(source.current()).toEqual({ running: false, error: null });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ne lance pas un second recomptage pendant le premier', () => {
    const task = vi.fn(() => new Promise<ScanState>(() => undefined));
    const source = createRecountSource(task);
    source.start();
    source.start();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('garde l’erreur d’un scan interrompu, et l’efface au recomptage suivant', async () => {
    const task = vi.fn().mockResolvedValueOnce(state('error', 'HTTP 500')).mockResolvedValueOnce(state('done'));
    const source = createRecountSource(task);
    source.start();
    await settle();
    expect(source.current()).toEqual({ running: false, error: 'HTTP 500' });
    source.start();
    expect(source.current().error).toBeNull();
    await settle();
    expect(source.current()).toEqual({ running: false, error: null });
  });

  it('rapporte aussi une erreur levée par le recomptage lui-même', async () => {
    const source = createRecountSource(() => Promise.reject(new Error('réseau')));
    source.start();
    await settle();
    expect(source.current()).toEqual({ running: false, error: 'réseau' });
  });
});
