import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { ApiFormatError } from '../../../src/core/api/errors';
import { parseMineResponse } from '../../../src/core/api/schemas';

describe('parseMineResponse', () => {
  it('accepte une réponse de forme réelle', () => {
    const parsed = parseMineResponse(fixture);
    expect(parsed.history).toHaveLength(2);
    expect(parsed.won).toHaveLength(1);
    expect(parsed.maxConcurrentAuctions).toBe(5);
    expect(parsed.history[0]?.card.wikipedia_title).toBe('Exemple Un');
  });

  it('rejette une réponse où final_price est absent', () => {
    const broken = structuredClone(fixture) as any;
    delete broken.history[0].final_price;
    expect(() => parseMineResponse(broken)).toThrow(ApiFormatError);
    expect(() => parseMineResponse(broken)).toThrow(/final_price/);
  });

  it("rejette ce qui n'est pas un objet", () => {
    expect(() => parseMineResponse('nope')).toThrow(ApiFormatError);
  });

  it('conserve une rareté inconnue au lieu de rejeter', () => {
    const changed = structuredClone(fixture) as any;
    changed.won[0].snapshot_rarity = 'MYTHIC';
    expect(parseMineResponse(changed).won[0]?.snapshot_rarity).toBe('MYTHIC');
  });
});
