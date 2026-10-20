import { memo, useEffect, useId, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { actorActive } from '../core/library/activity';
import type { CityContext } from '../core/library/city/intensity';
import type { SceneId } from '../core/library/library-types';
import { actorX, actorsFor, mulberry32, type Actor } from '../core/library/scene-world';
import type { MoonPhase } from '../core/library/astro';
import type { Sky } from '../core/library/sky';
import type { Weather } from '../core/library/weather/weather-types';
import { useArtStyle } from './art-setting';
import { CityLifeLayer, StreetLamps } from './city-life';
import { FIGURE_SPRITES_MAX, FigureContext, FigureRegistry } from './figure/figure-host';
import { ShopContext, ShopRegistry } from './shop/shop-host';
import { CarContext, CarRegistry } from './vehicle/car-host';
import { PropContext, PropRegistry } from './prop/prop-host';
import { CityScene } from './scene-city';
import { GhibliMoon, GhibliSkyTexture, GhibliStarCrosses, GhibliSun, fadeStyle, moonLitPath, moonOpacity, reducedMotion, useShownAfterMount } from './ghibli-sky';
import { usePaintedSky, type PaintedSky } from './painted-sky';
import { CountrysideScene, MountainScene, SeaScene } from './scene-nature';
import { moonPlace, sunPlace } from './sky-place';
import { ActorSprite } from './scene-sprites';
import { EarthScene, SpaceScene } from './scene-space';

// `gloom` : ciel sombre (lumières allumées en plein jour) ; `rainy` : il pleut (parapluies). Toujours faux hors scènes terrestres.
// `city` : contexte de la ville (jour, heure, météo) qui règle sa population ; sans lui, la Ville n'a pas de passants.
// `forcedNight` : mode d'heure « Toujours la nuit » (les lampadaires restent allumés).
// `weather` : horloge de la météo (identité stable), lue par les terrasses de la Ville ; absente hors scènes terrestres.
export type SceneBodyProps = { width: number; height: number; sky: Sky; minutes: number; seed: number; gloom?: boolean; rainy?: boolean; city?: CityContext; forcedNight?: boolean; weather?: { read(nowMs: number): Weather } };
export type PanoramaProps = SceneBodyProps & { scene: SceneId };

const FRAME_MS = 30;

// `still` : mouvement réduit, lu une fois par rendu du décor.
type PaintedProps = { painted: PaintedSky | null; shown: boolean; still: boolean };

export type Star = { i: number; x: number; y: number; r: number };
export const starsFor = (width: number, height: number, seed: number): Star[] => {
  const rng = mulberry32(seed ^ 0x57a45);
  return Array.from({ length: Math.round(width / 9) }, (_, i) => ({ i, x: rng() * width, y: rng() * height * 0.65, r: 0.7 + rng() * 1.3 }));
};

function SkyAndStars({ width, height, sky, seed, painted, shown, still }: SceneBodyProps & PaintedProps): ReactElement {
  const gradientId = useId().replace(/:/g, '');
  const stars = useMemo(() => starsFor(width, height, seed), [width, height, seed]);
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
      {/* Voile d'altitude (cirrus de la météo réelle) : ciel laiteux, posé par la couche météo. */}
      <rect data-sky-haze x={0} y={0} width={width} height={height} style={{ fill: 'var(--wmt-haze-color, #EEF2F6)', opacity: 'var(--wmt-haze, 0)' }} />
      {painted && <GhibliSkyTexture width={width} height={height} url={painted.texture} shown={shown} still={still} daylight={sky.daylight} />}
      <g opacity={sky.stars} style={{ transition: 'opacity 4s ease' }}>
        {sky.stars > 0 && stars.map((s) => <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" />)}
      </g>
      {painted && <GhibliStarCrosses stars={stars} opacity={sky.stars} shown={shown} still={still} />}
    </g>
  );
}

// Sans phase connue (aperçus) : lune gibbeuse, bord éclairé à gauche, comme l'ancien dessin.
const DEFAULT_PHASE: MoonPhase = { lit: 0.85, limb: Math.PI };

export { celestialPlace, moonPlace, sunPlace } from './sky-place';

// Soleil et lune traversent toute la largeur du monde : ils passent d'une fenêtre à l'autre au fil de la journée.
function Celestial({ width, height, sky, painted, shown, still }: SceneBodyProps & PaintedProps): ReactElement {
  const sun = sunPlace(sky, width, height);
  const moon = moonPlace(sky, width, height);
  const phase = sky.moonPhase ?? DEFAULT_PHASE;
  const limbDeg = (phase.limb * 180) / Math.PI;
  // Éclat de la lune ; sans ciel réel (aperçus), celui de la phase par défaut.
  const light = sky.moonLight ?? phase.lit ** 1.5;
  return (
    <g data-celestial style={{ opacity: 'var(--wmt-celestial, calc(1 - var(--wmt-overcast, 0)))' }}>
      {sun && (
        <g data-sun="" data-classic-sun="" transform={`translate(${sun.x} ${sun.y})`} style={fadeStyle(!shown, still)}>
          <circle r={40} fill="#FFE27A" opacity={0.22} />
          <circle r={22} fill={sky.twilight > 0.4 ? '#FF9A4A' : '#FFE27A'} />
        </g>
      )}
      {moon && (
        <g data-moon="" data-classic-moon="" data-moon-lit={phase.lit.toFixed(2)} transform={`translate(${moon.x} ${moon.y})`} opacity={moonOpacity(sky.daylight)} style={fadeStyle(!shown, still)}>
          {/* Halo : plus grand et plus vif quand la lune est pleine et haute. */}
          <circle r={Number((24 + 22 * light).toFixed(1))} fill="#DCE4FF" opacity={Number((0.16 * light * (1 - sky.daylight)).toFixed(2))} />
          {/* Lumière cendrée : la part sombre se devine la nuit, surtout sur un croissant. */}
          <circle r={18} fill="#B8C0DC" opacity={Number((0.2 * (1 - phase.lit) * (1 - sky.daylight)).toFixed(2))} />
          <path d={moonLitPath(18, phase.lit)} transform={`rotate(${limbDeg.toFixed(1)})`} fill="#E8ECFF" />
        </g>
      )}
      {painted && sun && <GhibliSun x={sun.x} y={sun.y} twilight={sky.twilight} painted={painted} shown={shown} still={still} />}
      {painted && moon && <GhibliMoon x={moon.x} y={moon.y} phase={phase} light={light} daylight={sky.daylight} painted={painted} shown={shown} still={still} />}
    </g>
  );
}

// Boucle d'animation : met les acteurs à leur place sans re-rendu React. Les positions viennent de l'horloge murale :
// toutes les vues (dont la copie soulevée d’une fenêtre, par <use>) voient donc le même instant.
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
// si bien que la copie `<use>` d’une fenêtre soulevée n’est pas recalculée à chaque image.
function ScenePanoramaStaticView({ scene, width, height, sky, minutes, seed, gloom = false, rainy = false, city, forcedNight = false, weather }: PanoramaProps): ReactElement {
  // `weather` : le fond vivant de la ville lit la neige posée et la météo une fois par minute (scene-city.tsx).
  const props = { width, height, sky, minutes, seed, gloom, rainy, city, forcedNight, weather };
  const terrestrial = scene !== 'space' && scene !== 'earth';
  const [art] = useArtStyle();
  const ghibli = art === 'ghibli' && scene === 'city';
  const painted = usePaintedSky(seed, ghibli);
  // Rendu dès que les images sont prêtes (même bascule désactivée, pour le fondu de sortie) ; montré seulement en Ghibli.
  const skyArt = scene === 'city' && painted.ready ? painted : null;
  const still = reducedMotion();
  // Les nœuds peints naissent à opacité 0, puis passent à 1 au rendu suivant : le fondu joue dès la première apparition.
  const shown = useShownAfterMount(skyArt !== null, ghibli, still);
  return (
    <g data-panorama="" data-scene={scene}>
      {terrestrial && <SkyAndStars {...props} painted={skyArt} shown={shown} still={still} />}
      {terrestrial && <Celestial {...props} painted={skyArt} shown={shown} still={still} />}
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
function SceneActorsView({ scene, width, height, sky, minutes, seed, rainy = false, city, forcedNight = false, weather }: PanoramaProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  const [art] = useArtStyle();
  // Ghibli Ville : les cumulus peints de la couche météo remplacent les nuages blancs plats des acteurs.
  const noClouds = art === 'ghibli' && scene === 'city';
  const actors = useMemo(() => {
    const all = actorsFor(scene, width, height, seed);
    return noClouds ? all.filter((a) => a.kind !== 'cloud') : all;
  }, [scene, width, height, seed, noClouds]);
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
      {scene === 'city' && city && <CityLifeLayer width={width} height={height} sky={sky} seed={seed} city={city} rainy={rainy} forcedNight={forcedNight} weather={weather} />}
      {/* Sans contexte de ville (pas de population), les lampadaires restent : ils sont dans ce calque pour passer devant les passants. */}
      {scene === 'city' && !city && <StreetLamps width={width} height={height} seed={seed} minutes={minutes} daylight={sky.daylight} forcedNight={forcedNight} ghibli={art === 'ghibli'} />}
    </g>
  );
}

// Le décor ne se redessine que si la scène, la taille ou la minute changent.
// Les appelants doivent passer des objets `sky` et `city` mémoïsés (issus de useSceneTime / RoomView), sinon le memo est inopérant.
export const ScenePanoramaStatic = memo(ScenePanoramaStaticView);
export const SceneActors = memo(SceneActorsView);

// Décor complet (fixe puis acteurs) dans un même groupe, pour un affichage sans fenêtres `<use>`.
export function ScenePanorama(props: PanoramaProps): ReactElement {
  // Cache des sprites du pantin (Ghibli) propre à cet affichage.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // Plafond de sprites : la rue Ghibli des commerces (gestes des employés et des clients, G4b) dépasse 1 500 poses en vue
  // à midi ; au-delà du plafond le cache tourne et repeint sans cesse. Le classique n'en approche pas.
  // Budget de peinture par image inchangé (défaut, spec G4b §7) ; même réglage que RoomView, la vue livrée.
  const figures = useMemo(() => new FigureRegistry(`pf${uid}`, { max: FIGURE_SPRITES_MAX }), [uid]);
  const cars = useMemo(() => new CarRegistry(`pc${uid}`), [uid]);
  const shops = useMemo(() => new ShopRegistry(`ps${uid}`), [uid]);
  // Accessoires de rue Ghibli (G5) : une instance partagée par le décor fixe et les acteurs.
  const propSprites = useMemo(() => new PropRegistry(`pp${uid}`), [uid]);
  return (
    <g data-panorama-full="">
      <ShopContext.Provider value={shops}>
      <PropContext.Provider value={propSprites}>
        <ScenePanoramaStatic {...props} />
      </PropContext.Provider>
      </ShopContext.Provider>
      <FigureContext.Provider value={figures}>
        <ShopContext.Provider value={shops}>
        <CarContext.Provider value={cars}>
        <PropContext.Provider value={propSprites}>
          <SceneActors {...props} />
        </PropContext.Provider>
        </CarContext.Provider>
        </ShopContext.Provider>
      </FigureContext.Provider>
    </g>
  );
}
