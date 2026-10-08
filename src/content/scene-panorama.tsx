import { memo, useEffect, useId, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { actorActive } from '../core/library/activity';
import type { SceneId } from '../core/library/library-types';
import { actorX, actorsFor, mulberry32, type Actor } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { CityScene } from './scene-city';
import { CountrysideScene, MountainScene, SeaScene } from './scene-nature';
import { ActorSprite } from './scene-sprites';
import { EarthScene, SpaceScene } from './scene-space';

export type SceneBodyProps = { width: number; height: number; sky: Sky; minutes: number; seed: number };
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
      <g opacity={sky.stars} style={{ transition: 'opacity 4s ease' }}>
        {sky.stars > 0 && stars.map((s) => <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" />)}
      </g>
    </g>
  );
}

// Soleil et lune traversent toute la largeur du monde : ils passent d'une fenêtre à l'autre au fil de la journée.
function Celestial({ width, height, sky }: SceneBodyProps): ReactElement {
  const place = (frac: number): { x: number; y: number } => ({ x: width * (0.04 + 0.92 * frac), y: height * 0.7 - Math.sin(Math.PI * frac) * height * 0.55 });
  const sun = sky.sunFrac === null ? null : place(sky.sunFrac);
  const moon = sky.moonFrac === null ? null : place(sky.moonFrac);
  return (
    <g data-celestial>
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

function ScenePanoramaView({ scene, width, height, sky, minutes, seed }: PanoramaProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  const actors = useMemo(() => actorsFor(scene, width, height, seed), [scene, width, height, seed]);
  useActorLoop(root, actors, width);
  const props = { width, height, sky, minutes, seed };
  const terrestrial = scene !== 'space' && scene !== 'earth';
  const t0 = Date.now() / 1000;
  return (
    <g data-panorama="" data-scene={scene} ref={root}>
      {terrestrial && <SkyAndStars {...props} />}
      {terrestrial && <Celestial {...props} />}
      {scene === 'city' && <CityScene {...props} />}
      {scene === 'countryside' && <CountrysideScene {...props} />}
      {scene === 'mountain' && <MountainScene {...props} />}
      {scene === 'sea' && <SeaScene {...props} />}
      {scene === 'space' && <SpaceScene {...props} />}
      {scene === 'earth' && <EarthScene {...props} />}
      <g data-actors>
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
              <ActorSprite kind={actor.kind} sky={sky} />
            </g>
          );
        })}
      </g>
    </g>
  );
}

// Le décor ne se redessine que si la scène, la taille ou la minute changent.
// Les appelants doivent passer un objet `sky` mémoïsé (issu de useSceneTime), sinon le memo est inopérant.
export const ScenePanorama = memo(ScenePanoramaView);
