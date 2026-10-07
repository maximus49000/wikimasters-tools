import type { CardKinds } from '../kinds/wikidata-kinds';

// Natures Wikidata d'une œuvre écrite : livre, roman, œuvre littéraire, nouvelle, pièce de théâtre, essai, poème, recueil de poèmes,
// roman court, récit, suite romanesque, bande dessinée, roman graphique, manga, série de manga.
export const BOOK_NATURES: readonly string[] = [
  'Q571',
  'Q8261',
  'Q7725634',
  'Q49084',
  'Q25379',
  'Q35760',
  'Q5185279',
  'Q12106333',
  'Q149537',
  'Q1318295',
  'Q1667921',
  'Q1004',
  'Q725377',
  'Q8274',
  'Q21198342',
];

const BOOK = new Set(BOOK_NATURES);

// Une carte dont une nature Wikidata est une œuvre écrite.
export const isBookCard = (kinds: CardKinds | undefined): boolean => kinds?.natures.some((id) => BOOK.has(id)) ?? false;

const HUMAN = 'Q5';
// Métiers (P106) d'un écrivain : écrivain, poète, romancier, dramaturge, essayiste, auteur, auteur de littérature pour la jeunesse.
export const WRITER_OCCUPATIONS: readonly string[] = ['Q36180', 'Q49757', 'Q6625963', 'Q214917', 'Q11774202', 'Q482980', 'Q4853732'];
const WRITER = new Set(WRITER_OCCUPATIONS);

// Une carte de personne dont un métier est celui d'écrivain : elle reçoit une bibliographie.
export const isWriterCard = (kinds: CardKinds | undefined): boolean =>
  (kinds?.natures.includes(HUMAN) ?? false) && kinds!.occupations.some((id) => WRITER.has(id));
