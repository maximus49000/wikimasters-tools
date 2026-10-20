// Bundle RUE : `cel` vu depuis facade-painter.ts, avec SHADOW_K = 0 → l'ombre portée en biais du voisin de gauche (défaut 3)
// dégénère en polygone vide ; la maquette repeint l'ombre corrigée (mitoyen seul, un étage) par-dessus (src/03-fond-peint.js).
export * from '../../../../src/core/library/paint/cel';
export const SHADOW_K = 0;
