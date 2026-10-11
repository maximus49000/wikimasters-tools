// src/content/vehicle/scripted-car.tsx
import type { ReactElement, ReactNode } from 'react';
import { specialLook, type SpecialId, type SpecialSpec } from '../../core/library/city/traffic/special-art';
import type { Sky } from '../../core/library/sky';
import type { FigureRegistry } from '../figure/figure-host';
import type { CarRegistry } from './car-host';
import { GhibliCar, placeCar } from './ghibli-car';

// Véhicule scénarisé peint (spec véhicules, livraison V5 : camionnette, camion plateau et nacelle des équipes, camion de
// déménagement, véhicules du défilé). Son modèle (special-art.ts) est dessiné aux cotes de son sprite classique : on le pose
// dans le repère de ce sprite AVANT sa mise à l'échelle (le classique applique `scale(dir·k, k)`). GhibliCar porte le sens
// sans miroir (`scale(k)`) ; les éléments dynamiques gardent le dessin classique en miroir (`scale(dir·k, k)`) : `under`
// sous la carrosserie (stabilisateurs), `children` par-dessus (échelle, chargement, portière, hayon, drapeaux).
// `roll` : véhicule déplacé par transition CSS (position px du monde et transition) : roues par la même transition, images
// peintes tout de suite, gyrophares par <animate>. Sans `roll` : une boucle le pose (placeScripted).
export type ScriptedCarProps = {
  spec: SpecialSpec;
  dir: 1 | -1;
  k: number;
  sky: Sky;
  rainy: boolean;
  lights: boolean;
  still: boolean;
  roll?: { worldX: number; move?: string };
  occupied?: boolean;
  under?: ReactNode;
  children?: ReactNode;
};

export function ScriptedCar({ spec, dir, k, sky, rainy, lights, still, roll, occupied = true, under, children }: ScriptedCarProps): ReactElement {
  const kk = k.toFixed(3);
  const mirror = `scale(${(dir * k).toFixed(3)} ${kk})`;
  return (
    <>
      {under && <g transform={mirror}>{under}</g>}
      <g data-scripted-car="" data-sid={spec.id} data-seed={spec.seed} data-paint={spec.paint ?? ''} transform={`scale(${kk})`}>
        <GhibliCar
          look={specialLook(spec)}
          dir={dir}
          sky={sky}
          rainy={rainy}
          lights={lights}
          still={still}
          occupied={occupied}
          paintNow={!!roll}
          blink={!!roll}
          roll={roll ? { x: roll.worldX / k, move: roll.move } : undefined}
        />
      </g>
      {children && <g transform={mirror}>{children}</g>}
    </>
  );
}

// Pose par une boucle (défilé) : `dist` et `v` en unités du véhicule ; le modèle est recomposé depuis les attributs.
export function placeScripted(fig: FigureRegistry, cars: CarRegistry, node: Element, dist: number, v: number, dir: 1 | -1, t: number): void {
  const car = node.querySelector('[data-ghibli-car]');
  if (!car) return;
  const paint = node.getAttribute('data-paint') || undefined;
  const spec: SpecialSpec = { id: node.getAttribute('data-sid') as SpecialId, seed: Number(node.getAttribute('data-seed')), ...(paint ? { paint } : {}) };
  placeCar(fig, cars, car, { look: specialLook(spec), dist, v, lean: 0, seed: spec.seed }, dir, t);
}
