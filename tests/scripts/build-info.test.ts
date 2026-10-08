import { describe, expect, it } from 'vitest';
import { buildId, parseFix } from '../../scripts/build-info.mjs';

describe('parseFix', () => {
  it('lit « hash<TAB>fix(portée): texte » et met la première lettre en majuscule', () => {
    expect(parseFix('abc1234\tfix(collection): plusieurs raretés cochées')).toEqual({ id: 'abc1234', title: 'Plusieurs raretés cochées' });
  });
  it('ignore les autres types de commit', () => {
    expect(parseFix('abc1234\tfeat: truc')).toBeNull();
    expect(parseFix('abc1234\tdocs: truc')).toBeNull();
  });
  it('retire la ligne Co-Authored-By et tronque les titres trop longs', () => {
    const long = parseFix(`abc1234\tfix: ${'a'.repeat(300)}`)!;
    expect(long.title.length).toBeLessThanOrEqual(160);
    expect(long.title.endsWith('…')).toBe(true);
    expect(parseFix('abc1234\tfix: x Co-Authored-By: Y')?.title).toBe('X');
  });
});

describe('buildId', () => {
  it('version du paquet + nombre de commits (même nombre que le versionCode Android)', () => {
    expect(buildId('.')).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
  });
  it('dossier sans package.json ni git : retombe sur 0.0.0+0 sans lever d’exception', () => {
    expect(buildId('/dossier/inexistant')).toBe('0.0.0+0');
  });
});
