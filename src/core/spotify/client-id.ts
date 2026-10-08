import type { KeyValueStore } from '../cache/store';
import { CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID, SESSION_KEY } from './config';

const CLIENT_ID = /^[0-9a-f]{32}$/;

// Un Client ID Spotify fait 32 caractères hexadécimaux ; on tolère espaces autour et majuscules (copier-coller).
export function normalizeClientId(value: string): string | null {
  const id = value.trim().toLowerCase();
  return CLIENT_ID.test(id) ? id : null;
}

// Les installations dont le compte est lié ont des jetons émis pour l'ancien identifiant : elles le gardent comme clé.
// Les autres (nouvelle installation, compte délié) n'ont pas de clé et doivent saisir la leur.
export async function migrateClientId(store: KeyValueStore): Promise<void> {
  if (await store.get<string | null>(CLIENT_ID_KEY)) return;
  if (await store.get(SESSION_KEY)) await store.set(CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID);
}
