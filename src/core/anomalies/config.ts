import { RELAY_BASE } from '../documentary/config';

// Les issues sont créées par le relais Cloudflare, qui détient le jeton GitHub (limité aux issues de ce dépôt) : l'extension et l'APK n'en contiennent aucun.
export const ISSUES_ENDPOINT = `${RELAY_BASE}/issues`;
