import { describe, expect, it, vi } from 'vitest';
import { createArchiveApi } from '../../../src/core/book/archive-api';

const reply = (identifiers: string[]) => vi.fn(async (_url: string) => Response.json({ response: { docs: identifiers.map((identifier) => ({ identifier })) } }));

describe('createArchiveApi', () => {
  it('rend le premier scan libre dans l’ordre d’Open Library', async () => {
    const fetchFn = reply(['b', 'c']);
    expect(await createArchiveApi({ fetch: fetchFn }).firstFree(['a', 'b', 'c'])).toBe('b');
    const query = new URL(fetchFn.mock.calls[0]![0]).searchParams.get('q');
    expect(query).toBe('identifier:(a OR b OR c) AND NOT access-restricted-item:true');
  });
  it('rend null quand aucun scan n’est libre ou sans identifiant, et écarte les identifiants douteux', async () => {
    expect(await createArchiveApi({ fetch: reply([]) }).firstFree(['a'])).toBeNull();
    const fetchFn = reply([]);
    expect(await createArchiveApi({ fetch: fetchFn }).firstFree([])).toBeNull();
    expect(await createArchiveApi({ fetch: fetchFn }).firstFree(['x) OR (y', '../z'])).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
