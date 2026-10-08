import { describe, expect, it } from 'vitest';
import { telemetryEnvironment } from '../../../src/core/telemetry/environment';

describe('telemetryEnvironment', () => {
  it('extension : pas de pont Android', () => {
    expect(telemetryEnvironment({})).toEqual({ platform: 'extension', channel: 'prod' });
  });
  it('Android production et pré-production, selon le schéma de retour', () => {
    expect(telemetryEnvironment({ WmtSpotify: { scheme: () => 'wikimasterstools' } })).toEqual({ platform: 'android', channel: 'prod' });
    expect(telemetryEnvironment({ WmtSpotify: { scheme: () => 'wikimasterstools-preprod' } })).toEqual({ platform: 'android', channel: 'preprod' });
    expect(telemetryEnvironment({ WmtSpotify: {} })).toEqual({ platform: 'android', channel: 'prod' });
  });
});
