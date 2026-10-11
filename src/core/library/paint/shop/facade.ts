import { SHOP_DEFS, type ShopTypeId } from '../../city/shops/catalog';
import { COOL } from '../cel';
import { mixRgb, rgba } from '../color';
import { INK, R as celR, cel, dot, fitText, glint, lightOf, shadeOf, type CelOpts } from './cel';
import { parseColor, type ShopPaintCtx, type TintedCtx } from './ctx';
import { FAMILY, TILES, pictOf, type Family } from './families';

// Devanture cellulo d'un local (G4a), portée de la maquette validée (docs/superpowers/maquettes/g4-commerces/devantures.html) :
// encadrement par famille de métier, bandeau et nom, store festonné, porte, enseigne en drapeau, lanternes, étal et ardoise
// du trottoir. Repère local : x de 0 à w (largeur du local), y = 0 en haut du rez-de-chaussée, 30 au sol ; débords dans
// FACADE_MARGIN. La vitre est PERCÉE (rien n'y est rempli, sauf le local vide) : le fond de l'intérieur passe dessous, le
// personnel entre les deux, et la vitre elle-même (teinte, reflet, petits bois) est peinte par paintGlass au premier plan.
// Les éléments lumineux ne sont peints sans teinte (ctx.glowing) que si la boutique est éclairée (`lit`).
export type FacadeState = 'open' | 'closed' | 'empty' | 'works';
// `empty` : local à vendre inoccupé (vitre passée au blanc d'Espagne) ; `works` : chantier ou déménagement (vitre percée :
// le mobilier qui sort par tranches et les ouvriers restent visibles). `placard` : panneau « À vendre » collé à la vitre.
export type FacadeSpec = { type: ShopTypeId | null; name: string; w: number; doorSide: 'left' | 'right'; state: FacadeState; placard: boolean; night: boolean; lit: boolean };
export type Rect = { x: number; y: number; w: number; h: number };
export const FACADE_MARGIN = { left: 9, right: 9, top: 6, bottom: 6 } as const;
export const GROUND_FLOOR_H = 30;
const DW = 6;
const NEUTRAL = '#D8D2C4';

const familyOf = (s: FacadeSpec): Family => (s.type ? FAMILY[s.type] : 'D');
const pilaster = (s: FacadeSpec): number => {
  const f = familyOf(s);
  return f === 'A' ? 2 : f === 'E' ? 2.2 : s.type && TILES[s.type] ? 1.8 : 1;
};

// Vitrine (`win`, celle de shopFrame), partie vitrée visible (`glass` : pilastre et soubassement retirés) et porte.
export function facadeGeometry(s: FacadeSpec): { win: Rect; glass: Rect; door: Rect } {
  const f = familyOf(s);
  const door = { x: s.doorSide === 'left' ? 0 : s.w - DW, y: 9, w: DW, h: 21 };
  const win = { x: s.doorSide === 'left' ? DW + 1 : 0, y: 8, w: s.w - DW - 1, h: 22 };
  const pil = pilaster(s);
  const glass = { x: win.x + (s.doorSide === 'left' ? 0 : pil), y: win.y, w: win.w - pil, h: win.h - (f === 'A' ? 4 : f === 'E' ? 3 : 0) };
  return { win, glass, door };
}

// Options de la maquette des devantures (ombre `sh` à partir de `shX`, rehaut `li` sur `liW`, trait `lw`) et leurs défauts.
type MOpts = { sh?: number; shX?: number; li?: number; liW?: number; lw?: number };
const mo = ({ sh = 0.28, shX = 0.68, li = 0.22, liW = 0.18, lw = 0.5 }: MOpts = {}): CelOpts => ({ s: sh, sx: shX, l: li, lx: liW, lw });
const R = (x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, c: string, o: MOpts = {}): void => celR(x, x0, y0, w, h, c, mo(o));
const disc = (x: ShopPaintCtx, cx: number, cy: number, r: number, c: string, lw = 0.3): void => {
  dot(x, cx, cy, r, c);
  if (lw) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
};
const line = (x: ShopPaintCtx, pts: readonly (readonly [number, number])[], c: string, lw: number): void => {
  x.strokeStyle = c;
  x.lineWidth = lw;
  x.beginPath();
  pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.stroke();
};
const luminance = (c: string): number => {
  const p = parseColor(c)?.rgb ?? [128, 128, 128];
  return p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
};
const mixHex = (a: string, b: string, t: number): string => rgba(mixRgb(parseColor(a)?.rgb ?? [128, 128, 128], parseColor(b)?.rgb ?? [128, 128, 128], t), 1);

// Store festonné : haut, hauteur de la toile, du lambrequin.
const awning = (f: Family): { ay: number; ah: number; vh: number } => ({ ay: 7.4, ah: f === 'C' ? 5.5 : 4.6, vh: 2.4 });
const hasAwning = (s: FacadeSpec): boolean => {
  const f = familyOf(s);
  return s.state === 'open' && !!s.type && (f === 'B' || (f === 'C' && s.type !== 'kebab' && s.type !== 'sushi'));
};
// Hauteur de vitrine cachée par le store (sous le haut de la vitrine) : le personnel et les clients sont rognés dessous.
export function awningDrop(s: FacadeSpec): number {
  if (!hasAwning(s)) return 0;
  const { ay, ah, vh } = awning(familyOf(s));
  return ay + ah + vh - facadeGeometry(s).win.y;
}

export function paintFacade(x: TintedCtx, s: FacadeSpec): void {
  const { w, doorSide, state, lit } = s;
  const f = familyOf(s);
  const def = s.type ? SHOP_DEFS[s.type] : null;
  const sign = def?.sign ?? NEUTRAL;
  const ink = def?.ink ?? '#6A6A6A';
  const open = state === 'open';
  const { win, glass: W0, door } = facadeGeometry(s);
  const pil = pilaster(s);
  const tiles = s.type ? TILES[s.type] : undefined;
  const glow = (fn: () => void): void => (lit ? x.glowing(fn) : fn());

  // Vitre percée (fond et personnel dessous, rideau roulant devant), sauf le local vide : passée au blanc d'Espagne.
  if (state === 'empty') {
    x.fillStyle = '#EDEAE0';
    x.fillRect(W0.x, W0.y, W0.w, W0.h);
    x.strokeStyle = 'rgba(255,255,255,0.8)';
    x.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      x.beginPath();
      x.arc(W0.x + 3 + (k * W0.w) / 5, W0.y + 6 + (k % 2) * 7, 3, 0.3, 2.6);
      x.stroke();
    }
    glint(x, W0.x, W0.y, W0.w, W0.h, 0.25);
  }
  x.strokeStyle = INK;
  x.lineWidth = 0.5;
  x.strokeRect(W0.x, W0.y, W0.w, W0.h);

  // Porte
  const dc = f === 'A' ? sign : f === 'F' ? '#1A1420' : f === 'E' ? '#E8E4DA' : '#3A3F4A';
  R(x, door.x, door.y, door.w, door.h, dc, { lw: 0.5, sh: 0.3, shX: 0.6 });
  const gl = { x: door.x + 1, y: door.y + 1.2, w: door.w - 2, h: f === 'A' ? 11 : door.h - 2.4 };
  glow(() => {
    x.fillStyle = lit ? '#FFD890' : s.night ? '#2A3050' : '#A8C8DA';
    x.fillRect(gl.x, gl.y, gl.w, gl.h);
  });
  glint(x, gl.x, gl.y, gl.w, gl.h, 0.3);
  x.strokeStyle = INK;
  x.lineWidth = 0.3;
  x.strokeRect(gl.x, gl.y, gl.w, gl.h);
  if (f === 'A') R(x, door.x + 1, door.y + 13.5, door.w - 2, 6, lightOf(dc, 0.1), { lw: 0.3, sh: 0.3, li: 0 });
  R(x, door.x + (doorSide === 'left' ? door.w - 1.6 : 0.9), door.y + 10, 0.7, 2.2, '#E8C060', { lw: 0.15, sh: 0, li: 0 });
  if (s.type === 'sushi' && open) {
    for (let k = 0; k < 3; k++) R(x, door.x + 0.3 + k * 1.8, door.y + 0.3, 1.7, 6.5, '#2A3A6A', { lw: 0.2, sh: 0, li: 0 });
    fitText(x, '寿', door.x + 3, door.y + 3.5, 2.4, '#FFFFFF');
  }

  // Encadrement par famille
  const px = doorSide === 'left' ? w - pil : 0;
  if (f === 'A') {
    R(x, W0.x, W0.y + W0.h, W0.w, 4, sign, { lw: 0.5 });
    R(x, W0.x + 1, W0.y + W0.h + 0.8, W0.w - 2, 2.4, lightOf(sign, 0.15), { lw: 0.3, sh: 0.25, li: 0 });
    R(x, px, 7, pil, 23, sign, { lw: 0.5, sh: 0.3, shX: 0.5, li: 0.3, liW: 0.3 });
    R(x, px - 0.4, 7, pil + 0.8, 1.4, lightOf(sign, 0.3), { lw: 0.3, sh: 0, li: 0 });
    R(x, doorSide === 'left' ? DW : w - DW - 1, 7, 1, 23, sign, { lw: 0.4, sh: 0, li: 0 });
  } else if (f === 'E') {
    R(x, W0.x, W0.y + W0.h, W0.w, 3, '#D8CCB0', { lw: 0.4 });
    R(x, px, 7, pil, 23, '#E2D6BC', { lw: 0.5, sh: 0.25, shX: 0.5 });
  } else if (tiles) {
    R(x, px, 7, pil, 23, tiles, { lw: 0.4, sh: 0.15, shX: 0.6, li: 0 });
    for (let yy = 8; yy < 30; yy += 1.6) line(x, [[px, yy], [px + pil, yy]], 'rgba(120,140,160,0.6)', 0.15);
  } else {
    R(x, px, 7, pil, 23, f === 'F' ? '#2A2030' : '#5A606C', { lw: 0.4, sh: 0, li: 0 });
  }

  // Bandeau d'enseigne et nom
  const bandC = !def || state === 'empty' ? NEUTRAL : f === 'F' ? '#1E1626' : f === 'E' ? '#E2D6BC' : sign;
  R(x, -0.5, 1.6, w + 1, 5.6, bandC, { lw: 0.6, sh: 0.22, shX: 0.82, li: 0.18, liW: 0.1 });
  if (f === 'A') R(x, -1.2, 0.6, w + 2.4, 1.3, lightOf(bandC, 0.25), { lw: 0.4, sh: 0, li: 0 });
  if (def && state !== 'empty') {
    if (f === 'A') {
      const dark = luminance(sign) < 120;
      fitText(x, s.name, w / 2, 4.5, 4.2, dark ? '#F2D27A' : ink, { font: 'serif', w: w - 3, stroke: dark ? shadeOf(sign, 0.5) : null });
    } else if (f === 'E') {
      fitText(x, 'PHARMACIE', w / 2, 4.5, 3.6, '#1E8A4C', { bold: true, w: w - 4 });
    } else if (f === 'F') {
      if (lit && open) {
        x.glowing(() => {
          x.fillStyle = rgba(parseColor(ink)!.rgb, 0.28);
          x.beginPath();
          x.roundRect(1, 1.4, w - 2, 6.2, 2);
          x.fill();
          fitText(x, s.name, w / 2, 4.5, 4.4, '#FFFFFF', { font: 'neon', w: w - 3, stroke: ink });
        });
      } else {
        fitText(x, s.name, w / 2, 4.5, 4.4, mixHex(ink, '#555555', 0.5), { font: 'neon', w: w - 3 });
      }
    } else {
      fitText(x, s.name, w / 2, 4.5, 4, ink, { bold: f === 'D', w: w - 3 });
    }
  } else {
    // Bandeau nu : les trous des fixations de l'enseigne déposée.
    disc(x, 2, 4.4, 0.6, '#6A6A6A', 0);
    disc(x, w - 2, 4.4, 0.6, '#6A6A6A', 0);
  }

  // Panneau À vendre collé à la vitre
  if (s.placard) {
    const pw = Math.min(W0.w - 2, 14);
    const pxx = W0.x + (W0.w - pw) / 2;
    R(x, pxx, 12, pw, 9, '#FFFFFF', { lw: 0.4, sh: 0.15, shX: 0.8, li: 0 });
    R(x, pxx, 12, pw, 3.6, '#E8601C', { lw: 0.3, sh: 0, li: 0 });
    fitText(x, 'À VENDRE', pxx + pw / 2, 13.9, 2.4, '#FFFFFF', { bold: true, w: pw - 1 });
    R(x, pxx + 1.5, 17, pw - 3, 0.7, '#9A9A9A', { lw: 0, sh: 0, li: 0 });
    R(x, pxx + 1.5, 18.6, pw - 5, 0.7, '#9A9A9A', { lw: 0, sh: 0, li: 0 });
  }

  // Store festonné (étals, cafés ; ni kebab ni sushis)
  if (hasAwning(s)) {
    const ax = win.x - 0.5;
    const aw = (f === 'C' ? w : win.w) + 1;
    const { ay, ah, vh } = awning(f);
    const dx = 1.6;
    const path = (): void => {
      x.moveTo(ax, ay);
      x.lineTo(ax + aw, ay);
      x.lineTo(ax + aw + dx, ay + ah);
      x.lineTo(ax - dx, ay + ah);
      x.closePath();
    };
    cel(x, path, sign, { lw: 0, s: 0, l: 0 });
    x.save();
    x.beginPath();
    path();
    x.clip();
    if (s.type === 'pizzeria') {
      const third = (aw + 2 * dx) / 3;
      ['#2E8B4A', '#FFFFFF', '#C8352B'].forEach((c, k) => {
        x.fillStyle = c;
        x.fillRect(ax - dx + k * third, ay, third + 0.2, ah);
      });
    } else {
      x.fillStyle = '#FFF8EC';
      for (let k = ax - dx; k < ax + aw + dx; k += 3.2) {
        x.beginPath();
        x.moveTo(k, ay);
        x.lineTo(k + 1.5, ay);
        x.lineTo(k + 2.1, ay + ah);
        x.lineTo(k + 0.6, ay + ah);
        x.fill();
      }
    }
    x.fillStyle = rgba(COOL, 0.28);
    x.fillRect(ax, ay + ah * 0.62, aw + dx * 2, ah);
    x.restore();
    x.beginPath();
    path();
    x.strokeStyle = INK;
    x.lineWidth = 0.5;
    x.stroke();
    // Lambrequin festonné
    const vy = ay + ah;
    const span = aw + 2 * dx;
    const n = Math.round(span / 2.6);
    x.beginPath();
    x.moveTo(ax - dx, vy);
    x.lineTo(ax + aw + dx, vy);
    x.lineTo(ax + aw + dx, vy + vh - 0.8);
    for (let k = n; k > 0; k--) {
      const x1 = ax - dx + ((k - 1) * span) / n;
      x.quadraticCurveTo(x1 + span / n / 2 + 1.3, vy + vh + 0.6, x1, vy + vh - 0.8);
    }
    x.closePath();
    x.fillStyle = sign;
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 0.4;
    x.stroke();
    if (f === 'C') fitText(x, s.name, ax + aw / 2, vy + 1.1, 1.9, ink, { w: aw - 2, bold: true });
    // Ombre nette sous le store
    x.fillStyle = 'rgba(70,50,130,0.22)';
    x.fillRect(win.x, vy + vh, win.w, 3);
  }

  // Kebab : panneau-menu lumineux au-dessus de la vitrine
  if (s.type === 'kebab' && open) {
    glow(() => {
      R(x, W0.x + 1, W0.y + 0.5, W0.w - 2, 4, lit ? '#FFF4D0' : '#F4E8C8', { lw: 0.3, sh: 0, li: 0 });
      for (let k = 0; k < Math.floor((W0.w - 2) / 4.5); k++) R(x, W0.x + 1.8 + k * 4.5, W0.y + 1, 3.6, 3, ['#C87A3A', '#E8C84A', '#8AB84A'][k % 3]!, { lw: 0.15, sh: 0, li: 0 });
    });
  }

  // Enseigne en drapeau (boutiques) et croix (pharmacie)
  const pict = s.type ? pictOf(s.type) : null;
  if ((f === 'D' && pict && def) || (f === 'E' && def)) {
    const bx = doorSide === 'left' ? w + 0.3 : -0.3;
    const dir = doorSide === 'left' ? 1 : -1;
    line(x, [[bx, -3], [bx + dir * 5, -3]], INK, 0.5);
    const cx = bx + dir * 3.6;
    const cy = 0.4;
    if (f === 'E') {
      const cross = (): void => cel(x, () => { x.rect(cx - 1, cy - 3, 2, 6); x.rect(cx - 3, cy - 1, 6, 2); }, lit ? '#3CF27A' : '#1E8A4C', { lw: 0.4, s: 0, l: 0 });
      if (lit) {
        x.glowing(() => {
          dot(x, cx, cy, 6, 'rgba(60,242,122,0.25)');
          cross();
        });
      } else cross();
    } else if (pict === 'barber') {
      R(x, cx - 1, cy - 3.4, 2, 6.8, '#FFFFFF', { lw: 0.35, sh: 0.2, shX: 0.6, li: 0 });
      x.save();
      x.beginPath();
      x.rect(cx - 1, cy - 3.4, 2, 6.8);
      x.clip();
      for (let k = -6; k < 6; k += 2.2) line(x, [[cx - 1, cy + k], [cx + 1, cy + k - 1.2]], '#D83A3A', 0.7);
      x.restore();
      disc(x, cx, cy - 3.8, 0.8, '#2A4A9A');
      disc(x, cx, cy + 3.8, 0.8, '#2A4A9A');
    } else {
      disc(x, cx, cy, 2.9, sign, 0.45);
      x.strokeStyle = ink;
      x.lineWidth = 0.4;
      const ring = (ox: number, oy: number, r: number): void => {
        x.strokeStyle = ink;
        x.lineWidth = 0.4;
        x.beginPath();
        x.arc(ox, oy, r, 0, Math.PI * 2);
        x.stroke();
      };
      if (pict === 'glasses') {
        ring(cx - 1, cy, 0.8);
        ring(cx + 1, cy, 0.8);
      } else if (pict === 'disc') {
        ring(cx, cy, 1.6);
        dot(x, cx, cy, 0.5, ink);
      } else if (pict === 'wheel') {
        ring(cx, cy, 1.6);
        for (let a = 0; a < 3; a++) line(x, [[cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6], [cx - Math.cos(a) * 1.6, cy - Math.sin(a) * 1.6]], ink, 0.4);
      } else if (pict === 'pad') {
        x.strokeStyle = ink;
        x.beginPath();
        x.ellipse(cx, cy, 1.8, 1, 0, 0, Math.PI * 2);
        x.stroke();
        dot(x, cx - 0.9, cy, 0.3, ink);
        dot(x, cx + 0.9, cy - 0.3, 0.25, ink);
        dot(x, cx + 1.2, cy + 0.2, 0.25, ink);
      } else if (pict === 'hanger') {
        line(x, [[cx - 1.8, cy + 1], [cx, cy - 0.4], [cx + 1.8, cy + 1], [cx - 1.8, cy + 1]], ink, 0.4);
        x.beginPath();
        x.arc(cx, cy - 1, 0.5, Math.PI, 2.2 * Math.PI);
        x.stroke();
      } else if (pict === 'paw') {
        dot(x, cx, cy + 0.6, 0.9, ink);
        for (const [a, b] of [[-1.1, -0.4], [-0.4, -1.1], [0.4, -1.1], [1.1, -0.4]] as const) dot(x, cx + a, cy + b, 0.38, ink);
      } else if (pict === 'washer') {
        x.strokeRect(cx - 1.5, cy - 1.6, 3, 3.2);
        ring(cx, cy + 0.3, 0.9);
      }
    }
  }

  // Appliques en laiton (boiserie) et lanterne (restaurant)
  if ((f === 'A' || s.type === 'restaurant') && def && state !== 'works' && state !== 'empty') {
    const lx = doorSide === 'left' ? DW + 1.2 : w - DW - 1.8;
    R(x, lx - 0.2, 8.5, 0.4, 1.6, '#3A3A3A', { lw: 0, sh: 0, li: 0 });
    glow(() => {
      R(x, lx - 0.9, 9.6, 1.8, 2.4, lit ? '#FFE8A0' : '#E8D8A8', { lw: 0.3, sh: 0, li: 0 });
      if (lit) dot(x, lx, 10.8, 3.6, 'rgba(255,220,140,0.25)');
    });
  }
  // Étal sur le trottoir (primeur, fleuriste, épicerie) ; glace de la poissonnerie
  if (open && f === 'B' && !tiles) {
    const n = Math.floor(win.w / 7);
    for (let k = 0; k < n; k++) {
      const sx = win.x + 1 + k * 7;
      if (s.type === 'florist') {
        R(x, sx + 0.5, 30.5, 4, 3, '#5A6A7A', { lw: 0.3 });
        for (let j = 0; j < 5; j++) {
          line(x, [[sx + 2.5, 30.6], [sx + 0.8 + j * 0.9, 27.4]], '#3A7A3A', 0.25);
          disc(x, sx + 0.8 + j * 0.9, 27.2, 0.7, ['#F05A8A', '#FFD84A', '#FFFFFF', '#B85AE8', '#F27A3A'][(j + k) % 5]!, 0.15);
        }
      } else {
        R(x, sx, 30, 5.4, 3.4, '#C89A5A', { lw: 0.35, sh: 0.25, shX: 0.7 });
        for (let j = 0; j < 4; j++) disc(x, sx + 0.9 + j * 1.2, 29.8, 0.75, ['#E84A3A', '#7AC84A', '#F2A03A', '#E8D04A'][(k + j) % 4]!, 0.15);
      }
    }
  }
  if (open && s.type === 'fishmonger') {
    R(x, win.x + 1, 30, win.w - 2, 2.6, '#E8F4FA', { lw: 0.35 });
    x.fillStyle = '#8AB0C8';
    for (let k = 0; k < Math.floor(win.w / 3); k++) {
      x.beginPath();
      x.ellipse(win.x + 2.5 + k * 3, 29.9, 1.2, 0.5, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  // Ardoise (café, restaurant, pizzeria)
  if (open && (s.type === 'cafe' || s.type === 'restaurant' || s.type === 'pizzeria')) {
    const ax = doorSide === 'left' ? door.x + door.w + 2.5 : door.x - 5;
    line(x, [[ax, 33.5], [ax + 1.4, 26.6], [ax + 2.8, 33.5]], INK, 0.4);
    R(x, ax - 0.2, 26.4, 3.2, 4.6, '#2E3A34', { lw: 0.4, sh: 0, li: 0 });
    for (let k = 0; k < 3; k++) line(x, [[ax + 0.4, 27.6 + k * 1.2], [ax + 2.4 - (k % 2) * 0.6, 27.6 + k * 1.2]], 'rgba(255,255,255,0.75)', 0.2);
  }
  // Sushis : lanterne en papier
  if (s.type === 'sushi' && state !== 'works' && state !== 'empty') {
    const lx = doorSide === 'left' ? DW + 2 : w - DW - 2.4;
    R(x, lx - 0.2, 7.2, 0.4, 1.2, '#3A3A3A', { lw: 0, sh: 0, li: 0 });
    glow(() => {
      cel(x, () => x.ellipse(lx, 10.6, 1.6, 2.3, 0, 0, Math.PI * 2), lit ? '#FF6A6A' : '#E2294B', { lw: 0.35, box: [lx - 1.6, 8.3, 3.2, 4.6] });
      if (lit) dot(x, lx, 10.6, 4, 'rgba(255,90,90,0.25)');
    });
  }
  // Boîte de nuit : cordon et poteaux
  if (s.type === 'nightclub' && open) {
    const x0 = doorSide === 'left' ? door.x + door.w + 1 : door.x - 9;
    for (const p of [x0, x0 + 4, x0 + 8]) R(x, p - 0.3, 27, 0.6, 4, '#D8B84A', { lw: 0.2, sh: 0, li: 0 });
    x.strokeStyle = '#B8203A';
    x.lineWidth = 0.5;
    x.beginPath();
    x.moveTo(x0, 27.6);
    x.quadraticCurveTo(x0 + 2, 29.2, x0 + 4, 27.6);
    x.quadraticCurveTo(x0 + 6, 29.2, x0 + 8, 27.6);
    x.stroke();
  }
}

// Vitre de la vitrine ouverte (premier plan, devant le personnel), repère de la partie vitrée (0..w, 0..h) : teinte du ciel
// ou lumière chaude, reflet diagonal, petits bois de la boiserie, cadre encré.
export function paintGlass(x: ShopPaintCtx, s: FacadeSpec, w: number, h: number): void {
  const f = familyOf(s);
  x.fillStyle = s.lit ? 'rgba(255,200,110,0.18)' : 'rgba(150,190,220,0.18)';
  x.fillRect(0, 0, w, h);
  glint(x, 0, 0, w, h, s.lit ? 0.1 : 0.25);
  if (f === 'A' && s.type) {
    const c = shadeOf(SHOP_DEFS[s.type].sign, 0.2);
    const n = Math.max(2, Math.round(w / 9));
    for (let k = 1; k < n; k++) line(x, [[(k * w) / n, 0], [(k * w) / n, h]], c, 0.5);
    line(x, [[0, 6], [w, 6]], c, 0.5);
  }
  x.strokeStyle = INK;
  x.lineWidth = 0.5;
  x.strokeRect(0, 0, w, h);
}
