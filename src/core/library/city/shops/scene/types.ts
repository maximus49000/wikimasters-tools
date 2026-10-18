import type { Outfit } from '../../people';
import type { ShopTypeId } from '../catalog';
import type { MoveId, PictoId, PropId } from './moves';

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

// ---- Partition du metteur en scène ----
// Acteur : `staff:<shiftId>` pour un employé, `<partyId>:<rang du membre>` pour un client.
export type ActorId = string;
// Segment d'une partition : de t0 à t1 (s depuis le début du créneau), x local à la vitrine interpolé de x0 à x1, orientation
// (indice 0-15) de yaw0 à yaw1. `move` : geste de la bibliothèque (MOVES) ou marche / demi-tour / station debout ; les poses
// (bras, penché, tête, allure) se déduisent du geste par keyAtTime à la lecture. `prop` : objet tenu pendant le segment ;
// `picto` : picto du geste retenu par la règle de rareté (null s'il est tu) ; `seed` : variation propre au segment ; `seated` :
// l'acteur occupe un siège (fauteuil, chaise d'attente, table), de l'assise jusqu'à la marche qui le relève : allure assise
// à la lecture, quel que soit le geste (sauf accroupi).
export type Segment = { t0: number; t1: number; move: MoveId | 'walk' | 'turn' | 'idle'; x0: number; x1: number; yaw0: number; yaw1: number; prop: PropId | null; picto: PictoId | null; seed: number; seated?: true };
// `enter` / `exit` : instants où le client franchit la porte du local (null s'il n'entre pas) ; pour un employé, sortie de
// l'arrière-boutique / retour (null s'il est là aux bornes du créneau). `arriveAt` : arrivée du client à la porte (s depuis le
// début du créneau, Party.arriveAt) ; `dir` : son sens de marche à l'aller (Party.dir) ; null tous deux pour un employé.
// `child` : enfant d'un parti parent-enfant (corps d'enfant en 3D) ; absent pour un adulte.
export type ActorTrack = { id: ActorId; role: 'staff' | 'customer'; outfit: Outfit; scale: number; child?: true; party: string | null; enter: number | null; exit: number | null; arriveAt: number | null; dir: 1 | -1 | null; segments: Segment[] };
export type Score = { key: string; start: number; length: number; tracks: ActorTrack[]; log: string[] };
// État de la rue fourni au créneau (déjà déterministe) : début d'averse, de défilé, passages du car (s depuis le début du créneau) ;
// `paradeTo` : dernier instant du défilé dans le créneau (absent ou null : inconnu) ; `umbrellas` : on a son parapluie (absent : non), le client qui sort l'ouvre au lieu d'attendre la fin de l'averse (street.ts).
export type StreetState = { rainFrom: number | null; paradeFrom: number | null; paradeTo?: number | null; busAt: number[]; umbrellas?: boolean };
