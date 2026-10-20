import type { StreetPass } from '../core/library/pets/outside';

// Passages de la rue (groupes déguisés, passants déguisés, promeneur de chien) publiés par chaque scène Ville vivante pour les
// animaux de la pièce (vague 1c) : un lecteur par scène montée, rangé par graine du monde (celle de la pièce : `hashString(room.id)`).
// `at(t)` : passages dans le champ à l'instant mural t (secondes).
type Reader = (t: number) => readonly StreetPass[];
const readers = new Map<number, Set<Reader>>();

export function publishStreetPasses(seed: number, read: Reader): () => void {
  let set = readers.get(seed);
  if (!set) readers.set(seed, (set = new Set()));
  set.add(read);
  return () => {
    set!.delete(read);
    if (set!.size === 0) readers.delete(seed);
  };
}

export function streetPassesAt(seed: number, t: number): StreetPass[] {
  const set = readers.get(seed);
  if (!set) return [];
  const out: StreetPass[] = [];
  const ids = new Set<string>();
  for (const read of set) for (const p of read(t)) if (!ids.has(p.id)) (ids.add(p.id), out.push(p));
  return out;
}
