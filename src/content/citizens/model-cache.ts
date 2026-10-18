import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RELAY_PERSOS } from '../figure/citizen-config';
import { ManifestSchema, type FaceMarks, type Manifest } from '../../core/citizens/manifest';

/** Modèle de base prêt à habiller : maillage à squelette + sa texture de peau/vêtement d'origine. */
export type BaseModel = {
  name: string;
  scene: THREE.Group;
  body: THREE.SkinnedMesh;
  texture: THREE.Texture;
  metres: number;
  child: boolean;
  aged: boolean;
  face: FaceMarks;
};

/** Partie qui a besoin des API du navigateur (analyse du GLB, décodage d'image) : injectable pour les tests. */
export type Decode = {
  glb(buf: ArrayBuffer): Promise<{ scene: THREE.Group }>;
  image(blob: Blob): Promise<THREE.Texture>;
};

export type CacheLike = {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
  delete?(url: string): Promise<boolean>;
};
export type CachesLike = { open(name: string): Promise<CacheLike> };

export type Deps = {
  fetch: (url: string) => Promise<Response>;
  caches: CachesLike | undefined;
  decode: Decode;
};

const CACHE_NAME = 'wmt-persos-v1';

/** Décodage par défaut. Pas de blob: (la CSP de l'hôte l'interdit) : GLB parsé depuis le buffer, image via bitmap. */
const decodeParDefaut: Decode = {
  glb: (buf) =>
    new Promise((resolve, reject) => {
      new GLTFLoader().parse(buf, '', (g) => resolve({ scene: g.scene }), reject);
    }),
  image: async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const tex = new THREE.Texture(bitmap);
    tex.flipY = false; // le GLB n'a pas d'image embarquée : UV au repère glTF
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  },
};

function depsParDefaut(): Deps {
  return {
    fetch: (url) => fetch(url),
    caches: typeof caches === 'undefined' ? undefined : (caches as unknown as CachesLike),
    decode: decodeParDefaut,
  };
}

/**
 * Récupère une ressource ET la valide (`analyser`), sans jamais lever d'exception (null sinon).
 * - Une réponse du réseau n'entre dans le cache qu'une fois analysée avec succès.
 * - Une entrée du cache qui ne s'analyse plus est supprimée, puis on retente le réseau.
 * `reseauDabord` : manifeste (URL non immuable, cache en secours hors ligne) ; sinon cache d'abord.
 */
async function obtenir<T>(
  url: string,
  d: Deps,
  analyser: (res: Response) => Promise<T>,
  reseauDabord = false,
): Promise<T | null> {
  let cache: CacheLike | null = null;
  try {
    cache = d.caches ? await d.caches.open(CACHE_NAME) : null;
  } catch {
    cache = null; // Cache Storage indisponible (cas limites WebView) : réseau seul
  }
  const depuisCache = async (): Promise<T | null> => {
    try {
      const hit = await cache?.match(url);
      if (!hit) return null;
      try {
        return await analyser(hit);
      } catch {
        await cache?.delete?.(url); // entrée corrompue : ne pas la rejouer
        return null;
      }
    } catch {
      return null;
    }
  };
  const depuisReseau = async (): Promise<T | null> => {
    try {
      const res = await d.fetch(url);
      if (!res.ok) return null;
      const copie = res.clone();
      const valeur = await analyser(res);
      try {
        await cache?.put(url, copie);
      } catch {
        /* écriture impossible (quota) : sans conséquence */
      }
      return valeur;
    } catch {
      return null;
    }
  };
  if (reseauDabord) return (await depuisReseau()) ?? (await depuisCache());
  return (await depuisCache()) ?? (await depuisReseau());
}

/** Promesses en vol, partagées entre appels simultanés ; un échec est retiré pour permettre une nouvelle tentative. */
let manifestEnCours: Promise<Manifest | null> | null = null;
const basesEnCours = new Map<string, Promise<BaseModel | null>>();

/** Pour les tests : oublie les promesses mémorisées. */
export function __resetModelCache(): void {
  manifestEnCours = null;
  basesEnCours.clear();
}

function chargerManifest(d: Deps): Promise<Manifest | null> {
  return obtenir(
    `${RELAY_PERSOS}/manifest.json`,
    d,
    async (res) => {
      const p = ManifestSchema.safeParse(await res.json());
      if (!p.success) throw new Error('manifeste invalide');
      return p.data;
    },
    true,
  );
}

export function loadManifest(deps?: Deps): Promise<Manifest | null> {
  if (manifestEnCours) return manifestEnCours;
  const p = chargerManifest(deps ?? depsParDefaut());
  manifestEnCours = p;
  void p.then((m) => {
    if (m === null && manifestEnCours === p) manifestEnCours = null;
  });
  return p;
}

function premierCorps(scene: THREE.Group): THREE.SkinnedMesh | null {
  let trouve: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    if (!trouve && (o as THREE.SkinnedMesh).isSkinnedMesh) trouve = o as THREE.SkinnedMesh;
  });
  return trouve;
}

async function chargerBase(name: string, d: Deps): Promise<BaseModel | null> {
  const manifest = await loadManifest(d);
  const info = manifest?.bases[name];
  if (!info) return null;
  const [glb, texture] = await Promise.all([
    obtenir(`${RELAY_PERSOS}/${info.glb}`, d, async (res) => {
      const { scene } = await d.decode.glb(await res.arrayBuffer());
      const body = premierCorps(scene);
      if (!body) throw new Error('aucun SkinnedMesh');
      return { scene, body };
    }),
    obtenir(`${RELAY_PERSOS}/${info.png}`, d, async (res) => d.decode.image(await res.blob())),
  ]);
  if (!glb || !texture) return null;
  // Le GLB n'embarque pas l'image : la texture est posée sur le(s) matériau(x) du corps.
  // Les consommateurs doivent cloner la scène (SkeletonUtils.clone) et les matériaux avant de teinter.
  const mats = Array.isArray(glb.body.material) ? glb.body.material : [glb.body.material];
  for (const m of mats) (m as THREE.MeshStandardMaterial).map = texture;
  return {
    name,
    scene: glb.scene,
    body: glb.body,
    texture,
    metres: info.metres,
    child: info.child === true,
    aged: info.aged === true,
    face: info.face,
  };
}

export function loadBase(name: string, deps?: Deps): Promise<BaseModel | null> {
  const dejaLa = basesEnCours.get(name);
  if (dejaLa) return dejaLa;
  const p = chargerBase(name, deps ?? depsParDefaut());
  basesEnCours.set(name, p);
  void p.then((b) => {
    if (b === null && basesEnCours.get(name) === p) basesEnCours.delete(name);
  });
  return p;
}
