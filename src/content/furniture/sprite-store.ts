import type { PaintedSprite } from './sprite-paint';

// Mémoire persistante des sprites cellulo (G6, tâche 4b) : les data URL des images peintes sont gardées sur l'appareil, en IndexedDB,
// dans une base propre à l'appli (« wikimasters-tools-sprites », à part de la base des réglages et des caches). Au rechargement de la
// pièce, une image déjà peinte est relue au lieu d'être repeinte (la cuisson d'une pièce coûte des dizaines de secondes sur Android).
// - Clé = spriteKey (qui contient CEL_VERSION) ; chaque fiche porte aussi la « génération » du dessin (`gen` : version du dessin et
//   suréchantillonnage) : à l'ouverture, les fiches d'une autre génération sont effacées (un changement de version invalide tout).
// - Plafond d'octets (somme des longueurs des data URL, ~60 Mo) ; au-delà, la fiche lue le moins récemment part (LRU par date de
//   dernière lecture).
// - Lecture : sur un fil saturé (Android, banc à CPU ×4), chaque événement d'IndexedDB attend son tour pendant des centaines de ms ;
//   on limite donc les allers-retours : une mémoire petite (≤ 16 Mo) est relue entière à l'ouverture (getAll, demandé en même temps
//   que les fiches grâce à un indice de taille gardé dans localStorage), sinon les clés demandées ensemble partagent une transaction.
// - Extension (script de contenu) : IndexedDB de l'origine du site, base à part ; appli Android (WebView) : IndexedDB de la page,
//   déjà utilisée par le stockage de l'appli. Sans IndexedDB (vitest/jsdom) ou si elle refuse de s'ouvrir (navigation privée, quota),
//   tout fonctionne sans mémoire : on repeint, comme avant.

export type SpriteStore = {
  /** Ouvre la base sans attendre le premier besoin (dès la création d'une pièce, avant son premier rendu). */
  warm(): void;
  /** Image gardée pour cette clé (null si absente, d'une autre génération, en cas d'erreur ou au-delà du délai maximal) ; met à jour
   *  sa date de lecture. `late` reçoit l'image si elle arrive après le délai (la peinture commencée entre-temps peut être abandonnée). */
  read(k: string, late?: (s: PaintedSprite) => void): Promise<PaintedSprite | null>;
  /** Garde l'image (et évince au-delà du plafond) ; ne rejette jamais. */
  write(k: string, s: PaintedSprite): Promise<void>;
  /** Octets occupés (somme des longueurs des data URL). */
  bytes(): Promise<number>;
  /** Nombre d'images gardées. */
  count(): Promise<number>;
};

const DB_NAME = 'wikimasters-tools-sprites';
const META = 'meta'; // clé → { gen, bytes, at } : petit, tout relu à l'ouverture
const DATA = 'data'; // clé → { url, box } : relu seulement au besoin
export const SPRITE_STORE_MAX_BYTES = 60e6;
// En dessous, toute la mémoire est relue à l'ouverture en une seule requête (getAll) : sur un fil saturé, chaque événement
// d'IndexedDB attend son tour (des centaines de ms à CPU ×4), une lecture clé par clé coûterait un événement par image.
export const SPRITE_STORE_PRELOAD_BYTES = 16e6;
// Délai maximal d'une ouverture ou d'une lecture : la mémoire accélère, elle ne bloque jamais. Au-delà, l'image est déclarée absente
// (elle sera peinte) ; une ouverture qui ne répond pas à temps (IndexedDB abîmée, WebView qui n'envoie aucun événement) désactive
// la mémoire pour la session.
export const SPRITE_STORE_TIMEOUT_MS = 3000;
type Timer = (cb: () => void, ms: number) => () => void;
const defaultTimer: Timer = (cb, ms) => {
  const t = setTimeout(cb, ms) as unknown as { unref?: () => void };
  t.unref?.(); // node (tests) : ne retient pas le processus
  return () => clearTimeout(t as unknown as number);
};
// `p` borné à `ms` : au-delà, `fallback` ; la valeur arrivée trop tard va à `late`.
function bounded<T>(p: Promise<T>, ms: number, timer: Timer, fallback: T, late?: (v: T) => void): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const cancel = timer(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        if (settled) return late?.(v);
        settled = true;
        cancel();
        resolve(v);
      },
      () => {
        if (settled) return;
        settled = true;
        cancel();
        resolve(fallback);
      },
    );
  });
}

// Les images relues d'avance et jamais demandées sont oubliées après ce délai (mémoire rendue).
const PRELOAD_KEEP_MS = 60_000;

type Meta = { gen: string; bytes: number; at: number };
// `pre` : images relues d'un coup à l'ouverture (petite mémoire), rendues au premier besoin puis oubliées.
type Db = { db: IDBDatabase; meta: Map<string, Meta>; total: number; pre: Map<string, PaintedSprite> | null };

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction IndexedDB annulée'));
  });

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(DB_NAME, 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(META);
      opening.result.createObjectStore(DATA);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('IndexedDB bloquée'));
  });
}

// Évince les fiches lues le moins récemment tant que le plafond est dépassé (la plus récente reste toujours).
function evict(d: Db, tx: IDBTransaction, maxBytes: number): void {
  if (d.total <= maxBytes) return;
  const byAge = [...d.meta].sort((a, b) => a[1].at - b[1].at);
  for (const [k, m] of byAge) {
    if (d.total <= maxBytes || d.meta.size <= 1) break;
    tx.objectStore(META).delete(k);
    tx.objectStore(DATA).delete(k);
    d.meta.delete(k);
    d.total -= m.bytes;
  }
}

// `factory` : IndexedDB à utiliser (null/undefined : aucune mémoire, la fonction rend null) ; `gen` : génération du dessin.
function defaultHint(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSpriteStore(opts: { factory?: IDBFactory | null; gen?: string; maxBytes?: number; preloadBytes?: number; now?: () => number; hint?: Storage | null; timeoutMs?: number; timer?: Timer } = {}): SpriteStore | null {
  const { factory } = opts;
  if (!factory) return null;
  const gen = opts.gen ?? '';
  const maxBytes = opts.maxBytes ?? SPRITE_STORE_MAX_BYTES;
  const now = opts.now ?? (() => Date.now());
  const preloadBytes = opts.preloadBytes ?? SPRITE_STORE_PRELOAD_BYTES;
  // Indice de taille (octets à la dernière écriture), lu avant l'ouverture : localStorage, une seule petite clé ; sans lui, on lit
  // d'abord les fiches puis, si la mémoire est petite, les images (un aller-retour de plus).
  const hint = opts.hint === undefined ? defaultHint() : opts.hint;
  const hintKey = `wmt:sprites-bytes:${gen}`;
  const readHint = (): number => {
    try {
      const v = hint?.getItem(hintKey);
      return v === null || v === undefined ? Infinity : Number(v);
    } catch {
      return Infinity;
    }
  };
  const writeHint = (n: number): void => {
    try {
      hint?.setItem(hintKey, String(n));
    } catch {
      // indice perdu : sans conséquence
    }
  };
  const timeoutMs = opts.timeoutMs ?? SPRITE_STORE_TIMEOUT_MS;
  const timer = opts.timer ?? defaultTimer;
  // Ouverture bornée : au-delà du délai, la mémoire est désactivée (lectures rendues absentes tout de suite, sans nouveau délai) ;
  // si l'ouverture aboutit plus tard, elle est réactivée et les lectures restées sans réponse reçoivent leur image en retard.
  let ready: Promise<Db | null> | undefined;
  let raw: Promise<Db | null> | null = null;
  // Lectures en attente d'une ouverture dépassée (une par image demandée, vidées à l'issue de l'ouverture).
  const lateReads: { k: string; late: (s: PaintedSprite) => void }[] = [];
  let rawFailed = false;
  const open = (): Promise<Db | null> =>
    // Le délai court à partir du premier besoin (lecture, écriture) : l'ouverture lancée d'avance par warm() n'est pas pressée.
    (ready ??= bounded(raw ?? startRaw(), timeoutMs, timer, null, (d) => {
      if (!d) return;
      ready = Promise.resolve(d);
      for (const { k, late } of lateReads.splice(0)) void lookup(d, k, late).then((s) => s && late(s));
    }).then((d) => {
      if (!d) console.warn('[wikimasters-tools]', 'mémoire des sprites désactivée (ouverture trop lente ou refusée) ; réactivée si elle aboutit plus tard');
      return d;
    }));
  const startRaw = (): Promise<Db | null> => {
    raw = openRaw();
    // Échec de l'ouverture (avant ou après le délai) : plus rien à attendre.
    void raw.then((d) => {
      if (d) return;
      rawFailed = true;
      lateReads.length = 0;
    });
    return raw;
  };
  const openRaw = (): Promise<Db | null> =>
    (async () => {
      const db = await openDb(factory);
      const tx = db.transaction([META, DATA], 'readwrite');
      const metaStore = tx.objectStore(META);
      const readData = () => {
        const data = tx.objectStore(DATA);
        return Promise.all([request(data.getAllKeys()), request(data.getAll() as IDBRequest<PaintedSprite[]>)]);
      };
      // Mémoire petite à la dernière visite (indice gardé à part) : fiches et images demandées ensemble, en un seul aller-retour.
      const early = readHint() <= preloadBytes ? readData() : null;
      early?.catch(() => undefined); // lue pour rien (mémoire devenue grande) : pas de rejet non rattrapé
      const [keys, values] = await Promise.all([request(metaStore.getAllKeys()), request(metaStore.getAll() as IDBRequest<Meta[]>)]);
      const d: Db = { db, meta: new Map(), total: 0, pre: null };
      keys.forEach((key, i) => {
        const k = String(key), m = values[i]!;
        if (m?.gen === gen) {
          d.meta.set(k, m);
          d.total += m.bytes;
        } else {
          // Autre version du dessin : jamais relue, place rendue.
          metaStore.delete(key);
          tx.objectStore(DATA).delete(key);
        }
      });
      evict(d, tx, maxBytes);
      // Petite mémoire : toutes les images d'un coup, dans la même transaction (après les effacements ci-dessus).
      if (d.meta.size > 0 && d.total <= preloadBytes) {
        const [dk, dv] = await (early ?? readData());
        d.pre = new Map();
        dk.forEach((key, i) => {
          const k = String(key), v = dv[i];
          if (d.meta.has(k) && v && typeof v.url === 'string') d.pre!.set(k, { url: v.url, box: { ...v.box } });
        });
        const timer = setTimeout(() => (d.pre = null), PRELOAD_KEEP_MS) as { unref?: () => void };
        timer.unref?.(); // node (tests) : ne retient pas le processus
      }
      // Prêt dès les lectures reçues, sans attendre la fin de la transaction (un tour de plus sur un fil saturé) : les effacements
      // ci-dessus s'achèvent seuls ; s'ils échouent, les fiches restées seront recomptées à la prochaine ouverture.
      finished(tx).catch(() => undefined);
      writeHint(d.total);
      return d;
    })().catch((error: unknown) => {
      console.warn('[wikimasters-tools]', 'mémoire des sprites indisponible :', error);
      return null;
    });

  // Dates de lecture des images servies d'avance : écrites ensemble, plus tard, en une transaction (la date en mémoire, elle, est
  // à jour tout de suite : c'est elle qui décide de l'éviction).
  let touched: Set<string> | null = null;
  function touch(d: Db, k: string, m: Meta): void {
    m.at = now();
    if (touched) return void touched.add(k);
    const t = (touched = new Set([k]));
    queueMicrotask(() => {
      touched = null;
      try {
        const tx = d.db.transaction(META, 'readwrite');
        for (const key of t) {
          const mm = d.meta.get(key);
          if (mm) tx.objectStore(META).put(mm, key);
        }
      } catch {
        // Date non gardée : sans conséquence (LRU un peu moins juste après un rechargement).
      }
    });
  }

  type Waiter = { resolve: (s: PaintedSprite | null) => void; late?: (s: PaintedSprite) => void };
  type Batch = Map<string, Waiter[]>;
  let batch: Batch | null = null;
  // Une transaction pour un lot de clés : images relues, dates de lecture mises à jour ; réponses données toutes ensemble.
  async function readBatch(d: Db, keys: Batch): Promise<void> {
    const found = new Map<string, PaintedSprite>();
    try {
      const tx = d.db.transaction([META, DATA], 'readwrite');
      const t = now();
      for (const k of keys.keys()) {
        const rq = tx.objectStore(DATA).get(k);
        rq.onsuccess = () => {
          const s = rq.result as PaintedSprite | undefined;
          const m = d.meta.get(k);
          if (!m) return;
          if (!s || typeof s.url !== 'string') {
            // Fiche sans image (base abîmée) : oubliée.
            tx.objectStore(META).delete(k);
            d.meta.delete(k);
            d.total -= m.bytes;
            return;
          }
          m.at = t;
          tx.objectStore(META).put(m, k);
          found.set(k, { url: s.url, box: { ...s.box } });
        };
      }
      // Transaction muette au-delà du délai : tout le lot est déclaré absent (et sera peint).
      const done = finished(tx).then(() => true);
      if (!(await bounded(done, timeoutMs, timer, false))) {
        // Images arrivées après le délai : à ceux qui veulent bien les recevoir en retard.
        void done.then(
          () => {
            for (const [k, ws] of keys) for (const w of ws) if (found.has(k)) w.late?.(found.get(k)!);
          },
          () => undefined,
        );
        for (const ws of keys.values()) for (const w of ws) w.resolve(null);
        return;
      }
    } catch {
      found.clear();
    }
    for (const [k, ws] of keys) for (const w of ws) w.resolve(found.get(k) ?? null);
  }

  // Image d'une clé dans une base ouverte : relue d'avance, sinon lue avec les autres clés demandées dans la même tâche.
  function lookup(d: Db, k: string, late?: (s: PaintedSprite) => void): Promise<PaintedSprite | null> {
    const m = d.meta.get(k);
    if (!m) return Promise.resolve(null);
    const early = d.pre?.get(k);
    if (early) {
      d.pre!.delete(k);
      touch(d, k, m);
      return Promise.resolve(early);
    }
    // Lectures groupées : toutes les clés demandées dans la même tâche (les meubles d'une pièce montés ensemble) partagent une
    // transaction, au lieu d'une transaction chacune (sérialisées, et chaque aller-retour attend son tour sur un fil saturé).
    return new Promise<PaintedSprite | null>((resolve) => {
      if (!batch) {
        const b = (batch = new Map());
        queueMicrotask(() => {
          batch = null;
          void readBatch(d, b);
        });
      }
      const w: Waiter = { resolve, ...(late && { late }) };
      const waiting = batch.get(k);
      if (waiting) waiting.push(w);
      else batch.set(k, [w]);
    });
  }

  return {
    warm() {
      if (!raw) void startRaw();
    },
    read(k, late) {
      return open().then((d) => {
        if (d) return lookup(d, k, late);
        // Ouverture dépassée mais encore en cours : l'image viendra peut-être en retard.
        if (late && raw && !rawFailed) lateReads.push({ k, late });
        return null;
      });
    },
    async write(k, s) {
      const d = await open();
      if (!d) return;
      try {
        const tx = d.db.transaction([META, DATA], 'readwrite');
        const m: Meta = { gen, bytes: s.url.length, at: now() };
        const old = d.meta.get(k);
        if (old) d.total -= old.bytes;
        tx.objectStore(DATA).put({ url: s.url, box: { ...s.box } }, k);
        tx.objectStore(META).put(m, k);
        d.meta.set(k, m);
        d.total += m.bytes;
        evict(d, tx, maxBytes);
        await finished(tx);
        writeHint(d.total);
      } catch (error) {
        // Écriture refusée (quota…) : la fiche n'existe pas. Les fiches évincées dans la même transaction sont restées dans la base :
        // elles seront recomptées à la prochaine ouverture.
        const m = d.meta.get(k);
        if (m) (d.meta.delete(k), (d.total -= m.bytes));
        console.warn('[wikimasters-tools]', 'image non gardée sur l’appareil :', error);
      }
    },
    async bytes() {
      return (await open())?.total ?? 0;
    },
    async count() {
      return (await open())?.meta.size ?? 0;
    },
  };
}
