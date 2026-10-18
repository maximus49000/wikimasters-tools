import { hexRgb, mixRgb, rgba } from '../color';
import { INK, TAU } from '../cel';
import { fitText, glint, L, lightOf, shadeOf, type CelOpts } from '../shop/cel';
import type { TintedCtx } from '../shop/ctx';
import { ball, celD, disc, ED, groundShadow, halo, PD, RD, RRD, tube, upright, wheel } from './kit';
import { registerProps, type PropArgs, type PropPaint } from './index';

// Engins du ciel, événements de rue et Patrouille cellulo (G5, tâche 12), portés de la maquette validée
// (docs/superpowers/maquettes/g5-fetes/index.html : `plane`, `helicopter`, `helicopterLit`, `drone`, `balloonEvt`, `bannerPlane`,
// `kite`, `crane`, `apartmentGlow`, `festBalloons`, `bells`, `garbageTruck`, `deliveryBike`) dans le repère de chaque sprite
// classique de city-event-sprites.tsx (notes.md §1 et §9). Tout est peint vers +x : l'hôte retourne le canvas pour un engin qui
// vole vers −x (jamais de miroir d'image). Les animations secondaires de la maquette (assiette, rotor, bouffées du brûleur,
// vague de la banderole, rafales du cerf-volant, balancement des ballons et des cloches) deviennent des poses clés : la pose k
// est l'instant k/frames du cycle, aux fréquences ramenées à des multiples du cycle pour boucler sans saut. Lumineux la nuit
// (glowing quand `lit`) : feux de position et balises de l'avion, de l'hélicoptère (+ projecteur) et du drone, lueur interne
// de la montgolfière à la bouffée, lueur d'appartement (toujours), phare du camion-poubelle. Les traînées (condensation,
// fumées tricolores) et les feux d'artifice ne sont pas peints ici : particules SVG calculées par la couche (city-event-art).

const IRON = '#4A5A58';
const HAZE = hexRgb('#9CC0E4');
// Perspective atmosphérique : couleurs mélangées au bleu de brume (`far` 0..1).
const hazer = (far: number) => (c: string): string => (far > 0 ? rgba(mixRgb(hexRgb(c), HAZE, far), 1) : c);
const op = (lw: number, s: number, sx = 0.68, l = 0.22, lx = 0.18): CelOpts => ({ lw, s, sx, l, lx });
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' && v ? v : d);
const deg = (a: number): number => (a * Math.PI) / 180;
type Box = readonly [number, number, number, number];

// Dégradé linéaire (ambre) : `stops` [offset, [r, g, b], alpha].
function grad(x: TintedCtx, x0: number, y0: number, x1: number, y1: number, stops: readonly (readonly [number, readonly [number, number, number], number])[]): CanvasGradient | string {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c, a] of stops) g.addColorStop(o, `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`);
  return g as CanvasGradient;
}

// ---------- Avion de ligne (plane : fuselage −20..18, aile vers le bas −4..4 → −12..−6, dérive −16..−12) : trois-quarts
// dessous, ailes en flèche à dièdre, deux réacteurs sous l'aile proche, hublots, bande bleue ; `far` : pâleur de la brume
// (0,3). Nuit (lit) : balise rouge, feu blanc, feux de position vert/rouge et leurs halos (glowing). ----------
function plane(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const far = a.far === true ? 0.3 : 0;
  const hz = hazer(far);
  const W = hz('#F4F4F4');
  const G = hz('#C8CED8');
  // Aile lointaine (au-dessus, plus petite), stabilisateur, dérive à livrée bleue.
  PD(x, [[-5, -1.2], [-13, -7.5], [-16.5, -7], [-9, -0.8]], G, op(0.4, 0.3, 0.6, 0.15));
  PD(x, [[-15, -0.6], [-21, -5], [-23, -4.6], [-18.5, -0.2]], G, op(0.4, 0.3, 0.68, 0.15));
  PD(x, [[-13, -1.2], [-17, -9], [-21.5, -9], [-20, -1]], G, op(0.45, 0.3, 0.6, 0.2));
  x.fillStyle = hz('#3B6FD6');
  x.beginPath();
  x.moveTo(-15.6, -5.5);
  x.lineTo(-19, -8.6);
  x.lineTo(-21.2, -8.6);
  x.lineTo(-18.6, -5.2);
  x.fill();
  // Fuselage : ventre visible, ombre du ventre, bande bleue, hublots, cockpit.
  celD(
    x,
    () => {
      x.moveTo(-20, -0.8);
      x.quadraticCurveTo(-8, -3.4, 16, -2.6);
      x.quadraticCurveTo(24, -1.2, 19, 2.2);
      x.quadraticCurveTo(-4, 4.2, -20, 2.4);
      x.closePath();
    },
    W,
    { ...op(0.5, 0.3, 0.64, 0.2), box: [-21, -4, 46, 9] },
  );
  x.fillStyle = shadeOf(W, 0.22);
  x.beginPath();
  x.moveTo(-19, 1.6);
  x.quadraticCurveTo(-2, 3.6, 18, 2);
  x.quadraticCurveTo(-2, 2.4, -19, 1.6);
  x.fill();
  x.fillStyle = hz('#3B6FD6');
  x.fillRect(-19, 0.2, 36, 0.7);
  for (let hx = -10; hx < 14; hx += 2.6) RD(x, hx, -1.6, 1.2, 0.9, hz('#6AA0D8'), op(0.15, 0, 0.68, 0));
  RD(x, 14.6, -2, 2.8, 1.2, hz('#4A6A90'), op(0.2, 0, 0.68, 0));
  // Aile proche en flèche, dièdre vers le bas, rehaut, réacteurs.
  PD(x, [[-2, 0.8], [-9, 11.5], [-14.5, 11.5], [-8, 1.2]], G, op(0.45, 0.3, 0.6, 0.2));
  x.fillStyle = lightOf(G, 0.3);
  x.beginPath();
  x.moveTo(-3, 1.2);
  x.lineTo(-8, 8);
  x.lineTo(-9.4, 8);
  x.lineTo(-4.5, 1.2);
  x.fill();
  for (const [ex, ey] of [[-5.2, 5.2], [-8.6, 8.8]] as const) {
    RRD(x, ex - 2.4, ey - 0.3, 4.4, 2.4, 1.1, hz('#B8BEC8'), op(0.4, 0.3, 0.6, 0.3));
    disc(x, ex + 2, ey + 0.9, 1.05, hz('#3A3E48'), 0.3);
    disc(x, ex + 2, ey + 0.9, 0.4, '#8A9098', 0);
  }
  if (!p.lit) return;
  // Nuit : balise rouge (à mi-pulsation), feu blanc à l'avant, feux de position vert (saumon proche) et rouge (lointain).
  x.glowing(() => {
    halo(x, -4, 3.6, 3, '#FF4040', 0.45);
    disc(x, -4, 3.6, 1.1, 'rgba(255,80,64,0.85)', 0);
    halo(x, 19, 0, 2.2, '#FFFFFF', 0.4);
    disc(x, 19, 0, 0.9, '#FFFFFF', 0);
    disc(x, -14.5, 11.5, 0.7, '#30FF60', 0);
    disc(x, -16.5, -7, 0.7, '#FF4040', 0);
  });
}

// ---------- Hélicoptère (helicopter : cabine 13 × 7, poutre −30..−12, verrière r 4 à (7, −1), rotor −22..22 à −10, patins
// −6..10 à 8) : assiette à piquer −6° + tangage ±2,2° et balancement ±1,2 u sur le cycle (1,1 s, 8 poses), rotor principal en
// disque flou + deux pales nettes une pose sur trois (stroboscopie), rotor de queue, verrière à reflet et pilote. `c` : couleur
// de la cellule ; `roundel` : cocarde tricolore (Patrouille). Nuit (lit) : balise rouge à éclats (pose 0), feu de position vert,
// éclat blanc du rotor (pose 0), projecteur vers le sol (dégradé en screen). ----------
export const HELI_CYCLE_S = 1.1;
const HELI_FRAMES = 8;
function helicopter(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const c = str(a.c, '#C0463A');
  const w = (TAU * p.frame) / HELI_FRAMES;
  const pitch = deg(-6 + 2.2 * Math.sin(w));
  const roll = 1.2 * Math.sin(w - 1);
  x.save();
  x.translate(0, roll);
  x.rotate(pitch);
  // Patins.
  tube(x, -6, 8, 10, 8, 1, IRON, { lw: 0.35 });
  L(x, -4, 7, -4, 8, IRON, 0.6);
  L(x, 8, 7, 8, 8, IRON, 0.6);
  // Poutre de queue, dérive, stabilisateur.
  celD(
    x,
    () => {
      x.moveTo(-12, -2.4);
      x.lineTo(-30, -1.6);
      x.lineTo(-30, 1);
      x.lineTo(-12, 2.2);
      x.closePath();
    },
    c,
    { ...op(0.45, 0.3, 0.6, 0.25), box: [-30, -3, 18, 5] },
  );
  PD(x, [[-30, -1.6], [-30, -8], [-26, -1.4]], c, op(0.4, 0.3, 0.68, 0.2));
  PD(x, [[-27, -1.6], [-24, -4.2], [-21, -1.6]], shadeOf(c, 0.2), op(0.35, 0.3, 0.68, 0.1));
  // Rotor de queue : disque flou + deux pales (6 tours par cycle).
  x.save();
  x.translate(-30, -4);
  x.fillStyle = 'rgba(60,60,70,0.28)';
  x.beginPath();
  x.arc(0, 0, 3.2, 0, TAU);
  x.fill();
  x.rotate(w * 6);
  L(x, 0, -3.2, 0, 3.2, '#2A2A2A', 0.8);
  x.rotate(Math.PI / 2);
  L(x, 0, -3.2, 0, 3.2, '#2A2A2A', 0.8);
  x.restore();
  // Cabine, ombre basse, rehaut du dos, verrière, pilote, reflet.
  ED(x, 0, 0, 13, 7, c, op(0.55, 0.3, 0.62, 0.22, 0.2));
  x.fillStyle = shadeOf(c, 0.4);
  x.fillRect(-13, -0.6, 8, 1.4);
  x.fillStyle = lightOf(c, 0.35);
  x.beginPath();
  x.ellipse(-3, -4.2, 6, 1.2, 0.1, 0, TAU);
  x.fill();
  celD(
    x,
    () => {
      x.moveTo(3, -4.2);
      x.quadraticCurveTo(10, -6, 12, 0);
      x.quadraticCurveTo(10, 4.5, 4, 3);
      x.closePath();
    },
    '#9CC4E0',
    { ...op(0.45, 0.25, 0.6, 0), box: [3, -6, 9, 9] },
  );
  ball(x, 7.4, -1.2, 1.4, '#F0C8A0', 0.3);
  x.fillStyle = '#2A2A30';
  x.beginPath();
  x.arc(7.4, -2.1, 1.3, Math.PI, 0);
  x.fill();
  RD(x, 6.6, 0.2, 2, 2.6, '#2E5E8A', op(0.25, 0.2, 0.68, 0));
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath();
  x.ellipse(6.2, -3.2, 2.6, 0.9, 0.5, 0, TAU);
  x.fill();
  if (a.roundel === true) {
    disc(x, -8, 0.4, 1.9, '#2B4FA0', 0.3);
    disc(x, -8, 0.4, 1.2, '#F2F2F2', 0);
    disc(x, -8, 0.4, 0.6, '#C0302B', 0);
  }
  // Mât et rotor principal : disque flou, reflet, deux pales (5 tours par cycle, nettes une pose sur trois), moyeu.
  tube(x, 0, -7, 0, -10, 0.9, '#333333', { lw: 0.3 });
  x.save();
  x.translate(0, -10);
  x.fillStyle = 'rgba(50,50,60,0.22)';
  x.beginPath();
  x.ellipse(0, 0, 23, 1.8, 0, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.18)';
  x.beginPath();
  x.ellipse(-6, -0.3, 8, 0.8, 0, 0, TAU);
  x.fill();
  const ra = (w * 5) % TAU;
  const vis = p.frame % 3 === 0;
  for (const b of [0, Math.PI]) L(x, 0, 0, Math.cos(ra + b) * 22, Math.sin(ra + b) * 1.7, vis ? '#2A2A2A' : 'rgba(42,42,42,0.35)', vis ? 1.2 : 0.9);
  ball(x, 0, 0, 1.3, '#3A3E48', 0.3);
  x.restore();
  if (p.lit) {
    x.glowing(() => {
      const bl = p.frame === 0 ? 1 : 0.25;
      halo(x, -30, 0, 3, '#FF4040', 0.6 * bl);
      disc(x, -30, 0, 1.4, '#FF5050', 0);
      disc(x, 12, 1, 0.8, '#30FF60', 0);
      halo(x, 0, -13, 2.4, '#FFFFFF', p.frame === 0 ? 0.9 : 0.1);
      // Projecteur vers le sol.
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = grad(x, 6, 8, 14, 40, [[0, [255, 240, 200], 0.35], [1, [255, 240, 200], 0]]);
      x.beginPath();
      x.moveTo(4, 8);
      x.lineTo(10, 8);
      x.lineTo(26, 44);
      x.lineTo(2, 44);
      x.closePath();
      x.fill();
      x.restore();
    });
  }
  x.restore();
}

// ---------- Drone (drone : corps 10 × 4, bras ±10 à −3, hélices ±10) : vol stationnaire (tremblement ±0,4 u, inclinaison)
// sur 4 poses (0,8 s), hélices floues + pale, LED : rouge qui clignote de jour (poses 0 et 1), verte la nuit (glowing). ----------
export const DRONE_CYCLE_S = 0.8;
const DRONE_FRAMES = 4;
function drone(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  const w = (TAU * p.frame) / DRONE_FRAMES;
  x.save();
  x.translate(0.4 * Math.sin(w), 0.3 * Math.sin(w + 1));
  x.rotate(deg(3.6 * Math.cos(w)));
  tube(x, -10, -3, 10, -3, 1, '#333333', { lw: 0.35 });
  RRD(x, -5, -2, 10, 4, 1, '#3A3A42', op(0.45, 0.3, 0.6, 0.3, 0.3));
  ball(x, 0, 1.2, 1.2, '#2A2A2A', 0.3);
  disc(x, 0.3, 0.9, 0.4, '#8AB8E0', 0);
  for (const cx of [-10, 10]) {
    tube(x, cx, -3, cx, -4.5, 0.8, '#333333', { lw: 0.3 });
    x.fillStyle = 'rgba(80,80,90,0.3)';
    x.beginPath();
    x.ellipse(cx, -4.6, 5.2, 1, 0, 0, TAU);
    x.fill();
    const an = w / 2 + cx;
    L(x, cx - Math.cos(an) * 5, -4.6 - Math.sin(an) * 0.8, cx + Math.cos(an) * 5, -4.6 + Math.sin(an) * 0.8, 'rgba(60,60,60,0.7)', 0.6);
    ball(x, cx, -4.6, 0.6, '#555555', 0.2);
  }
  if (p.lit) {
    x.glowing(() => {
      halo(x, 0, 2.4, 2.4, '#40FF80', 0.5);
      disc(x, 0, 2.4, 0.9, '#40FF80', 0);
    });
  } else if (p.frame < 2) disc(x, 0, 2.4, 0.9, '#FF4040', 0);
  x.restore();
}

// ---------- Montgolfière (balloon : enveloppe −16..16 × −36..8, suspentes ±4, nacelle −5..5 × 14..21) : 7 fuseaux courbes
// alternés `a` / `b`, modelés, ombre de côté, déformation sous le vent, balancement ±1,6°, brûleur par bouffée (cycle 4 s :
// flamme à la pose 0, montée de 2,6 u puis redescente), cordages croisés, nacelle en osier, deux passagers. Nuit (lit) :
// l'enveloppe s'illumine de l'intérieur à la bouffée (dégradé ambre en screen, glowing) et halo du brûleur. ----------
export const BALLOON_CYCLE_S = 4;
const BALLOON_FRAMES = 8;
function balloon(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const ca = str(a.a, '#E0A21E');
  const cb = str(a.b, '#C0463A');
  const hz = hazer(num(a.far));
  const w = (TAU * p.frame) / BALLOON_FRAMES;
  // Bouffée : poses à l'instant (k + ½)/8 du cycle ; flamme pendant 0,7 s, montée pendant la bouffée, redescente en 2,2 s.
  const burnT = ((p.frame + 0.5) / BALLOON_FRAMES) * BALLOON_CYCLE_S;
  const burn = burnT < 0.7 ? Math.sin((Math.PI * burnT) / 0.7) : 0;
  const burnEnv = burnT < 0.7 ? burnT / 0.7 : Math.max(0, 1 - (burnT - 0.7) / 2.2);
  x.save();
  x.translate(0, -2.6 * burnEnv);
  x.rotate(deg(1.6 * Math.sin(w)));
  const wind = 1 + 0.02 * Math.sin(2 * w);
  const env = (): void => {
    x.moveTo(-16 * wind, -10);
    x.quadraticCurveTo(-16 * wind, -36, 0, -36);
    x.quadraticCurveTo(16 * wind, -36, 16 * wind, -10);
    x.quadraticCurveTo(12, 2, 4, 8);
    x.lineTo(-4, 8);
    x.quadraticCurveTo(-12, 2, -16 * wind, -10);
    x.closePath();
  };
  celD(x, env, hz(ca), { ...op(0.55, 0, 0.68, 0), box: [-16, -36, 32, 44] });
  x.save();
  x.beginPath();
  env();
  x.clip();
  // Fuseaux : 7 bandes courbes, alternance a / b, chacune modelée (clair à gauche, ombre à droite).
  for (let i = -3; i <= 3; i++) {
    const x0 = (i / 3.6) * 16 * wind;
    const x1 = ((i + 1) / 3.6) * 16 * wind;
    const col = (i + 10) % 2 ? ca : cb;
    x.beginPath();
    x.moveTo(0, -36);
    x.quadraticCurveTo(x0 * 1.9, -18, x0 * 0.5, 8);
    x.lineTo(x1 * 0.5, 8);
    x.quadraticCurveTo(x1 * 1.9, -18, 0, -36);
    x.closePath();
    x.fillStyle = hz(col);
    x.fill();
    x.fillStyle = shadeOf(col, 0.28);
    x.beginPath();
    x.moveTo(0, -36);
    x.quadraticCurveTo(x1 * 1.9, -18, x1 * 0.5, 8);
    x.lineTo(x1 * 0.5 - 0.6 * (x1 - x0), 8);
    x.quadraticCurveTo(x1 * 1.9 - 0.5 * (x1 - x0), -18, 0, -36);
    x.fill();
  }
  x.fillStyle = 'rgba(70,50,130,0.3)';
  x.beginPath();
  x.moveTo(6, -36);
  x.quadraticCurveTo(19, -20, 10, 8);
  x.lineTo(22, 8);
  x.lineTo(22, -40);
  x.fill();
  x.fillStyle = 'rgba(255,246,208,0.32)';
  x.beginPath();
  x.ellipse(-7, -24, 4, 8, 0.2, 0, TAU);
  x.fill();
  if (p.lit && burn > 0) {
    x.glowing(() => {
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = grad(x, 0, -2, 0, 30, [[0, [255, 200, 110], 0.85 * burn], [0.5, [255, 170, 80], 0.4 * burn], [1, [255, 170, 80], 0]]);
      x.fillRect(-20, -40, 40, 50);
      x.restore();
    });
  }
  x.restore();
  x.beginPath();
  env();
  x.strokeStyle = INK;
  x.lineWidth = 0.55;
  x.stroke();
  // Cordages (suspentes croisées), brûleur et flamme.
  for (const sx of [-4, 4]) {
    L(x, sx, 8, sx * 1.1, 14, '#4A3B2A', 0.6);
    L(x, sx, 8, -sx * 0.4, 14, '#4A3B2A', 0.35);
  }
  RD(x, -1.8, 10, 3.6, 1.6, '#4A4E58', op(0.3, 0.3, 0.68, 0.2));
  if (burn > 0) {
    const flame = (): void => {
      celD(
        x,
        () => {
          x.moveTo(-1.6, 10);
          x.quadraticCurveTo(-3, 6 - 4 * burn, 0, 2 - 6 * burn);
          x.quadraticCurveTo(3, 6 - 4 * burn, 1.6, 10);
          x.closePath();
        },
        '#FFB040',
        op(0, 0, 0.68, 0),
      );
      x.fillStyle = 'rgba(255,240,180,0.9)';
      x.beginPath();
      x.moveTo(-0.8, 10);
      x.quadraticCurveTo(-1, 7 - 2 * burn, 0, 5 - 3 * burn);
      x.quadraticCurveTo(1, 7 - 2 * burn, 0.8, 10);
      x.fill();
    };
    if (p.lit) {
      x.glowing(() => {
        halo(x, 0, 6, 5, '#FFC060', 0.8 * burn);
        flame();
      });
    } else flame();
  }
  // Passagers dans la nacelle (silhouettes, coupées par le bord).
  x.save();
  x.beginPath();
  x.rect(-6, 6, 12, 9);
  x.clip();
  for (const [px, skin, top] of [[-2.4, '#F0C8A0', '#2E5E8A'], [2, '#C98A5E', '#C0463A']] as const) {
    RRD(x, px - 1.6, 12.6, 3.2, 4, 0.8, top, op(0.3, 0.3, 0.62, 0.2));
    ball(x, px, 11.4, 1.3, skin, 0.3);
  }
  x.restore();
  // Nacelle en osier tressé.
  RD(x, -5, 14, 10, 7, hz('#A8743A'), op(0.45, 0.3, 0.65, 0.2));
  x.strokeStyle = 'rgba(42,26,24,0.35)';
  x.lineWidth = 0.3;
  for (let y = 15.4; y < 21; y += 1.3) {
    x.beginPath();
    x.moveTo(-5, y);
    x.lineTo(5, y);
    x.stroke();
  }
  for (let bx = -3.5; bx < 5; bx += 1.7) {
    x.beginPath();
    x.moveTo(bx, 14);
    x.lineTo(bx, 21);
    x.stroke();
  }
  RD(x, -5.4, 13.4, 10.8, 1, hz('#8A5A2B'), op(0.3, 0, 0.68, 0.2));
  x.restore();
}

// ---------- Avion à banderole (banner-plane : avion −12..12, câble vers −24, banderole −104..−24 × ±7) : monomoteur à aile
// haute et hélice floue, câble en chaînette, banderole « Wikimasters » en vague (8 poses sur le cycle de la vague), plis
// ombrés / rehaussés, légère ondulation de trajectoire. `col` : couleur de la banderole. ----------
export const BANNER_CYCLE_S = TAU / 5.2;
const BANNER_FRAMES = 8;
function bannerPlane(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const col = str(a.col, '#F2C94C');
  const w = (TAU * p.frame) / BANNER_FRAMES;
  x.save();
  x.translate(0, 0.6 * Math.sin(w));
  x.rotate(deg(1.5 * Math.sin(w + 1)));
  // Banderole : vague qui court vers l'arrière, amplitude croissante ; bord d'attaque au bout du câble.
  const yAt = (u: number): number => Math.sin(u * 5.5 - w) * (0.6 + 2.4 * u) + Math.sin(u * 2.1 - w) * 0.8 * u;
  const n = 24;
  const cloth = (): void => {
    x.beginPath();
    for (let i = 0; i <= n; i++) x.lineTo(-24 - (80 * i) / n, -7 + yAt(i / n));
    for (let i = n; i >= 0; i--) x.lineTo(-24 - (80 * i) / n, 7 + yAt(i / n) * 1.1);
    x.closePath();
  };
  cloth();
  x.fillStyle = col;
  x.fill();
  x.save();
  x.clip();
  for (let i = 0; i < n; i++) {
    const d = yAt((i + 1) / n) - yAt(i / n);
    if (d > 0.15) x.fillStyle = shadeOf(col, 0.3);
    else if (d < -0.15) x.fillStyle = lightOf(col, 0.3);
    else continue;
    x.fillRect(-24 - (80 * (i + 1)) / n, -10, 80 / n + 0.2, 22);
  }
  x.restore();
  cloth();
  x.strokeStyle = INK;
  x.lineWidth = 0.5;
  x.stroke();
  // Texte couché sur la pente locale de la banderole, lu de gauche à droite (la maquette prenait la tangente vers −x : texte à
  // l'envers), redressé à dir −1.
  x.save();
  x.translate(-64, 0.5 + yAt(0.5));
  x.rotate(Math.atan2(yAt(0.45) - yAt(0.55), 8));
  upright(x, 0, () => fitText(x, 'Wikimasters', 0, 0, 9, '#5A3A0A', { bold: true }));
  x.restore();
  // Câble en chaînette (pend sous la ligne de vol).
  x.beginPath();
  x.moveTo(-11, 0.6);
  x.quadraticCurveTo(-18, 4.5, -24, -7 + yAt(0));
  x.strokeStyle = '#555555';
  x.lineWidth = 0.5;
  x.stroke();
  // Monomoteur : train, fuselage, empennage, aile haute, verrière, liseré, hélice floue.
  PD(x, [[-2, 0.4], [-7, 6.5], [-3.5, 6.5], [3.5, 0.4]], '#D0D4DC', op(0.45, 0.3, 0.6, 0.2));
  celD(
    x,
    () => {
      x.moveTo(-12, -0.4);
      x.quadraticCurveTo(-2, -2.8, 10, -2.2);
      x.quadraticCurveTo(14, -0.8, 11, 1.6);
      x.quadraticCurveTo(-2, 2.6, -12, 0.8);
      x.closePath();
    },
    '#F4F4F4',
    { ...op(0.45, 0.28, 0.7, 0.2), box: [-12, -3, 26, 6] },
  );
  PD(x, [[-9, 0], [-13, -5], [-10, -5], [-6, 0]], '#D0D4DC', op(0.4, 0.3, 0.68, 0.2));
  PD(x, [[-4, -1.6], [-8, -4.4], [-1, -4.4], [2, -1.8]], '#E0A21E', op(0.4, 0.3, 0.6, 0.25));
  RD(x, 4, -2, 3, 1.2, '#8AB8E0', op(0.2, 0, 0.68, 0));
  x.fillStyle = '#C0463A';
  x.fillRect(-11, 0.4, 21, 0.6);
  L(x, 0, 2, -1, 4.4, '#444444', 0.5);
  disc(x, -1, 4.8, 0.8, '#2A2A2A', 0.2);
  x.save();
  x.translate(13.2, -0.4);
  x.fillStyle = 'rgba(80,80,90,0.3)';
  x.beginPath();
  x.ellipse(0, 0, 1.1, 4.6, 0, 0, TAU);
  x.fill();
  const pa = w * 9;
  L(x, -Math.cos(pa) * 0.9, -Math.sin(pa) * 4.4, Math.cos(pa) * 0.9, Math.sin(pa) * 4.4, 'rgba(50,50,50,0.8)', 0.7);
  ball(x, 0, 0, 0.8, '#444444', 0.2);
  x.restore();
  x.restore();
}

// ---------- Cerf-volant (kite : losange ±9 × −12..14, ficelle vers (−40, 150)) : rafales `gust` sur le cycle (3 s, 8 poses) →
// altitude, dérive et gîte, ligne en chaînette qui se tend aux rafales, queue qui serpente avec ses nœuds. `c` : couleur. ----------
export const KITE_CYCLE_S = 3;
const KITE_FRAMES = 8;
function kite(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const c = str(a.c, '#E07A8C');
  const w = (TAU * p.frame) / KITE_FRAMES;
  const gust = 0.5 + 0.5 * Math.sin(w) + 0.3 * Math.sin(3 * w);
  const dy = -6 * gust + 3 * Math.sin(2 * w);
  const dx = 4 * Math.sin(w);
  const ang = deg(10 * Math.sin(w + 1) + 6 * (gust - 0.5));
  x.save();
  x.translate(dx, dy);
  const sag = 10 - 8 * gust;
  x.beginPath();
  x.moveTo(0, 14);
  x.quadraticCurveTo(-20 + sag * 0.6, 80 + sag * 2, -40 - dx, 150 - dy);
  x.strokeStyle = 'rgba(60,60,60,0.6)';
  x.lineWidth = 0.5;
  x.stroke();
  x.rotate(ang);
  PD(x, [[0, -12], [9, 0], [0, 14], [-9, 0]], c, op(0.5, 0.3, 0.6, 0.25));
  L(x, 0, -12, 0, 14, '#FFFFFF', 0.8);
  L(x, -9, 0, 9, 0, '#FFFFFF', 0.8);
  x.beginPath();
  x.moveTo(0, 14);
  for (let k = 0; k < 5; k++) x.quadraticCurveTo(5 * (k % 2 ? -1 : 1) * (0.6 + gust * 0.6), 14 + k * 6 + 3 + Math.sin(2 * w + k) * 1.5, Math.sin(w + k) * 2, 14 + (k + 1) * 6);
  x.strokeStyle = INK;
  x.lineWidth = 1.2;
  x.stroke();
  x.strokeStyle = '#3B6FD6';
  x.lineWidth = 0.7;
  x.stroke();
  for (let k = 0; k < 5; k++) {
    const y = 20 + k * 6;
    const bx = Math.sin(w + k) * 2 + 1.5 * (k % 2 ? -1 : 1);
    PD(x, [[bx - 1.5, y - 1], [bx + 1.5, y - 1], [bx + 1, y + 1], [bx - 1, y + 1]], k % 2 ? '#F2C94C' : '#FFFFFF', op(0.3, 0.2, 0.68, 0));
  }
  x.restore();
}

// ---------- Grue (crane : mât ±4 × 0..−200, diagonales tous les 10, flèche −30..70 à −200, contrepoids −34..−26, câble à 45
// jusqu'à 30, charge 41..49 × 30..35) : treillis, cabine, haubans ; `side` : côté de la flèche (−1 : vers −x, dessinée en
// coordonnées retournées, pas en miroir : ombres et rehauts gardent leur côté). ----------
const CRANE_Y = '#E0A21E';
const craneSide = (a: PropArgs): 1 | -1 => (num(a.side, 1) < 0 ? -1 : 1);
function crane(x: TintedCtx, a: PropArgs): void {
  const s = craneSide(a);
  tube(x, -4, 0, -4, -200, 2, CRANE_Y, { lw: 0.4 });
  tube(x, 4, 0, 4, -200, 2, CRANE_Y, { lw: 0.4 });
  x.strokeStyle = shadeOf(CRANE_Y, 0.3);
  x.lineWidth = 0.9;
  for (let i = 0; i < 20; i++) {
    x.beginPath();
    x.moveTo(-4, -i * 10);
    x.lineTo(4, -i * 10 - 10);
    x.stroke();
    x.beginPath();
    x.moveTo(-4, -i * 10 - 10);
    x.lineTo(4, -i * 10 - 10);
    x.stroke();
  }
  PD(x, [[-1.2, -212], [1.2, -212], [4, -200], [-4, -200]], CRANE_Y, op(0.4, 0.3, 0.68, 0.25));
  // Flèche et contrepoids (repère de la flèche à −200) ; rectangle `rs` posé par son abscisse côté `s`.
  const rs = (x0: number, y0: number, w: number, h: number, c: string, o: CelOpts): void => RD(x, s > 0 ? x0 : -(x0 + w), y0, w, h, c, o);
  x.save();
  x.translate(0, -200);
  rs(-7, -6, 14, 6, '#F2F2F0', op(0.45, 0.3, 0.6, 0.2));
  rs(-6, -5, 5, 3, '#CFE4F2', op(0.3, 0, 0.68, 0));
  tube(x, -30 * s, -1, 70 * s, -1, 2.6, CRANE_Y, { lw: 0.45 });
  tube(x, -30 * s, -4.5, 70 * s, -4.5, 1.4, CRANE_Y, { lw: 0.4 });
  x.strokeStyle = shadeOf(CRANE_Y, 0.3);
  x.lineWidth = 0.6;
  for (let jx = -30; jx < 70; jx += 6) {
    x.beginPath();
    x.moveTo(jx * s, -1);
    x.lineTo((jx + 3) * s, -4.5);
    x.lineTo((jx + 6) * s, -1);
    x.stroke();
  }
  rs(-34, -2, 8, 8, '#5A5A60', op(0.45, 0.3, 0.6, 0.2));
  x.strokeStyle = 'rgba(60,60,60,0.6)';
  x.lineWidth = 0.5;
  x.beginPath();
  x.moveTo(-2 * s, -4.5);
  x.lineTo(-2 * s, -20);
  x.lineTo(70 * s, -4.5);
  x.stroke();
  x.beginPath();
  x.moveTo(-2 * s, -20);
  x.lineTo(-30 * s, -4.5);
  x.stroke();
  L(x, 45 * s, 0, 45 * s, 30, '#333333', 0.6);
  rs(41, 30, 8, 5, '#8A5A2B', op(0.45, 0.3, 0.6, 0.2));
  x.restore();
}
const craneBox = (a: PropArgs): Box => (craneSide(a) > 0 ? [-36, -222, 108, 258] : [-72, -222, 108, 258]);

// ---------- Lueur d'appartement (apartment : fenêtre 0..5 × 0..7, auréole −3..8 × −3..10) : toujours lumineuse (glowing),
// croisée sombre, reflet. ----------
function apartmentGlow(x: TintedCtx): void {
  x.glowing(() => {
    x.fillStyle = 'rgba(255,210,122,0.25)';
    x.fillRect(-3, -3, 11, 13);
    x.fillStyle = '#FFD27A';
    x.fillRect(0, 0, 5, 7);
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.fillRect(0.6, 0.6, 1.6, 2.4);
    x.fillStyle = 'rgba(42,26,24,0.35)';
    x.fillRect(2.3, 0, 0.4, 7);
    x.fillRect(0, 3.3, 5, 0.4);
  });
}

// ---------- Ballons de fête (fest-balloons : trois ballons à dx = (k−1)·14, nœud à 34 + (k%2)·6 ; cœurs ou lapins) :
// balancement ±4° autour du nœud sur le cycle (8 poses, phase k par ballon), ficelles en retard de 0,9 rad. ----------
export const FEST_BALLOONS_CYCLE_S = 3.4;
const FEST_FRAMES = 8;
function festBalloons(x: TintedCtx, a: PropArgs, p: PropPaint): void {
  const bunny = a.bunny === true;
  const cols = bunny ? ['#F7C6D9', '#CFE8FF', '#FFF2A8'] : ['#E0305A', '#F2708C', '#B01E48'];
  const w = (TAU * p.frame) / FEST_FRAMES;
  cols.forEach((c, k) => {
    const dx = (k - 1) * 14;
    const knot = 34 + (k % 2) * 6;
    x.save();
    x.translate(0, knot);
    x.rotate(deg(4 * Math.sin(w + k)));
    x.translate(dx, -knot - (k % 2) * 6);
    const lag = -3 * Math.sin(w + k - 0.9);
    x.beginPath();
    x.moveTo(0, 8);
    x.quadraticCurveTo(-dx * 0.3 + lag, 22, -dx, knot);
    x.strokeStyle = '#6B5B4A';
    x.lineWidth = 0.6;
    x.stroke();
    if (bunny) {
      ED(x, -3.5, -14, 2.4, 6.5, c, op(0.4, 0.3, 0.6, 0.25));
      ED(x, 3.5, -14, 2.4, 6.5, c, op(0.4, 0.3, 0.6, 0.25));
      ED(x, -3.5, -14, 1, 4, '#F7A8C0', op(0, 0, 0.68, 0));
      ED(x, 3.5, -14, 1, 4, '#F7A8C0', op(0, 0, 0.68, 0));
      ED(x, 0, -1, 8, 9, c, op(0.5, 0.3, 0.62, 0.25));
      disc(x, -2.8, -3, 0.9, '#5A4A4A', 0);
      disc(x, 2.8, -3, 0.9, '#5A4A4A', 0);
      disc(x, 0, 0, 0.9, '#E07A8C', 0);
      L(x, -1, 1.5, 1, 1.5, 'rgba(90,74,74,0.7)', 0.4);
    } else {
      celD(
        x,
        () => {
          x.moveTo(0, 8);
          x.bezierCurveTo(-14, -2, -8, -14, 0, -6);
          x.bezierCurveTo(8, -14, 14, -2, 0, 8);
        },
        c,
        { ...op(0.5, 0.3, 0.62, 0.25), box: [-11, -12, 22, 20] },
      );
    }
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.beginPath();
    x.ellipse(-3, -4, 1.6, 2.4, 0.3, 0, TAU);
    x.fill();
    x.restore();
  });
  disc(x, 0, 34, 1, '#6B5B4A', 0);
}

// ---------- Cloches de Pâques (bells : ruban rouge noué, deux cloches dorées à ±11 qui balancent ±14° sur 1,6 s, 8 poses). ----------
export const BELLS_CYCLE_S = 1.6;
const BELLS_FRAMES = 8;
function bells(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  const w = (TAU * p.frame) / BELLS_FRAMES;
  x.beginPath();
  x.moveTo(-11, -10);
  x.quadraticCurveTo(0, -16, 11, -10);
  x.strokeStyle = INK;
  x.lineWidth = 2.4;
  x.stroke();
  x.strokeStyle = '#C0463A';
  x.lineWidth = 1.6;
  x.stroke();
  PD(x, [[0, -14], [-5, -18], [-5, -10]], '#C0463A', op(0.4, 0.3, 0.68, 0.2));
  PD(x, [[0, -14], [5, -18], [5, -10]], '#C0463A', op(0.4, 0.3, 0.5, 0.2));
  L(x, 0, -14, -3, -6, '#C0463A', 1.2);
  L(x, 0, -14, 3, -6, '#C0463A', 1.2);
  ball(x, 0, -14, 1.2, '#C0463A', 0.3);
  [-11, 11].forEach((bx, k) => {
    const an = (k ? 14 : -14) * Math.sin(w);
    x.save();
    x.translate(bx, -10);
    x.rotate(deg(an));
    L(x, 0, 0, 0, 3, '#C0463A', 1.2);
    celD(
      x,
      () => {
        x.moveTo(-7, 17);
        x.quadraticCurveTo(-7, 4, 0, 2);
        x.quadraticCurveTo(7, 4, 7, 17);
        x.closePath();
      },
      '#E8B923',
      { ...op(0.5, 0.3, 0.62, 0.3, 0.25), box: [-7, 2, 14, 15] },
    );
    L(x, -7, 17, 7, 17, INK, 1.9);
    L(x, -7, 17, 7, 17, '#B08A16', 1.3);
    x.beginPath();
    x.moveTo(-3.5, 6);
    x.quadraticCurveTo(-5, 10, -4.5, 15);
    x.strokeStyle = 'rgba(255,244,200,0.8)';
    x.lineWidth = 1;
    x.stroke();
    ball(x, 0, 19, 1.8, '#8A6A12', 0.3);
    x.restore();
  });
}

// ---------- Camion-poubelle (garbage-truck : benne −30..10 × −30..−4 verte, cabine 10..26 × −24..−4, vitre 16..24 × −21..−14,
// marchepied −34..−30 × −20..−8, roues à (−18, −3) et (16, −3) r 4,5) : benne nervurée + capot, bande jaune, roues `wheel`,
// gyrophare ; le ripeur reste le pantin, le cône des phares le dessin SVG ; phare allumé la nuit (glowing). ----------
function garbageTruck(x: TintedCtx, _a: PropArgs, p: PropPaint): void {
  groundShadow(x, -2, 0.6, 32, 2, 0.18);
  RRD(x, -30, -30, 40, 26, 2, '#2E8B6A', op(0.55, 0.28, 0.72, 0.22, 0.15));
  x.strokeStyle = 'rgba(42,26,24,0.35)';
  x.lineWidth = 0.4;
  for (let rx = -24; rx < 8; rx += 6) {
    x.beginPath();
    x.moveTo(rx, -29);
    x.lineTo(rx, -6);
    x.stroke();
  }
  PD(x, [[-30, -30], [-24, -33], [6, -33], [10, -30]], '#257258', op(0.45, 0.3, 0.7, 0.2));
  RD(x, -31, -13, 42, 4, '#E0A21E', op(0.4, 0.25, 0.72, 0.2));
  RD(x, -34, -20, 4, 12, '#E0A21E', op(0.45, 0.3, 0.6, 0.25));
  RD(x, -34, -8, 4, 1.6, IRON, op(0.3, 0, 0.68, 0.2));
  RRD(x, 10, -24, 16, 20, 2, '#ECECEA', op(0.5, 0.28, 0.7, 0.2));
  RD(x, 16, -21, 8, 7, '#CFE4F2', op(0.4, 0.15, 0.7, 0));
  glint(x, 16, -21, 8, 7, 0.4);
  RD(x, 10, -10, 16, 1.2, '#2E8B6A', op(0, 0, 0.68, 0));
  RD(x, 25, -20, 1.6, 3, '#2A2A2A', op(0.3, 0, 0.68, 0.2));
  RD(x, -31, -6, 58, 2, '#2E323C', op(0.4, 0.3, 0.7, 0.1));
  for (const wx of [-18, 16]) wheel(x, wx, -3, 4.5);
  RD(x, 24, -26, 3, 1.6, '#F28C28', op(0.3, 0, 0.68, 0.3));
  if (p.lit) x.glowing(() => ball(x, 25.6, -9.5, 1.4, '#FFE9A0', 0.3));
  else ball(x, 25.6, -9.5, 1.4, '#D8D0B8', 0.3);
}

// ---------- Vélo de livraison (delivery-bike : roues ±7 r 5 à −5, cadre, caisse isotherme −13..−1 × −34..−23) : vélo et
// caisse peints, logo « W » (redressé à −1) ; le livreur est le pantin GhibliRider (selle à (−4, −16)). `box` : couleur. ----------
function deliveryBike(x: TintedCtx, a: PropArgs): void {
  const box = str(a.box, '#2A9DAA');
  const fr = '#3B3F4A';
  wheel(x, -7, -5, 5);
  wheel(x, 7, -5, 5);
  tube(x, -7, -5, 0, -12, 1.3, fr, { lw: 0.4 });
  tube(x, 0, -12, 7, -5, 1.3, fr, { lw: 0.4 });
  tube(x, -7, -5, -1, -5, 1.3, fr, { lw: 0.4 });
  tube(x, -1, -5, 0, -12, 1.3, fr, { lw: 0.4 });
  tube(x, 0, -12, 2, -15, 1.3, fr, { lw: 0.4 });
  tube(x, -1, -12, -6, -13, 1.1, fr, { lw: 0.35 });
  ball(x, -1, -5, 1.3, '#2A2D34', 0.3);
  RRD(x, -5.5, -13.6, 4, 1.2, 0.5, '#2A2D34', op(0.3, 0.2, 0.68, 0.2));
  tube(x, 2, -15, 5, -16, 1.1, '#2A2D34', { lw: 0.35 });
  // Porte-bagages et caisse isotherme.
  tube(x, -13, -23, -1, -23, 0.9, fr, { lw: 0.35 });
  tube(x, -9, -23, -7, -5, 0.8, fr, { lw: 0.3 });
  RRD(x, -13, -34, 12, 11, 1, box, op(0.5, 0.3, 0.68, 0.25, 0.2));
  x.strokeStyle = 'rgba(255,255,255,0.6)';
  x.lineWidth = 0.4;
  x.strokeRect(-11.5, -32.5, 9, 8);
  disc(x, -7, -28.5, 2, '#FFFFFF', 0.3);
  upright(x, -7, () => fitText(x, 'W', -7, -28.3, 2.6, box, { bold: true }));
}

// ---------- Patrouille (Jet de flypast-sprite : fuselage −5..8, ailes ±2,6, dérive rouge, bande blanche) : petit chasseur
// bleu, verrière, feu de dérive ; les fumées tricolores sont des particules de la couche. ----------
const JET_BLUE = '#2B4FA0';
function jet(x: TintedCtx): void {
  PD(x, [[0, 0], [-3.5, 2.6], [-1.8, 2.6], [2, 0]], JET_BLUE, op(0.3, 0.3, 0.6, 0.15));
  PD(x, [[0, 0], [-3.5, -2.6], [-1.8, -2.6], [2, 0]], shadeOf(JET_BLUE, 0.15), op(0.3, 0.3, 0.6, 0.1));
  PD(x, [[-5, 0], [-6.4, -2.6], [-4.6, -2.6], [-3.2, -0.4]], '#C0302B', op(0.3, 0.3, 0.6, 0.2));
  celD(
    x,
    () => {
      x.moveTo(-5, 0);
      x.lineTo(5, -0.9);
      x.quadraticCurveTo(8, 0, 5, 0.9);
      x.closePath();
    },
    JET_BLUE,
    { ...op(0.35, 0.3, 0.64, 0.2), box: [-5, -1, 13, 2] },
  );
  x.fillStyle = '#F2F2F2';
  x.fillRect(-2, -0.3, 5, 0.6);
  ED(x, 3.2, -0.5, 1.1, 0.45, '#9CC4E0', op(0.2, 0.2, 0.6, 0));
}

const paintOf = (fn: (x: TintedCtx, a: PropArgs) => void) => (x: TintedCtx, a: PropArgs, _p: PropPaint): void => fn(x, a);

registerProps({
  plane: { box: () => [-24, -14, 50, 30], paint: plane },
  helicopter: { box: () => [-35, -17, 72, 63], frames: HELI_FRAMES, paint: helicopter },
  drone: { box: () => [-17, -8, 34, 14], frames: DRONE_FRAMES, paint: drone },
  balloon: { box: () => [-20, -42, 40, 66], frames: BALLOON_FRAMES, paint: balloon },
  'banner-plane': { box: () => [-109, -15, 128, 26], frames: BANNER_FRAMES, paint: bannerPlane },
  kite: { box: () => [-54, -24, 70, 178], frames: KITE_FRAMES, paint: kite },
  crane: { box: craneBox, paint: paintOf(crane) },
  'apartment-glow': { box: () => [-3, -3, 11, 13], paint: paintOf((x) => apartmentGlow(x)) },
  'fest-balloons': { box: () => [-31, -32, 62, 68], frames: FEST_FRAMES, paint: festBalloons },
  bells: { box: () => [-22, -20, 44, 42], frames: BELLS_FRAMES, paint: bells },
  'garbage-truck': { box: () => [-36, -35, 86, 38], paint: garbageTruck },
  'delivery-bike': { box: () => [-14.5, -35, 29, 36], paint: paintOf(deliveryBike) },
  jet: { box: () => [-7.5, -3.5, 17, 7], paint: paintOf((x) => jet(x)) },
});
