import { ACTIVE_NAME, MAX_EVENTS_PER_BATCH, UPDATE_NAME, type ActionArgs, type ActionName, type Channel, type ErrorArgs, type ErrorName, type Platform, type WireEvent } from './catalogue';

const KEY_ENABLED = 'wmt:usageStats';
const KEY_CLIENT = 'wmt:clientId';
const KEY_VERSION = 'wmt:lastVersion';
const KEY_ACTIVE = 'wmt:lastActiveDay';
const CLIENT_ID = /^[0-9a-f-]{36}$/;
export const FLUSH_MS = 60_000;
export const MAX_ERRORS_PER_SESSION = 30;
const MAX_QUEUE = 200;

export type TelemetryDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  send(body: string): void;
  now(): number;
  newId(): string;
  platform: Platform;
  channel: Channel;
  version: string;
  defaultEnabled: boolean;
};
export type TelemetryScheduler = { every(run: () => void, ms: number): void; onHide(run: () => void): void };

// Mesure d'usage anonyme : l'identifiant d'installation est aléatoire et sans lien avec un compte ; les erreurs n'en portent pas.
// Aucune méthode ne lève d'exception et un envoi qui échoue est simplement abandonné.
export function createTelemetry(deps: TelemetryDeps) {
  const read = (key: string): string | null => {
    try {
      return deps.storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      deps.storage.setItem(key, value);
    } catch {
      // stockage indisponible
    }
  };
  let enabled = ((): boolean => {
    const saved = read(KEY_ENABLED);
    return saved === null ? deps.defaultEnabled : saved === 'on';
  })();
  let queue: WireEvent[] = [];
  let errors = 0;
  let memoryId: string | null = null;
  const listeners = new Set<() => void>();

  const clientId = (): string => {
    const known = read(KEY_CLIENT);
    if (known !== null && CLIENT_ID.test(known)) return known;
    memoryId ??= deps.newId();
    write(KEY_CLIENT, memoryId);
    return memoryId;
  };
  const push = (event: WireEvent): void => {
    if (queue.length < MAX_QUEUE) queue.push(event);
  };
  const today = (): string => new Date(deps.now()).toISOString().slice(0, 10);

  const flush = (): void => {
    if (queue.length === 0) return;
    const pending = queue;
    queue = [];
    for (let from = 0; from < pending.length; from += MAX_EVENTS_PER_BATCH) {
      try {
        deps.send(JSON.stringify({ platform: deps.platform, channel: deps.channel, version: deps.version, events: pending.slice(from, from + MAX_EVENTS_PER_BATCH) }));
      } catch {
        // envoi impossible : lot abandonné
      }
    }
  };

  return {
    enabled: (): boolean => enabled,
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      write(KEY_ENABLED, next ? 'on' : 'off');
      if (!next) queue = queue.filter((event) => event.type === 'error');
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Une action RÉALISÉE (lecture démarrée, lien ouvert, changement confirmé) — jamais l'affichage d'un module.
    track<N extends ActionName>(name: N, ...detail: ActionArgs<N>): void {
      if (!enabled) return;
      const value = (detail as string[])[0];
      push({ type: 'action', name, ...(value !== undefined ? { detail: value } : {}), clientId: clientId() });
    },
    reportError<N extends ErrorName>(name: N, ...detail: ErrorArgs<N>): void {
      if (errors >= MAX_ERRORS_PER_SESSION) return;
      errors += 1;
      const value = (detail as string[])[0];
      push({ type: 'error', name, ...(value !== undefined ? { detail: value } : {}) });
    },
    // Au démarrage : mise à jour détectée (version mémorisée ≠ version courante), « jour-actif » du jour, envois périodiques.
    start(scheduler: TelemetryScheduler): void {
      const last = read(KEY_VERSION);
      if (enabled && last !== null && last !== deps.version) push({ type: 'update', name: UPDATE_NAME, fromVersion: last, clientId: clientId() });
      write(KEY_VERSION, deps.version);
      if (enabled && read(KEY_ACTIVE) !== today()) {
        push({ type: 'active', name: ACTIVE_NAME, clientId: clientId() });
        write(KEY_ACTIVE, today());
      }
      scheduler.every(flush, FLUSH_MS);
      scheduler.onHide(flush);
    },
    flush,
  };
}

export type Telemetry = ReturnType<typeof createTelemetry>;
