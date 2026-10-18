// Banc des habitants 3D : CitizenRenderer sur les vrais modèles (relay/public/persos servis par vite).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CitizenRenderer, type CitizenSprite } from '../../src/content/citizens/citizen-renderer';
import { loadBase, type Deps } from '../../src/content/citizens/model-cache';
import { RELAY_PERSOS } from '../../src/content/figure/citizen-config';
import { SPRITE_BOX } from '../../src/content/figure/figure-host';
import { citizen, type CitizenDesc } from '../../src/core/citizens/catalogue';
import { faceState, type Emotion } from '../../src/core/citizens/face';
import type { FigureKey } from '../../src/core/library/figure/bake';

const q = new URLSearchParams(location.search);
const PX = Number(q.get('px') ?? 3);
const ZOOM = Number(q.get('zoom') ?? 3);
const NODOTS = q.has('nodots');
const errors: string[] = [];
(window as unknown as { benchErrors: string[] }).benchErrors = errors;

// Même décodage que model-cache (GLB depuis le buffer, image en bitmap), réseau local, sans Cache Storage.
const deps: Deps = {
  fetch: (url) => fetch(url.replace(RELAY_PERSOS, '/relay/public/persos')),
  caches: undefined,
  decode: {
    glb: (buf) => new Promise((ok, ko) => new GLTFLoader().parse(buf, '', (g) => ok({ scene: g.scene }), ko)),
    image: async (blob) => {
      const tex = new THREE.Texture(await createImageBitmap(blob));
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    },
  },
};
const R = new CitizenRenderer({ pxPerUnit: PX, loadBase: (n) => loadBase(n, deps) });
(window as unknown as { renderer: CitizenRenderer }).renderer = R;

const BASES = ['homme-fort', 'homme-maigre', 'femme-frele', 'femme-forte', 'femme-grande', 'papy', 'mamie', 'enfant'];
// Graines : les 4 premières de chaque base.
const byBase = new Map<string, CitizenDesc[]>(BASES.map((b) => [b, []]));
for (let s = 1; s < 5000 && [...byBase.values()].some((l) => l.length < 4); s++) {
  const d = citizen(s);
  const l = byBase.get(d.base);
  if (l && l.length < 4) l.push(d);
}
// Tenues de travail : gilet + parapluie, tablier.
const work: CitizenDesc[] = [
  { ...citizen(11), items: [...citizen(11).items, { k: 'gilet', color: '#F28C28' }, { k: 'accessory', color: '#C0392B', what: 'parapluie' }] },
  { ...citizen(23), items: [...citizen(23).items, { k: 'tablier', color: '#F4F1EA' }] },
];

const key = (o: Partial<FigureKey>): FigureKey => ({ sig: '', yaw: 0, gait: 'walk', phase: 0, head: 0, arms: 'swing', lean: 0, ...o });
const DOTS: [keyof CitizenSprite['anchors'], string][] = [['handR', '#d22'], ['handL', '#22d'], ['head', '#2a2'], ['nape', '#e80'], ['seat', '#a2a']];

function tile(parent: HTMLElement, d: CitizenDesc, k: FigureKey, face: string, label: string): void {
  const fig = document.createElement('figure');
  const out = R.render(d, k, 1, face);
  if (!out) {
    errors.push(`null : ${label}`);
    fig.textContent = '∅';
  } else {
    const img = new Image();
    img.src = out.url;
    img.width = SPRITE_BOX.w * PX * ZOOM;
    img.height = SPRITE_BOX.h * PX * ZOOM;
    fig.append(img);
    for (const [a, c] of DOTS) {
      const p = out.anchors[a];
      if (NODOTS) continue;
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = c;
      dot.style.left = `${(p[0] - SPRITE_BOX.x0) * PX * ZOOM}px`;
      dot.style.top = `${(p[1] - SPRITE_BOX.y0) * PX * ZOOM}px`;
      fig.append(dot);
    }
  }
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.append(cap);
  parent.append(fig);
}

function section(title: string): HTMLElement {
  const app = document.getElementById('app')!;
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  app.append(h, row);
  return row;
}

async function main(): Promise<void> {
  const all = [...[...byBase.values()].flat(), ...work];
  for (const d of all) R.prepare(d);
  const t0 = performance.now();
  while (!all.every((d) => R.ready(d))) {
    if (performance.now() - t0 > 30_000) { errors.push('bases non chargées'); break; }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  const etat = document.getElementById('etat')!;
  const t1 = performance.now();
  let n = 0;
  for (const b of BASES) {
    const row = section(`${b} — yaw 0 / yaw 4, marche phase 0`);
    for (const d of byBase.get(b)!) {
      tile(row, d, key({ yaw: 0 }), '', `${d.height.toFixed(2)} m`);
      tile(row, d, key({ yaw: 4 }), '', `${d.mood}`);
      n += 2;
    }
  }
  const rw = section('Tenues de travail : gilet + parapluie, tablier');
  for (const d of work) for (const yaw of [0, 4, 8, 12]) { tile(rw, d, key({ yaw }), '', `yaw ${yaw}`); n++; }
  // Pluie : « u » dans la signature → parapluie ouvert (le sien, rouge ; sinon couleur par défaut pour la 2e).
  const rr = section('Pluie : parapluie ouvert (le sien, puis sans parapluie à soi)');
  for (const d of [work[0]!, work[1]!]) for (const yaw of [0, 4, 8, 12]) { tile(rr, d, key({ yaw, sig: 'short.tee.pants.none.u.n' }), '', `pluie yaw ${yaw}`); n++; }
  const rp = section('Marche, phases 0–11 (yaw 0)');
  const walker = byBase.get('homme-fort')![0]!;
  for (let p = 0; p < 12; p++) { tile(rp, walker, key({ yaw: 0, phase: p }), '', `phase ${p}`); n++; }
  const re = section('Émotions (debout, de face) et clignement');
  const face = byBase.get('femme-frele')![0]!;
  for (const [e, b] of [['neutre', 0], ['heureux', 0], ['triste', 0], ['surpris', 0], ['neutre', 0.5], ['neutre', 1]] as [Emotion, number][]) {
    tile(re, face, key({ yaw: 4, gait: 'stand' }), faceState(e, b), `${e}${b ? ` cligne ${b}` : ''}`);
    n++;
  }
  etat.textContent = `${n} images en ${Math.round(performance.now() - t1)} ms${errors.length ? ` — ${errors.length} erreur(s)` : ''}`;
  (window as unknown as { benchDone: boolean }).benchDone = true;
}

main().catch((e: unknown) => {
  errors.push(String(e));
  document.getElementById('etat')!.textContent = `erreur : ${String(e)}`;
});
