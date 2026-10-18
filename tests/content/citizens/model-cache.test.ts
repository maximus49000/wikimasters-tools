import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { __resetModelCache, loadBase, type Deps } from '../../../src/content/citizens/model-cache';

const mark = { s: 0, u: 0, w: 1, h: 1 };
const noir: [number, number, number] = [0, 0, 0];
const manifest = {
  version: 1,
  bases: {
    papy: {
      glb: 'm/papy.0123abcd.glb',
      png: 'm/papy.4567cdef.png',
      metres: 1.7,
      aged: true,
      face: {
        eyes: [mark, mark],
        brows: [mark, mark],
        mouthU: 0,
        lidSkin: [noir, noir],
        browSkin: [noir, noir],
        mouthSkin: noir,
      },
    },
  },
};

function scene(): THREE.Group {
  const g = new THREE.Group();
  const bone = new THREE.Bone();
  const m = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  m.add(bone);
  m.bind(new THREE.Skeleton([bone]));
  g.add(m);
  return g;
}

function faux(over: Partial<Deps> = {}) {
  const store = new Map<string, Response>();
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const deps: Deps = {
    fetch: fetchMock,
    caches: {
      open: async () => ({
        match: async (u: string) => store.get(u)?.clone(),
        put: async (u: string, r: Response) => void store.set(u, r),
        delete: async (u: string) => store.delete(u),
      }),
    },
    decode: { glb: async () => ({ scene: scene() }), image: async () => new THREE.Texture() },
    ...over,
  };
  return { deps, fetchMock, store };
}

beforeEach(() => __resetModelCache());

describe('model-cache', () => {
  it('charge une base : drapeaux du manifeste et texture assignée', async () => {
    const b = await loadBase('papy', faux().deps);
    expect(b?.aged).toBe(true);
    expect(b?.child).toBe(false);
    expect(b?.metres).toBe(1.7);
    expect((b?.body.material as THREE.MeshStandardMaterial).map).toBe(b?.texture);
  });

  it('2e appel sans réseau (lu dans le cache)', async () => {
    const { deps, fetchMock } = faux();
    await loadBase('papy', deps);
    const modeles = () => fetchMock.mock.calls.filter(([u]) => !u.endsWith('manifest.json')).length;
    const n = modeles();
    __resetModelCache();
    expect(await loadBase('papy', deps)).not.toBeNull();
    expect(modeles()).toBe(n); // GLB et PNG lus dans le cache (le manifeste, lui, est rafraîchi)
  });

  it('404 : null sans exception', async () => {
    const { deps } = faux({ fetch: async () => new Response('', { status: 404 }) });
    await expect(loadBase('papy', deps)).resolves.toBeNull();
  });

  it('ne passe jamais par URL.createObjectURL', async () => {
    const spy = vi.fn(() => 'blob:x');
    const orig = URL.createObjectURL;
    URL.createObjectURL = spy;
    try {
      await loadBase('papy', faux().deps);
    } finally {
      URL.createObjectURL = orig;
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('deux appels simultanés partagent la même promesse', () => {
    const { deps } = faux();
    expect(loadBase('papy', deps)).toBe(loadBase('papy', deps));
  });

  it('un échec n est pas mémorisé : nouvel essai possible', async () => {
    const bon = faux().deps;
    let ok = false;
    const deps: Deps = { ...bon, fetch: (u) => (ok ? bon.fetch(u) : Promise.reject(new Error('hors ligne'))) };
    expect(await loadBase('papy', deps)).toBeNull();
    ok = true;
    expect(await loadBase('papy', deps)).not.toBeNull();
  });

  it('sans Cache Storage : repli sur fetch seul', async () => {
    expect(await loadBase('papy', faux({ caches: undefined }).deps)).not.toBeNull();
  });

  it('base inconnue : null', async () => {
    expect(await loadBase('zzz', faux().deps)).toBeNull();
  });

  it('put qui échoue (quota) : le modèle est quand même rendu', async () => {
    const base = faux().deps;
    const deps: Deps = {
      ...base,
      caches: { open: async () => ({ match: async () => undefined, put: async () => Promise.reject(new Error('quota')) }) },
    };
    expect(await loadBase('papy', deps)).not.toBeNull();
  });

  it('caches.open qui lève : repli sur fetch', async () => {
    const deps: Deps = { ...faux().deps, caches: { open: async () => Promise.reject(new Error('webview')) } };
    expect(await loadBase('papy', deps)).not.toBeNull();
  });

  it('manifeste invalide : null, puis un manifeste valide réussit', async () => {
    const bon = faux().deps;
    let casse = true;
    const deps: Deps = {
      ...bon,
      caches: undefined,
      fetch: async (u) => (casse && u.endsWith('manifest.json') ? new Response('{"x":1}') : bon.fetch(u)),
    };
    expect(await loadBase('papy', deps)).toBeNull();
    casse = false;
    expect(await loadBase('papy', deps)).not.toBeNull();
  });

  it('GLB corrompu en cache : évincé puis retéléchargé', async () => {
    const { deps, store } = faux();
    await loadBase('papy', deps);
    __resetModelCache();
    let n = 0;
    const d2: Deps = {
      ...deps,
      decode: { ...deps.decode, glb: async (b) => (n++ === 0 ? Promise.reject(new Error('tronqué')) : deps.decode.glb(b)) },
    };
    const b = await loadBase('papy', d2);
    expect(b).not.toBeNull();
    expect(n).toBe(2);
    expect(store.size).toBeGreaterThan(0);
  });

  it('GLB invalide du réseau : pas mis en cache', async () => {
    const { deps, store } = faux();
    const d2: Deps = { ...deps, decode: { ...deps.decode, glb: async () => Promise.reject(new Error('tronqué')) } };
    expect(await loadBase('papy', d2)).toBeNull();
    expect([...store.keys()].some((k) => k.endsWith('.glb'))).toBe(false);
  });

  it('manifeste : rafraîchi depuis le réseau, copie en cache si hors ligne', async () => {
    const { deps, fetchMock } = faux();
    await loadBase('papy', deps);
    __resetModelCache();
    const avant = fetchMock.mock.calls.filter(([u]) => u.endsWith('manifest.json')).length;
    await loadBase('papy', deps);
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('manifest.json')).length).toBe(avant + 1);
    __resetModelCache();
    const horsLigne: Deps = { ...deps, fetch: async () => Promise.reject(new Error('hors ligne')) };
    expect(await loadBase('papy', horsLigne)).not.toBeNull();
  });

  it('modèle refait (nouvelle empreinte dans le manifeste) : le nouveau GLB est téléchargé, jamais l’ancien en cache', async () => {
    const { deps, fetchMock } = faux();
    await loadBase('papy', deps);
    expect(fetchMock.mock.calls.some(([u]) => u.endsWith('/persos/m/papy.0123abcd.glb'))).toBe(true);
    __resetModelCache();
    const papy = manifest.bases.papy;
    const avant = papy.glb;
    papy.glb = 'm/papy.89abcdef.glb';
    try {
      expect(await loadBase('papy', deps)).not.toBeNull();
      expect(fetchMock.mock.calls.some(([u]) => u.endsWith('/persos/m/papy.89abcdef.glb'))).toBe(true);
    } finally {
      papy.glb = avant;
    }
  });
});
