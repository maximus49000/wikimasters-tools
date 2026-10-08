import { describe, expect, it } from 'vitest';
import { validateBatch, validateEvent } from '../../../src/core/telemetry/catalogue';

const ID = '123e4567-e89b-42d3-a456-426614174000';

describe('validateEvent', () => {
  it('accepte une action connue avec son identifiant', () => {
    expect(validateEvent({ type: 'action', name: 'plein-ecran', clientId: ID })).toEqual({ type: 'action', name: 'plein-ecran', detail: null, clientId: ID, fromVersion: null });
  });
  it('exige un détail de la liste quand l’action en porte un, et le refuse sinon', () => {
    expect(validateEvent({ type: 'action', name: 'lecture-musique', detail: 'spotify', clientId: ID })?.detail).toBe('spotify');
    expect(validateEvent({ type: 'action', name: 'lecture-musique', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'lecture-musique', detail: 'deezer', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'plein-ecran', detail: 'x', clientId: ID })).toBeNull();
  });
  it('refuse un nom hors liste, y compris ceux du prototype', () => {
    expect(validateEvent({ type: 'action', name: 'inconnu', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'constructor', clientId: ID })).toBeNull();
  });
  it('refuse une action sans identifiant valide', () => {
    expect(validateEvent({ type: 'action', name: 'plein-ecran' })).toBeNull();
    expect(validateEvent({ type: 'action', name: 'plein-ecran', clientId: 'abc' })).toBeNull();
  });
  it('une erreur n’a jamais d’identifiant, même si le client en envoie un', () => {
    expect(validateEvent({ type: 'error', name: 'api-429', detail: 'spotify', clientId: ID })).toEqual({ type: 'error', name: 'api-429', detail: 'spotify', clientId: null, fromVersion: null });
    expect(validateEvent({ type: 'error', name: 'js-erreur' })?.detail).toBeNull();
  });
  it('active : nom fixe, identifiant obligatoire', () => {
    expect(validateEvent({ type: 'active', name: 'jour-actif', clientId: ID })).not.toBeNull();
    expect(validateEvent({ type: 'active', name: 'autre', clientId: ID })).toBeNull();
  });
  it('update : version génératrice obligatoire et bien formée', () => {
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '0.1.0+480' })?.fromVersion).toBe('0.1.0+480');
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID })).toBeNull();
    expect(validateEvent({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '<script>' })).toBeNull();
  });
  it('refuse tout ce qui n’est pas un objet', () => {
    for (const raw of [null, undefined, 3, 'x', [], [1]]) expect(validateEvent(raw)).toBeNull();
  });
});

describe('validateBatch', () => {
  const header = { platform: 'android', channel: 'preprod', version: '0.1.0+481' };
  it('garde les événements valides et ignore les autres', () => {
    const batch = validateBatch({ ...header, events: [{ type: 'action', name: 'plein-ecran', clientId: ID }, { type: 'action', name: 'nimporte', clientId: ID }] });
    expect(batch?.events).toHaveLength(1);
    expect(batch).toMatchObject({ platform: 'android', channel: 'preprod', version: '0.1.0+481' });
  });
  it('refuse une plateforme, un canal ou une version invalides', () => {
    expect(validateBatch({ ...header, platform: 'ios', events: [] })).toBeNull();
    expect(validateBatch({ ...header, channel: 'beta', events: [] })).toBeNull();
    expect(validateBatch({ ...header, version: 'v1', events: [] })).toBeNull();
  });
  it('refuse plus de 50 événements', () => {
    const events = Array.from({ length: 51 }, () => ({ type: 'action', name: 'plein-ecran', clientId: ID }));
    expect(validateBatch({ ...header, events })).toBeNull();
  });
});
