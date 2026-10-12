import { INK, TAU } from '../cel';
import { fitText, L, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, celD, disc, ED, groundShadow, PD, RD, RRD, tube, upright } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Mobilier des commerces cellulo (G5, tâche 3), porté de la maquette validée (docs/superpowers/maquettes/g5-fetes/index.html :
// `table`, `chair`, `parasol`, `apron`, `cordon`, `carriedSign`, `forSalePlacard`, `carriedPlacard`, `ladder`, `accessory`)
// dans le repère de chaque sprite classique (notes.md §1). Rien n'est lumineux ici : tout est teint par le registre. La chaise
// de l'autre côté de la table passe par `dir` (canvas retourné par l'hôte, ombres du kit du bon côté), jamais par un miroir.
// Le cordon : seuls les poteaux sont des images (`cordon-post`, à l'échelle k de l'hôte) ; la corde reste un <path> cellulo.

// Options par défaut de la maquette (cel : ombre 0,28 sur le tiers droit, rehaut 0,22 sur 18 %).
const M: CelOpts = { s: 0.28, sx: 0.68, l: 0.22, lx: 0.18 };
const GALVA = '#B9C0C8';
// Sans ombre ni rehaut ni trait : aplat pur (bandes, étiquettes).
const FLAT: CelOpts = { lw: 0, s: 0, l: 0 };

// Trait courbe (veine du marbre, dossier cintré, anse) : une quadratique, bout rond.
function curve(x: TintedCtx, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, c: string, w: number): void {
  x.beginPath();
  x.moveTo(x1, y1);
  x.quadraticCurveTo(cx, cy, x2, y2);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = 'round';
  x.stroke();
}
// Cercle en trait seul (anneaux des ciseaux, lunettes, sillon du disque).
function ring(x: TintedCtx, cx: number, cy: number, r: number, c: string, w: number): void {
  x.strokeStyle = c;
  x.lineWidth = w;
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.stroke();
}

// Guéridon (TableSprite : pied ellipse 3 × 0,8 à y = 0, tige 1,4 × 12, plateau 6 × 1,6 à −12,4) : pied fonte à collerette,
// plateau marbre blanc sur bord gris, veine, ombre au sol.
function table(x: TintedCtx): void {
  const c = '#3A3A40';
  groundShadow(x, 1, 0.6, 4, 1, 0.2);
  ED(x, 0, 0, 3, 0.8, c, { ...M, lw: 0.4, s: 0.3, l: 0.25 });
  PD(x, [[-0.7, 0], [0.7, 0], [0.5, -12], [-0.5, -12]], c, { lw: 0.4, s: 0.3, sx: 0.5, l: 0.3, lx: 0.3 });
  PD(x, [[-1.4, -3], [1.4, -3], [0.8, -1.2], [-0.8, -1.2]], c, { ...M, lw: 0.35, s: 0.3, l: 0.2 });
  ED(x, 0, -11.6, 6, 1.6, '#B8B4A8', { ...M, lw: 0.4, s: 0.3, l: 0 });
  ED(x, 0, -12.4, 6, 1.6, '#E6E2D6', { lw: 0.45, s: 0.2, sx: 0.7, l: 0.3, lx: 0.25 });
  curve(x, -3.6, -12.8, -1, -12, 2.6, -12.6, 'rgba(120,110,130,0.35)', 0.3);
}

// Chaise bistrot (ChairSprite : assise −3..3 × −8,6..−7,2 ; dossier à x = 2,2..3,4 jusqu'à −17 ; pied avant −3..−2), dossier
// vers +x : l'hôte pose `translate(side·9)` et retourne le canvas pour le côté gauche (dir = −1). Bois courbé, assise cannée,
// dossier cintré en arc, deux pieds `tube`.
function chair(x: TintedCtx): void {
  const c = '#6B4A2E';
  groundShadow(x, 0, 0.5, 3.4, 0.8, 0.18);
  tube(x, -2.5, -8, -2.5, 0, 1, c, { lw: 0.35 });
  tube(x, 2.8, -8, 2.8, 0, 1, c, { lw: 0.35 });
  tube(x, 2.8, -8.6, 2.8, -16.4, 1.2, c, { lw: 0.4 });
  curve(x, 2.8, -16.4, 2.6, -18.2, 0.6, -17.4, INK, 1.9);
  curve(x, 2.8, -16.4, 2.6, -18.2, 0.6, -17.4, c, 1);
  // Barreau du dossier cintré.
  curve(x, 2.2, -10, 0.5, -12.5, 1.6, -15.6, c, 0.7);
  // Assise cannée.
  RRD(x, -3, -8.6, 6, 1.4, 0.5, '#C8A060', { lw: 0.4, s: 0.3, sx: 0.65, l: 0.25, lx: 0.18 });
  x.strokeStyle = 'rgba(42,26,24,0.35)';
  x.lineWidth = 0.25;
  for (let sx = -2; sx < 2.6; sx += 1.2) {
    x.beginPath();
    x.moveTo(sx, -8.4);
    x.lineTo(sx + 0.6, -7.4);
    x.stroke();
  }
}

// Parasol (ParasolSprite : mât 0,8 de −40 à −12, toile M−14 −37 Q0 −49 14 −37, deux panneaux clairs) : même toile + panneaux
// crème cernés, ombre sur le quart droit, volants festonnés (7 × 4 u) sous le bord, pointe.
function parasol(x: TintedCtx, a: PropArgs): void {
  const hue = String(a.hue ?? '#E8604A');
  tube(x, 0, -12, 0, -40, 0.9, '#5A5A5A', { lw: 0.4 });
  const top = (): void => {
    x.moveTo(-14, -37);
    x.quadraticCurveTo(0, -49, 14, -37);
    x.closePath();
  };
  celD(x, top, hue, { lw: 0.5, box: [-14, -49, 28, 12], s: 0.3, sx: 0.66, l: 0.2, lx: 0.2 });
  x.save();
  x.beginPath();
  top();
  x.clip();
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * 14, -37);
    x.quadraticCurveTo(s * 5, -45, 0, -46.5);
    x.quadraticCurveTo(s * 3, -42, s * 5, -37);
    x.closePath();
    x.fillStyle = 'rgba(244,241,232,0.9)';
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 0.3;
    x.stroke();
  }
  x.fillStyle = shadeOf(hue, 0.35);
  x.beginPath();
  x.moveTo(14, -37);
  x.quadraticCurveTo(10, -44, 4, -46);
  x.lineTo(9, -37);
  x.closePath();
  x.fill();
  x.restore();
  // Volants festonnés.
  x.beginPath();
  x.moveTo(-14, -37);
  for (let k = 0; k < 7; k++) x.quadraticCurveTo(-14 + k * 4 + 2, -35.2, -14 + (k + 1) * 4, -37);
  x.lineTo(14, -37);
  x.closePath();
  x.fillStyle = hue;
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = 0.4;
  x.stroke();
  disc(x, 0, -49.4, 0.9, '#5A5A5A', 0.3);
}

// Tablier (Apron : −4,2..4,2 × −21..−8 sur le pantin).
function apron(x: TintedCtx): void {
  RRD(x, -4.2, -21, 8.4, 13, 1, '#F4F1E8', { lw: 0.4, s: 0.2, sx: 0.7, l: 0 });
  L(x, -4.2, -21, 4.2, -21, INK, 0.3);
}

// Poteau du cordon de boîte de nuit (CordonSprite, à l'échelle k posée par l'hôte : socle 2,2 × 0,7, fût 1,2 × 13, boule r 1 à
// −13,4) : laiton modelé. La corde (velours cerné d'encre + rehaut rose) reste un <path> de l'hôte.
function cordonPost(x: TintedCtx): void {
  groundShadow(x, 0.5, 0.3, 2.6, 0.7, 0.2);
  ED(x, 0, 0, 2.2, 0.7, '#B8973A', { ...M, lw: 0.35, s: 0.3, l: 0.2 });
  PD(x, [[-0.6, 0], [0.6, 0], [0.45, -13], [-0.45, -13]], '#D4B04A', { lw: 0.4, s: 0.35, sx: 0.5, l: 0.4, lx: 0.3 });
  ball(x, 0, -13.4, 1, '#E8C860', 0.35);
}

// Enseigne portée (CarriedSign : −w/2..w/2 × −5..0, couleur `sign` du type, nom en `ink`) : bandeau à ombre droite, nom Georgia.
const signW = (a: PropArgs): number => Math.max(4, Number(a.w) || 20);
function carriedSign(x: TintedCtx, a: PropArgs): void {
  const w = signW(a);
  const sign = String(a.sign ?? '#2F7D64');
  const ink = String(a.ink ?? '#F6F3EC');
  const name = String(a.name ?? '');
  RD(x, -w / 2, -5, w, 5, sign, { lw: 0.55, s: 0.22, sx: 0.8, l: 0.18, lx: 0.1 });
  upright(x, 0, () => fitText(x, name, 0, -2.4, 4, ink, { font: 'serif', w: w - 3 }));
}

// Écriteau « À vendre » (ForSalePlacard : panneau 14 max × 9 centré sur la largeur w, bandeau orange 3,6, deux lignes grises).
const placardGeom = (x0: number, w: number): { pw: number; px: number } => {
  const pw = Math.min(w - 2, 14);
  return { pw, px: x0 + (w - pw) / 2 };
};
function placard(x: TintedCtx, x0: number, y0: number, w: number): void {
  const { pw, px } = placardGeom(x0, w);
  RD(x, px, y0, pw, 9, '#FFFFFF', { lw: 0.4, s: 0.15, sx: 0.8, l: 0 });
  RD(x, px, y0, pw, 3.6, '#E8601C', { lw: 0.3, s: 0, l: 0 });
  upright(x, px + pw / 2, () => fitText(x, 'À VENDRE', px + pw / 2, y0 + 1.9, 2.4, '#FFFFFF', { bold: true, w: pw - 1 }));
  RD(x, px + 1.5, y0 + 5, pw - 3, 0.7, '#9A9A9A', FLAT);
  RD(x, px + 1.5, y0 + 6.6, pw - 5, 0.7, '#9A9A9A', FLAT);
}
// `for-sale` : à l'origine (l'hôte translate en (x, y) de la vitrine) ; `carried-placard` : à (−w/2, −9), largeur w + 2.
const forSaleW = (a: PropArgs): number => Math.max(3, Number(a.w) || 14);
const forSaleBox = (a: PropArgs): readonly [number, number, number, number] => {
  const { pw, px } = placardGeom(0, forSaleW(a));
  return [px - 0.3, -0.3, pw + 0.6, 9.6];
};
const carriedPlacardBox = (a: PropArgs): readonly [number, number, number, number] => {
  const w = forSaleW(a);
  const { pw, px } = placardGeom(-w / 2, w + 2);
  return [px - 0.3, -9.3, pw + 0.6, 9.6];
};

// Échelle (LadderSprite : rails à ±2, barreaux tous les 3 jusqu'à −h) : rails `tube` alu, barreaux encrés + rehaut.
const ladderH = (a: PropArgs): number => Math.max(3, Number(a.h) || 30);
function ladder(x: TintedCtx, a: PropArgs): void {
  const h = ladderH(a);
  tube(x, -2, 0, -2, -h, 1, GALVA, { lw: 0.4 });
  tube(x, 2, 0, 2, -h, 1, GALVA, { lw: 0.4 });
  for (let y = -3; y > -h; y -= 3) {
    L(x, -2, y, 2, y, INK, 1.1);
    L(x, -2, y, 2, y, GALVA, 0.55);
    L(x, -1.6, y - 0.25, 1.6, y - 0.25, 'rgba(255,255,255,0.5)', 0.2);
  }
}

// Accessoires tenus (AccessorySprite : repère de la main, ~6 u ; les 32 ids de ACCESSORY) : mêmes silhouettes, en cellulo.
function accessory(x: TintedCtx, a: PropArgs): void {
  const o: CelOpts = { ...M, lw: 0.3 };
  const dark = '#2A2A2A';
  switch (String(a.kind)) {
    case 'baguette':
      x.save();
      x.rotate((-20 * Math.PI) / 180);
      RRD(x, -5, -1, 10, 2, 1, '#D9A04A', o);
      for (let sx = -3; sx < 4; sx += 2) L(x, sx, -0.8, sx + 0.8, 0.8, 'rgba(120,70,20,0.6)', 0.3);
      x.restore();
      break;
    case 'box':
      RD(x, -3, -2.5, 6, 4.5, '#F6D2E0', o);
      RD(x, -3, -1, 6, 0.8, '#C0306A', FLAT);
      L(x, 0, -2.5, 0, 2, '#C0306A', 0.5);
      break;
    case 'chocolate':
      RD(x, -3, -2, 6, 4, '#5A2E1A', o);
      RD(x, -3, -0.4, 6, 0.8, '#E8C04A', FLAT);
      break;
    case 'parcel':
      RD(x, -3, -2.5, 6, 5, '#F2EEE6', o);
      L(x, -3, 0, 3, 0, '#B04040', 0.6);
      L(x, 0, -2.5, 0, 2.5, '#B04040', 0.6);
      break;
    case 'fish':
      celD(
        x,
        () => {
          x.moveTo(-4, 0);
          x.quadraticCurveTo(-1, -2.5, 2.5, 0);
          x.quadraticCurveTo(-1, 2.5, -4, 0);
        },
        '#8FA8B8',
        { ...o, box: [-4, -2.5, 6.5, 5] },
      );
      PD(x, [[2.5, 0], [4.5, -1.8], [4.5, 1.8]], '#8FA8B8', o);
      disc(x, -2.6, -0.4, 0.35, INK, 0);
      break;
    case 'wedge':
      PD(x, [[-3.5, 2], [3.5, 2], [-3.5, -2.5]], '#F2C94A', o);
      disc(x, -1.5, 0.5, 0.5, '#E8B030', 0);
      break;
    case 'pill':
      RD(x, -2.5, -3, 5, 6, '#FFFFFF', o);
      RD(x, -0.5, -2, 1, 3, '#1E8A4C', FLAT);
      RD(x, -1.5, -1, 3, 1, '#1E8A4C', FLAT);
      break;
    case 'bouquet':
      PD(x, [[0, 4], [-1.5, -1], [1.5, -1]], '#3A8A3A', o);
      ball(x, -1.5, -2, 1.4, '#E8486A', 0.25);
      ball(x, 1.5, -2, 1.4, '#F2C94A', 0.25);
      ball(x, 0, -3.4, 1.4, '#B05ACF', 0.25);
      break;
    case 'basket':
      PD(x, [[-3.5, -1], [3.5, -1], [2.5, 3], [-2.5, 3]], '#A8743A', o);
      ball(x, -1, -1.6, 1.1, '#D63A2A', 0.25);
      ball(x, 1.2, -1.6, 1.1, '#6AAA2A', 0.25);
      break;
    case 'bottle':
      RRD(x, -1.2, -2, 2.4, 6, 0.6, '#2F6A2A', o);
      RD(x, -0.5, -4, 1, 2, '#2F6A2A', { lw: 0.25, s: 0, l: 0 });
      RD(x, -1, 0, 2, 1.6, '#E8D8A8', { lw: 0.15, s: 0, l: 0 });
      break;
    case 'bag':
      RD(x, -2.8, -2, 5.6, 5, '#E8DCC0', o);
      curve(x, -1.4, -2, 0, -4, 1.4, -2, '#8A7A5A', 0.5);
      break;
    case 'can':
      RRD(x, -1.5, -2.5, 3, 5, 0.4, '#C0392B', o);
      RD(x, -1.5, -0.5, 3, 1, '#F2F2F2', FLAT);
      break;
    case 'bone':
      RD(x, -3, -0.6, 6, 1.2, '#F2EEE0', { ...M, lw: 0.25 });
      for (const [bx, by] of [[-3, -0.8], [-3, 0.8], [3, -0.8], [3, 0.8]] as const) disc(x, bx, by, 0.9, '#F2EEE0', 0.25);
      break;
    case 'scissors':
      L(x, -1, 1, 4, -2, GALVA, 0.7);
      L(x, -1, -1, 4, 2, GALVA, 0.7);
      ring(x, -2, 1.4, 0.9, dark, 0.5);
      ring(x, -2, -1.4, 0.9, dark, 0.5);
      break;
    case 'needle':
      RRD(x, -2.5, -1, 4, 2, 0.6, dark, o);
      L(x, 1.5, 0, 4.5, 0, GALVA, 0.5);
      break;
    case 'book':
      RD(x, -3, -2.5, 6, 5, '#2E6FA0', o);
      RD(x, 2.2, -2.5, 0.8, 5, '#F2EEE0', { lw: 0.15, s: 0, l: 0 });
      break;
    case 'record':
      disc(x, 0, 0, 3, '#1A1A1A', 0.3);
      ring(x, 0, 0, 2, 'rgba(255,255,255,0.25)', 0.3);
      disc(x, 0, 0, 1, '#E8486A', 0.2);
      break;
    case 'dice':
      RRD(x, -2.2, -2.2, 4.4, 4.4, 0.6, '#F2F2F2', o);
      disc(x, -0.9, -0.9, 0.45, dark, 0);
      disc(x, 0.9, 0.9, 0.45, dark, 0);
      break;
    case 'glasses':
      ring(x, -1.8, 0, 1.4, dark, 0.6);
      ring(x, 1.8, 0, 1.4, dark, 0.6);
      L(x, -0.4, 0, 0.4, 0, dark, 0.5);
      break;
    case 'clothes':
      PD(x, [[-3.5, -2], [-1.5, -3], [1.5, -3], [3.5, -2], [2.5, -0.5], [2, -1], [2, 3], [-2, 3], [-2, -1], [-2.5, -0.5]], '#C0463A', o);
      break;
    case 'vase':
      celD(
        x,
        () => {
          x.moveTo(-1, -3.5);
          x.lineTo(1, -3.5);
          x.lineTo(1, -2.5);
          x.quadraticCurveTo(3, -1, 2, 2.5);
          x.lineTo(-2, 2.5);
          x.quadraticCurveTo(-3, -1, -1, -2.5);
          x.closePath();
        },
        '#2E6FA0',
        { ...o, box: [-3, -3.5, 6, 6] },
      );
      break;
    case 'glass':
      PD(x, [[-1.5, -2.5], [1.5, -2.5], [1.2, 2.5], [-1.2, 2.5]], '#E0A21E', o);
      RD(x, -1.5, -3, 3, 0.8, '#FFFFFF', { lw: 0.15, s: 0, l: 0 });
      break;
    case 'cup':
      PD(x, [[-2, -1.5], [2, -1.5], [1.5, 2], [-1.5, 2]], '#FFFFFF', o);
      curve(x, 2, -0.8, 3.4, 0, 1.8, 1.2, INK, 0.5);
      RD(x, -2.8, 2, 5.6, 0.6, '#D8D8D8', { lw: 0.2, s: 0, l: 0 });
      break;
    case 'teapot':
      ball(x, 0, 0.5, 2.4, '#F2EEE6', 0.3);
      L(x, 2.2, 0, 4, -1.6, '#F2EEE6', 0.8);
      L(x, 2.2, 0, 4, -1.6, INK, 0.25);
      RD(x, -0.6, -2.6, 1.2, 0.8, '#8AB8A0', { lw: 0.2, s: 0, l: 0 });
      break;
    case 'plate':
      ED(x, 0, 0.5, 3.5, 1, '#FFFFFF', { ...M, lw: 0.3, s: 0.15, l: 0 });
      ED(x, 0, 0, 1.8, 0.7, '#A8743A', { ...M, lw: 0.2, s: 0.2, l: 0 });
      break;
    case 'pizza':
      ED(x, 0, 0, 3.6, 1.4, '#E8B04A', { ...M, lw: 0.3, s: 0.2, l: 0 });
      ED(x, 0, -0.2, 2.8, 1, '#C0392B', { ...M, lw: 0.2, s: 0.2, l: 0 });
      disc(x, -1, -0.3, 0.4, '#F2E090', 0);
      disc(x, 1.2, 0, 0.4, '#F2E090', 0);
      break;
    case 'wrap':
      PD(x, [[-1.5, -3], [1.5, -3], [1, 3], [-1, 3]], '#E8D2A0', o);
      PD(x, [[-1.5, -3], [1.5, -3], [1.2, -1.5], [-1.2, -1.5]], '#6AAA2A', { ...M, lw: 0.2 });
      break;
    case 'tray':
      RD(x, -3.5, 0, 7, 1, '#1A1A1A', { ...M, lw: 0.25 });
      RD(x, -2.5, -1.2, 1.6, 1.2, '#F2F2F2', { lw: 0.15, s: 0, l: 0 });
      RD(x, -0.8, -1.2, 1.6, 1.2, '#E8705A', { lw: 0.15, s: 0, l: 0 });
      RD(x, 0.9, -1.2, 1.6, 1.2, '#F2F2F2', { lw: 0.15, s: 0, l: 0 });
      break;
    case 'cocktail':
      PD(x, [[-2.2, -2.5], [2.2, -2.5], [0, 0.5]], '#FF4FD8', { ...M, lw: 0.3 });
      L(x, 0, 0.5, 0, 2.5, '#D8DCE6', 0.4);
      L(x, -1, 2.5, 1, 2.5, '#D8DCE6', 0.4);
      break;
    case 'joystick':
      RD(x, -2.5, 0.5, 5, 2, '#1C1A3A', o);
      L(x, 0, 0.5, 0, -2, dark, 0.6);
      ball(x, 0, -2.2, 1, '#E63B3B', 0.2);
      break;
    case 'laundry':
      RRD(x, -3, -1, 6, 3.5, 0.6, '#5AA7D6', o);
      celD(
        x,
        () => {
          x.moveTo(-2, -1);
          x.quadraticCurveTo(0, -3, 2, -1);
          x.closePath();
        },
        '#F2F2F2',
        { lw: 0.2 },
      );
      break;
    case 'tool':
      RD(x, -3.5, -0.5, 6, 1, '#8C939C', o);
      PD(x, [[2.5, -1.6], [4.2, -1.6], [4.2, 1.6], [2.5, 1.6], [2.5, 0.6], [3.4, 0.6], [3.4, -0.6], [2.5, -0.6]], '#8C939C', { ...M, lw: 0.25 });
      break;
    default:
      ball(x, 0, 0, 1.5, '#8C939C', 0.25);
  }
}

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  table: { box: () => [-6.5, -14.5, 13, 16.5], paint: paintOf(table) },
  chair: { box: () => [-4, -19.5, 8, 21], paint: paintOf(chair) },
  parasol: { box: () => [-14.5, -50.5, 29, 39.5], paint: paintOf(parasol) },
  apron: { box: () => [-4.5, -21.5, 9, 14], paint: paintOf(apron) },
  'cordon-post': { box: () => [-3.2, -14.8, 6.4, 16], paint: paintOf(cordonPost) },
  'carried-sign': { box: (a) => [-signW(a) / 2 - 0.5, -5.5, signW(a) + 1, 6], paint: paintOf(carriedSign) },
  'carried-placard': { box: carriedPlacardBox, paint: paintOf((x, a) => placard(x, -forSaleW(a) / 2, -9, forSaleW(a) + 2)) },
  'for-sale': { box: forSaleBox, paint: paintOf((x, a) => placard(x, 0, 0, forSaleW(a))) },
  ladder: { box: (a) => [-3, -ladderH(a) - 0.7, 6, ladderH(a) + 1.4], paint: paintOf(ladder) },
  accessory: { box: () => [-5.5, -5.5, 11, 11], paint: paintOf(accessory) },
});
