import { hashString, mulberry32 } from '../../scene-world';
import type { ArmPose } from '../../figure/skeleton';

// Service en terrasse (revue du 2026-10-13 : « tout doit être naturel ») : un déroulé complet par convive, au lieu d'un geste
// en boucle et d'un serveur qui va et vient sans rien poser.
// - Le serveur apporte la boisson et la POSE sur la table (geste « give ») : la tasse est alors sur la table.
// - Le convive la prend, la porte à la bouche, boit, la repose ; plusieurs gorgées espacées jusqu'à la finir ; entre deux,
//   il fait autre chose (attend, lit, téléphone, menton dans la main…).
// - Avant de partir, il PAIE : le serveur vient avec son carnet, le convive tend sa carte ou ses billets.
// - La tasse ne disparaît jamais : elle reste sur la table (vide) jusqu'à ce qu'un serveur vienne débarrasser (geste « take »,
//   il repart la tasse à la main) — parfois après la dernière gorgée, souvent après le départ du convive.
// Chaque passage du serveur est une tâche à heure fixe tirée de la clé du convive (aucune cascade : l'arrivée d'un nouveau
// convive ne décale pas les autres) ; deux tâches qui se chevauchent sont faites par deux employés (le second sort aussi).
// Moteur pur, en secondes de l'horloge murale.

export type ServedGuest = { key: string; table: number; seat: 0 | 1; sitAt: number; leaveAt: number };
export type GuestService = { key: string; table: number; seat: 0 | 1; sitAt: number; leaveAt: number; served: number; sips: number[]; pay: number; clear: number };
export type TaskKind = 'bring' | 'pay' | 'clear';
// `at` : arrivée à la table (début du geste) ; `act` : durée du geste ; `staff` : 0 serveur, 1 collègue.
export type WaiterTask = { kind: TaskKind; key: string; table: number; seat: 0 | 1; at: number; act: number; staff: 0 | 1 };

// Gorgée : prendre (0 → 1 s), boire (1 → 3,2 s), reposer (3,2 → 4,2 s) ; la tasse est en main de 0,8 à 3,6 s.
export const SIP_S = 4.2;
const IN_HAND = [0.8, 3.6] as const;
export const ACT_S: Readonly<Record<TaskKind, number>> = { bring: 2.2, pay: 4, clear: 1.6 };
// Le geste « give » pose la tasse à 1,2 s : elle est sur la table à partir de là.
const SET_DOWN = 1.2;
// Le geste « take » du débarrassage la prend à 0,8 s.
const PICK_UP = 0.8;
// Durée d'un aller (porte → table) côté serveur : sert à répartir les tâches entre les deux employés.
const TRIP_S = 6;

const IDLE: readonly ArmPose[] = ['down', 'down', 'chin', 'read', 'phone', 'crossed', 'down'];

// Déroulé d'un convive (tiré de sa clé).
export function guestService(g: ServedGuest, seed: number): GuestService {
  const r = mulberry32(seed ^ hashString(`service/${g.key}`));
  const stay = g.leaveAt - g.sitAt;
  // Commande servie 40 s à 2 min après s'être assis (plus vite si le convive ne reste pas longtemps).
  const served = g.sitAt + Math.min(40 + r() * 80, Math.max(10, stay * 0.15));
  // Paiement 40 s à 1 min 30 avant de se lever (jamais avant d'avoir été servi).
  const pay = Math.max(served + ACT_S.bring + 10, g.leaveAt - (40 + r() * 50));
  // Gorgées : 6 à 12, étalées sur 40 à 85 % du temps qui reste avant de payer (on boit en discutant, pas d'une traite), à
  // intervalles irréguliers ; la première peu après avoir été servi.
  const sips: number[] = [];
  const n = 6 + Math.floor(r() * 7);
  const t0 = served + ACT_S.bring + 6 + r() * 15;
  const span = Math.max(0, (pay - 4 - SIP_S - t0) * (0.4 + 0.45 * r()));
  const gap = n > 1 ? span / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * gap + (i > 0 && i < n - 1 ? (r() - 0.5) * gap * 0.6 : 0);
    if (t + SIP_S >= pay - 4 || (sips.length > 0 && t < sips[sips.length - 1]! + SIP_S + 4)) continue;
    sips.push(t);
  }
  const finish = sips.length > 0 ? sips[sips.length - 1]! + SIP_S : served + ACT_S.bring;
  // Débarrassage : une fois sur trois peu après la dernière gorgée (si le convive reste encore), sinon après son départ.
  const early = r() < 0.35 && finish + 150 < pay;
  const clear = early ? finish + 40 + r() * 80 : g.leaveAt + 25 + r() * 150;
  return { key: g.key, table: g.table, seat: g.seat, sitAt: g.sitAt, leaveAt: g.leaveAt, served, sips, pay, clear };
}

// Tâches du serveur pour ces convives, réparties entre deux employés (le collègue ne sort que si le serveur est déjà dehors).
export function waiterTasks(services: readonly GuestService[]): WaiterTask[] {
  const tasks: Omit<WaiterTask, 'staff'>[] = [];
  for (const s of services) {
    tasks.push({ kind: 'bring', key: s.key, table: s.table, seat: s.seat, at: s.served, act: ACT_S.bring });
    if (s.pay < s.leaveAt) tasks.push({ kind: 'pay', key: s.key, table: s.table, seat: s.seat, at: s.pay, act: ACT_S.pay });
    tasks.push({ kind: 'clear', key: s.key, table: s.table, seat: s.seat, at: s.clear, act: ACT_S.clear });
  }
  tasks.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : 1));
  const busy: [number, number] = [-Infinity, -Infinity];
  return tasks.map((t) => {
    const from = t.at - TRIP_S;
    const to = t.at + t.act + TRIP_S;
    const staff: 0 | 1 = busy[0] <= from ? 0 : 1;
    busy[staff] = Math.max(busy[staff], to);
    return { ...t, staff };
  });
}

// Pose du convive assis à l'instant t : bras, tasse en main.
export function guestPoseAt(s: GuestService, t: number, payWith: 'pay-card' | 'pay-cash'): { arms: ArmPose; cup: boolean } {
  for (const at of s.sips) {
    const d = t - at;
    if (d < 0 || d >= SIP_S) continue;
    return { arms: d < 1 || d >= 3.2 ? 'take' : 'taste', cup: d >= IN_HAND[0] && d < IN_HAND[1] };
  }
  if (t >= s.pay && t < s.pay + ACT_S.pay) return { arms: t - s.pay > 0.6 ? payWith : 'down', cup: false };
  // Entre deux : une occupation qui change toutes les 40 à 90 s.
  const slot = Math.floor((t - s.sitAt) / 65);
  const r = mulberry32(hashString(`${s.key}/idle/${slot}`))();
  return { arms: IDLE[Math.floor(r * IDLE.length)]!, cup: false };
}

// Tasse sur la table à l'instant t : posée par le serveur, absente pendant les gorgées (en main), jusqu'au débarrassage.
export function cupOnTable(s: GuestService, t: number): boolean {
  if (t < s.served + SET_DOWN || t >= s.clear + PICK_UP) return false;
  return !s.sips.some((at) => t >= at + IN_HAND[0] && t < at + IN_HAND[1]);
}

// La tasse est-elle dans la main du serveur pendant cette tâche, à `d` secondes de son arrivée à la table ? (À l'aller pour
// servir, au retour pour débarrasser.)
export const waiterHolds = (kind: TaskKind, d: number): boolean => (kind === 'bring' ? d < SET_DOWN : kind === 'clear' ? d >= PICK_UP : false);
// Geste du serveur à la table.
export const WAITER_ARMS: Readonly<Record<TaskKind, ArmPose>> = { bring: 'give', pay: 'notepad', clear: 'take' };
