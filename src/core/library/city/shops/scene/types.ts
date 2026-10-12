import type { Outfit } from '../../people';
import type { ShopTypeId } from '../catalog';

// Types partagés du metteur en scène des commerces (G4b). Module de types seulement : aucun code exécuté ici.

// Caractère du meneur d'un parti : colore ses décisions (pressé, bavard, indécis, habitué, perdu, ordinaire).
export type Character = 'rushed' | 'chatty' | 'undecided' | 'regular' | 'lost' | 'ordinary';
export type PartyKind = 'solo' | 'couple' | 'parent-child' | 'friends';
// Aléas tirés à l'avance : joués seulement si l'occasion se présente pendant la visite.
export type Incident = 'drop-coin' | 'no-change' | 'sneeze' | 'phone-ring' | 'child-tug';
export type Member = { id: string; outfit: Outfit; scale: number; child: boolean };
export type Party = {
  id: string; // `${slotId}-c${slot}-p${i}`
  kind: PartyKind;
  members: Member[]; // meneur en [0]
  character: Character;
  arriveAt: number; // s depuis le début du créneau, arrivée à la porte
  dir: 1 | -1; // sens de marche à l'aller
  incidents: Incident[]; // tirés à l'avance, joués si l'occasion se présente
  knows: string | null; // id d'un autre parti du créneau qu'il connaît
};
// Identité d'un créneau : `day` est un numéro de jour (`dayNumber` de hours.ts), `index` le rang du créneau dans la journée.
export type SlotKey = { seed: number; slotId: string; type: ShopTypeId; day: number; index: number };
