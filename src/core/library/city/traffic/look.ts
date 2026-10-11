// Apparence d'un véhicule peint en Ghibli (spec véhicules §3-4) : clé des sprites, plan de peinture et jantes. Une voiture
// générée (cars.ts) et un véhicule à part (special-art.ts) se rendent de la même façon (content/vehicle/ghibli-car.tsx).
import { carArt, type CarArt } from './car-art';
import type { CarSpec, Rim } from './cars';

export type VehicleLook = { key: string; arch: string; art: CarArt; rim: Rim; rimColor: string };
// Clé identique à celle des sprites de V2 (graine + type).
export const lookOfCar = (c: CarSpec): VehicleLook => ({ key: `${c.seed}|${c.arch}`, arch: c.arch, art: carArt(c), rim: c.rim, rimColor: c.rimColor });
