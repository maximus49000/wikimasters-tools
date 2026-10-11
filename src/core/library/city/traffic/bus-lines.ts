// Lignes de bus (spec véhicules §5) : repli déterministe quand aucune ligne réelle n'est connue (position désactivée, relais
// en échec, aucune ligne autour). Numéro de 1 à 99, parfois une lettre et un chiffre (« C3 ») ; terminus types ; couleur de
// ligne tirée d'une palette de tons de réseau. Les lignes réelles (relais /buslines) viendront en V4.
import { mulberry32 } from '../../scene-world';

export type BusLine = { ref: string; to: string; colour: string };

export const TERMINI = [
  'Gare SNCF', 'Hôtel de Ville', 'Place de la République', 'Centre hospitalier', 'Lycée Victor Hugo', 'Zone commerciale',
  'Parc des expositions', 'Campus', 'Les Coteaux', 'Le Port', 'Stade', 'Cimetière', 'Mairie annexe', 'Piscine', 'Collège Jean Moulin',
  'Porte de la Ville', 'Le Bourg', 'Les Tilleuls',
] as const;
const COLOURS = ['#2f7d64', '#c0463a', '#2f5e8a', '#d9862e', '#7a4a8a', '#3b8fb0', '#b5395c', '#5f7a2e'] as const;

export function fallbackLine(seed: number): BusLine {
  const r = mulberry32((seed * 2654435761) ^ 0xb05);
  const lettered = r() < 0.2;
  const ref = lettered ? `${'ABCLT'[Math.floor(r() * 5)]}${1 + Math.floor(r() * 9)}` : `${1 + Math.floor(r() * 99)}`;
  return { ref, to: TERMINI[Math.floor(r() * TERMINI.length)]!, colour: COLOURS[Math.floor(r() * COLOURS.length)]! };
}
