import type { TempoRepo } from '../core/music/tempo-repo';
import type { estimateBpm } from '../core/music/tempo-estimate';
import { RELAY_BASE } from '../core/documentary/config';

export type TempoTrack = { uri: string; title: string; artist: string };
export type DecodedAudio = { samples: Float32Array; sampleRate: number };

type Deps = {
  repo: TempoRepo;
  fetch: typeof fetch;
  decode: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
  estimate: typeof estimateBpm;
};

// Mesure : { bpm } = résultat à garder (nombre ou null) ; null = panne, rien à garder.
type Measure = { bpm: number | null } | null;

// Tempo d'une piste : relais → extrait Deezer (30 s) → décodage → estimation, une seule fois par piste.
// L'URL de l'extrait est signée et expire vite : elle n'est jamais gardée.
export function createTempoService(deps: Deps) {
  const session = new Map<string, number | null>();
  const inflight = new Map<string, Promise<number | null>>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  async function measure(track: TempoTrack): Promise<Measure> {
    try {
      const query = new URLSearchParams({ title: track.title, artist: track.artist });
      const relay = await deps.fetch(`${RELAY_BASE}/deezer-preview?${query}`);
      if (!relay.ok) return null;
      const body = (await relay.json()) as { previewUrl?: unknown; deezerBpm?: unknown };
      if (typeof body.previewUrl !== 'string' || !body.previewUrl) return { bpm: null };
      // Le bpm Deezer est souvent doublé (190 au lieu de 92) et la spec dit « jamais répondre seul » : aucun indice n'est transmis.
      const hint: number | null = null;
      const preview = await deps.fetch(body.previewUrl);
      if (!preview.ok) return null;
      const bytes = await preview.arrayBuffer();
      try {
        const { samples, sampleRate } = await deps.decode(bytes);
        return { bpm: deps.estimate(samples, sampleRate, hint) };
      } catch {
        // Extrait indécodable : inutile de réessayer tout de suite.
        return { bpm: null };
      }
    } catch {
      return null;
    }
  }

  async function resolve(track: TempoTrack): Promise<number | null> {
    try {
      const saved = await deps.repo.get(track.uri);
      if (saved !== undefined) {
        session.set(track.uri, saved);
        notify();
        return saved;
      }
    } catch {
      // Dépôt illisible : on mesure quand même.
    }
    const result = await measure(track);
    if (!result) return null;
    session.set(track.uri, result.bpm);
    try {
      await deps.repo.save(track.uri, result.bpm);
    } catch {
      // Écriture impossible : la valeur reste valable pour la session.
    }
    notify();
    return result.bpm;
  }

  return {
    async tempo(track: TempoTrack): Promise<number | null> {
      const known = session.get(track.uri);
      if (known !== undefined) return known;
      const running = inflight.get(track.uri);
      if (running) return running;
      const run = resolve(track).finally(() => inflight.delete(track.uri));
      inflight.set(track.uri, run);
      return run;
    },
    // Lecture synchrone pour le rendu : undefined = pas encore mesuré.
    known(uri: string): number | null | undefined {
      return session.get(uri);
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type TempoService = ReturnType<typeof createTempoService>;
