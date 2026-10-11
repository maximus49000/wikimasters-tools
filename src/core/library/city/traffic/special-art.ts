// Véhicules à part en Ghibli (spec véhicules §4, livraison V3) : plans de peinture (CarArt, exécutés par
// content/vehicle/car-host.tsx comme ceux des voitures générées) de 15 modèles, repris des dessins de la maquette validée
// (`.superpowers/brainstorm/vehicules-ghibli/maquette.html` : bus, schoolBus, van, et le CATALOG de model()). Le tram, la
// benne à ordures et les éboueurs sont nouveaux, dans la même grammaire. Repère : roues au sol y = 0, regard vers +x.
// Fabrication commune (model) : caisse peinte, détails, passages de roue, PERCÉE à chaque vitre (les occupants, rognés au
// rectangle englobant des vitres, n'apparaissent qu'aux vitres), habitacle sombre, vitrage, chromes, feu arrière, pot.
// Occupants : pantins assis aux têtes des bustes de la maquette (échelle bust × 0,53), pilotes des deux-roues en selle,
// éboueurs debout sur le marchepied.
import { hashString, mulberry32 } from '../../scene-world';
import { mixHex } from '../../sky';
import type { ArmPose } from '../../figure/skeleton';
import { INK, circlePath, type Beacon, type CarArt, type Op, type Seat } from './car-art';
import type { Rim } from './cars';
import type { BusLine } from './bus-lines';
import type { VehicleLook } from './look';

export const SPECIAL_IDS = ['bus', 'school-bus', 'tram', 'estafette', 'type-h', 'poste', 'tipper', 'ambulance', 'police', 'taxi', 'garbage', 'vespa', 'mobylette', 'sidecar', 'triporteur'] as const;
export type SpecialId = (typeof SPECIAL_IDS)[number];
// `label` : inscription d'un utilitaire (Type H : commerce desservi) ; `line` : ligne d'un bus (girouette, couleur).
export type SpecialSpec = { id: SpecialId; seed: number; label?: string; line?: BusLine };

// Vitesse voulue (× vitesse de base du genre de l'agent).
export const SPECIAL_SPEED: Readonly<Record<SpecialId, number>> = {
  bus: 1, 'school-bus': 1, tram: 1, estafette: 0.95, 'type-h': 0.85, poste: 0.95, tipper: 0.8, ambulance: 1, police: 1.05, taxi: 1.05, garbage: 1, vespa: 0.95, mobylette: 0.75, sidecar: 0.9, triporteur: 0.6,
};

const BUST = 0.53; // échelle du pantin assis pour un buste de la maquette d'échelle 1
const RIDER = 0.5; // pilote en selle
const STAND = 0.6; // debout (éboueur)
const CREAM = '#efe4c6';
const CHROME = '#d9d6cf';

const f = (n: number): string => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(2));
function rr(x: number, y: number, w: number, h: number, r: number | readonly [number, number, number, number]): string {
  const [a, b, c, d] = typeof r === 'number' ? [r, r, r, r] : r;
  return `M${f(x + a)} ${f(y)} L${f(x + w - b)} ${f(y)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + b)} L${f(x + w)} ${f(y + h - c)} Q${f(x + w)} ${f(y + h)} ${f(x + w - c)} ${f(y + h)} L${f(x + d)} ${f(y + h)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - d)} L${f(x)} ${f(y + a)} Q${f(x)} ${f(y)} ${f(x + a)} ${f(y)} Z`;
}
const rect = (x0: number, y0: number, x1: number, y1: number): string => `M${f(x0)} ${f(y0)} L${f(x1)} ${f(y0)} L${f(x1)} ${f(y1)} L${f(x0)} ${f(y1)} Z`;
const archPath = (x: number, y: number, r: number): string => `M${f(x - r)} ${f(y)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`;
// Rectangle englobant d'un tracé fait de M, L, Q (coordonnées absolues par paires).
function bboxOf(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i + 1 < n.length; i += 2) {
    b.x0 = Math.min(b.x0, n[i]!);
    b.x1 = Math.max(b.x1, n[i]!);
    b.y0 = Math.min(b.y0, n[i + 1]!);
    b.y1 = Math.max(b.y1, n[i + 1]!);
  }
  return b;
}
const piece = (d: string, color: string, ox?: number, oy?: number): Op => ({ k: 'piece', d, color, ...(ox !== undefined ? { ox } : {}), ...(oy !== undefined ? { oy } : {}) });
const fill = (d: string, color: string, more: Partial<Extract<Op, { k: 'fill' }>> = {}): Op => ({ k: 'fill', d, color, ...more });
const line = (d: string, color: string, w: number, alpha?: number): Op => ({ k: 'line', d, color, w, ...(alpha !== undefined ? { alpha } : {}) });
const text = (x: number, y: number, t: string, size: number, color: string, bg?: string): Op => ({ k: 'text', x, y, text: t, size, color, ...(bg ? { bg } : {}) });

type Person = { x: number; y: number; k: number; role?: Seat['role']; child?: boolean; gait?: Seat['gait']; arms?: ArmPose; over?: boolean };
type Model = {
  color: string;
  body: string;
  under?: Op[];
  paint?: Op[];
  windows?: string[];
  pillars?: string;
  people: Person[]; // le premier est le conducteur
  wheels: readonly (readonly [number, number])[];
  arch?: { r: number; y: number; color: string };
  chrome?: readonly (readonly [number, number, number, number])[];
  lamp: readonly [number, number];
  tail: readonly [number, number];
  exhaust: readonly [number, number] | null;
  over?: Op[];
  beacons?: Beacon[];
  top?: number;
  x0?: number;
  x1?: number;
};

function model(m: Model, seed: number): CarArt {
  const bb = bboxOf(m.body);
  const x0 = Math.min(bb.x0, m.x0 ?? Infinity, ...(m.chrome ?? []).map((c) => c[0]));
  const x1 = Math.max(bb.x1, m.x1 ?? -Infinity, ...(m.chrome ?? []).map((c) => c[0] + c[2]));
  const body: Op[] = [{ k: 'shadow', x0, x1 }, ...(m.under ?? []), piece(m.body, m.color), ...(m.paint ?? [])];
  if (m.arch) for (const [x] of m.wheels) body.push(piece(archPath(x, m.arch.y, m.arch.r), m.arch.color, -0.3, -0.5));
  const interior: Op[] = [];
  const glazing: Op[] = [];
  let cabin: CarArt['cabin'] = null;
  if (m.windows && m.windows.length > 0) {
    const w = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const d of m.windows) {
      body.push({ k: 'hole', d });
      interior.push(fill(d, '#3a3040'));
      glazing.push({ k: 'glass', d });
      const b = bboxOf(d);
      w.x0 = Math.min(w.x0, b.x0);
      w.y0 = Math.min(w.y0, b.y0);
      w.x1 = Math.max(w.x1, b.x1);
      w.y1 = Math.max(w.y1, b.y1);
    }
    cabin = { x: w.x0, y: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 };
  }
  if (m.pillars) body.push(line(m.pillars, INK, 0.7));
  for (const [x, y, w, h] of m.chrome ?? []) body.push(piece(rr(x, y, w, h, h / 2), CHROME, -0.3, -0.4));
  body.push(fill(rect(m.tail[0] - 0.6, m.tail[1] - 1.1, m.tail[0] + 0.6, m.tail[1] + 1.1), '#c0392b'));
  if (m.exhaust) body.push(fill(rr(m.exhaust[0] - 2.2, m.exhaust[1] - 0.5, 2.6, 1.1, 0.5), INK));
  const seats: Seat[] = m.people.map((p, i) => ({
    role: i === 0 ? 'driver' : (p.role ?? 'rear'),
    child: p.child ?? false,
    outfitSeed: (seed ^ hashString(`occ-${i}`)) >>> 0,
    x: p.x,
    headY: p.y,
    k: p.k,
    ...(p.gait ? { gait: p.gait } : {}),
    ...(p.arms ? { arms: p.arms } : {}),
    ...(p.over ? { over: true } : {}),
  }));
  const tops = [bb.y0, m.top ?? 0, ...(m.beacons ?? []).map((b) => b.y)];
  for (const o of [...body, ...(m.over ?? [])]) if (o.k === 'text') tops.push(o.y - o.size * 1.2);
  const d = m.people[0]!;
  return {
    len: x1 - x0,
    x0,
    x1,
    top: Math.min(...tops) - 0.6,
    interior,
    body,
    glazing,
    over: m.over ?? [],
    wheels: m.wheels.map(([x, r]) => ({ x, r })),
    cabin,
    seats,
    wheelHand: d.gait ? null : { x: d.x + 3.4, y: d.y + 4.2 },
    tail: { x: m.tail[0], y: m.tail[1] },
    head: { x: m.lamp[0], y: m.lamp[1], round: true },
    exhaust: m.exhaust ? { x: m.exhaust[0], y: m.exhaust[1] } : null,
    beacons: m.beacons ?? [],
  };
}

// Petit panneau « transport d'enfants » : carré jaune bordé de rouge, deux silhouettes.
function kidsSign(x: number): Op[] {
  return [
    fill(rr(x - 0.4, -9.9, 6.8, 5, 0.7), '#c0302b'),
    fill(rr(x, -9.5, 6, 4.2, 0.5), '#f2c230'),
    fill(`${circlePath(x + 2.2, -8.2, 0.6)} ${circlePath(x + 3.9, -8, 0.5)}`, INK),
    fill(rect(x + 1.8, -7.6, x + 2.6, -6), INK),
    fill(rect(x + 3.5, -7.4, x + 4.2, -6), INK),
  ];
}

const SEDAN = 'M-24 -4.6 L-24 -12 Q-24 -14 -21 -14 L-14.6 -14 Q-11.4 -21.4 -4 -21.8 L4.4 -21.8 Q9.6 -21.4 12.6 -14 L21 -13.6 Q24 -13 24 -9.6 L24 -4.6 Q23.6 -3.4 21 -3.4 L-21 -3.4 Q-24 -3.4 -24 -4.6 Z';
const SEDAN_WIN = ['M-13.6 -14.4 Q-10.6 -20.4 -4.6 -20.6 L-0.6 -20.6 L-0.6 -14.4 Z', 'M0.6 -14.4 L0.6 -20.6 L4 -20.6 Q8.6 -20.2 11.4 -14.4 Z'];
const SEDAN_BASE = { wheels: [[-15, 4.2], [15, 4.2]] as const, chrome: [[-25, -6.4, 4, 1.8], [22, -6.4, 4, 1.8]] as const, lamp: [23.2, -10.6] as const, tail: [-23.6, -11] as const, exhaust: [-23.6, -3.8] as const };
const CAB = 'M12 -4 L12 -24.6 Q12 -26.6 14.4 -26.6 L21 -26.6 Q25.4 -24.6 26.6 -16.4 L29 -15 L29 -4 Z';
const CAB_WIN = 'M15 -24.6 L21.4 -24.6 Q24 -23 25 -17.4 L15 -17.4 Z';

function build(s: SpecialSpec): CarArt {
  const r = mulberry32((s.seed * 7919) ^ hashString(s.id));
  const pickOf = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
  switch (s.id) {
    case 'bus': {
      // Bus bicolore (bas à la couleur de la ligne, haut crème), six vitres à passagers, porte, girouette de toit.
      const c = s.line?.colour ?? '#2f7d64';
      const windows = Array.from({ length: 6 }, (_, i) => rr(-30 + i * 9.6, -27, 7.6, 8.4, 1.6));
      const people: Person[] = [{ x: 30.6, y: -23.4, k: BUST * 0.8 }];
      for (let i = 0; i < 6; i++) {
        const wx = -30 + i * 9.6;
        const n = r() < 0.15 ? 0 : r() < 0.55 ? 1 : 2;
        if (n === 1) people.push({ x: wx + 3.2, y: -23, k: BUST * 0.78 });
        if (n === 2) people.push({ x: wx + 2.2, y: -23, k: BUST * 0.78 }, { x: wx + 5.2, y: -22.6, k: BUST * 0.78 });
      }
      const sign = `${s.line?.ref ?? '1'}  ${(s.line?.to ?? 'Gare').toUpperCase()}`.slice(0, 22);
      const sw = 3 + sign.length * 1.62;
      return model(
        {
          color: c,
          body: rr(-34, -30, 68, 26, [7, 9, 3, 3]),
          paint: [
            piece(rr(-33.4, -29.4, 66.8, 12.5, [6.5, 8.5, 0, 0]), CREAM, -0.4, -0.5),
            fill(rect(-33, -16.6, 33, -15.4), '#c9a440'),
            piece(rr(23, -18, 6, 13, 1), mixHex(c, '#000000', 0.15), -0.2),
            piece(rr(1 - sw / 2, -33.4, sw, 3.8, 1.6), '#2a2622', -0.2),
            text(2.2 - sw / 2, -30.5, sign, 2.6, '#ffc94a'),
          ],
          windows: [...windows, 'M29 -27 Q33 -26 33.4 -19 L29 -19 Z'],
          people,
          wheels: [[-21, 4.6], [20, 4.6]],
          arch: { r: 6.6, y: -5, color: mixHex(c, '#000000', 0.2) },
          chrome: [[-35, -6.4, 6, 2.2], [30, -6.4, 6, 2.2]],
          lamp: [33, -9],
          tail: [-33.6, -11],
          exhaust: [-33.5, -3.4],
        },
        s.seed,
      );
    }
    case 'school-bus': {
      // Car scolaire blanc et bleu, deux enfants à chaque vitre, panneaux « transport d'enfants » à l'avant et à l'arrière.
      const people: Person[] = [{ x: 30.6, y: -24.2, k: BUST * 0.8 }];
      for (let i = 0; i < 6; i++) {
        const wx = -30 + i * 9.6;
        people.push({ x: wx + 2.2, y: -22.8, k: BUST * 0.62, child: true }, { x: wx + 5.4, y: -22.6, k: BUST * 0.62, child: true });
      }
      return model(
        {
          color: '#eef0f2',
          body: rr(-34, -31, 68, 27, [6, 8, 3, 3]),
          paint: [fill(rect(-33.6, -14.5, 33.6, -11.5), '#2d6db5'), fill(rect(-33.6, -11.5, 33.6, -10.5), '#e8b53a'), ...kidsSign(-33), ...kidsSign(26), text(-24, -16.2, 'TRANSPORT SCOLAIRE', 2.4, '#2d6db5')],
          windows: [...Array.from({ length: 6 }, (_, i) => rr(-30 + i * 9.6, -28, 7.6, 8.4, 1.6)), 'M29 -28 Q33 -27 33.4 -19 L29 -19 Z'],
          people,
          wheels: [[-21, 4.6], [20, 4.6]],
          arch: { r: 6.6, y: -5, color: '#d6d9dc' },
          chrome: [[-35, -6.4, 6, 2.2], [30, -6.4, 6, 2.2]],
          lamp: [33, -9],
          tail: [-33.6, -13],
          exhaust: [-33.5, -3.4],
        },
        s.seed,
      );
    }
    case 'tram': {
      // Tram articulé de deux caisses (haut crème, bas rouge), pantographe, vitres à passagers, bogies ; aucun pot.
      const red = '#b8443a';
      const winsA = Array.from({ length: 5 }, (_, i) => rr(-64 + i * 12.4, -30, 10, 9, 1.6));
      const winsB = Array.from({ length: 4 }, (_, i) => rr(5 + i * 12.4, -30, 10, 9, 1.6));
      const people: Person[] = [{ x: 63, y: -26, k: BUST * 0.8 }];
      for (const wx of [...Array.from({ length: 5 }, (_, i) => -64 + i * 12.4), ...Array.from({ length: 4 }, (_, i) => 5 + i * 12.4)]) {
        const n = r() < 0.2 ? 0 : r() < 0.5 ? 1 : 2;
        if (n >= 1) people.push({ x: wx + 3, y: -25.6, k: BUST * 0.78 });
        if (n === 2) people.push({ x: wx + 7, y: -25.4, k: BUST * 0.78 });
      }
      return model(
        {
          color: CREAM,
          body: rr(-68, -34, 67, 28, [5, 3, 2, 2]),
          paint: [
            piece(rr(1, -34, 67, 28, [3, 9, 2, 2]), CREAM),
            piece(rr(-67.4, -16, 66, 9.4, [0, 0, 2, 2]), red, -0.3, -0.4),
            piece(rr(1.6, -16, 65.8, 9.4, [0, 0, 2, 2]), red, -0.3, -0.4),
            fill(rect(-1.4, -31, 1.4, -8), '#3a3040'),
            line('M-30 -15.5 L-30 -7 M-29.4 -15.5 L-29.4 -7 M30.6 -15.5 L30.6 -7 M31.2 -15.5 L31.2 -7', INK, 0.5, 0.7),
            line('M-12 -34 L-6 -41 L2 -35.4 M-15 -41.4 L1 -41.4', INK, 0.8),
          ],
          windows: [...winsA, ...winsB, 'M58 -31 Q65 -30 66.4 -21 L58 -21 Z'],
          people,
          wheels: [[-58, 3], [-50, 3], [-6, 3], [6, 3], [50, 3], [58, 3]],
          lamp: [67, -11],
          tail: [-67.6, -12],
          exhaust: null,
          top: -42,
          x1: 68,
        },
        s.seed,
      );
    }
    case 'estafette': {
      const c = pickOf(['#e8e1cf', '#3e6e9e', '#9fb59a', '#d9a43a']);
      const people: Person[] = [{ x: 13.4, y: -21, k: BUST * 0.85 }];
      if (r() < 0.4) people.push({ x: 2.6, y: -21.2, k: BUST * 0.8 });
      return model(
        {
          color: c,
          body: 'M-22 -4 L-22 -24 Q-22 -27 -18 -27 L12 -27 Q20 -27 22 -18 L23 -7 Q23 -4 20 -4 Z',
          paint: [fill(rect(-21.4, -13.5, 22.6, -11.5), mixHex(c, '#ffffff', 0.6)), ...(s.label ? [text(-18, -15.4, s.label, 2.8, '#2f5e8a', '#f2efe6')] : [])],
          windows: ['M10 -25 Q18 -25 20.5 -17 L10 -17 Z', rr(-2, -25, 9, 7, 1.2)],
          pillars: 'M8.5 -26 L8.5 -5 M-4 -26 L-4 -5',
          people,
          wheels: [[-13, 4.2], [13, 4.2]],
          chrome: [[-23, -6, 4, 2], [20, -6, 4, 2]],
          lamp: [21.5, -10],
          tail: [-21.4, -12],
          exhaust: [-21.5, -3.6],
        },
        s.seed,
      );
    }
    case 'type-h': {
      // Fourgon en tôle ondulée : nervures verticales, enseigne du commerce desservi.
      let ribs = '';
      for (let x = -23.6; x < 9; x += 2) ribs += `M${f(x)} -27.6 L${f(x)} -5 `;
      return model(
        {
          color: '#9aa3a6',
          body: 'M-25 -4 L-25 -27 Q-25 -29 -22.6 -29 L9 -29 Q13.4 -29 14.4 -25 L15.6 -18.4 L22 -16.4 Q25 -15.4 25 -11 L25 -4 Q24.6 -3.2 22 -3.2 L-22 -3.2 Q-25 -3.2 -25 -4 Z',
          paint: [line(ribs, INK, 0.45, 0.45), text(-19, -15, s.label ?? 'LAITERIE', 3, '#2f5e8a', '#f2efe6')],
          windows: ['M10.4 -26.6 Q13 -26.6 13.8 -23.4 L14.6 -18.6 L10.4 -18.6 Z'],
          people: [{ x: 12.4, y: -21.6, k: BUST * 0.75 }],
          wheels: [[-15, 4.2], [16, 4.2]],
          arch: { r: 5.6, y: -4, color: mixHex('#9aa3a6', '#000000', 0.1) },
          chrome: [[-26, -6, 3.4, 1.6], [23, -6, 3.4, 1.6]],
          lamp: [23.6, -12],
          tail: [-24.4, -12],
          exhaust: [-24.6, -3.6],
        },
        s.seed,
      );
    }
    case 'poste':
      return model(
        {
          color: '#f2c230',
          body: 'M-20 -4 L-20 -25 L4.6 -25 Q6.6 -25 7.4 -22 L9.4 -15.4 L18.4 -14.4 Q20.4 -13.6 20.4 -9.4 L20.4 -4 Q20 -3.2 18 -3.2 L-18 -3.2 Q-20 -3.2 -20 -4 Z',
          paint: [piece(rect(-19.4, -11.6, 19.8, -9.6), '#2f5e8a', 0, 0), text(-15, -15, 'POSTES', 3.2, '#2f5e8a')],
          windows: ['M1.6 -21.6 L6 -21.6 L8.4 -15.6 L1.6 -15.6 Z'],
          people: [{ x: 4.4, y: -18.6, k: BUST * 0.75 }],
          wheels: [[-13, 4], [13.4, 4]],
          arch: { r: 5.4, y: -4, color: mixHex('#f2c230', '#000000', 0.1) },
          chrome: [[-21, -6, 3.4, 1.6], [18.6, -6, 3.4, 1.6]],
          lamp: [19.6, -11.4],
          tail: [-19.4, -14],
          exhaust: [-19.6, -3.6],
        },
        s.seed,
      );
    case 'tipper':
      // Camion-benne : benne orange chargée de gravats, cabine bleue avancée, trois roues.
      return model(
        {
          color: '#d9862e',
          under: [piece('M-29 -9.6 L13 -9.6 L13 -6.6 L-29 -6.6 Z', '#3a3430', 0, 0)],
          body: 'M-29 -9.4 L-28 -22 L9 -22 L10 -9.4 Z',
          paint: [
            line('M-20 -21.6 L-20.6 -9.8 M-10 -21.6 L-10 -9.8 M0 -21.6 L0.4 -9.8', INK, 0.6, 0.5),
            piece('M-27 -22 Q-20 -25 -10 -23.6 Q0 -25.4 8 -22 Z', '#7a6a5a', -0.2),
            piece(CAB, '#3e6e9e'),
          ],
          windows: [CAB_WIN],
          people: [{ x: 19, y: -21.2, k: BUST * 0.8 }],
          wheels: [[-20, 4.6], [-9, 4.6], [21, 4.6]],
          lamp: [28.4, -12],
          tail: [-28.6, -12],
          exhaust: [-28.6, -6],
          x1: 29,
        },
        s.seed,
      );
    case 'ambulance':
      return model(
        {
          color: '#f2f1ec',
          body: 'M-26 -4 L-26 -28 Q-26 -29.6 -24 -29.6 L12 -29.6 Q16.6 -29.6 18.6 -21 L24 -18.6 Q26 -17.6 26 -12 L26 -4 Q25.6 -3.2 23 -3.2 L-23 -3.2 Q-26 -3.2 -26 -4 Z',
          paint: [piece(rect(-25.6, -15.4, 25.6, -12.6), '#c8222c', 0, 0), fill(rect(-14, -25.6, -12, -19.6), '#c8222c'), fill(rect(-16, -23.6, -10, -21.6), '#c8222c')],
          windows: ['M12.4 -27.4 Q15.6 -27.4 17.2 -20.4 L12.4 -20.4 Z', rect(-8, -27, 4, -21)],
          people: [{ x: 14.4, y: -23.4, k: BUST * 0.75 }],
          wheels: [[-16, 4.4], [16, 4.4]],
          arch: { r: 5.8, y: -4, color: '#d9d8d2' },
          chrome: [[-27, -6, 3.4, 1.6], [24, -6, 3.4, 1.6]],
          beacons: [
            { x: 6, y: -32, w: 4, h: 2.4, on: '#4f7bff', off: '#22305a' },
            { x: -22, y: -32, w: 4, h: 2.4, on: '#4f7bff', off: '#22305a' },
          ],
          lamp: [25, -12],
          tail: [-25.6, -18],
          exhaust: [-25.6, -3.6],
        },
        s.seed,
      );
    case 'police':
      return model(
        {
          ...SEDAN_BASE,
          color: '#2e4f8a',
          body: SEDAN,
          paint: [piece(rect(-23.6, -11, 23.6, -7.4), '#efeee8', 0, 0), text(-6, -8.1, 'POLICE', 2.6, '#2e4f8a')],
          windows: SEDAN_WIN,
          people: [
            { x: 5, y: -17.6, k: BUST * 0.8 },
            { x: -6.6, y: -17.4, k: BUST * 0.78, role: 'front' },
          ],
          arch: { r: 5.6, y: -4, color: mixHex('#2e4f8a', '#000000', 0.1) },
          beacons: [{ x: -2, y: -24.2, w: 4, h: 2.4, on: '#4f7bff', off: '#22305a' }],
        },
        s.seed,
      );
    case 'taxi': {
      const people: Person[] = [{ x: 5, y: -17.6, k: BUST * 0.8 }];
      if (r() < 0.6) people.push({ x: -6.6, y: -17.4, k: BUST * 0.78 });
      return model(
        {
          ...SEDAN_BASE,
          color: '#2a2a2e',
          body: SEDAN,
          paint: [line('M-23.4 -11 L23.4 -11', '#cfd3d6', 0.5), piece('M-4 -21.8 L-4 -24.6 L4 -24.6 L4 -21.8 Z', '#f2c230', -0.2), text(-3.3, -22.4, 'TAXI', 2.2, INK)],
          windows: SEDAN_WIN,
          people,
          arch: { r: 5.6, y: -4, color: '#232327' },
          // Lumineux : halo posé sur l'enseigne la nuit.
          beacons: [{ x: -4.6, y: -25.2, w: 9.2, h: 4, on: '#ffe9a0', off: null }],
        },
        s.seed,
      );
    }
    case 'garbage':
      // Benne à ordures : caisse verte arrondie, trémie à l'arrière, cabine claire, gyrophare orange, deux éboueurs debout
      // sur le marchepied.
      return model(
        {
          color: '#4f8a4a',
          under: [piece('M-31 -9.6 L13 -9.6 L13 -6.6 L-31 -6.6 Z', '#3a3430', 0, 0)],
          body: 'M-28 -9 L-28 -24 Q-28 -27 -24 -27 L8 -27 Q11 -27 11 -24 L11 -9 Z',
          paint: [
            piece('M-28 -7 L-33 -9 L-33 -21 L-28 -25 Z', '#3f7240', -0.2),
            fill(rect(-27.4, -15.4, 10.4, -13.4), '#f2efe6'),
            text(-20, -17.4, 'PROPRETÉ', 2.6, '#f2efe6'),
            piece(CAB, '#e8e1cf'),
            fill(rect(-36, -6.8, -29, -5.6), INK),
          ],
          windows: [CAB_WIN],
          people: [
            { x: 19, y: -21.2, k: BUST * 0.8 },
            { x: -34.4, y: -6.4, k: STAND, gait: 'stand', arms: 'hold', over: true },
            { x: -31.2, y: -6.4, k: STAND, gait: 'stand', arms: 'hold', over: true },
          ],
          wheels: [[-21, 4.6], [-10, 4.6], [21, 4.6]],
          beacons: [{ x: 15, y: -29, w: 4, h: 2.2, on: '#ffa23a', off: '#8a5a20' }],
          lamp: [28.4, -12],
          tail: [-32.6, -12],
          exhaust: [-31, -6],
          x0: -36,
          x1: 29,
        },
        s.seed,
      );
    case 'vespa': {
      const c = pickOf(['#a9cfc3', '#e8d9b0', '#c0463a', '#8fb0d8']);
      return model(
        {
          color: c,
          body: 'M-10 -4.6 Q-11.6 -11.4 -6 -11.6 L-1.6 -11.6 L-1.4 -6.4 L3.6 -6.4 L6.4 -15.4 L8.4 -15.4 Q9.6 -9 8.6 -4.6 Z',
          paint: [fill(rr(-7.6, -13.2, 6.4, 1.8, 0.9), '#3a3040'), line('M6.4 -15.6 L8.2 -18 M6.8 -17.6 L5 -18', INK, 0.9)],
          people: [{ x: -4.4, y: -13, k: RIDER, gait: 'mount', arms: 'handlebar', over: true }],
          wheels: [[-7, 2.6], [7.6, 2.6]],
          lamp: [8.6, -15],
          tail: [-9.8, -8],
          exhaust: [-10, -3.2],
          top: -26,
        },
        s.seed,
      );
    }
    case 'mobylette':
      return model(
        {
          color: '#5a3a8a',
          body: 'M-1.6 -9.6 Q1 -11.4 3 -9.6 L2.6 -7.4 L-1.2 -7.4 Z',
          under: [line('M-7.4 -4 L-1 -10 L6.6 -4 M-1 -10 L-2.4 -13 M-1 -10 L5 -10.4 L6 -14 M0 -6 L2 -6', '#5a3a8a', 1), fill(rr(-4.4, -13.8, 4.4, 1.4, 0.7), '#2b2522')],
          people: [{ x: -2.4, y: -13.4, k: RIDER, gait: 'mount', arms: 'handlebar', over: true }],
          wheels: [[-7.4, 3.2], [6.6, 3.2]],
          lamp: [6.6, -14],
          tail: [-7.6, -9],
          exhaust: [-6, -3.4],
          x0: -10.6,
          x1: 9.8,
          top: -27,
        },
        s.seed,
      );
    case 'sidecar':
      // Moto (derrière) et son panier (devant, côté spectateur) : le pilote en selle sous le panier, le passager assis dans
      // le panier, recouvert jusqu'à la taille par la caisse du panier (couche « over »).
      return model(
        {
          color: '#3a3430',
          body: 'M-8 -6 L-8 -11 L6 -12 L8.6 -9 L6 -6 Z',
          people: [
            { x: -4, y: -12.4, k: RIDER, gait: 'mount', arms: 'handlebar' },
            { x: 6, y: -15, k: BUST * 0.78, role: 'front' },
          ],
          wheels: [[-9.4, 3.6], [9, 3.6], [12, 3]],
          over: [piece('M-2 -4.6 Q-3 -12.6 6 -12.6 L14 -12 Q17 -10 16.4 -6 Q15 -4.6 12 -4.6 Z', pickOf(['#2f5e3e', '#7a2f2a', '#2f4a6a']))],
          lamp: [10.6, -13.6],
          tail: [-8, -9],
          exhaust: [-12, -4],
          x0: -13,
          x1: 17,
          top: -27,
        },
        s.seed,
      );
    case 'triporteur':
      // Triporteur du laitier : caisse « LAIT » à l'avant sur deux roues, pilote en selle derrière, une roue arrière.
      return model(
        {
          color: '#2f7d64',
          under: [line('M-10 -3.6 L-4 -11 L2 -11 M-4 -11 L-3 -15', '#4a4a52', 1.2)],
          body: 'M2.6 -6.4 L2.6 -17 L15 -17 L15 -6.4 Z',
          paint: [text(3.8, -10.8, 'LAIT', 2.8, '#f2efe6')],
          people: [{ x: -4.2, y: -13.2, k: RIDER, gait: 'mount', arms: 'handlebar', over: true }],
          wheels: [[-10, 3.4], [9, 3.4]],
          lamp: [15, -10],
          tail: [-12.4, -6],
          exhaust: null,
          x0: -13.4,
          top: -28,
        },
        s.seed,
      );
  }
}

export const specialKey = (s: SpecialSpec): string => `sp|${s.id}|${s.seed}|${s.label ?? ''}|${s.line ? `${s.line.ref}|${s.line.to}|${s.line.colour}` : ''}`;
const memo = new Map<string, CarArt>();
export function specialArt(s: SpecialSpec): CarArt {
  const key = specialKey(s);
  const hit = memo.get(key);
  if (hit) return hit;
  const art = build(s);
  if (memo.size >= 256) memo.clear();
  memo.set(key, art);
  return art;
}
// Demi-encombrement (unités du sprite), pare-chocs compris : le moteur en tire la demi-longueur.
export const specialExtent = (s: SpecialSpec): number => {
  const a = specialArt(s);
  return Math.max(-a.x0, a.x1) + 1.6;
};
const RIMS: Partial<Record<SpecialId, readonly [Rim, string]>> = { tram: ['tôle', '#3a3236'], vespa: ['enjoliveur', '#e9e6dc'], mobylette: ['rayons', CHROME], sidecar: ['rayons', CHROME], triporteur: ['rayons', CHROME], police: ['tôle', '#2f2f33'], taxi: ['enjoliveur', CHROME] };
const looks = new Map<string, VehicleLook>();
export function specialLook(s: SpecialSpec): VehicleLook {
  const key = specialKey(s);
  const hit = looks.get(key);
  if (hit) return hit;
  const [rim, rimColor] = RIMS[s.id] ?? (['enjoliveur', '#d8d4c8'] as const);
  const look: VehicleLook = { key, arch: s.id, art: specialArt(s), rim, rimColor };
  if (looks.size >= 256) looks.clear();
  looks.set(key, look);
  return look;
}
