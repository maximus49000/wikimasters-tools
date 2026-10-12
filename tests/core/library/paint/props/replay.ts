import type { Op } from '../recording-ctx';

// Points touchés, en coordonnées du sprite : les peintres des installations posent des pièces par translate/rotate/scale
// (têtes de projecteur inclinées, drapeaux de la caisse, tissu du drapeau de lampadaire retourné), que le faux contexte
// n'applique pas ; on rejoue donc ses appels avec une pile de transformations et le rognage (`clip` borne les bandes
// d'ombre et de rehaut de `cel` à la forme).
type M = readonly [number, number, number, number, number, number];
type Box = [number, number, number, number] | null;
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export function touched(ops: readonly Op[]): [number, number][] {
  const out: [number, number][] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  let clip: Box = null;
  const stack: { m: M; clip: Box }[] = [];
  let path: [number, number][] = [];
  const pt = (x: number, y: number): void => {
    const p: [number, number] = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    path.push(p);
    out.push(clip ? [Math.min(clip[2], Math.max(clip[0], p[0])), Math.min(clip[3], Math.max(clip[1], p[1]))] : p);
  };
  const box = (x: number, y: number, w: number, h: number): void => {
    pt(x, y); pt(x + w, y); pt(x, y + h); pt(x + w, y + h);
  };
  for (const { op, args: a } of ops) {
    switch (op) {
      case 'save': stack.push({ m, clip }); break;
      case 'restore': ({ m, clip } = stack.pop() ?? { m, clip }); break;
      case 'translate': m = mul(m, [1, 0, 0, 1, a[0]!, a[1]!]); break;
      case 'scale': m = mul(m, [a[0]!, 0, 0, a[1]!, 0, 0]); break;
      case 'rotate': { const c = Math.cos(a[0]!); const s = Math.sin(a[0]!); m = mul(m, [c, s, -s, c, 0, 0]); break; }
      case 'beginPath': path = []; break;
      case 'moveTo': case 'lineTo': pt(a[0]!, a[1]!); break;
      case 'quadraticCurveTo': pt(a[0]!, a[1]!); pt(a[2]!, a[3]!); break;
      case 'bezierCurveTo': pt(a[0]!, a[1]!); pt(a[2]!, a[3]!); pt(a[4]!, a[5]!); break;
      case 'arc': box(a[0]! - a[2]!, a[1]! - a[2]!, 2 * a[2]!, 2 * a[2]!); break;
      // Boîte exacte d'une ellipse droite ; tournée, le carré du grand rayon (comme recording-ctx).
      case 'ellipse': { const [rx, ry] = a[4] ? [Math.max(a[2]!, a[3]!), Math.max(a[2]!, a[3]!)] : [a[2]!, a[3]!]; box(a[0]! - rx, a[1]! - ry, 2 * rx, 2 * ry); break; }
      case 'rect': case 'roundRect': case 'fillRect': case 'strokeRect': box(a[0]!, a[1]!, a[2]!, a[3]!); break;
      case 'clip': {
        if (!path.length) break;
        const b: Box = [Math.min(...path.map((p) => p[0])), Math.min(...path.map((p) => p[1])), Math.max(...path.map((p) => p[0])), Math.max(...path.map((p) => p[1]))];
        clip = clip ? [Math.max(clip[0], b[0]), Math.max(clip[1], b[1]), Math.min(clip[2], b[2]), Math.min(clip[3], b[3])] : b;
        break;
      }
      default: break;
    }
  }
  return out;
}
