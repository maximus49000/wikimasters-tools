// tests/relay/memory-kv.ts
import type { KvLike } from '../../relay/src/kv';

// Faux KV en mémoire : `data` permet de préparer et de contrôler son contenu.
export function memoryKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (key) => data.get(key) ?? null, put: async (key, value) => void data.set(key, value) };
}
