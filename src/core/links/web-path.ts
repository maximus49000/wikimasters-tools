import { isIgnored } from './web-graph';

// Liens gardés par article (les premiers, dans l'ordre de l'introduction).
export const PER_ARTICLE = 100;
// Étapes de la recherche : chacune avance d'un niveau, depuis le départ ou depuis l'arrivée.
export const MAX_LEVELS = 10;
// Garde-fou : articles dont on lit les liens (ou les citeurs) pour une recherche, soit une soixantaine de requêtes.
export const MAX_READS = 3000;
// Articles lus par requête, et par vérification de la rencontre des deux côtés.
export const SLICE = 50;

// Les liens (slugs) de chaque article donné, dans l'ordre. `forward` : ce que l'article cite ; `backward` : les articles qui le citent.
export type PathSource = {
  forward: (slugs: string[]) => Promise<Record<string, string[]>>;
  backward: (slugs: string[]) => Promise<Record<string, string[]>>;
};

export type PathProgress = { level: number; reads: number };

export type PathResult =
  // De la carte A à la carte B, les deux comprises.
  | { status: 'found'; path: string[]; level: number; reads: number }
  | { status: 'none'; reason: 'exhausted' | 'levels' | 'limit'; level: number; reads: number }
  | { status: 'cancelled'; level: number; reads: number };

// Plus court chemin entre deux articles, cherché des deux côtés à la fois : depuis A en suivant les liens, depuis B en remontant
// ceux qui le citent. À chaque étape, le côté qui a le moins d'articles à lire avance. Les deux côtés se rejoignent bien avant :
// deux niveaux de chaque côté valent quatre niveaux d'un seul. Les articles génériques (identifiants, bibliothèques…) ne servent pas de passage.
export async function findPath(
  start: string,
  end: string,
  source: PathSource,
  onProgress: (progress: PathProgress) => void = () => undefined,
  cancelled: () => boolean = () => false,
): Promise<PathResult> {
  if (start === end) return { status: 'found', path: [start], level: 0, reads: 0 };
  // Pour chaque article atteint : celui d'où l'on vient (depuis A) ou celui où l'on va (vers B).
  const from = new Map<string, string | null>([[start, null]]);
  const to = new Map<string, string | null>([[end, null]]);
  let fromFrontier = [start];
  let toFrontier = [end];
  let reads = 0;
  let level = 0;

  const joinAt = (meet: string): string[] => {
    const head: string[] = [];
    for (let at: string | null | undefined = meet; at !== null && at !== undefined; at = from.get(at)) head.unshift(at);
    const tail: string[] = [];
    for (let at = to.get(meet); at !== null && at !== undefined; at = to.get(at)) tail.push(at);
    return [...head, ...tail];
  };

  while (level < MAX_LEVELS) {
    if (fromFrontier.length === 0 || toFrontier.length === 0) return { status: 'none', reason: 'exhausted', level, reads };
    level += 1;
    const forward = fromFrontier.length <= toFrontier.length;
    const frontier = forward ? fromFrontier : toFrontier;
    const mine = forward ? from : to;
    const theirs = forward ? to : from;
    const next: string[] = [];
    for (let at = 0; at < frontier.length; at += SLICE) {
      if (cancelled()) return { status: 'cancelled', level, reads };
      if (reads >= MAX_READS) return { status: 'none', reason: 'limit', level, reads };
      const slice = frontier.slice(at, at + SLICE);
      const answers = await (forward ? source.forward(slice) : source.backward(slice));
      if (cancelled()) return { status: 'cancelled', level, reads };
      reads += slice.length;
      onProgress({ level, reads });
      for (const origin of slice) {
        const found = (answers[origin] ?? []).filter((slug) => slug !== origin && (!isIgnored(slug) || theirs.has(slug))).slice(0, PER_ARTICLE);
        for (const slug of found) {
          if (mine.has(slug)) continue;
          mine.set(slug, origin);
          if (theirs.has(slug)) return { status: 'found', path: joinAt(slug), level, reads };
          next.push(slug);
        }
      }
    }
    if (forward) fromFrontier = next;
    else toFrontier = next;
  }
  return { status: 'none', reason: 'levels', level, reads };
}
