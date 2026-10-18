// Catalogue et générateur d'habitants 3D : décide QUI est chaque habitant (base, peau, cheveux, barbe, casquette, vêtements,
// humeur) sans rien dessiner. La garde-robe 3D habille ensuite le modèle à partir de `expand`. Logique pure (ni three.js ni DOM).
// Règles de bon sens : pas de barbe pour les femmes et enfants, pas de jupe pour les hommes, pas de casquette pour les
// anciens, chaussettes surtout avec jupe ou short. Même graine = même habitant.
import type { Outfit } from '../library/city/people';
import type { Work } from '../library/figure/dress';
import {
  BASES, BEARD, BOTTOM_COLORS, BOTTOMS, CHEVEUX, COAT_COLORS, DRESS, FEET, HAIR, PAL, PEAUX, PIECES, SHOE_COLORS, SOLES,
  TOP_COLORS, TOPS, TYPES, type NomCouleur, type Pondere,
} from './catalogue-data';

export { BASES, CHEVEUX, PAL, PEAUX, PIECES, TYPES } from './catalogue-data';

export type Emotion = 'neutre' | 'content' | 'heureux' | 'triste' | 'surpris' | 'fache' | 'inquiet';
export type CitizenKind = 'adult' | 'child' | 'aged' | 'any';
export type Pattern = { kind: 'rayures' | 'carreaux'; color: string; freq: number };

// Un vêtement ou objet du catalogue : `k` = nom d'une pièce (pull, jupe…), `accessory` précise `what` (sac-a-dos, parapluie…).
export type Item = { k: string; color: string; pattern?: Pattern; sole?: string; what?: string };

// Pièce prête pour la garde-robe 3D (sortie de `expand`).
export type Piece =
  | { k: 'top'; sleeve: number; color: string; off?: number; hem?: number; collar?: number; neckR?: number; pattern?: Pattern }
  | { k: 'bottom'; cut: number; color: string; pattern?: Pattern }
  | { k: 'skirt'; len: number; flare: number; color: string; off?: number; pattern?: Pattern }
  | { k: 'socks'; from: number; color: string }
  | { k: 'shoes'; color: string; off?: number; sole?: string }
  | { k: 'boots'; from: number; color: string; sole?: string }
  | { k: 'skin'; from: number; to: number }
  | { k: 'collar'; color: string }
  | { k: 'hair'; style: string; color: string }
  | { k: 'beard'; style: string; color: string }
  | { k: 'cap'; color: string; visor: string }
  | { k: 'gilet'; color: string }
  | { k: 'tablier'; color: string }
  | { k: 'bonnet'; color: string }
  | { k: 'accessory'; what: string; color: string };

export type CitizenDesc = {
  base: string;
  skin: string;
  height: number;
  hair: [string, string] | null;
  beard: [string, string] | null;
  cap: [string, string] | null;
  items: Item[];
  mood: Emotion;
};

// ——— Pièces ———

const avec = <T extends object>(base: T, extra: { pattern?: Pattern; sole?: string }): T & { pattern?: Pattern; sole?: string } => ({
  ...base, ...(extra.pattern ? { pattern: extra.pattern } : {}), ...(extra.sole ? { sole: extra.sole } : {}),
});

// Tenue → pièces pour la garde-robe (manteau = haut épais + jupe de manteau ; robe = haut + jupe de même couleur ;
// haut à manches courtes = bras nus, on recouvre les manches grises du corps de base).
export function expand(d: CitizenDesc): Piece[] {
  const out: Piece[] = [];
  if (d.hair) out.push({ k: 'hair', style: d.hair[0], color: d.hair[1] });
  if (d.beard) out.push({ k: 'beard', style: d.beard[0], color: d.beard[1] });
  if (d.cap) out.push({ k: 'cap', color: d.cap[0], visor: d.cap[1] });
  for (const it of d.items) {
    const { k, color, pattern, sole } = it;
    if (k === 'gilet' || k === 'tablier' || k === 'bonnet') { out.push({ k, color }); continue; }
    if (k === 'accessory') { out.push({ k: 'accessory', what: it.what ?? 'sac', color }); continue; }
    const p = PIECES[k];
    if (!p) continue;
    switch (p.k) {
      case 'coat':
        out.push({ k: 'top', sleeve: 0.93, off: 0.018, hem: 0, collar: 0.4, neckR: 0.07, color }, { k: 'skirt', len: p.len, flare: 0.15, off: 0.024, color });
        break;
      case 'dress':
        out.push(avec({ k: 'top', sleeve: 0.3, hem: 0, color }, { pattern }), { k: 'skin', from: 0.28, to: 0.55 }, avec({ k: 'skirt', len: p.len, flare: p.flare, color }, { pattern }));
        break;
      case 'top':
        out.push(avec({ k: 'top', sleeve: p.sleeve, color, ...(p.off !== undefined ? { off: p.off } : {}), ...(p.hem !== undefined ? { hem: p.hem } : {}) }, { pattern }));
        if (p.collar) out.push({ k: 'collar', color });
        if (p.sleeve < 0.4) out.push({ k: 'skin', from: p.sleeve - 0.02, to: 0.55 });
        break;
      case 'bottom':
        out.push(avec({ k: 'bottom', cut: p.cut, color }, { pattern }));
        break;
      case 'skirt':
        out.push(avec({ k: 'skirt', len: p.len, flare: p.flare, color }, { pattern }));
        break;
      case 'socks':
        out.push({ k: 'socks', from: p.from, color });
        break;
      case 'shoes':
        out.push(avec({ k: 'shoes', color, ...(p.off !== undefined ? { off: p.off } : {}) }, { sole }));
        break;
      case 'boots':
        out.push(avec({ k: 'boots', from: p.from, color }, { sole }));
        break;
    }
  }
  return out;
}

// ——— Aléa reproductible ———

// Même graine = même suite de tirages.
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
type Rnd = () => number;
const pickW = <T>(R: Rnd, list: ReadonlyArray<readonly [T, number, ...unknown[]]>): T => {
  let t = list.reduce((a, x) => a + x[1], 0) * R();
  for (const x of list) { t -= x[1]; if (t <= 0) return x[0]; }
  return list[list.length - 1]![0];
};
const pick = <T>(R: Rnd, list: readonly T[]): T => list[Math.floor(R() * list.length)]!;

// Couleur de cheveux vraisemblable selon la peau (indice 0 = la plus claire) : peaux foncées surtout noir ou brun foncé,
// peaux claires toute la gamme (blond, roux…). Âgés : gris ou blancs, quelle que soit la peau.
export function hairFor(skinIdx: number, aged: boolean, R: Rnd): string {
  if (aged) return R() < 0.5 ? CHEVEUX.blanc : CHEVEUX.gris;
  const table: ReadonlyArray<readonly [keyof typeof CHEVEUX, number]> = skinIdx >= 5 ? [['noir', 6], ['brunFonce', 3], ['chatain', 1]]
    : skinIdx >= 3 ? [['noir', 4], ['brunFonce', 4], ['chatain', 2]]
    : [['brunFonce', 3], ['chatain', 3], ['chatainClair', 2], ['blond', 2], ['roux', 1], ['noir', 1]];
  return CHEVEUX[pickW(R, table)];
}

// Humeur : surtout neutre ou contente, quelques autres.
const HUMEURS: ReadonlyArray<readonly [Emotion, number]> = [
  ['neutre', 5], ['content', 4], ['heureux', 1], ['triste', 0.6], ['surpris', 0.6], ['fache', 0.5], ['inquiet', 0.6],
];

const motif = (R: Rnd): Pattern | undefined => {
  const x = R();
  if (x < 0.14) return { kind: 'rayures', color: PAL[pick(R, ['blanc', 'creme', 'marine'] as const)], freq: 55 + R() * 20 };
  if (x < 0.22) return { kind: 'carreaux', color: PAL[pick(R, ['blanc', 'creme', 'anthracite', 'brique'] as const)], freq: 22 + R() * 10 };
  return undefined;
};
const item = (k: string, color: string, extra: { pattern?: Pattern; sole?: string; what?: string } = {}): Item => ({ k, color, ...avec({}, extra), ...(extra.what ? { what: extra.what } : {}) });
const chaussettes = (R: Rnd, feet: string, lower: string): Item[] =>
  feet !== 'bottes' && R() < (/jupe|robe|short/.test(lower) ? 0.45 : 0.15) ? [item('chaussettes', PAL[pick(R, ['blanc', 'blanc', 'gris', 'marine'] as const)])] : [];
const chaussures = (R: Rnd, base: string): { feet: string; items: Item[] } => {
  const feet = pickW(R, FEET[base]!);
  return { feet, items: [item(feet, PAL[pick(R, SHOE_COLORS[feet]!)], { sole: SOLES[feet] })] };
};

// ——— Habitant aléatoire ———

export function citizen(seed: number): CitizenDesc {
  const R = rng(seed);
  R(); R();
  const base = pickW(R, Object.entries(BASES).map(([k, b]) => [k, b.weight] as const));
  const B = BASES[base]!, aged = !!B.aged;
  const skinIdx = Math.floor(R() * PEAUX.length);
  const hairColor = hairFor(skinIdx, aged, R);
  const hairList = HAIR[base]!.map(([s, w, tag]) => [s, tag === 'curly' ? w * (0.35 + skinIdx / 3) : w] as const);
  const style = pickW(R, hairList);
  const hair: [string, string] | null = style ? [style, hairColor] : null;
  let beard: [string, string] | null = null;
  let cap: [string, string] | null = null;
  const items: Item[] = [];
  if (BEARD[base] && R() < BEARD[base]!) beard = [pickW(R, [['pleine', 3], ['courte', 4], ['moustache', 2], ['bouc', 2]] as const), aged ? PAL.blanc : hairColor];
  if (!aged && R() < (B.child ? 0.18 : 0.14)) {
    const cc = PAL[pick(R, ['rouge', 'marine', 'moutarde', 'vert', 'anthracite', 'ciel', 'creme'] as const)];
    cap = [cc, R() < 0.7 ? cc : PAL[pick(R, ['blanc', 'anthracite'] as const)]];
  }
  let lower: string;
  const robes = DRESS[base];
  if (robes && R() < robes[0]) {
    lower = pick(R, robes[1]);
    const color = PAL[pick(R, ['rose', 'ciel', 'jaune', 'sauge', 'lavande', 'brique', 'prune', 'marine', 'creme'] as const)];
    items.push(item(lower, color, { pattern: R() < 0.3 ? motif(R) : undefined }));
  } else {
    const top = pickW(R, TOPS[base]!);
    const coat = top.startsWith('manteau');
    const topColor: NomCouleur = coat ? pick(R, COAT_COLORS) : pick(R, TOP_COLORS);
    lower = pickW(R, BOTTOMS[base]!);
    if (coat && (lower === 'short' || lower === 'jupeCourte')) lower = 'pantalon';
    let bColor: NomCouleur = pick(R, BOTTOM_COLORS);
    if (bColor === topColor) bColor = 'anthracite';
    items.push(item(lower, PAL[bColor], { pattern: lower.startsWith('jupe') && R() < 0.2 ? motif(R) : undefined }));
    items.push(item(top, PAL[topColor], { pattern: !coat && top !== 'debardeur' ? motif(R) : undefined }));
  }
  const { feet, items: chaus } = chaussures(R, base);
  items.push(...chaussettes(R, feet, lower), ...chaus);
  const height = B.metres * (0.95 + R() * 0.1);
  const mood = pickW(R, HUMEURS);
  return { base, skin: PEAUX[skinIdx]![1], height, hair, beard, cap, items, mood };
}

// ——— Habitant à partir d'une tenue de la ville ———

const ACCESSOIRES = { backpack: 'sac-a-dos', bag: 'sac', case: 'mallette', ball: 'ballon', scarf: 'echarpe' } as const;
// Tenues de travail : gilet haute visibilité orange, tablier crème clair (la bande réfléchissante est dessinée par la garde-robe).
const GILET = '#F28C28';
const TABLIER = '#F4F1EA';
const HAUTS = { tee: 'tee', sweater: 'pull', jacket: 'manteau', coat: 'manteauLong', shirt: 'chemise', suit: 'chemise', jersey: 'tee' } as const;
// Si la base ne porte pas le haut demandé, on glisse vers le plus proche qu'elle porte.
const REPLI_HAUT = ['pull', 'chemise', 'tee'];
const COIFFURES = { short: ['court', 'raie', 'enfant', 'carre'], cap: ['court', 'raie', 'enfant', 'carre'], long: ['long', 'boucles', 'couettes', 'carre'], bun: ['chignon', 'queue', 'couronne'] } as const;

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Peau de la tenue (5 teintes) → la plus proche des 8 teintes du catalogue, en distance RGB.
function peauProche(c: string): string {
  const [r, g, b] = hex(c);
  let best = PEAUX[0]!, bd = Infinity;
  for (const p of PEAUX) {
    const [pr, pg, pb] = hex(p[1]);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best[1];
}

// `sex` : sexe imposé par la scène (Père Noël : homme), qui écarte aussi l'enfant (sexe neutre).
function choisirBase(R: Rnd, kind: CitizenKind, femme: boolean, sex?: 'm' | 'f'): string {
  const ok = Object.entries(BASES).filter(([, b]) => {
    if (sex && b.sex !== sex) return false;
    if (kind === 'child') return !!b.child;
    // Un enfant n'est tiré que si la scène le demande (`child`) : sinon un adulte de la rue aurait une chance sur cinq
    // d'avoir le corps d'un enfant.
    if (b.child) return false;
    if (kind === 'aged' && !b.aged) return false;
    if (kind === 'adult' && (b.aged || b.child)) return false;
    return !femme || (b.sex === 'f' && !b.child);
  });
  return pickW(R, ok.map(([k, b]) => [k, b.weight] as const));
}

function coiffure(R: Rnd, base: string, voulu: readonly string[] | null): string | null {
  if (!voulu) return null;
  const permis = TYPES[base]!.hair;
  const direct = voulu.find((s) => permis.includes(s));
  if (direct) return direct;
  const sobres: Pondere = HAIR[base]!.filter(([s, , tag]) => s && s !== 'rase' && !tag);
  return pickW(R, sobres);
}

// `sex` : sexe imposé ; `beard` : barbe pleine imposée (Père Noël), blanche pour un ancien comme toute barbe d'ancien.
export type CitizenOpts = { work?: Work; umbrella?: boolean; kind?: CitizenKind; sex?: 'm' | 'f'; beard?: boolean };
export function citizenFromOutfit(seed: number, o: Outfit, opts: CitizenOpts): CitizenDesc {
  const R = rng(seed);
  R(); R();
  const jupe = o.bottom === 'skirt' || o.bottom === 'dress';
  const base = choisirBase(R, opts.kind ?? 'any', jupe && opts.kind !== 'child' && opts.sex !== 'm', opts.sex);
  const B = BASES[base]!, perm = TYPES[base]!;
  const hairColor = o.hairColor;

  // Cheveux : coiffure compatible avec la base ; casquette = champ `cap` (jamais pour un ancien : la coiffure l'emporte).
  let hair: [string, string] | null = null;
  let cap: [string, string] | null = null;
  const items: Item[] = [];
  // Crâne rasé (« bald » des tenues de la Ville, tiré sans regarder la base) : réservé aux hommes ; une femme ou un enfant
  // reçoit des cheveux longs ou un chignon (sinon des femmes chauves en robe dans la rue).
  const chauve = o.hair === 'bald' && B.sex === 'm';
  const coiffe = o.hair === 'bald' && !chauve ? (R() < 0.5 ? 'long' : 'bun') : o.hair;
  if (coiffe === 'beanie') {
    items.push(item('bonnet', o.hatColor));
  } else if (coiffe !== 'bald') {
    const voulu = coiffe === 'cap' || coiffe === 'short' ? COIFFURES.short : COIFFURES[coiffe];
    const style = coiffure(R, base, voulu);
    hair = style ? [style, hairColor] : null;
    if (coiffe === 'cap' && !B.aged) cap = [o.hatColor, o.hatColor];
  }

  // Barbe : mêmes probabilités par base que `citizen` ; jamais pour les femmes ni les enfants (pas d'entrée BEARD).
  let beard: [string, string] | null = null;
  // Mêmes tirages avec ou sans barbe imposée (les autres habitants gardent leur aspect).
  if (BEARD[base] && (R() < BEARD[base]! || opts.beard)) {
    const style = pickW(R, [['pleine', 3], ['courte', 4], ['moustache', 2], ['bouc', 2]] as const);
    beard = [opts.beard ? 'pleine' : style, B.aged ? PAL.blanc : hairColor];
  }

  // Bas, puis haut : le manteau n'accompagne ni short ni jupe courte ; jupe et robe suivent la base.
  let lower: string;
  let top: string | null = null;
  const premier = (l: readonly string[]): string => l.find((n) => perm.bottoms.includes(n)) ?? 'pantalon';
  if (o.bottom === 'dress') lower = premier(['robe', 'robeLongue']);
  else if (o.bottom === 'skirt') lower = premier(['jupeGenou', 'jupeCourte', 'jupeLongue']);
  else lower = ({ pants: 'pantalon', jeans: 'pantalon', jogging: 'pantalon', shorts: 'short' } as const)[o.bottom];
  if (!perm.bottoms.includes(lower)) lower = 'pantalon';
  if (!/^robe/.test(lower)) {
    const voulu = HAUTS[o.top];
    top = [voulu, ...REPLI_HAUT, perm.tops[0]!].find((n) => perm.tops.includes(n)) ?? 'tee';
    if (top.startsWith('manteau') && (lower === 'short' || lower === 'jupeCourte')) lower = 'pantalon';
  }
  if (/^robe/.test(lower)) items.push(item(lower, o.topColor));
  else {
    items.push(item(lower, o.bottomColor));
    items.push(item(top!, o.topColor));
  }
  const { feet, items: chaus } = chaussures(R, base);
  items.push(...chaussettes(R, feet, lower), ...chaus);

  if (o.accessory !== 'none') items.push(item('accessory', o.accessoryColor, { what: ACCESSOIRES[o.accessory] }));
  if (opts.umbrella) items.push(item('accessory', PAL[pick(R, ['rouge', 'marine', 'moutarde', 'vert', 'prune'] as const)], { what: 'parapluie' }));
  if (opts.work === 'vest') items.push(item('gilet', GILET));
  if (opts.work === 'apron') items.push(item('tablier', TABLIER));

  return { base, skin: peauProche(o.skin), height: B.metres * (0.95 + R() * 0.1), hair, beard, cap, items, mood: 'neutre' };
}

// ——— Clé stable ———

const clePattern = (p?: Pattern): string => (p ? `${p.kind}/${p.color}/${p.freq.toFixed(1)}` : '');
// Chaîne stable à ordre de champs fixe : deux habitants de même clé ont le même aspect.
export function citizenKey(d: CitizenDesc): string {
  const items = d.items.map((i) => [i.k, i.color, clePattern(i.pattern), i.sole ?? '', i.what ?? ''].join(':')).join(',');
  return [d.base, d.skin, d.height.toFixed(2), d.hair?.join(':') ?? '-', d.beard?.join(':') ?? '-', d.cap?.join(':') ?? '-', items, d.mood].join('|');
}
