import { describe, expect, it, vi } from 'vitest';
import { recountCopies } from '../../../src/core/collection/recount';
import type { ScanState } from '../../../src/core/collection/collection-scan';

const state = (status: ScanState['status'], extra: Partial<ScanState> = {}): ScanState => ({ status, nextPage: 0, entries: 0, updatedAt: 1_000, ...extra });

function setup(states: ScanState[]) {
  const queue = [...states];
  const scanner = {
    run: vi.fn(async () => undefined),
    state: vi.fn(async () => queue.length > 1 ? (queue.shift() as ScanState) : (queue[0] as ScanState)),
  };
  const sleep = vi.fn(async () => undefined);
  return { scanner, sleep, deps: { sleep, now: () => 1_500 } };
}

describe('recountCopies', () => {
  it('lance un parcours complet (force) et rend l’état final', async () => {
    const { scanner, deps } = setup([state('done', { entries: 12 })]);
    await expect(recountCopies(scanner, deps)).resolves.toMatchObject({ status: 'done', entries: 12 });
    expect(scanner.run).toHaveBeenCalledWith({ force: true });
  });

  it('rend l’erreur du scan telle quelle', async () => {
    const { scanner, deps } = setup([state('error', { error: 'HTTP 500' })]);
    await expect(recountCopies(scanner, deps)).resolves.toMatchObject({ status: 'error', error: 'HTTP 500' });
  });

  it('attend la fin du scan d’un autre onglet (récent) avant de rendre la main', async () => {
    const { scanner, sleep, deps } = setup([state('running', { updatedAt: 1_400 }), state('running', { updatedAt: 1_450 }), state('done')]);
    await expect(recountCopies(scanner, deps)).resolves.toMatchObject({ status: 'done' });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('ne reste pas bloqué sur un scan « en cours » périmé', async () => {
    const { scanner, sleep, deps } = setup([state('running', { updatedAt: 1 })]);
    await expect(recountCopies(scanner, { ...deps, now: () => 1_000_000 })).resolves.toMatchObject({ status: 'running' });
    expect(sleep).not.toHaveBeenCalled();
  });
});
