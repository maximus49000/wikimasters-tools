// Catalogue des commerces de la scène Ville (vague 1b-iv-a) : horaires, couleurs, clientèle et noms écrits.
// Les noms écrits servent quand le relais ne donne aucun nom local pour le type (ou pas de position).
export const SHOP_TYPE_IDS = [
  'bakery', 'pastry', 'chocolatier', 'butcher', 'fishmonger', 'cheese', 'greengrocer', 'wine', 'grocery', 'minimarket',
  'pharmacy', 'florist', 'bookshop', 'records', 'games', 'hairdresser', 'optician', 'tattoo', 'thrift', 'antiques',
  'petshop', 'bikes', 'laundry', 'cafe', 'restaurant', 'pizzeria', 'kebab', 'sushi', 'tearoom', 'arcade', 'bar', 'nightclub',
] as const;
export type ShopTypeId = (typeof SHOP_TYPE_IDS)[number];

// Forme de la clientèle sur la journée (voir crowdAt) ; `level` règle l'affluence (0,2 rares … 1 très nombreux).
export type CrowdProfile = 'morning' | 'meals' | 'afternoon' | 'regular' | 'evening' | 'night' | 'after-school' | 'allday';

export type ShopDef = {
  id: ShopTypeId;
  label: string;
  days: readonly number[];
  hours: readonly (readonly [number, number])[];
  // Plages propres au dimanche (boulangerie, fleuriste : le matin) ; absent = mêmes plages que les autres jours.
  sundayHours?: readonly (readonly [number, number])[];
  // Ouvert les jours fériés (supérette, laverie, bar, boîte, arcade, pizzeria, kebab, sushis).
  holidays: boolean;
  sign: string; // fond de l'enseigne
  ink: string; // lettres
  wall: string; // mur intérieur
  floor: string; // sol intérieur
  awning: boolean;
  crowd: CrowdProfile;
  level: number;
  // Équipe du local : nombre de personnes par équipe, tiré entre min et max selon la graine et le jour.
  staff: { min: number; max: number };
  // Nombre maximal de tables en terrasse (0 = pas de terrasse).
  terrace: 0 | 2 | 3 | 4;
  names: readonly string[];
};

const H = (h: number, m = 0): number => h * 60 + m;

const TUE_SAT = [2, 3, 4, 5, 6];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const ALL = [0, 1, 2, 3, 4, 5, 6];
const NO_MON = [0, 2, 3, 4, 5, 6];
const MEALS = [[H(11, 30), H(14)], [H(18), H(23, 30)]] as const;

export const SHOP_DEFS: Readonly<Record<ShopTypeId, ShopDef>> = {
  bakery: {
    id: 'bakery', label: 'Boulangerie', days: NO_MON, hours: [[H(7), H(20)]], sundayHours: [[H(7), H(13)]], holidays: false,
    sign: '#8A4B1E', ink: '#F7E3B5', wall: '#F3E2C0', floor: '#C9A06A', awning: false, crowd: 'morning', level: 1, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Pain Perdu', 'La Mie Tendre', 'Le Fournil du Coin', 'Pain, Amour et Fournil', 'À la Baguette Magique', 'Le Croustillant', 'Mie de Rien', 'La Croûte Dorée', 'Au Levain Levé', 'Farine et Fierté'],
  },
  pastry: {
    id: 'pastry', label: 'Pâtisserie', days: NO_MON, hours: [[H(9), H(19)]], holidays: false,
    sign: '#E58FB0', ink: '#5A1F3A', wall: '#FBE3EC', floor: '#E8C4D0', awning: false, crowd: 'afternoon', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Éclair de Lune', 'Au Chou Fou', 'Tarte à la Crème', 'Le Mille-Feuille d’Or', 'Choux Bidou', 'La Religieuse Gourmande', 'Macaron Toujours', 'Sucre d’Orge et Fils', 'Le Paris-Brestois', 'Au Fondant Fondu'],
  },
  chocolatier: {
    id: 'chocolatier', label: 'Chocolatier', days: TUE_SAT, hours: [[H(10), H(19)]], holidays: false,
    sign: '#4A2A1A', ink: '#F2C57C', wall: '#7B4B32', floor: '#A9714F', awning: false, crowd: 'regular', level: 0.3, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Cacao et Compagnie', 'Au Praliné Câlin', 'La Fève Rêveuse', 'Chocolat Show', 'Ganache à Moustache', 'Truffe Attitude', 'Le Carré Noir', 'Les Bonbons de Gaston', 'Au Beurre de Cacao', 'La Pépite Fondante'],
  },
  butcher: {
    id: 'butcher', label: 'Boucherie', days: TUE_SAT, hours: [[H(8), H(19, 30)]], holidays: false,
    sign: '#A3262A', ink: '#FFFFFF', wall: '#F4EDE6', floor: '#D9D2CA', awning: false, crowd: 'morning', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Fin Gras', 'La Bonne Entrecôte', 'Le Rumsteck Rieur', 'Chez Gégène Boucher', 'À la Côte à l’Os', 'Au Bœuf Couronné', 'La Hache du Terroir', 'Le Gigot d’Or', 'Saucisse Attitude', 'Au Filet Mignon'],
  },
  fishmonger: {
    id: 'fishmonger', label: 'Poissonnerie', days: TUE_SAT, hours: [[H(8), H(13)]], holidays: false,
    sign: '#2D6F9A', ink: '#F2F7FA', wall: '#DCEBF2', floor: '#B7CAD3', awning: false, crowd: 'morning', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Il était une Fish', 'Au Bar à Poissons', 'La Raie Publique', 'Le Merlan Enchanteur', 'Sole Mio', 'Le Thon Sonne', 'À la Marée Montante', 'Chez Marcel Écailler', 'Truite Alors', 'Au Hareng Saur'],
  },
  cheese: {
    id: 'cheese', label: 'Fromager', days: TUE_SAT, hours: [[H(9), H(19, 30)]], holidays: false,
    sign: '#E3B23C', ink: '#3E2B05', wall: '#F6E8B8', floor: '#D8BE7A', awning: false, crowd: 'regular', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Fromage Roi', 'La Crème de la Crème', 'Le Brie Avisé', 'Fromages et Dragons', 'Chez Camille Embert', 'Le Fort en Goût', 'La Cave à Pâte Molle', 'Au Plateau de Chèvre', 'Meule Fête', 'Le Comté Tout Court'],
  },
  greengrocer: {
    id: 'greengrocer', label: 'Primeur', days: MON_SAT, hours: [[H(8), H(20)]], holidays: false,
    sign: '#4F9A3B', ink: '#FFFBE0', wall: '#E6F1D3', floor: '#BFCF9D', awning: true, crowd: 'regular', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Panier Fleuri', 'Chou Cool', 'La Poire Enchantée', 'Les Fruits du Hasard', 'Carotte Diem', 'Le Radis Rieur', 'Pomme d’Api et Cie', 'Aux Légumes Joyeux', 'La Cagette de Lucie', 'Le Verger Express'],
  },
  wine: {
    id: 'wine', label: 'Caviste', days: TUE_SAT, hours: [[H(10), H(20)]], holidays: false,
    sign: '#6B1E3A', ink: '#F1D9A6', wall: '#8B3A52', floor: '#6E4A3A', awning: false, crowd: 'evening', level: 0.4, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Le Bouchon Lyonnais', 'À la Grappe Joyeuse', 'Vin d’Honneur', 'La Cuvée du Patron', 'Le Tire-Bouchon', 'Au Verre Levé', 'Cave Canem', 'Le Nez dans le Verre', 'Chez Bacchus et Fils', 'Millésime et Cie'],
  },
  grocery: {
    id: 'grocery', label: 'Épicerie', days: MON_SAT, hours: [[H(8), H(21)]], holidays: false,
    sign: '#C2701F', ink: '#FFF6E0', wall: '#F2DDB4', floor: '#B89A66', awning: false, crowd: 'regular', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['L’Épicerie de Mamie', 'Au Petit Marché', 'Chez Ali Épicier', 'Le Bocal Heureux', 'À la Bonne Conserve', 'Épice et Tout', 'Le Garde-Manger', 'Au Coin du Quartier', 'Le Panier Bio du Coin', 'La Réserve de Léon'],
  },
  minimarket: {
    id: 'minimarket', label: 'Supérette', days: ALL, hours: [[H(8), H(23)]], holidays: true,
    sign: '#1C6FB8', ink: '#FFE45C', wall: '#E8EEF4', floor: '#C5CDD6', awning: false, crowd: 'allday', level: 0.7, staff: { min: 2, max: 3 }, terrace: 0,
    names: ['Petit Prix Express', 'Le Dépanneur du Coin', 'Mini Mieux', 'Toujours Ouvert', 'La Supérette Pressée', 'Super Dépannage', 'Le Coin Malin', 'Cinq sur Cinq Market', 'Chez Nono Dépanne', 'Tout Pile Poil'],
  },
  pharmacy: {
    id: 'pharmacy', label: 'Pharmacie', days: MON_SAT, hours: [[H(9), H(19, 30)]], holidays: false,
    sign: '#1E8A4C', ink: '#FFFFFF', wall: '#EAF5EE', floor: '#C9DCCF', awning: false, crowd: 'regular', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Pharmacie du Marché', 'La Pharmacie Vitale', 'Pharmacie des Remparts', 'Au Bon Remède', 'Pharmacie de la Gare', 'La Croix du Mieux', 'Pharmacie Saint-Rémy', 'Pharmacie du Centre', 'Le Pilulier d’Or', 'Pharmacie des Tilleuls'],
  },
  florist: {
    id: 'florist', label: 'Fleuriste', days: NO_MON, hours: [[H(9), H(19)]], sundayHours: [[H(9), H(13)]], holidays: false,
    sign: '#D2527F', ink: '#FFF3F7', wall: '#FBE6EE', floor: '#D6B6C2', awning: true, crowd: 'regular', level: 0.4, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Nom de la Rose', 'Pétale Alors', 'Le Bouquet Final', 'Fleur de Peau', 'La Tulipe Noire', 'Marguerite et Cie', 'Œillet de Lynx', 'Pivoine Pivoine', 'Au Jardin des Délices', 'Mimosa Mia'],
  },
  bookshop: {
    id: 'bookshop', label: 'Librairie', days: TUE_SAT, hours: [[H(10), H(19)]], holidays: false,
    sign: '#2F4B7C', ink: '#F4E7C6', wall: '#E7DEC9', floor: '#9C7A55', awning: false, crowd: 'afternoon', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Les Mots Passants', 'Page Blanche', 'La Plume et le Chat', 'Chapitre Un', 'Le Marque-Page', 'Au Fil des Pages', 'Livre Ouvert', 'Les Feuilles Mortes', 'L’Encre Bleue', 'Au Dos de la Couverture'],
  },
  records: {
    id: 'records', label: 'Disquaire', days: TUE_SAT, hours: [[H(11), H(19)]], holidays: false,
    sign: '#1B1B1F', ink: '#FF6A3D', wall: '#34343C', floor: '#56565F', awning: false, crowd: 'regular', level: 0.3, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Vinyle Fatal', 'Le Sillon Profond', 'Face B', 'Tourne-Disque Club', '33 Tours et Retour', 'La Pointe de Lecture', 'Disque Rayé', 'Le Microsillon', 'Pochette Surprise', 'Rock et Rondelles'],
  },
  games: {
    id: 'games', label: 'Magasin de jeux', days: TUE_SAT, hours: [[H(10), H(19)]], holidays: false,
    sign: '#6A3FB5', ink: '#FFD84A', wall: '#E5DAF5', floor: '#A592CC', awning: false, crowd: 'after-school', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Dé Pipé', 'Le Pion Roi', 'Case Départ', 'Jeux de Mains', 'Le Joker Rieur', 'Tout Jouet Tout Flamme', 'La Boîte à Jouer', 'Carte Blanche', 'Quatre Cartes d’As', 'Les Petits Chevaux'],
  },
  hairdresser: {
    id: 'hairdresser', label: 'Coiffeur', days: TUE_SAT, hours: [[H(9), H(19)]], holidays: false,
    sign: '#0F8F8F', ink: '#FFFFFF', wall: '#DFF1F0', floor: '#B0C9C8', awning: false, crowd: 'regular', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['L’Hair du temps', 'Tiff’Hair', 'Mèche Rebelle', 'Coup de Peigne', 'Hair Force One', 'Sur un Air de Coupe', 'Bouclette et Frisette', 'Salon Crinière', 'À Fleur de Tifs', 'Cheveu sur la Soupe'],
  },
  optician: {
    id: 'optician', label: 'Opticien', days: TUE_SAT, hours: [[H(10), H(19)]], holidays: false,
    sign: '#243B8A', ink: '#E8F0FF', wall: '#EEF1F8', floor: '#C3C9DA', awning: false, crowd: 'regular', level: 0.3, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Vu d’Ici', 'Œil de Lynx', 'Lunettes et Compagnie', 'Au Verre Clair', 'La Monture Dorée', 'Voir la Vie en Rose', 'Pince-Nez Chic', 'Le Bon Œil', 'Myope Mais Content', 'Regard Neuf'],
  },
  tattoo: {
    id: 'tattoo', label: 'Tatoueur', days: TUE_SAT, hours: [[H(11), H(20)]], holidays: false,
    sign: '#111111', ink: '#E63B3B', wall: '#2B2B2B', floor: '#4A4A4A', awning: false, crowd: 'regular', level: 0.2, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Encre Noire', 'Peau d’Encre', 'À l’Aiguille', 'Tatoo Rizieux', 'Dragon Pourpre', 'L’Ancre Marine', 'Au Motif Éternel', 'Le Dernier Cri', 'Bras d’Honneur', 'Piqûre de Rappel'],
  },
  thrift: {
    id: 'thrift', label: 'Friperie', days: TUE_SAT, hours: [[H(11), H(19)]], holidays: false,
    sign: '#D96B2B', ink: '#FFF3E0', wall: '#F5E3D0', floor: '#C79C78', awning: false, crowd: 'afternoon', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Vieux Jeans, Neuve Vie', 'La Seconde Peau', 'Fripe-Moi', 'Cintre Heureux', 'Retour de Mode', 'Le Dressing de Tata', 'Ça Me Va Bien', 'Au Vestiaire Vintage', 'Cousu Main d’Occase', 'Chine Chine'],
  },
  antiques: {
    id: 'antiques', label: 'Antiquaire', days: [3, 4, 5, 6], hours: [[H(14), H(19)]], holidays: false,
    sign: '#3F3A2E', ink: '#D9B863', wall: '#6E6446', floor: '#8C7650', awning: false, crowd: 'afternoon', level: 0.2, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Au Temps Jadis', 'Le Bric-à-Brac Doré', 'Antiquités Poussière', 'La Commode Muette', 'Au Vieux Guéridon', 'Les Trésors d’Hier', 'Pendule et Pendule', 'L’Armoire Normande', 'Chez Hector Brocante', 'Siècle Dernier'],
  },
  petshop: {
    id: 'petshop', label: 'Animalerie', days: TUE_SAT, hours: [[H(10), H(19)]], holidays: false,
    sign: '#F0A02B', ink: '#3A2205', wall: '#FBEBC8', floor: '#D6BE8C', awning: false, crowd: 'afternoon', level: 0.5, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Poil au Nez', 'La Patte Heureuse', 'Au Doux Museau', 'Queue Leu Leu', 'Croquettes et Câlins', 'Chat Va Bien', 'Le Perroquet Bavard', 'Au Jardin des Bêtes', 'Mon Chien Content', 'Les Moustaches'],
  },
  bikes: {
    id: 'bikes', label: 'Vélociste', days: TUE_SAT, hours: [[H(9), H(19)]], holidays: false,
    sign: '#E0412B', ink: '#FFFFFF', wall: '#EFE8E2', floor: '#B7AEA6', awning: false, crowd: 'regular', level: 0.4, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['La Petite Reine', 'Roue Libre', 'Pédale Douce', 'Chaîne et Cie', 'Au Dérailleur', 'Le Guidon Malin', 'Vélo Dodo', 'Selle Tout Va Bien', 'Rayon de Soleil', 'Rustine et Fils'],
  },
  laundry: {
    id: 'laundry', label: 'Laverie', days: ALL, hours: [[H(7), H(22)]], holidays: true,
    sign: '#3AA9D6', ink: '#FFFFFF', wall: '#E3F3FA', floor: '#B9D6E2', awning: false, crowd: 'allday', level: 0.5, staff: { min: 2, max: 3 }, terrace: 0,
    names: ['Lave-Tout du Coin', 'Tambour Battant', 'Linge Sale en Famille', 'Chaussette Perdue', 'Mousse Pas Mousse', 'Lessive Express', 'Le Hublot Rond', 'Essorage Express', 'Propre sur Soi', 'Lave-Linge Libre'],
  },
  cafe: {
    id: 'cafe', label: 'Café', days: MON_SAT, hours: [[H(7), H(20)]], holidays: false,
    sign: '#7A3E2A', ink: '#F6E7D0', wall: '#E8D4B8', floor: '#A8815A', awning: true, crowd: 'meals', level: 0.8, staff: { min: 2, max: 3 }, terrace: 4,
    names: ['Le Petit Noir', 'Café du Commerce', 'Au Café Gourmand', 'Le Grain de Folie', 'Chez Paulette', 'Le Rendez-Vous', 'L’Expresso du Coin', 'Au Noisette', 'Le Zinc Heureux', 'Café Crème de la Crème'],
  },
  restaurant: {
    id: 'restaurant', label: 'Restaurant', days: TUE_SAT, hours: [[H(12), H(14, 30)], [H(19), H(23)]], holidays: false,
    sign: '#8B1E2D', ink: '#F5E6C8', wall: '#C9A98A', floor: '#7B4F36', awning: false, crowd: 'meals', level: 0.7, staff: { min: 2, max: 3 }, terrace: 3,
    names: ['La Table de Jules', 'Le Bistrot Gourmand', 'Chez Gaston', 'À la Bonne Fourchette', 'Le Couvert Mis', 'Au Dernier Service', 'La Cuillère d’Argent', 'Le Plat du Jour', 'Chez Marthe et Marcel', 'L’Assiette Pleine'],
  },
  pizzeria: {
    id: 'pizzeria', label: 'Pizzeria', days: ALL, hours: MEALS, holidays: true,
    sign: '#C8352B', ink: '#FFF4D6', wall: '#F3DCC0', floor: '#9B6B4A', awning: false, crowd: 'meals', level: 0.7, staff: { min: 2, max: 3 }, terrace: 2,
    names: ['Chez Luigi', 'La Pizza Margherita', 'Pâte à Modeler', 'Le Four à Bois', 'Bella Pizzaiola', 'La Quatre Saisons', 'Pizza Pazza', 'Au Feu de Naples', 'Le Calzone Rieur', 'Ciao Bella'],
  },
  kebab: {
    id: 'kebab', label: 'Kebab', days: ALL, hours: MEALS, holidays: true,
    sign: '#E5791F', ink: '#FFFFFF', wall: '#F2E2C8', floor: '#A9835C', awning: false, crowd: 'meals', level: 0.7, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Le Grand Broche', 'Kebab Palace', 'Chez Mehmet', 'Istanbul Express', 'Le Sultan Gourmand', 'Au Pain Pita', 'Le Roi du Döner', 'Sauce Blanche Ou Rouge', 'Le Délice d’Anatolie', 'Chez Hakan'],
  },
  sushi: {
    id: 'sushi', label: 'Sushis', days: ALL, hours: MEALS, holidays: true,
    sign: '#E2294B', ink: '#FFFFFF', wall: '#F4E9E4', floor: '#2F2F33', awning: false, crowd: 'meals', level: 0.6, staff: { min: 1, max: 2 }, terrace: 0,
    names: ['Sushi Sensei', 'Maki Mania', 'Le Riz Cher', 'Tokyo Express', 'Sashimi Ouverture', 'Wasabi Bonheur', 'Au Chat Qui Pêche', 'Le Poisson Cru', 'Nigiri Nigiri', 'Mikado Roll'],
  },
  tearoom: {
    id: 'tearoom', label: 'Salon de thé', days: [0, 3, 4, 5, 6], hours: [[H(14), H(19)]], holidays: false,
    sign: '#8F5FA8', ink: '#FDF2D8', wall: '#EBDDF0', floor: '#C8B0D2', awning: false, crowd: 'afternoon', level: 0.5, staff: { min: 1, max: 2 }, terrace: 3,
    names: ['Thé à la Menthe', 'Bergamote et Rêverie', 'L’Heure du Thé', 'Chai Chai Chai', 'Au Petit Biscuit', 'Tasse et Soucoupe', 'La Théière Bavarde', 'Earl Grey Zone', 'Infusion Confusion', 'Le Scone Chic'],
  },
  arcade: {
    id: 'arcade', label: 'Salle d’arcade', days: ALL, hours: [[H(14), H(25)]], holidays: true,
    sign: '#1A1650', ink: '#3DF2E0', wall: '#2A2570', floor: '#4B3F9A', awning: false, crowd: 'evening', level: 0.6, staff: { min: 2, max: 3 }, terrace: 0,
    names: ['Game Over Café', 'Insert Coin', 'Pixel Palace', 'Le Joystick d’Or', 'Flipper Folies', 'Level Up', 'Bip Bip Arcade', 'Un Crédit S’il Plaît', 'Le Baby-Foot Sauvage', 'High Score Club'],
  },
  bar: {
    id: 'bar', label: 'Bar', days: ALL, hours: [[H(17), H(26)]], holidays: true,
    sign: '#2A1A3A', ink: '#FFB347', wall: '#4A3350', floor: '#2C2030', awning: false, crowd: 'night', level: 0.8, staff: { min: 2, max: 3 }, terrace: 3,
    names: ['Le Zinc', 'Au Comptoir Ivre', 'Le Bar à Sons', 'La Dernière Tournée', 'Chez Raymond', 'Le Pichet Vide', 'Le Shaker Fou', 'Au Houblon Doré', 'Le Tabouret Haut', 'Un Verre et Ça Repart'],
  },
  nightclub: {
    id: 'nightclub', label: 'Boîte de nuit', days: [4, 5, 6], hours: [[H(23), H(29)]], holidays: true,
    sign: '#120A24', ink: '#FF4FD8', wall: '#2A1250', floor: '#1B0E38', awning: false, crowd: 'night', level: 1, staff: { min: 2, max: 3 }, terrace: 0,
    names: ['Le Dancing Fou', 'Boule à Facettes', 'Le Bunker Rose', 'Nuit Blanche', 'Le Quai de Minuit', 'Baisse le Son', 'Le Moonlight Club', 'Fièvre du Samedi', 'Discothèque Étoilée', 'Le Dernier Slow'],
  },
};
