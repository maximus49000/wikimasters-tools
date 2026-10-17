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

/** Cache d'abord, réseau ensuite (et mémorisation si ok). Jamais d'exception : null si injoignable. */
async function obtenir(url: string, d: Deps): Promise<Response | null> {
  let cache: CacheLike | null = null;
  try {
    cache = d.caches ? await d.caches.open(CACHE_NAME) : null;
  } catch {
    cache = null; // Cache Storage indisponible (cas limites WebView) : réseau seul
  }
  try {
    const hit = await cache?.match(url);
    if (hit) return hit;
  } catch {
    /* lecture du cache impossible : on tente le réseau */
  }
  try {
    const res = await d.fetch(url);
    if (!res.ok) return null;
    try {
      await cache?.put(url, res.clone());
    } catch {
      /* écriture impossible : sans conséquence */
    }
    return res;
  } catch {
    return null;
  }
}

/** Promesses en vol, partagées entre appels simultanés ; un échec est retiré pour permettre une nouvelle tentative. */
let manifestEnCours: Promise<Manifest | null> | null = null;
const basesEnCours = new Map<string, Promise<BaseModel | null>>();

/** Pour les tests : oublie les promesses mémorisées. */
export function __resetModelCache(): void {
  manifestEnCours = null;
  basesEnCours.clear();
}

async function chargerManifest(d: Deps): Promise<Manifest | null> {
  const res = await obtenir(`${RELAY_PERSOS}/manifest.json`, d);
  if (!res) return null;
  try {
    const p = ManifestSchema.safeParse(await res.json());
    return p.success ? p.data : null;
  } catch {
    return null;
  }
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
  const [glbRes, pngRes] = await Promise.all([
    obtenir(`${RELAY_PERSOS}/${info.glb}`, d),
    obtenir(`${RELAY_PERSOS}/${info.png}`, d),
  ]);
  if (!glbRes || !pngRes) return null;
  try {
    const [{ scene }, texture] = await Promise.all([
      glbRes.arrayBuffer().then((b) => d.decode.glb(b)),
      pngRes.blob().then((b) => d.decode.image(b)),
    ]);
    const body = premierCorps(scene);
    if (!body) return null;
    // Le GLB n'embarque pas l'image : la texture est posée sur le(s) matériau(x) du corps.
    const mats = Array.isArray(body.material) ? body.material : [body.material];
    for (const m of mats) (m as THREE.MeshStandardMaterial).map = texture;
    return {
      name,
      scene,
      body,
      texture,
      metres: info.metres,
      child: info.child === true,
      aged: info.aged === true,
      face: info.face,
    };
  } catch {
    return null;
  }
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
