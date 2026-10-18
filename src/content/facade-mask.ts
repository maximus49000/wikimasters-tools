// Masque des silhouettes de la rue (immeubles devant la colline), commun aux calques qui passent DERRIÈRE les façades : père
// Noël posé sur la colline (santa-layer.tsx) et mouettes (gulls-layer.tsx). Un rectangle noir par façade, élargi de ce que
// le peintre fait dépasser : 2 px de chaque côté (débord des pignons et du mur du fond), 9 px au-dessus du toit (antennes),
// 4 px sous le sol.
export const MASK_PAD_X = 2;
export const MASK_PAD_TOP = 9;
export const MASK_PAD_BOTTOM = 4;
export type FacadeBox = { x: number; w: number; h: number };
// Haut du rectangle de masque d'une façade (y du monde).
export const maskTop = (f: FacadeBox, ground: number): number => ground - f.h - MASK_PAD_TOP;
// Rectangle de masque d'une façade.
export const facadeMaskRect = (f: FacadeBox, ground: number): { x: number; y: number; width: number; height: number } => ({
  x: f.x - MASK_PAD_X,
  y: maskTop(f, ground),
  width: f.w + 2 * MASK_PAD_X,
  height: f.h + MASK_PAD_TOP + MASK_PAD_BOTTOM,
});
