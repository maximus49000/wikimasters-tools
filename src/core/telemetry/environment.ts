import type { Channel, Platform } from './catalogue';

type BridgeWindow = { WmtSpotify?: { scheme?(): string } };

// L'application Android expose le pont `WmtSpotify` ; son schéma de retour distingue la pré-production. L'extension n'a pas de canal de pré-production.
export function telemetryEnvironment(win: BridgeWindow): { platform: Platform; channel: Channel } {
  const bridge = win.WmtSpotify;
  if (!bridge) return { platform: 'extension', channel: 'prod' };
  return { platform: 'android', channel: bridge.scheme?.()?.includes('preprod') ? 'preprod' : 'prod' };
}
