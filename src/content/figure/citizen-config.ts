import { RELAY_BASE } from '../../core/documentary/config';

/**
 * Interrupteur des habitants 3D : `true` = les figures de la ville sont rendues en 3D (three.js),
 * `false` = retour au rendu 2D d'avant, sans autre changement de code.
 */
export const CITIZENS_3D = false;

/** Relais qui sert les persos (garde-robe et modèles). */
export const RELAY_PERSOS = `${RELAY_BASE}/persos`;

/** Temps maximal (ms) accordé au rendu 3D par image, pour ne pas faire saccader la scène. */
export const RENDER_BUDGET_MS = 6;

/** Attente maximale (ms) du chargement 3D avant de retomber sur le rendu 2D. */
export const WAIT3D_FALLBACK_MS = 4000;

/** Lumière des habitants 3D en pleine nuit (1 en plein jour) : la teinte de nuit du rendu 3D s'en déduit (comme le pantin). */
export const NIGHT_LIGHT = 0.45;
