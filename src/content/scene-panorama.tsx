import { memo, useEffect, useId, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { actorActive } from '../core/library/activity';
import type { CityContext } from '../core/library/city/intensity';
import type { SceneId } from '../core/library/library-types';
import { actorX, actorsFor, mulberry32, type Actor } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { CityLifeLayer } from './city-life';
import { CityScene } from './scene-city';
import { CountrysideScene, MountainScene, SeaScene } from './scene-nature';
import { ActorSprite } from './scene-sprites';
import { EarthScene, SpaceScene } from './scene-space';

// `gloom` : ciel sombre (lumières allumées en plein jour) ; `rainy` : il pleut (parapluies). Toujours faux hors scènes terrestres.
// `city` : contexte de la ville (jour, heure, météo) qui règle sa population ; sans lui, la Ville n'a pas de passants.
// `forcedNight` : mode d'heure « Toujours la nuit » (les lampadaires restent allumés).
export type SceneBodyProps = { width: number; height: number; sky: Sky; minutes: number; seed: number; gloom?: boolean; rainy?: boolean; city?: CityContext; forcedNight?: boolean };
export type PanoramaProps = SceneBodyProps & { scene: SceneId };

const FRAME_MS = 30;

function SkyAndStars({ width, height, sky, seed }: SceneBodyProps): ReactElement {
  const gradientId = useId().replace(/:/g, '');
  const stars = useMemo(() => {
    const rng = mulberry32(seed ^ 0x57a45);
    return Array.from({ length: Math.round(width / 9) }, (_, i) => ({ i, x: rng() * width, y: rng() * height * 0.65, r: 0.7 + rng() * 1.3 }));
  }, [width, height, seed]);
  return (
    <g data-sky-layer>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
      </defs>
      <rect data-sky x={0} y={0} width={width} height={height} fill={`url(#${gradientId})`} />
      {/* Ciel couvert : gris plein, sous les immeubles (variables posées par la couche météo sur le <svg> de la pièce). */}
      <rect data-sky-veil x={0} y={0} width={width} height={height} style={{ fill: 'var(--wmt-overcast-color, #B9C0CA)', opacity: 'var(--wmt-overcast, 0)' }} />
      <g opacity={sky.stars} style={{ transition: 'opacity 4s ease' }}>
        {sky.stars > 0 && stars.map((s) => <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" />)}
      </g>
    </g>
  );
}

// Position d'un astre (soleil ou lune) selon sa fraction de course (0 = lever, 1 = coucher), dans le repère du monde.
export const celestialPlace = (frac: number, width: number, height: number): { x: number; y: number } => ({
  x: width * (0.04 + 0.92 * frac),
  y: height * 0.7 - Math.sin(Math.PI * frac) * height * 0.55,
});

// Soleil et lune traversent toute la largeur du monde : ils passent d'une fenêtre à l'autre au fil de la journée.
function Celestial({ width, height, sky }: SceneBodyProps): ReactElement {
  const place = (frac: number): { x: number; y: number } => celestialPlace(frac, width, height);
  const sun = sky.sunFrac === null ? null : place(sky.sunFrac);
  const moon = sky.moonFrac === null ? null : place(sky.moonFrac);
  return (
    <g data-celestial style={{ opacity: 'calc(1 - var(--wmt-overcast, 0))' }}>
      {sun && (
        <g data-sun="" transform={`translate(${sun.x} ${sun.y})`}>
          <circle r={34} fill="#FFE27A" opacity={0.25} />
          <circle r={22} fill={sky.twilight > 0.4 ? '#FF9A4A' : '#FFE27A'} />
        </g>
      )}
      {moon && (
        <g data-moon="" transform={`translate(${moon.x} ${moon.y})`}>
          <circle r={18} fill="#E8ECFF" />
          <circle cx={6} cy={-4} r={16} fill={sky.bottom} opacity={0.35} />
        </g>
      )}
    </g>
  );
}

// Boucle d'animation : met les acteurs à leur place sans re-rendu React. Les positions viennent de l'horloge murale :
// toutes les fenêtres (copies <use> du même groupe) voient donc le même instant.
function useActorLoop(root: RefObject<SVGGElement | null>, actors: Actor[], width: number): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nodes = new Map<string, SVGGElement>();
    for (const actor of actors) {
      const node = el.querySelector<SVGGElement>(`[data-actor="${actor.id}"]`);
      if (node) nodes.set(actor.id, node);
    }
    const place = (): void => {
      const t = Date.now() / 1000;
      for (const actor of actors) nodes.get(actor.id)?.setAttribute('transform', `translate(${actorX(actor, width, t).toFixed(1)} ${actor.y}) scale(${actor.speed < 0 ? -actor.scale : actor.scale} ${actor.scale})`);
    };
    place();
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      place();
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [actors, width, root]);
}

// Décor fixe : ciel, étoiles, soleil, lune et paysage. Il ne change qu'à la minute ; aucune animation n'y touche,
// si bien que les copies `<use>` de chaque fenêtre ne sont pas recalculées à chaque image.
function ScenePanoramaStaticView({ scene, width, height, sky, minutes, seed, gloom = false, rainy = false, city, forcedNight = false }: PanoramaProps): ReactElement {
  const props = { width, height, sky, minutes, seed, gloom, rainy, city, forcedNight };
  const terrestrial = scene !== 'space' && scene !== 'earth';
  return (
    <g data-panorama="" data-scene={scene}>
      {terrestrial && <SkyAndStars {...props} />}
      {terrestrial && <Celestial {...props} />}
      {scene === 'city' && <CityScene {...props} />}
      {scene === 'countryside' && <CountrysideScene {...props} />}
      {scene === 'mountain' && <MountainScene {...props} />}
      {scene === 'sea' && <SeaScene {...props} />}
      {scene === 'space' && <SpaceScene {...props} />}
      {scene === 'earth' && <EarthScene {...props} />}
    </g>
  );
}

// Acteurs animés (passants, voitures, bateaux…), dans le même repère et sur la même horloge murale que le décor fixe :
// la boucle d'animation ne modifie que ce groupe.
function SceneActorsView({ scene, width, height, sky, minutes, seed, rainy = false, city }: PanoramaProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  const actors = useMemo(() => actorsFor(scene, width, height, seed), [scene, width, height, seed]);
  useActorLoop(root, actors, width);
  const t0 = Date.now() / 1000;
  return (
    <g data-actors="" data-scene={scene} ref={root}>
      {actors.map((actor) => {
        const active = actorActive(actor.u, minutes);
        return (
          <g
            key={actor.id}
            data-actor={actor.id}
            data-kind={actor.kind}
            data-u={actor.u}
            data-active={active ? 'true' : 'false'}
            transform={`translate(${actorX(actor, width, t0).toFixed(1)} ${actor.y}) scale(${actor.speed < 0 ? -actor.scale : actor.scale} ${actor.scale})`}
            opacity={active ? 1 : 0}
            style={{ transition: 'opacity 3s ease' }}
          >
            <ActorSprite kind={actor.kind} sky={sky} rainy={rainy} />
          </g>
        );
      })}
      {/* Ville : la population (passants, habitants, circulation) a sa propre couche et sa propre boucle. */}
      {scene === 'city' && city && <CityLifeLayer width={width} height={height} sky={sky} seed={seed} city={city} rainy={rainy} />}
    </g>
  );
}

// Le décor ne se redessine que si la scène, la taille ou la minute changent.
// Les appelants doivent passer des objets `sky` et `city` mémoïsés (issus de useSceneTime / RoomView), sinon le memo est inopérant.
export const ScenePanoramaStatic = memo(ScenePanoramaStaticView);
export const SceneActors = memo(SceneActorsView);

// Décor complet (fixe puis acteurs) dans un même groupe, pour un affichage sans fenêtres `<use>`.
export function ScenePanorama(props: PanoramaProps): ReactElement {
  return (
    <g data-panorama-full="">
      <ScenePanoramaStatic {...props} />
      <SceneActors {...props} />
    </g>
  );
}
