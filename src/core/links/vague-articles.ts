// Articles trop vagues pour relier deux cartes : une page de date, un pays ou un continent. Deux cartes qui citent « France »
// ou « 2000 en football » n'ont rien de précis en commun.

const MONTHS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';

// Pages de date (slugs) : « 1998 », « 2000_en_football », « 26_janvier », « 1er_mai_1968 », « Janvier_2000 », « XXe_siècle »,
// « Années_1990 », « Saison_2003-2004 ». Une compétition datée (« Coupe_du_monde_de_football_2006 ») n'en est pas une.
const DATE_PATTERNS = [
  /^\d{1,4}(_av\._J\.-C\.)?$/,
  /^\d{1,4}_en_.+$/,
  new RegExp(`^(1er|\\d{1,2})_(${MONTHS})(_\\d{1,4})?$`, 'i'),
  new RegExp(`^(${MONTHS})_\\d{4}$`, 'i'),
  /^[IVXLC]+e_(siècle|millénaire)(_av\._J\.-C\.)?$/,
  /^Années_\d{1,4}$/,
  /^Saison_\d{4}(-\d{4})?$/,
];

export function isDateArticle(slug: string): boolean {
  return DATE_PATTERNS.some((pattern) => pattern.test(slug));
}

// Pays (titres de Wikipédia en français), continents et grands ensembles.
const PLACES = `
Afghanistan Afrique_du_Sud Albanie Algérie Allemagne Andorre Angola Antigua-et-Barbuda Arabie_saoudite Argentine Arménie Australie
Autriche Azerbaïdjan Bahamas Bahreïn Bangladesh Barbade Belgique Belize Bénin Bhoutan Biélorussie Birmanie Bolivie
Bosnie-Herzégovine Botswana Brésil Brunei Bulgarie Burkina_Faso Burundi Cambodge Cameroun Canada Cap-Vert Chili Chine Chypre
Colombie Comores Corée_du_Nord Corée_du_Sud Costa_Rica Côte_d'Ivoire Croatie Cuba Danemark Djibouti Dominique Égypte
Émirats_arabes_unis Équateur_(pays) Érythrée Espagne Estonie Eswatini États-Unis Éthiopie Fidji Finlande France Gabon Gambie
Géorgie_(pays) Ghana Grèce Grenade_(pays) Guatemala Guinée Guinée-Bissau Guinée_équatoriale Guyana Haïti Honduras Hongrie Inde
Indonésie Irak Iran Irlande_(pays) Islande Israël Italie Jamaïque Japon Jordanie Kazakhstan Kenya Kirghizistan Kiribati Koweït
Laos Lesotho Lettonie Liban Liberia Libye Liechtenstein Lituanie Luxembourg_(pays) Macédoine_du_Nord Madagascar Malaisie Malawi
Maldives Mali Malte Maroc Îles_Marshall Maurice_(pays) Mauritanie Mexique Micronésie_(pays) Moldavie Monaco Mongolie Monténégro
Mozambique Namibie Nauru Népal Nicaragua Niger Nigeria Norvège Nouvelle-Zélande Oman Ouganda Ouzbékistan Pakistan Palaos
Palestine Panama Papouasie-Nouvelle-Guinée Paraguay Pays-Bas Pérou Philippines Pologne Portugal Qatar République_centrafricaine
République_démocratique_du_Congo République_du_Congo République_dominicaine Tchéquie République_tchèque Roumanie Royaume-Uni
Russie Rwanda Saint-Christophe-et-Niévès Saint-Marin Saint-Vincent-et-les-Grenadines Sainte-Lucie Îles_Salomon Salvador Samoa
Sao_Tomé-et-Principe Sénégal Serbie Seychelles Sierra_Leone Singapour Slovaquie Slovénie Somalie Soudan Soudan_du_Sud Sri_Lanka
Suède Suisse Suriname Syrie Tadjikistan Tanzanie Taïwan Tchad Thaïlande Timor_oriental Togo Tonga Trinité-et-Tobago Tunisie
Turkménistan Turquie Tuvalu Ukraine Uruguay Vanuatu Vatican Venezuela Viêt_Nam Vietnam Yémen Zambie Zimbabwe
Angleterre Écosse Pays_de_Galles Irlande_du_Nord Kosovo Union_soviétique Allemagne_de_l'Ouest Allemagne_de_l'Est
Yougoslavie Tchécoslovaquie Empire_ottoman Empire_romain
Europe Afrique Asie Amérique Amérique_du_Nord Amérique_du_Sud Amérique_latine Océanie Antarctique Moyen-Orient Proche-Orient
Union_européenne Monde Terre
`;
const PLACE_SET = new Set(PLACES.split(/\s+/).filter(Boolean));

export function isPlaceArticle(slug: string): boolean {
  return PLACE_SET.has(slug);
}

// Régions et grandes villes : trop larges pour relier deux cartes par leur intermédiaire (« né à Paris », « tourné en Californie »),
// mais une vraie carte liée directement (la Tour Eiffel et Paris). Écartées des intermédiaires seulement.
const BROAD_PLACES = `
Île-de-France Auvergne-Rhône-Alpes Bourgogne-Franche-Comté Bretagne Centre-Val_de_Loire Corse Grand_Est Hauts-de-France Normandie
Nouvelle-Aquitaine Occitanie Pays_de_la_Loire Provence-Alpes-Côte_d'Azur Provence Alsace Lorraine Côte_d'Azur Guadeloupe Martinique
Guyane La_Réunion Mayotte Polynésie_française Nouvelle-Calédonie France_métropolitaine
Alabama Alaska Arizona Arkansas Californie Caroline_du_Nord Caroline_du_Sud Colorado Connecticut Dakota_du_Nord Dakota_du_Sud
Delaware Floride Géorgie_(États-Unis) Hawaï Idaho Illinois Indiana Iowa Kansas Kentucky Louisiane Maine Maryland Massachusetts
Michigan Minnesota Mississippi_(État) Missouri Montana Nebraska Nevada New_Hampshire New_Jersey État_de_New_York Nouveau-Mexique
Ohio Oklahoma Oregon Pennsylvanie Rhode_Island Tennessee Texas Utah Vermont Virginie Virginie-Occidentale Washington_(État)
Wisconsin Wyoming Québec Ontario Colombie-Britannique Alberta Catalogne Andalousie Bavière Toscane Sicile Lombardie Flandre
Wallonie Sibérie Scandinavie Balkans Caraïbes Maghreb
Paris Londres New_York Los_Angeles Hollywood Berlin Rome Madrid Barcelone Milan Tokyo Moscou Saint-Pétersbourg Pékin Shanghai
Bruxelles Amsterdam Vienne_(Autriche) Genève Lisbonne Athènes Istanbul Le_Caire Mumbai Sydney Rio_de_Janeiro Buenos_Aires Mexico
Chicago San_Francisco Las_Vegas Miami Boston Washington_(district_de_Columbia) Montréal Toronto Marseille Lyon Toulouse Bordeaux
Lille Nice Nantes Strasbourg Manhattan Brooklyn
`;
const BROAD_PLACE_SET = new Set(BROAD_PLACES.split(/\s+/).filter(Boolean));

export function isBroadPlaceArticle(slug: string): boolean {
  return BROAD_PLACE_SET.has(slug);
}
