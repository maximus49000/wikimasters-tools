// Identité 3D des personnages des scènes : graine tirée d'un id stable (passant `ped-3`, client `…-p2:1`, employé…), et type
// de corps imposé par la scène (enfants). Même id → même habitant, d'un rendu et d'une ouverture à l'autre.
import type { Profile } from '../library/city/people';
import { hashString } from '../library/scene-world';
import type { CitizenKind } from './catalogue';

/** Graine d'habitant d'un personnage à id stable. */
export const citizenSeed = (id: string): number => hashString(id);

/** Type de corps d'un profil de la ville : enfant pour le profil `child`, sinon tirage (adulte ou ancien). */
export const kindOfProfile = (p: Profile): CitizenKind | undefined => (p === 'child' ? 'child' : undefined);
