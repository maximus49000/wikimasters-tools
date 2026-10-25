// État de vie d'un meuble (G6) : le dessin cellulo s'en sert pour déformer ses pièces ; le livre des réactions (furniture-life)
// le fait évoluer quand un animal s'en sert. Unités : tilt rad (bascule), dent 0..1 (creux d'assise), sway rad (balancement),
// sag cm (affaissement), tassel rad (pompon), rustle 0..1 (feuillage), skirt 0..1 (volant), tremble cm (tremblement).
export type LifeState = { tilt: number; dent: number; sway: number; sag: number; tassel: number; rustle: number; skirt: number; tremble: number };

// Meuble au repos : rien ne bouge.
export const REST_LIFE: LifeState = Object.freeze({ tilt: 0, dent: 0, sway: 0, sag: 0, tassel: 0, rustle: 0, skirt: 0, tremble: 0 });
