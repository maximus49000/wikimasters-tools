// Banc de la pièce G6 : piece.html?style=<StyleId>&h=<heure décimale>&meteo=soleil|nuages|pluie|neige&pet=chat|chien|robot&scene=<nom>&t=<s>&w=1440
// Pièce meublée (RoomView, Ghibli) ; `window.done` quand plus aucun repli `[data-sprite-fallback]` ; `window.__spriteStats` = temps de peinture.
const q = new URLSearchParams(location.search);
const t = q.get('t');
// `t=<s>` : fige l'instant (horloge des animaux et mouvement réduit), pour des captures reproductibles.
if (t !== null) {
  const base = 1_760_000_000_000;
  Date.now = () => base + Number(t) * 1000;
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (query: string): MediaQueryList => (query.includes('prefers-reduced-motion') ? ({ ...mm(query), matches: true } as MediaQueryList) : mm(query));
}
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { RoomView, type SceneView } from '../../src/content/RoomView';
import { usePetSim } from '../../src/content/pet-sim';
import { SpriteContext, SpriteRegistry } from '../../src/content/furniture/sprite-host';
import { skyAt } from '../../src/core/library/sky';
import { STYLE_IDS, type PetPlan, type Room, type StyleId } from '../../src/core/library/library-types';
import { VISIBLE_COLS } from '../../src/core/library/room-grid';
import { PETS, benchRoom } from './fixtures';

const W = Number(q.get('w') ?? 1440);
const style = (STYLE_IDS as readonly string[]).includes(q.get('style') ?? '') ? (q.get('style') as StyleId) : 'scandinave';
const hour = Number(q.get('h') ?? 15);
const minutes = Math.floor(hour * 60);
const petName = q.get('pet') as keyof typeof PETS | null;
const scene = q.get('scene');

// Stub (tâche 4) : les scènes d'animal scriptées (rock, nap, hide, scratch, brush, tree, egg) sont branchées à la tâche 15
// (moteur de vie du mobilier). Ici le nom est seulement exposé ; l'animal vit sa vie normale.
(window as unknown as { __scene: string | null }).__scene = scene;
if (scene) console.warn(`scene=${scene} : non branché (tâche 15), l'animal suit son plan normal`);

// Météo du banc, même forme que le banc du fond.
const base = { cloud: 0.1, precip: 0, kind: 'rain' as const, fog: 0, wind: 0.2, lightning: 0, wet: 0, snowCover: 0 };
const PRESETS: Record<string, typeof base> = {
  soleil: base,
  nuages: { ...base, cloud: 0.8, wind: 0.4 },
  pluie: { ...base, cloud: 0.92, precip: 0.65, wind: 0.5, wet: 0.8 },
  neige: { ...base, cloud: 0.85, precip: 0.5, kind: 'snow' as never, wind: 0.2, snowCover: 0.8 },
};
const wx = PRESETS[q.get('meteo') ?? 'soleil'] ?? base;
const sceneView: SceneView = {
  sky: skyAt(minutes, { kind: 'normal', sunrise: 7 * 60, sunset: 20 * 60 }),
  minutes,
  weather: { clock: { read: () => wx as never }, flags: { gloom: wx.cloud > 0.7, rainy: wx.precip > 0 && wx.kind === 'rain' } },
};

// Registre mesuré : chaque tâche de peinture est chronométrée (somme des tranches) sans toucher au code de l'appli.
type Stat = { key: string; ms: number; steps: number };
const stats: Stat[] = [];
class BenchRegistry extends SpriteRegistry {
  override want(k: string, job: Parameters<SpriteRegistry['want']>[1], done: () => void): () => void {
    return super.want(
      k,
      () => {
        const j = job();
        const s: Stat = { key: k, ms: 0, steps: 0 };
        stats.push(s);
        return {
          step: (b) => { const t0 = performance.now(); const r = j.step(b); s.ms += performance.now() - t0; s.steps++; return r; },
          finish: () => { const t0 = performance.now(); const r = j.finish(); s.ms += performance.now() - t0; return r; },
        };
      },
      done,
    );
  }
}
const registry = new BenchRegistry('banc');
(window as unknown as { __spriteStats: unknown }).__spriteStats = {
  get count() { return stats.length; },
  get meanMs() { return stats.length ? stats.reduce((a, s) => a + s.ms, 0) / stats.length : 0; },
  get maxMs() { return stats.reduce((a, s) => Math.max(a, s.ms), 0); },
  get totalMs() { return stats.reduce((a, s) => a + s.ms, 0); },
  get cacheSize() { return registry.size(); },
  get cacheBytes() { return registry.bytes(); },
  perSprite: () => stats.map((s) => ({ ...s })),
};

function Piece() {
  const [room, setRoom] = useState<Room>(() => benchRoom(style, petName && petName in PETS ? petName : null));
  const sim = usePetSim(room, (_roomId, petId, plan: PetPlan) => setRoom((r) => ({ ...r, pets: r.pets.map((p) => (p.id === petId ? { ...p, plan } : p)) })));
  return (
    <div style={{ width: (W * VISIBLE_COLS.landscape) / room.cols }}>
      <SpriteContext.Provider value={registry}>
        <RoomView
          room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
          cards={{ Dune: { title: 'Dune' }, Foundation: { title: 'Foundation' }, Daft_Punk: { title: 'Daft Punk' }, Alien: { title: 'Alien' } }}
          sceneView={sceneView} light pets={sim.views} petAttach={sim.attach} petFrames={sim.frames}
        />
      </SpriteContext.Provider>
    </div>
  );
}
createRoot(document.getElementById('out')!).render(<Piece />);

// Prêt quand plus aucun repli n'est affiché et qu'au moins un sprite l'est.
const w = window as unknown as { done: boolean; doneAt: number };
const ready = (): void => {
  if (document.querySelector('[data-furniture-sprite] > image') && document.querySelectorAll('[data-sprite-fallback]').length === 0) {
    w.doneAt = performance.now();
    w.done = true;
  } else setTimeout(ready, 100);
};
ready();
