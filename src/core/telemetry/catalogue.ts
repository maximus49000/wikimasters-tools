// Liste fermée des événements mesurés. Un événement = une ACTION réalisée (lecture démarrée, lien ouvert, changement confirmé),
// jamais l'affichage d'un module. Partagée par le client (typage) et le relais (validation).
export const SERVICES = ['wikipedia', 'wikidata', 'commons', 'spotify', 'tidal', 'tmdb', 'steam', 'igdb', 'openlibrary', 'googlebooks', 'github', 'relais'] as const;
export type Service = (typeof SERVICES)[number];

// Valeurs permises du détail ; `[]` = pas de détail.
export const ACTIONS = {
  'lecture-musique': ['spotify', 'tidal'],
  'liaison-compte': ['spotify', 'tidal'],
  'bo-lue': [],
  'bande-annonce-lue': [],
  'streaming-lien-ouvert': [],
  'film-change': [],
  'jeu-video-lu': [],
  'jeu-change': [],
  'livre-lecture-ouverte': ['wikisource', 'gutenberg', 'internet-archive'],
  'livre-achat-ouvert': ['papier', 'ebook'],
  'livre-change': [],
  'documentaire-lu': [],
  'documentaire-change': [],
  'documentaire-propose': [],
  'carte-liee-ouverte': [],
  'toile-generee': [],
  'echange-prepare': [],
  'plein-ecran': [],
  'anomalie-signalee': [],
  'wikihow-fiche-lue': [],
  'visite-terminee': [],
  'reglage-modifie': ['images', 'publicite-achat', 'lecteur'],
} as const satisfies Record<string, readonly string[]>;

export const ERRORS = {
  'api-429': SERVICES,
  'api-5xx': SERVICES,
  'api-reseau': SERVICES,
  'js-erreur': [],
  'lecture-echec': ['spotify', 'tidal', 'video'],
} as const satisfies Record<string, readonly string[]>;

export const ACTIVE_NAME = 'jour-actif';
export const UPDATE_NAME = 'maj-appliquee';
export const PLATFORMS = ['extension', 'android'] as const;
export const CHANNELS = ['preprod', 'prod'] as const;
export const MAX_EVENTS_PER_BATCH = 50;

export type Platform = (typeof PLATFORMS)[number];
export type Channel = (typeof CHANNELS)[number];
export type ActionName = keyof typeof ACTIONS;
export type ErrorName = keyof typeof ERRORS;
type DetailArgs<D> = [D] extends [never] ? [] : [detail: D];
export type ActionArgs<N extends ActionName> = DetailArgs<(typeof ACTIONS)[N][number]>;
export type ErrorArgs<N extends ErrorName> = DetailArgs<(typeof ERRORS)[N][number]>;

export type WireEvent = { type: 'active' | 'action' | 'update' | 'error'; name: string; detail?: string; clientId?: string; fromVersion?: string };
export type ValidEvent = { type: WireEvent['type']; name: string; detail: string | null; clientId: string | null; fromVersion: string | null };
export type ValidBatch = { platform: Platform; channel: Channel; version: string; events: ValidEvent[] };

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(\+\d{1,7})?$/;
const CLIENT_ID = /^[0-9a-f-]{36}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const detailOk = (allowed: readonly string[], detail: string | undefined): boolean => (allowed.length === 0 ? detail === undefined : detail !== undefined && allowed.includes(detail));

export function validateEvent(raw: unknown): ValidEvent | null {
  if (!isRecord(raw)) return null;
  const type = text(raw.type);
  const name = text(raw.name);
  const detail = text(raw.detail);
  const clientId = text(raw.clientId);
  const fromVersion = text(raw.fromVersion);
  if (name === undefined) return null;
  const hasId = clientId !== undefined && CLIENT_ID.test(clientId);
  const made = (id: string | null, from: string | null = null): ValidEvent => ({ type: type as WireEvent['type'], name, detail: detail ?? null, clientId: id, fromVersion: from });
  if (type === 'error') {
    if (!Object.hasOwn(ERRORS, name) || !detailOk((ERRORS as Record<string, readonly string[]>)[name]!, detail)) return null;
    return made(null);
  }
  if (!hasId) return null;
  if (type === 'active') return name === ACTIVE_NAME && detail === undefined ? made(clientId) : null;
  if (type === 'update') return name === UPDATE_NAME && detail === undefined && fromVersion !== undefined && VERSION.test(fromVersion) ? made(clientId, fromVersion) : null;
  if (type === 'action') {
    if (!Object.hasOwn(ACTIONS, name) || !detailOk((ACTIONS as Record<string, readonly string[]>)[name]!, detail)) return null;
    return made(clientId);
  }
  return null;
}

export function validateBatch(raw: unknown): ValidBatch | null {
  if (!isRecord(raw) || !Array.isArray(raw.events) || raw.events.length > MAX_EVENTS_PER_BATCH) return null;
  const platform = PLATFORMS.find((candidate) => candidate === raw.platform);
  const channel = CHANNELS.find((candidate) => candidate === raw.channel);
  const version = text(raw.version);
  if (!platform || !channel || version === undefined || !VERSION.test(version)) return null;
  const events = raw.events.map(validateEvent).filter((event): event is ValidEvent => event !== null);
  return { platform, channel, version, events };
}
