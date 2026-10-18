// Tables du catalogue d'habitants : palette, pièces nommées, ce que chaque base peut porter et les pondérations du tirage.
// Données pures (aucun import) : la logique est dans catalogue.ts. Palette douce « ville de Kiki ».
export const PAL = {
  creme: '#F2E6CC', marine: '#2A3A5E', brique: '#B5523B', sauge: '#8FA77F', moutarde: '#D9A93E', ciel: '#8DB3D0',
  rose: '#D98C95', prune: '#6E4E6E', olive: '#6B6A3A', chocolat: '#5A3A28', anthracite: '#3A3A40', gris: '#9EA4AA',
  blanc: '#F5F1E8', velours: '#7A5A3A', jean: '#4A6A90', rouge: '#C0392B', vert: '#4E7A4A', jaune: '#E8C440', lavande: '#A595C0',
} as const;
export type NomCouleur = keyof typeof PAL;

// Pièce nommée : `k` = famille, le reste = réglages géométriques de la pièce (voir `expand`).
export type DefPiece =
  | { k: 'top'; sleeve: number; off?: number; hem?: number; collar?: boolean | number }
  | { k: 'coat'; len: number }
  | { k: 'bottom'; cut: number }
  | { k: 'skirt' | 'dress'; len: number; flare: number }
  | { k: 'socks' | 'boots'; from: number }
  | { k: 'shoes'; off?: number };

export const PIECES: Record<string, DefPiece> = {
  // Hauts
  tee: { k: 'top', sleeve: 0.45 },
  debardeur: { k: 'top', sleeve: 0.04 },
  chemise: { k: 'top', sleeve: 0.92, off: 0.009, collar: true },
  pull: { k: 'top', sleeve: 0.93, off: 0.013, hem: 0.05, collar: 0.45 },
  manteau: { k: 'coat', len: 0.55 },
  manteauLong: { k: 'coat', len: 0.85 },
  // Bas
  pantalon: { k: 'bottom', cut: 0.96 },
  short: { k: 'bottom', cut: 0.33 },
  pantacourt: { k: 'bottom', cut: 0.62 },
  jupeCourte: { k: 'skirt', len: 0.42, flare: 0.45 },
  jupeGenou: { k: 'skirt', len: 0.6, flare: 0.35 },
  jupeLongue: { k: 'skirt', len: 0.95, flare: 0.3 },
  robe: { k: 'dress', len: 0.62, flare: 0.4 },
  robeLongue: { k: 'dress', len: 0.92, flare: 0.3 },
  // Pieds
  chaussettes: { k: 'socks', from: 0.82 },
  chaussures: { k: 'shoes' },
  baskets: { k: 'shoes', off: 0.013 },
  bottes: { k: 'boots', from: 0.72 },
  bottines: { k: 'boots', from: 0.86 },
};

// Teintes de peau naturelles, de la plus claire à la plus foncée (la peau du corps est recolorée dans sa texture).
export const PEAUX: ReadonlyArray<readonly [string, string]> = [
  ['porcelaine', '#F0CFB6'], ['claire', '#EEC6A6'], ['beige', '#E0AE88'], ['olive', '#C9976A'],
  ['halee', '#B07A50'], ['caramel', '#94603C'], ['brune', '#73452A'], ['ebene', '#4E2E1E'],
];

// Couleurs de cheveux naturelles ; leur vraisemblance selon la peau est dans `hairFor` (catalogue.ts).
export const CHEVEUX = { noir: '#1E1714', brunFonce: '#3A2618', chatain: '#6B4428', chatainClair: '#8E6038', blond: '#C9A15A', roux: '#A8502A', gris: '#9EA0A4', blanc: '#E8E6E2' } as const;

// Ce que chaque base peut porter (rien d'incohérent : pas de jupe pour les hommes, pas de barbe pour les femmes et enfants).
export type PermisBase = { hair: string[]; beard: string[]; tops: string[]; bottoms: string[]; feet: string[] };
export const TYPES: Record<string, PermisBase> = {
  'homme-fort': { hair: ['court', 'raie', 'degarni', 'rase', 'frise', 'afro'], beard: ['pleine', 'courte', 'moustache', 'bouc'], tops: ['tee', 'debardeur', 'chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'short', 'pantacourt'], feet: ['chaussures', 'baskets', 'bottes'] },
  'homme-maigre': { hair: ['court', 'raie', 'degarni', 'rase', 'frise', 'afro'], beard: ['pleine', 'courte', 'moustache', 'bouc'], tops: ['tee', 'debardeur', 'chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'short', 'pantacourt'], feet: ['chaussures', 'baskets', 'bottes'] },
  papy: { hair: ['couronne', 'degarni', 'court', 'rase'], beard: ['moustache', 'pleine', 'courte'], tops: ['chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'pantacourt'], feet: ['chaussures', 'bottines'] },
  'femme-frele': { hair: ['carre', 'long', 'queue', 'chignon', 'frise', 'afro', 'tresses', 'rase'], beard: [], tops: ['tee', 'debardeur', 'chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'short', 'jupeCourte', 'jupeGenou', 'jupeLongue', 'robe', 'robeLongue'], feet: ['chaussures', 'baskets', 'bottes', 'bottines'] },
  'femme-forte': { hair: ['carre', 'long', 'queue', 'chignon', 'frise', 'afro', 'tresses', 'rase'], beard: [], tops: ['tee', 'debardeur', 'chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'short', 'jupeCourte', 'jupeGenou', 'jupeLongue', 'robe', 'robeLongue'], feet: ['chaussures', 'baskets', 'bottes', 'bottines'] },
  'femme-grande': { hair: ['carre', 'long', 'queue', 'chignon', 'frise', 'afro', 'tresses', 'rase'], beard: [], tops: ['tee', 'debardeur', 'chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'short', 'jupeCourte', 'jupeGenou', 'jupeLongue', 'robe', 'robeLongue'], feet: ['chaussures', 'baskets', 'bottes', 'bottines'] },
  mamie: { hair: ['chignon', 'boucles', 'carre', 'court'], beard: [], tops: ['chemise', 'pull', 'manteau', 'manteauLong'], bottoms: ['pantalon', 'jupeGenou', 'jupeLongue', 'robeLongue'], feet: ['chaussures', 'bottines'] },
  enfant: { hair: ['enfant', 'couettes', 'carre', 'queue', 'frise', 'tresses', 'afro', 'rase'], beard: [], tops: ['tee', 'pull', 'manteau'], bottoms: ['pantalon', 'short', 'jupeCourte', 'robe'], feet: ['baskets', 'bottes', 'chaussures'] },
};

// Les bases : modèle, taille en mètres, poids du tirage, sexe (`f` = base femme : seule à porter jupe/robe parmi les adultes),
// `aged` = ancien (cheveux gris, jamais de casquette), `child` = enfant. Les bases futures s'ajoutent ici.
// `ease` = facteur d'aisance des vêtements (défaut 1) pour les corps dont les courbes dépassent la coque standard.
export type DefBase = { glb: string; metres: number; weight: number; sex: 'f' | 'm' | 'n'; aged?: true; child?: true; ease?: number };
export const BASES: Record<string, DefBase> = {
  'homme-fort': { glb: 'base-generique', metres: 1.7, weight: 14, sex: 'm' },
  'homme-maigre': { glb: 'base-homme-maigre', metres: 1.82, weight: 14, sex: 'm' },
  'femme-frele': { glb: 'base-femme-frele', metres: 1.62, weight: 10, sex: 'f' },
  'femme-forte': { glb: 'base-femme-forte', metres: 1.65, weight: 8, sex: 'f', ease: 1.6 },
  'femme-grande': { glb: 'base-femme-grande', metres: 1.76, weight: 8, sex: 'f' },
  papy: { glb: 'base-papy', metres: 1.66, weight: 12, sex: 'm', aged: true },
  mamie: { glb: 'base-mamie', metres: 1.54, weight: 12, sex: 'f', aged: true },
  enfant: { glb: 'base-enfant', metres: 1.25, weight: 22, sex: 'n', child: true },
};

// Coiffures pondérées par base ; `curly` : plus fréquentes quand la peau est plus foncée (sans être exclusives).
export type Pondere = ReadonlyArray<readonly [string | null, number, 'curly'?]>;
export const HAIR: Record<string, Pondere> = {
  'homme-fort': [['court', 5], ['raie', 3], ['degarni', 2], ['rase', 3], ['frise', 2, 'curly'], ['afro', 1, 'curly'], [null, 1]],
  'homme-maigre': [['court', 5], ['raie', 4], ['degarni', 2], ['rase', 3], ['frise', 2, 'curly'], ['afro', 1, 'curly'], [null, 1]],
  'femme-frele': [['carre', 4], ['long', 5], ['queue', 3], ['chignon', 2], ['frise', 2, 'curly'], ['afro', 2, 'curly'], ['tresses', 2, 'curly'], ['rase', 0.4]],
  'femme-forte': [['carre', 4], ['long', 5], ['queue', 3], ['chignon', 2], ['frise', 2, 'curly'], ['afro', 2, 'curly'], ['tresses', 2, 'curly'], ['rase', 0.4]],
  'femme-grande': [['carre', 4], ['long', 5], ['queue', 3], ['chignon', 2], ['frise', 2, 'curly'], ['afro', 2, 'curly'], ['tresses', 2, 'curly'], ['rase', 0.4]],
  papy: [['couronne', 5], ['degarni', 3], ['court', 2], ['rase', 1], [null, 1]],
  mamie: [['chignon', 4], ['boucles', 5], ['carre', 2], ['court', 1]],
  enfant: [['enfant', 5], ['couettes', 2], ['carre', 2], ['queue', 2], ['frise', 2, 'curly'], ['tresses', 1.5, 'curly'], ['afro', 1, 'curly'], ['rase', 1]],
};
export const BEARD: Record<string, number> = { 'homme-fort': 0.55, 'homme-maigre': 0.45, papy: 0.5 };
export const TOPS: Record<string, ReadonlyArray<readonly [string, number]>> = {
  'homme-fort': [['tee', 5], ['chemise', 3], ['pull', 3], ['debardeur', 1], ['manteau', 1.5], ['manteauLong', 1]],
  'homme-maigre': [['tee', 5], ['chemise', 4], ['pull', 3], ['debardeur', 1], ['manteau', 1.5], ['manteauLong', 1]],
  'femme-frele': [['tee', 4], ['chemise', 3], ['pull', 3], ['debardeur', 2], ['manteau', 1.5], ['manteauLong', 1]],
  'femme-forte': [['tee', 4], ['chemise', 3], ['pull', 4], ['debardeur', 1], ['manteau', 1.5], ['manteauLong', 1]],
  'femme-grande': [['tee', 4], ['chemise', 3], ['pull', 3], ['debardeur', 2], ['manteau', 1.5], ['manteauLong', 1]],
  papy: [['chemise', 4], ['pull', 4], ['manteau', 1.5], ['manteauLong', 1.5]],
  mamie: [['chemise', 3], ['pull', 4], ['manteau', 1.5], ['manteauLong', 2]],
  enfant: [['tee', 6], ['pull', 3], ['manteau', 1.5]],
};
export const BOTTOMS: Record<string, ReadonlyArray<readonly [string, number]>> = {
  'homme-fort': [['pantalon', 7], ['short', 2], ['pantacourt', 1.5]],
  'homme-maigre': [['pantalon', 7], ['short', 2], ['pantacourt', 1.5]],
  'femme-frele': [['pantalon', 4], ['short', 1.5], ['jupeCourte', 1.5], ['jupeGenou', 2.5], ['jupeLongue', 2.5]],
  'femme-forte': [['pantalon', 4], ['short', 0.5], ['jupeCourte', 0.5], ['jupeGenou', 2.5], ['jupeLongue', 2.5]],
  'femme-grande': [['pantalon', 4], ['short', 1.5], ['jupeCourte', 1.5], ['jupeGenou', 2.5], ['jupeLongue', 2.5]],
  papy: [['pantalon', 8], ['pantacourt', 1]],
  mamie: [['pantalon', 3], ['jupeGenou', 3], ['jupeLongue', 4]],
  enfant: [['pantalon', 4], ['short', 4], ['jupeCourte', 2]],
};
// Robe : [probabilité, robes possibles] (à la place du haut + bas).
export const DRESS: Record<string, readonly [number, readonly string[]]> = { 'femme-frele': [0.2, ['robe', 'robeLongue']], 'femme-forte': [0.25, ['robe', 'robeLongue']], 'femme-grande': [0.2, ['robe', 'robeLongue']], mamie: [0.25, ['robeLongue']], enfant: [0.12, ['robe']] };
export const FEET: Record<string, ReadonlyArray<readonly [string, number]>> = {
  'homme-fort': [['chaussures', 4], ['baskets', 4], ['bottes', 1]],
  'homme-maigre': [['chaussures', 4], ['baskets', 4], ['bottes', 1]],
  'femme-frele': [['chaussures', 4], ['baskets', 3], ['bottes', 1.5], ['bottines', 2]],
  'femme-forte': [['chaussures', 4], ['baskets', 3], ['bottes', 1.5], ['bottines', 2]],
  'femme-grande': [['chaussures', 4], ['baskets', 3], ['bottes', 1.5], ['bottines', 2]],
  papy: [['chaussures', 6], ['bottines', 2]],
  mamie: [['chaussures', 6], ['bottines', 2]],
  enfant: [['baskets', 6], ['bottes', 1.5], ['chaussures', 1]],
};
export const TOP_COLORS: readonly NomCouleur[] = ['creme', 'brique', 'sauge', 'moutarde', 'ciel', 'rose', 'prune', 'blanc', 'rouge', 'vert', 'jaune', 'lavande', 'gris', 'marine', 'olive'];
export const BOTTOM_COLORS: readonly NomCouleur[] = ['marine', 'anthracite', 'jean', 'velours', 'olive', 'chocolat', 'gris', 'creme', 'jean', 'marine'];
export const COAT_COLORS: readonly NomCouleur[] = ['olive', 'brique', 'marine', 'anthracite', 'chocolat', 'velours', 'prune', 'moutarde', 'gris'];
export const SHOE_COLORS: Record<string, readonly NomCouleur[]> = {
  chaussures: ['chocolat', 'anthracite', 'velours'], baskets: ['blanc', 'blanc', 'gris', 'marine', 'rouge'],
  bottes: ['chocolat', 'anthracite', 'jaune', 'rouge'], bottines: ['chocolat', 'anthracite', 'velours'],
};
export const SOLES: Record<string, string> = { baskets: '#E6E0D4', chaussures: '#2A1C14', bottes: '#2A1C14', bottines: '#2A1C14' };
