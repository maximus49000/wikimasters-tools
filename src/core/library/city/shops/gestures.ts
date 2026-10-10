import { mulberry32 } from '../../scene-world';
import type { ShopTypeId } from './catalog';

// Gestes de travail : huit familles, chacune une courte boucle (6 à 14 s) pour l'employé et pour le client.
// Fonctions pures de (type, rôle, temps, graine) : rien n'est mémorisé, la graine ne fait que déphaser la boucle.
export const FAMILIES = ['counter', 'till', 'chair', 'browse', 'drink', 'table', 'dance', 'machine'] as const;
export type Family = (typeof FAMILIES)[number];

export const SHOP_FAMILY: Readonly<Record<ShopTypeId, Family>> = {
  bakery: 'counter', pastry: 'counter', chocolatier: 'counter', butcher: 'counter', fishmonger: 'counter', cheese: 'counter', pharmacy: 'counter', florist: 'counter',
  greengrocer: 'till', wine: 'till', grocery: 'till', minimarket: 'till', petshop: 'till',
  hairdresser: 'chair', tattoo: 'chair',
  bookshop: 'browse', records: 'browse', games: 'browse', optician: 'browse', thrift: 'browse', antiques: 'browse',
  bar: 'drink', cafe: 'drink', tearoom: 'drink',
  restaurant: 'table', pizzeria: 'table', kebab: 'table', sushi: 'table',
  nightclub: 'dance', arcade: 'dance',
  laundry: 'machine', bikes: 'machine',
};

// Accessoire propre à chaque type (id de dessin) : distinct dans une même famille.
export const ACCESSORY: Readonly<Record<ShopTypeId, string>> = {
  bakery: 'baguette', pastry: 'box', chocolatier: 'chocolate', butcher: 'parcel', fishmonger: 'fish', cheese: 'wedge', pharmacy: 'pill', florist: 'bouquet',
  greengrocer: 'basket', wine: 'bottle', grocery: 'bag', minimarket: 'can', petshop: 'bone',
  hairdresser: 'scissors', tattoo: 'needle',
  bookshop: 'book', records: 'record', games: 'dice', optician: 'glasses', thrift: 'clothes', antiques: 'vase',
  bar: 'glass', cafe: 'cup', tearoom: 'teapot',
  restaurant: 'plate', pizzeria: 'pizza', kebab: 'wrap', sushi: 'tray',
  nightclub: 'cocktail', arcade: 'joystick',
  laundry: 'laundry', bikes: 'tool',
};

export type Role = 'staff' | 'customer';
export type Pose = { arms: 'down' | 'reach' | 'hold' | 'up' | 'work'; lean: number; head: 'front' | 'down' | 'turn'; item: 'none' | 'hand' | 'table' | 'counter'; sway: number };

// Durée de la boucle de chaque famille, en secondes.
export const FAMILY_PERIOD_S: Readonly<Record<Family, number>> = {
  counter: 8, till: 10, chair: 14, browse: 12, drink: 9, table: 13, dance: 6, machine: 11,
};

type Step = { to: number; arms: Pose['arms']; head: Pose['head']; item: Pose['item'] };
type Script = { steps: readonly Step[]; lean: number; sway: number; beats: number };

const s = (to: number, arms: Pose['arms'], head: Pose['head'], item: Pose['item']): Step => ({ to, arms, head, item });
// Pour chaque famille : employé et client. `to` est la fin de l'étape dans la boucle (0..1) ; `lean` et `sway` sont les
// amplitudes (sinus à `beats` oscillations par boucle, donc raccord parfait).
const SCRIPTS: Readonly<Record<Family, Readonly<Record<Role, Script>>>> = {
  counter: {
    staff: { steps: [s(0.3, 'reach', 'down', 'counter'), s(0.6, 'work', 'down', 'hand'), s(0.85, 'hold', 'front', 'hand'), s(1, 'down', 'front', 'none')], lean: 0.4, sway: 0, beats: 1 },
    customer: { steps: [s(0.4, 'down', 'front', 'none'), s(0.7, 'reach', 'front', 'none'), s(1, 'hold', 'down', 'hand')], lean: 0.2, sway: 0, beats: 1 },
  },
  till: {
    staff: { steps: [s(0.4, 'work', 'down', 'table'), s(0.7, 'reach', 'front', 'counter'), s(1, 'work', 'down', 'counter')], lean: 0.3, sway: 0, beats: 1 },
    customer: { steps: [s(0.35, 'reach', 'turn', 'none'), s(0.65, 'hold', 'front', 'hand'), s(1, 'down', 'front', 'counter')], lean: 0.25, sway: 0, beats: 1 },
  },
  chair: {
    staff: { steps: [s(0.5, 'work', 'down', 'hand'), s(0.75, 'up', 'down', 'hand'), s(1, 'work', 'down', 'hand')], lean: 0.5, sway: 0.1, beats: 3 },
    customer: { steps: [s(1, 'down', 'front', 'none')], lean: 0, sway: 0, beats: 1 },
  },
  browse: {
    staff: { steps: [s(0.45, 'work', 'down', 'table'), s(0.7, 'down', 'turn', 'none'), s(1, 'reach', 'front', 'table')], lean: 0.3, sway: 0, beats: 1 },
    customer: { steps: [s(0.35, 'reach', 'turn', 'none'), s(0.65, 'up', 'down', 'hand'), s(1, 'hold', 'down', 'hand')], lean: 0.3, sway: 0.1, beats: 2 },
  },
  drink: {
    staff: { steps: [s(0.3, 'reach', 'down', 'counter'), s(0.65, 'work', 'down', 'hand'), s(1, 'hold', 'front', 'hand')], lean: 0.3, sway: 0, beats: 1 },
    customer: { steps: [s(0.4, 'down', 'front', 'counter'), s(0.6, 'up', 'front', 'hand'), s(1, 'hold', 'down', 'counter')], lean: 0.2, sway: 0, beats: 1 },
  },
  table: {
    staff: { steps: [s(0.35, 'hold', 'front', 'hand'), s(0.6, 'reach', 'down', 'table'), s(1, 'down', 'turn', 'none')], lean: 0.35, sway: 0, beats: 1 },
    customer: { steps: [s(0.3, 'down', 'down', 'table'), s(0.55, 'up', 'down', 'hand'), s(1, 'hold', 'front', 'table')], lean: 0.2, sway: 0, beats: 1 },
  },
  dance: {
    staff: { steps: [s(0.5, 'work', 'down', 'table'), s(1, 'up', 'front', 'table')], lean: 0.2, sway: 0.35, beats: 3 },
    customer: { steps: [s(0.5, 'up', 'front', 'none'), s(1, 'work', 'turn', 'none')], lean: 0.3, sway: 0.9, beats: 4 },
  },
  machine: {
    staff: { steps: [s(0.4, 'reach', 'down', 'hand'), s(0.75, 'work', 'down', 'hand'), s(1, 'down', 'turn', 'none')], lean: 0.5, sway: 0, beats: 1 },
    customer: { steps: [s(0.4, 'reach', 'down', 'hand'), s(0.7, 'down', 'front', 'none'), s(1, 'down', 'turn', 'none')], lean: 0.3, sway: 0, beats: 1 },
  },
};

export function gestureAt(type: ShopTypeId, role: Role, t: number, seed: number): Pose {
  const family = SHOP_FAMILY[type];
  const period = FAMILY_PERIOD_S[family];
  const script = SCRIPTS[family][role];
  // Déphasage propre à la graine (et au rôle, pour que l'employé et le client ne soient pas synchrones).
  const offset = mulberry32((seed ^ (role === 'staff' ? 0x51 : 0xc3)) >>> 0)() * period;
  const u = ((((t + offset) % period) + period) % period) / period;
  const step = script.steps.find((x) => u < x.to) ?? script.steps[script.steps.length - 1]!;
  return {
    arms: step.arms,
    head: step.head,
    item: step.item,
    lean: script.lean * Math.sin(2 * Math.PI * u),
    sway: script.sway * Math.sin(2 * Math.PI * u * script.beats),
  };
}

// Le client repart avec un petit objet quand la famille s'y prête.
export const takesAway = (type: ShopTypeId): boolean => {
  const f = SHOP_FAMILY[type];
  return f === 'counter' || f === 'till' || f === 'browse';
};
