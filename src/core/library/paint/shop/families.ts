import type { ShopTypeId } from '../../city/shops/catalog';

// Famille de devanture par métier (G4a, maquette validée) : A boiserie, B étal à store festonné, C café-restaurant,
// D boutique à enseigne en drapeau, E pharmacie, F commerce de nuit à néon.
export type Family = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Pict = 'glasses' | 'disc' | 'pad' | 'barber' | 'hanger' | 'paw' | 'wheel' | 'washer' | null;

export const FAMILY: Readonly<Record<ShopTypeId, Family>> = {
  bakery: 'A', pastry: 'A', chocolatier: 'A', cheese: 'A', wine: 'A', antiques: 'A', bookshop: 'A', tearoom: 'A',
  butcher: 'B', fishmonger: 'B', greengrocer: 'B', florist: 'B', grocery: 'B',
  cafe: 'C', restaurant: 'C', pizzeria: 'C', kebab: 'C', sushi: 'C',
  minimarket: 'D', optician: 'D', records: 'D', games: 'D', hairdresser: 'D', thrift: 'D', petshop: 'D', bikes: 'D', laundry: 'D',
  pharmacy: 'E',
  bar: 'F', nightclub: 'F', arcade: 'F', tattoo: 'F',
};

// Pictogramme de l'enseigne en drapeau (famille D ; la supérette n'en a pas).
const PICTS: Readonly<Partial<Record<ShopTypeId, Exclude<Pict, null>>>> = {
  optician: 'glasses', records: 'disc', games: 'pad', hairdresser: 'barber', thrift: 'hanger', petshop: 'paw', bikes: 'wheel', laundry: 'washer',
};
export const pictOf = (t: ShopTypeId): Pict => PICTS[t] ?? null;

// Faïence des pilastres (boucherie, poissonnerie).
export const TILES: Readonly<Partial<Record<ShopTypeId, string>>> = { butcher: '#FFFFFF', fishmonger: '#D8ECF6' };
