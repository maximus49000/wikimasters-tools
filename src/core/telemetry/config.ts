import { RELAY_BASE } from '../documentary/config';

export const TELEMETRY_ENDPOINT = `${RELAY_BASE}/t`;
// Usage (actifs, actions, mises à jour) : activé par défaut, désactivable dans Paramètre d'extension.
// À passer à `false` (opt-in) au passage en diffusion publique. Les erreurs techniques anonymes ne dépendent pas de ce réglage.
export const USAGE_STATS_DEFAULT = true;
