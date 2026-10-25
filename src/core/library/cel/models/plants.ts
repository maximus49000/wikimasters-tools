import type { LifeState } from '../life-state';
import type { CelLook } from '../looks';
import { bent, lathe, leaf, normalize, part, place, rotX, rotY, superEll, tube, type CelPart, type Deform, type Mesh, type Vec3 } from '../mesh';
import type { Tone } from '../tone';
import { CEL_MODELS } from './registry';

// Plantes (G6, tâche 8) : plante verte (touffe de feuilles lancéolées), monstera (porté de la maquette `monstera`, l. 326 : feuilles
// en cœur fendues, place validée v3), strelitzia (palettes dressées, fleur), palmier kentia (porté de `palm`, l. 304 : rachis en tube,
// folioles), cactus cierge (côtes, bras coudés), pampas (vase, plumeaux). Repère centré (origine au centre de la base, x à droite,
// y en haut, z vers le spectateur, cm). Couleurs : les clés de palette du modèle à boîtes (`look.tones`) ; les tons littéraux des
// fleurs du modèle (orange, bleu, rose) sont remplacés par `shade` (crème, le ton des plumeaux) et `fabric`.
//
// Logique des angles : la lumière est fixe (haut-gauche), la plante tourne dessous. Une feuille plate est un aplat ; le modelé vient
// (a) des revers (le dessous d'une feuille retombante est à l'ombre, visible sous les couronnes basses et de dos), (b) de la carène
// de chaque limbe (pli le long de la nervure : la moitié qui tourne vers la droite prend l'ombre, l'autre reste au ton), (c) des
// volumes ronds (pots, vases, plumeaux, colonne et bras côtelés du cactus). Les feuilles sont des plaques à double face : le revers
// est dessiné (couleur unique, l'ombre fait la différence), jamais une face manquante.
//
// Mobilier vivant (spec §6) : `life.rustle` ∈ [0, 1] fait fléchir chaque feuille d'au plus 6° (RUSTLE_MAX) autour de sa base, avec
// une phase propre par feuille (son indice) : amplitude 6° × rustle, part et sens donnés par sin(2,4 k + 1,2). Palmier : la palme
// entière (rachis + folioles) pivote au sommet du stipe ; pampas : tige + plumeau au col du vase ; monstera et strelitzia : le limbe
// à la pointe de sa tige ; cactus (sans feuille) : la fleur du sommet. Les 4 poses de l'animation (tâche 15) échantillonnent `rustle`.

/** Flexion maximale d'une feuille sous le bruissement (rad) : 6°. */
export const RUSTLE_MAX = (6 * Math.PI) / 180;
const RUSTLE_PHASE = 2.4, RUSTLE_SHIFT = 1.2;
/** Angle de flexion de la feuille `k` pour un bruissement `rustle` ∈ [0, 1] (rad, signé) : au plus 6° × rustle, phase propre à la feuille. */
export const rustleAngle = (k: number, rustle: number): number => (rustle <= 0 ? 0 : RUSTLE_MAX * rustle * Math.sin(RUSTLE_PHASE * k + RUSTLE_SHIFT));

// Rotation d'un maillage de `a` rad autour de l'axe `axis` passant par `base` (Rodrigues ; les normales tournent sans translation).
function rotAxis(m: Mesh, axis: Vec3, a: number, base: Vec3 = [0, 0, 0]): Mesh {
  if (a === 0) return m;
  const [ux, uy, uz] = normalize(axis), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const R = (p: Vec3): Vec3 => [
    (c + ux * ux * t) * p[0] + (ux * uy * t - uz * s) * p[1] + (ux * uz * t + uy * s) * p[2],
    (uy * ux * t + uz * s) * p[0] + (c + uy * uy * t) * p[1] + (uy * uz * t - ux * s) * p[2],
    (uz * ux * t - uy * s) * p[0] + (uz * uy * t + ux * s) * p[1] + (c + uz * uz * t) * p[2],
  ];
  return {
    v: m.v.map((p) => {
      const q = R([p[0] - base[0], p[1] - base[1], p[2] - base[2]]);
      return [q[0] + base[0], q[1] + base[1], q[2] + base[2]];
    }),
    n: m.n.map(R),
    t: m.t,
  };
}
// Réunion de maillages en un seul (indices décalés) : une pièce, donc pas d'encre de silhouette entre eux.
function merge(ms: Mesh[]): Mesh {
  const out: Mesh = { v: [], n: [], t: [] };
  for (const m of ms) {
    const o = out.v.length;
    out.v.push(...m.v);
    out.n.push(...m.n);
    for (const [a, b, c] of m.t) out.t.push([a + o, b + o, c + o]);
  }
  return out;
}
// Axe horizontal perpendiculaire à la direction `dir` d'une feuille : la feuille hoche (pointe qui monte ou descend).
const nodAxis = (dir: Vec3): Vec3 => (Math.hypot(dir[0], dir[2]) < 1e-6 ? [1, 0, 0] : [dir[2], 0, -dir[0]]);
// Bruissement de la feuille `k` : ses pièces pivotent de rustleAngle autour de `base`.
function nod(parts: CelPart[], base: Vec3, dir: Vec3, k: number, rustle: number): CelPart[] {
  const a = rustleAngle(k, rustle);
  if (a === 0) return parts;
  const axis = nodAxis(dir);
  return parts.map((P) => ({ ...P, m: rotAxis(P.m, axis, a, base) }));
}
// Direction horizontale d'un azimut (convention de `place` : ry = a envoie +z local sur (sin a, 0, cos a)).
const dirOf = (a: number): Vec3 => [Math.sin(a), 0, Math.cos(a)];

/* ---------- limbes ---------- */
// Contours de limbes (plan y = 0, pointe en +z, longueur L, demi-largeur hw). Sens du contour : de la base par le côté x < 0 vers la
// pointe, retour par x > 0. Avec une déformation, `leaf` recalcule les normales à partir des faces : ce sens donne à la face du dessus
// (y > 0) une normale vers le haut. Le sens inverse (celui des folioles de la maquette) met le dessus à l'ombre et éclaire le revers.
function outline(half: [number, number][], L: number): [number, number][] {
  return [[0, 0], ...half.map(([x, z]): [number, number] => [-x, z]), [0, L], ...[...half].reverse()];
}
// Feuille lancéolée.
const lanceOutline = (L: number, hw: number): [number, number][] => outline([[hw * 0.3, L * 0.1], [hw * 0.72, L * 0.3], [hw, L * 0.52], [hw * 0.8, L * 0.75], [hw * 0.42, L * 0.92]], L);
// Palette à bout rond (strelitzia).
const paddleOutline = (L: number, hw: number): [number, number][] => outline([[hw * 0.25, L * 0.04], [hw * 0.6, L * 0.16], [hw * 0.88, L * 0.35], [hw, L * 0.55], [hw * 0.9, L * 0.76], [hw * 0.62, L * 0.92], [hw * 0.25, L * 0.99]], L);
// Carène (pli le long de la nervure : les bords descendent de `fold` × |x|) et flexion vers le revers (`c` × z²).
const curl = (fold: number, c: number): Deform => (x, y, z) => [x, y - fold * Math.abs(x) - c * z * z, z];
// Même chose avec une torsion du limbe autour de sa nervure (`twist` rad de la base à la pointe, longueur L) : une grande palette
// présente toujours une part de sa surface détournée de la lumière, quel que soit l'angle.
const curlTwist = (fold: number, c: number, twist: number, L: number): Deform => (x, y, z) => {
  const [x1, y1] = [x, y - fold * Math.abs(x) - c * z * z];
  const a = (twist * z) / L, co = Math.cos(a), si = Math.sin(a);
  return [x1 * co - y1 * si, x1 * si + y1 * co, z];
};
// Limbe posé : construit pointe en +z, relevé de `elev` (rad au-dessus de l'horizontale), tourné à l'azimut `az`, base en `base`.
function blade(outline: [number, number][], L: number, th: number, deform: Deform, elev: number, az: number, base: Vec3): Mesh {
  return place(leaf(outline, th, deform, [0, L * 0.5]), { rx: -elev, ry: az, t: base });
}
// Dôme de terreau (aplat sans ombre) sur le dessus d'un pot : rayon r, à la hauteur y.
const soil = (r: number, y: number, col: Tone): CelPart => part(lathe([[r, y], [r * 0.6, y + 0.6], [0, y + 0.8]], 24, undefined, { caps: false }), col, { flat: true, noshadow: true, crease: false });

/* ---------- plante verte : pot évasé en terre, collerette, terreau, touffe de feuilles lancéolées carénées en trois couronnes
   (retombantes sur le bord du pot, arquées, dressées qui se courbent au sommet), cœur de la touffe ---------- */
function plant(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[11.5, 0], [12.2, 1.5], [15.5, 30], [14.8, 30.6]], 28), T.warm)); // pot 0..30,6
  P.push(part(lathe([[15.2, 29.8], [17, 30.3], [17.2, 34.5], [16.4, 36], [14.6, 36.3]], 28), T.warmDark)); // collerette 30..36
  P.push(soil(14.2, 36.4, T.door));
  const base: Vec3 = [0, 36.8, 0];
  P.push(part(place(superEll(3.2, 4, 3.2, 0.8, 1, 8, 12), { t: [0, 37.5, 0] }), T.leafDark, { crease: false, noshadow: true })); // cœur de la touffe
  // Couronnes : [nombre, décalage d'azimut, longueur, demi-largeur, élévation, flexion].
  const crowns: [number, number, number, number, number, number][] = [
    [5, 0.44, 18.5, 3.6, 0.5, 0.03], // retombantes : la pointe revient au niveau de la collerette, au-dehors
    [6, 0, 26, 4.5, 1.0, 0.014], // arquées
    [5, 0.87, 66, 4.4, 1.4, 0.0025], // dressées, courbées au sommet (hauteur 100)
  ];
  let k = 0;
  for (const [n, off, L0, hw, elev, c] of crowns)
    for (let i = 0; i < n; i++, k++) {
      const az = off + (2 * Math.PI * i) / n;
      const L = L0 * (0.94 + 0.06 * ((k * 7) % 3)); // longueurs un peu inégales : une touffe, pas une roue
      const m = blade(lanceOutline(L, hw), L, 0.6, curl(0.38, c), elev, az, base);
      P.push(...nod([part(m, k % 2 ? T.leaf : T.leafDark, { crease: false })], base, dirOf(az), k, life.rustle));
    }
  return P;
}

/* ---------- monstera (porté de la maquette) : pot évasé, collerette, terreau ; six tiges courbes, chacune finie par une feuille
   en cœur à fentes pennées (Ruling 25) qui pend vers l'extérieur et vers le bas. L'arche du limbe est translatée pour que sa base
   reste à la pointe de la tige (dans la maquette elle en était écartée de 3 cm). ---------- */
const MON_L = 46, MON_W = 36, MON_NOTCH = 3.5;
// Largeur du limbe à la hauteur z (maquette).
const monW = (z: number): number => {
  const t = z / MON_L;
  return (MON_W / 2) * Math.sin(Math.PI * Math.pow(t, 0.8)) * (t < 0.3 ? 0.75 + (0.25 * t) / 0.3 : 1);
};
// Bord d'un côté du limbe, de la pointe à la base, z STRICTEMENT décroissant : quatre fentes PENNÉES (Ruling 25), chacune un biseau
// qui part du bord vers la nervure, presque perpendiculaire, le fond un peu vers la pointe (comme les nervures secondaires).
function monsteraSide(sgn: number): [number, number][] {
  const L = MON_L;
  const pts: [number, number][] = [[0, L]];
  for (let i = 1; i < 14; i++) {
    const z = L * (1 - i / 14), x = monW(z) * sgn;
    if (i === 3 || i === 6 || i === 9 || i === 12) {
      const d = 0.55 + 0.1 * (i % 2); // profondeur de la fente (part de la demi-largeur)
      pts.push([monW(z + 1.3) * sgn, z + 1.3], [x * (1 - d), z + 0.9], [monW(z - 1.3) * sgn, z - 1.3]);
    } else pts.push([x, z]);
  }
  pts.push([2.5 * sgn, -1], [0, MON_NOTCH]); // lobe de la base, puis l'échancrure du cœur sur la nervure
  return pts;
}
// Limbe à double face triangulé PAR BANDES le long de la nervure : chaque point du bord est relié à son pied sur la nervure (0, z),
// borné à l'échancrure ; la bande entre deux points voisins du bord est deux triangles. Les fentes sont donc des vides exacts (aucune
// lamelle de fond ni recouvrement, contrairement à l'éventail de `leaf` sur un contour non étoilé). Épaisseur th, déformation puis
// normales recalculées à partir des faces (sens du dessus vers le haut imposé avant déformation).
function pinnateBlade(th: number, deform: Deform): Mesh {
  const flat: Vec3[] = [], m: Mesh = { v: [], n: [], t: [] };
  const push = (x: number, y: number, z: number): number => {
    flat.push([x, y, z]);
    m.v.push(deform(x, y, z));
    m.n.push([0, y > 0 ? 1 : -1, 0]);
    return m.v.length - 1;
  };
  const tri = (a: number, b: number, c: number, want: Vec3): void => {
    const A = flat[a]!, B = flat[b]!, C = flat[c]!;
    const u: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w: Vec3 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const N: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (N[0] * want[0] + N[1] * want[1] + N[2] * want[2] < 0) m.t.push([a, c, b]);
    else m.t.push([a, b, c]);
  };
  for (const sgn of [1, -1]) {
    const edge = monsteraSide(sgn);
    const top = edge.map(([x, z]) => push(x, th / 2, z)), bot = edge.map(([x, z]) => push(x, -th / 2, z));
    const ribT = edge.map(([, z]) => push(0, th / 2, Math.max(z, MON_NOTCH))), ribB = edge.map(([, z]) => push(0, -th / 2, Math.max(z, MON_NOTCH)));
    for (let j = 0; j + 1 < edge.length; j++) {
      tri(ribT[j]!, top[j]!, top[j + 1]!, [0, 1, 0]);
      tri(ribT[j]!, top[j + 1]!, ribT[j + 1]!, [0, 1, 0]);
      tri(ribB[j]!, bot[j]!, bot[j + 1]!, [0, -1, 0]);
      tri(ribB[j]!, bot[j + 1]!, ribB[j + 1]!, [0, -1, 0]);
      // Chant (épaisseur), tourné vers le dehors du limbe.
      const [x0, z0] = edge[j]!, [x1, z1] = edge[j + 1]!;
      const out: Vec3 = [(x0 + x1) / 2, 0, (z0 + z1) / 2 - MON_L / 2];
      tri(top[j]!, bot[j]!, top[j + 1]!, out);
      tri(top[j + 1]!, bot[j]!, bot[j + 1]!, out);
    }
  }
  // Normales lissées à partir des faces déformées (repli : la normale plane).
  const nn: Vec3[] = m.v.map(() => [0, 0, 0]);
  for (const [a, b, c] of m.t) {
    const A = m.v[a]!, B = m.v[b]!, C = m.v[c]!;
    const u: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w: Vec3 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const N: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const i of [a, b, c]) nn[i] = [nn[i]![0] + N[0], nn[i]![1] + N[1], nn[i]![2] + N[2]];
  }
  m.n = nn.map((v, i) => (Math.hypot(v[0], v[1], v[2]) > 1e-9 ? normalize(v) : m.n[i]!));
  return m;
}
// Arche du limbe (bombé de 3,2 cm au milieu, base et pointe sur la tige) et creux transversal.
const monsteraCurl: Deform = (x, y, z) => [x, y + 0.006 * z * (MON_L - z) - 0.004 * x * x, z];
const MON_BLADE = pinnateBlade(0.5, monsteraCurl);
function monstera(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[11.5, 0], [12.2, 1.5], [16, 31], [15.4, 31.6]], 28), T.warm)); // pot 0..31,6
  P.push(part(lathe([[15.8, 30.8], [17, 31.3], [17.2, 34.8], [16.3, 36], [14.6, 36.3]], 28), T.warmDark)); // collerette 31..36
  P.push(soil(14.2, 36.4, T.door));
  const y0 = 37;
  // Tiges : [azimut, hauteur relative, inclinaison du limbe (rad sous l'horizontale), échelle du limbe, portée de la pointe de tige].
  const stems: [number, number, number, number, number][] = [
    [0, 0.8, 0.95, 0.85, 11], [1.25, 0.95, 0.85, 1, 15], [-1.3, 0.9, 0.9, 0.95, 15], [2.7, 0.6, 0.8, 0.8, 12], [-2.6, 0.7, 1.0, 0.9, 13], [0.6, 1, 0.75, 1.1, 6],
  ];
  stems.forEach(([a, h, tip, sc, r2], k) => {
    const r1 = r2 * 0.45;
    const p1: Vec3 = [Math.sin(a) * r1, y0 + 37 * h, Math.cos(a) * r1], p2: Vec3 = [Math.sin(a) * r2, y0 + 68 * h, Math.cos(a) * r2];
    // La feuille part de la pointe de la tige, pend vers l'extérieur et vers le bas (pointe en bas). Le pétiole continue sous le
    // limbe le long de la nervure (6 cm, 1,9 cm sous la face : le tube r 1,5 reste entièrement sous le revers) : son bout n'est jamais une « baguette » au-dessus de la feuille.
    const along = rotY(rotX([0, 0, 1], tip), a), under = rotY(rotX([0, -1, 0], tip), a);
    const p3: Vec3 = [p2[0] + along[0] * 6 + under[0] * 1.9, p2[1] + along[1] * 6 + under[1] * 1.9, p2[2] + along[2] * 6 + under[2] * 1.9];
    const stem = part(tube([[0, y0 - 1, 0], p1, p2, p3], 1.5, 8), T.leafDark, { crease: false });
    const m = place(MON_BLADE, { s: sc, rx: tip, ry: a, t: p2 });
    P.push(...nod([stem, part(m, k % 2 ? T.leaf : T.leafDark, { crease: false, hi: false })], p2, dirOf(a), k, life.rustle));
  });
  return P;
}

/* ---------- strelitzia : pot droit clair, collerette, terreau ; six tiges presque verticales finies par une grande palette
   carénée qui se renverse vers l'extérieur ; une hampe avec la fleur (spathe horizontale, trois pétales dressés, une langue) ---------- */
function strelitzia(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[12.4, 0], [13, 1.2], [13, 30.6]], 28), T.warmLight)); // pot 0..30,6
  P.push(part(lathe([[12.8, 29.8], [15, 30.3], [15, 34.3], [14.2, 35], [12.6, 35.2]], 28), T.warm)); // collerette 30..35
  P.push(soil(12.2, 35.3, T.door));
  const y0 = 35.5;
  // Feuilles : [azimut (rad), hauteur de la pointe de tige, portée de la pointe de tige, longueur, demi-largeur, élévation, flexion].
  const leaves: [number, number, number, number, number, number, number][] = [
    [Math.PI, 88, 6, 50, 11, 1.28, 0.003], [0, 90, 6, 48, 11, 1.3, 0.003], [3.49, 105, 4, 56, 12.5, 1.32, 0.0025],
    [5.93, 110, 4, 54, 12.5, 1.35, 0.0025], [4.71, 98, 4, 56, 13, 1.3, 0.003], [1.57, 96, 4, 52, 12.5, 1.3, 0.003],
  ];
  leaves.forEach(([az, yt, r, L, hw, elev, c], k) => {
    const d = dirOf(az);
    const foot: Vec3 = [d[0] * 2, y0 - 1, d[2] * 2], top: Vec3 = [d[0] * r, yt, d[2] * r];
    const mid: Vec3 = [d[0] * (r * 0.35), (y0 + yt) / 2, d[2] * (r * 0.35)];
    P.push(part(tube([foot, mid, top], 1.1, 8), T.leafDark, { crease: false }));
    const m = blade(paddleOutline(L, hw), L, 0.8, curlTwist(0.42, c, k % 2 ? 0.28 : -0.28, L), elev, az, top);
    P.push(...nod([part(m, k % 2 ? T.leaf : T.leafDark, { crease: false })], top, d, k, life.rustle));
  });
  // Fleur : hampe courbe, spathe (bec horizontal) pointée vers l'avant droit, pétales et langue qui en sortent.
  const fa = -0.35, fd = dirOf(fa);
  const head: Vec3 = [fd[0] * 13, 136, fd[2] * 13];
  P.push(part(tube([[fd[0] * 2, y0 - 1, fd[2] * 2], [fd[0] * 5, 90, fd[2] * 5], head], 1.2, 8), T.leafDark, { crease: false }));
  const beak = place(superEll(10, 2.4, 1.9, 0.5, 0.8, 8, 16), { ry: fa + Math.PI / 2, t: [head[0] + fd[0] * 7, head[1] + 1.5, head[2] + fd[2] * 7] }); // bec le long de la direction fd
  P.push(part(beak, T.leafDark));
  const petals: [number, number, number, Tone][] = [[1.35, 19, 3.4, T.shade], [1.1, 17, 3.2, T.shade], [0.85, 15, 3, T.shade], [0.55, 12, 2.3, T.fabric]];
  petals.forEach(([elev, L, hw, col], i) => {
    const b: Vec3 = [head[0] + fd[0] * (3 + i * 1.6), head[1] + 2.2, head[2] + fd[2] * (3 + i * 1.6)];
    P.push(part(blade(lanceOutline(L, hw), L, 0.5, curl(0.3, 0.002), elev, fa, b), col, { crease: false }));
  });
  return P;
}

/* ---------- palmier kentia (porté de la maquette) : panier, cerclage, terreau ; stipe légèrement courbe ; neuf palmes dont le
   rachis monte, s'arque et retombe (tube), garni de folioles fines et souples des deux côtés, plus courtes vers la pointe ---------- */
const PALM_TOP: Vec3 = [-3, 132, 1];
function palm(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[14.5, 0], [15.3, 2], [17, 31], [16.5, 31.6]], 28), T.woodDark)); // panier 0..31,6
  P.push(part(lathe([[16.8, 31.2], [18, 31.8], [18, 35.4], [17.2, 36], [15.6, 36.2]], 28), T.wood)); // cerclage 32..36
  P.push(soil(15.2, 36.3, T.door));
  P.push(part(tube([[0, 35.5, 0], [1, 68, 0], [-2, 102, 0], PALM_TOP], 2.6, 8), T.warmDark, { crease: false })); // stipe
  const top = PALM_TOP;
  const N = 20;
  for (let k = 0; k < 9; k++) {
    const a = (k * 2 * Math.PI) / 9 + 0.25, th0 = 0.3 + (0.3 * ((k * 5) % 3)) / 2, len = 52 + 7 * ((k * 7) % 3);
    // Rachis : monte, s'arque puis retombe (dans le plan local x-y, puis tourné de a).
    const loc: Vec3[] = [[0, 0, 0]];
    for (let i = 1; i <= N; i++) {
      const s = (i - 0.5) / N, th = th0 + 1.55 * s * s, q = loc[i - 1]!;
      loc.push([q[0] + (Math.sin(th) * len) / N, q[1] + (Math.cos(th) * len) / N, 0]);
    }
    const toWorld = (p: Vec3): Vec3 => {
      const c = Math.cos(a), s = Math.sin(a);
      return [p[0] * c + p[2] * s + top[0], p[1] + top[1], -p[0] * s + p[2] * c + top[2]];
    };
    const frond: CelPart[] = [part(tube(loc.map(toWorld), 0.75, 6), T.leafDark, { crease: false })];
    // Folioles des deux côtés du rachis, de plus en plus courtes vers la pointe, retombantes (sans miroir : le côté −z est obtenu par
    // une rotation de π, l'orientation des faces est gardée).
    for (let i = 3; i < loc.length; i++) {
      const s = i / N, p0 = loc[i - 1]!, p1 = loc[i]!;
      const tilt = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const Lf = (22 - 10 * s) * (0.92 + 0.16 * ((i * 3) % 2));
      for (const sd of [-1, 1]) {
        const droop = 0.5 + (0.25 * ((i * 7 + (sd > 0 ? 1 : 0)) % 4)) / 3 + 0.25 * s;
        const out = outline([[1.1, Lf * 0.2], [1.35, Lf * 0.45], [1, Lf * 0.75]], Lf); // même foliole que la maquette, contour dans le sens qui éclaire le dessus
        let m = leaf(out, 0.35, (x, y, z) => [x, y - 0.009 * z * z, z]);
        m = sd > 0 ? place(m, { rx: droop }) : place(place(m, { ry: Math.PI }), { rx: -droop });
        m = place(m, { rz: tilt * 0.6, ry: a, t: toWorld(p0) });
        frond.push(part(m, (i + sd) % 2 ? T.leaf : T.leafDark, { crease: false }));
      }
    }
    P.push(...nod(frond, top, [Math.cos(a), 0, -Math.sin(a)], k, life.rustle));
  }
  return P;
}

/* ---------- cactus cierge : pot en terre, collerette, terreau ; colonne côtelée au tour, deux bras côtelés coudés (colonne droite
   cintrée par bent() le long d'un coude arrondi, une seule pièce avec la colonne), fleur en bouton au sommet (elle frémit) ---------- */
const RIBS = 9, RIB = 0.055; // au-delà, les côtes au ras de la silhouette font des tirets d'encre (saut de profondeur) de profil
const ribbed: Deform = (x, y, z) => {
  const f = 1 + RIB * Math.cos(RIBS * Math.atan2(z, x));
  return [x * f, y, z * f];
};
// Bras : colonne droite (axe y, longueur S) cintrée le long d'un chemin horizontal depuis l'axe de la colonne (x = 0, hauteur y0)
// vers sx·reach, coude de rayon Re, puis vertical. Repère (N, T, B) de déterminant +1 : aucune inversion d'orientation.
function armPath(sx: number, y0: number, reach: number, Re: number): { S: (vertical: number) => number; d: Deform } {
  const h1 = reach - Re, arc = (Math.PI / 2) * Re;
  const d: Deform = (x, y, z) => {
    let px: number, py: number, tx: number, ty: number;
    if (y <= h1) [px, py, tx, ty] = [sx * y, y0, sx, 0];
    else if (y <= h1 + arc) {
      const phi = (y - h1) / Re;
      [px, py, tx, ty] = [sx * (h1 + Re * Math.sin(phi)), y0 + Re * (1 - Math.cos(phi)), sx * Math.cos(phi), Math.sin(phi)];
    } else [px, py, tx, ty] = [sx * reach, y0 + Re + (y - h1 - arc), 0, 1];
    const [nx, ny] = [ty, -tx]; // det(N, T, B) = +1
    return [px + x * nx, py + x * ny, z];
  };
  return { S: (vertical) => h1 + arc + vertical, d };
}
function cactus(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones, G = T.leaf;
  const P: CelPart[] = [];
  P.push(part(lathe([[9.8, 0], [10.5, 1.5], [13, 19.6], [12.4, 20]], 28), T.warm)); // pot 0..20
  P.push(part(lathe([[12.8, 19], [15.2, 19.5], [15.2, 22.4], [14.4, 23.1], [12.8, 23.3]], 28), T.warmDark)); // collerette 19..23
  P.push(soil(12.4, 23.4, T.door));
  // Colonne : côtes au tour (9 côtes, 6 colonnes par côte), sommet en dôme.
  const body: Mesh[] = [lathe([[4.6, 22.6], [5.5, 25.5], [5.5, 118], [5.2, 121], [4.2, 124], [2.5, 126.5], [0, 127.4]], 54, ribbed)];
  // Bras : la racine est dans la colonne (x = 0), le coude arrondi, le bout en dôme. Les côtes du bras s'effacent sur ses 8 premiers
  // centimètres (racine lisse). Colonne et bras forment UNE pièce : au raccord, pas de trait d'encre entre deux surfaces côtelées
  // (le moignon dentelé), seule la silhouette et les vrais sauts de profondeur s'encrent.
  for (const [sx, y0, h] of [[-1, 58, 88], [1, 72, 98]] as const) {
    const { S, d } = armPath(sx, y0, 12.3, 4.2);
    const top = h - (y0 + 4.2), L = S(top);
    // Anneaux tous les 1,5 cm : le cintrage de `bent()` ne déplace que des sommets (une colonne à deux anneaux resterait une diagonale).
    const prof: [number, number][] = [[2.6, 0], [3.9, 3]];
    for (let y = 4.5; y < L; y += 1.5) prof.push([3.9, y]);
    prof.push([3.9, L], [3.6, L + 1.8], [2.5, L + 3.1], [0, L + 4]);
    const arm = lathe(prof, 42, (x, y, z) => {
      const f = 1 + 0.08 * Math.cos(7 * Math.atan2(z, x)) * Math.min(1, Math.max(0, (y - 5) / 3));
      return [x * f, y, z * f];
    });
    body.push(bent(arm, d));
  }
  P.push(part(merge(body), G, { crease: false }));
  // Fleur en bouton au sommet (bulbe à pétales festonnés qui se resserrent en pointe) ; elle frémit (feuille 0).
  const fy = 127;
  const flower = lathe([[0, 0], [2, 0.5], [3.4, 2], [3.6, 3.5], [2.7, 5], [1.3, 6], [0, 6.3]], 30, (x, y, z) => {
    const f = 1 + 0.14 * Math.cos(6 * Math.atan2(z, x)) * Math.min(1, y / 2);
    return [x * f, y + fy, z * f];
  });
  P.push(...nod([part(flower, T.shade, { crease: false, noshadow: true })], [0, fy, 0], [0, 0, 1], 0, life.rustle));
  return P;
}

/* ---------- pampas : grand vase en céramique (ventre, col étroit), cinq tiges fines qui s'écartent, plumeaux en fuseau effilés
   vers le haut (chacun frémit avec sa tige, autour du col) ---------- */
// Bouts des tiges, relatifs au col du vase.
const PAMPAS_ENDS: Vec3[] = [[-11.5, 29, 3], [-6, 21, -7], [1, 33, -1], [7, 22, 7], [11.5, 27, -5]];
function pampas(look: CelLook, life: LifeState): CelPart[] {
  const T = look.tones;
  const P: CelPart[] = [];
  P.push(part(lathe([[8.5, 0], [9, 1], [11.5, 8], [12, 20], [11.3, 30], [9, 40], [6.5, 50], [5.2, 56], [5, 59], [5.4, 62], [4.2, 62.3], [0, 62.3]], 32), T.warmLight)); // vase 0..62
  const neck: Vec3 = [0, 60, 0];
  PAMPAS_ENDS.forEach((e, k) => {
    const end: Vec3 = [neck[0] + e[0], neck[1] + e[1], neck[2] + e[2]];
    const d = normalize(e);
    const mid: Vec3 = [neck[0] + e[0] * 0.45, neck[1] + e[1] * 0.5, neck[2] + e[2] * 0.45]; // la tige s'incurve un peu vers le dehors
    const parts: CelPart[] = [part(tube([[0, 57, 0], mid, end], 0.6, 6), T.warmDark, { crease: false })];
    // Plumeau : fuseau de 24 cm, effilé vers le haut, ondulé doucement, dont le pied recouvre le bout de la tige.
    const plume = superEll(4.2, 12, 4.2, 0.85, 1, 14, 16, (x, y, z) => {
      const t = (y + 12) / 24, f = (1 - 0.3 * t) * (1 + 0.06 * Math.sin(5.5 * t + k));
      return [x * f, y, z * f];
    });
    const up: Vec3 = [0, 1, 0], axis: Vec3 = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
    const ang = Math.acos(Math.max(-1, Math.min(1, up[0] * d[0] + up[1] * d[1] + up[2] * d[2])));
    const aligned = Math.hypot(axis[0], axis[1], axis[2]) < 1e-6 ? plume : rotAxis(plume, axis, ang);
    parts.push(part(place(aligned, { t: [end[0] + d[0] * 11, end[1] + d[1] * 11, end[2] + d[2] * 11] }), T.shade, { crease: false }));
    P.push(...nod(parts, neck, d, k, life.rustle));
  });
  return P;
}

CEL_MODELS.plant = plant;
CEL_MODELS.monstera = monstera;
CEL_MODELS.strelitzia = strelitzia;
CEL_MODELS.palm = palm;
CEL_MODELS.cactus = cactus;
CEL_MODELS.pampas = pampas;
