import type { CityTime } from './deco';

// Grandes villes pour l'heure d'une horloge : nom et pays en français, fuseau IANA. Calcul local par Intl, sans réseau.
export type City = { name: string; country: string; tz: string };

export const CITIES: readonly City[] = [
  // Europe
  { name: 'Paris', country: 'France', tz: 'Europe/Paris' },
  { name: 'Lyon', country: 'France', tz: 'Europe/Paris' },
  { name: 'Marseille', country: 'France', tz: 'Europe/Paris' },
  { name: 'Bruxelles', country: 'Belgique', tz: 'Europe/Brussels' },
  { name: 'Genève', country: 'Suisse', tz: 'Europe/Zurich' },
  { name: 'Zurich', country: 'Suisse', tz: 'Europe/Zurich' },
  { name: 'Luxembourg', country: 'Luxembourg', tz: 'Europe/Luxembourg' },
  { name: 'Londres', country: 'Royaume-Uni', tz: 'Europe/London' },
  { name: 'Édimbourg', country: 'Royaume-Uni', tz: 'Europe/London' },
  { name: 'Dublin', country: 'Irlande', tz: 'Europe/Dublin' },
  { name: 'Lisbonne', country: 'Portugal', tz: 'Europe/Lisbon' },
  { name: 'Madrid', country: 'Espagne', tz: 'Europe/Madrid' },
  { name: 'Barcelone', country: 'Espagne', tz: 'Europe/Madrid' },
  { name: 'Rome', country: 'Italie', tz: 'Europe/Rome' },
  { name: 'Milan', country: 'Italie', tz: 'Europe/Rome' },
  { name: 'Berlin', country: 'Allemagne', tz: 'Europe/Berlin' },
  { name: 'Munich', country: 'Allemagne', tz: 'Europe/Berlin' },
  { name: 'Amsterdam', country: 'Pays-Bas', tz: 'Europe/Amsterdam' },
  { name: 'Copenhague', country: 'Danemark', tz: 'Europe/Copenhagen' },
  { name: 'Oslo', country: 'Norvège', tz: 'Europe/Oslo' },
  { name: 'Stockholm', country: 'Suède', tz: 'Europe/Stockholm' },
  { name: 'Helsinki', country: 'Finlande', tz: 'Europe/Helsinki' },
  { name: 'Reykjavik', country: 'Islande', tz: 'Atlantic/Reykjavik' },
  { name: 'Varsovie', country: 'Pologne', tz: 'Europe/Warsaw' },
  { name: 'Prague', country: 'Tchéquie', tz: 'Europe/Prague' },
  { name: 'Vienne', country: 'Autriche', tz: 'Europe/Vienna' },
  { name: 'Budapest', country: 'Hongrie', tz: 'Europe/Budapest' },
  { name: 'Athènes', country: 'Grèce', tz: 'Europe/Athens' },
  { name: 'Bucarest', country: 'Roumanie', tz: 'Europe/Bucharest' },
  { name: 'Kyiv', country: 'Ukraine', tz: 'Europe/Kyiv' },
  { name: 'Istanbul', country: 'Turquie', tz: 'Europe/Istanbul' },
  { name: 'Moscou', country: 'Russie', tz: 'Europe/Moscow' },
  // Afrique
  { name: 'Le Caire', country: 'Égypte', tz: 'Africa/Cairo' },
  { name: 'Casablanca', country: 'Maroc', tz: 'Africa/Casablanca' },
  { name: 'Alger', country: 'Algérie', tz: 'Africa/Algiers' },
  { name: 'Tunis', country: 'Tunisie', tz: 'Africa/Tunis' },
  { name: 'Dakar', country: 'Sénégal', tz: 'Africa/Dakar' },
  { name: 'Abidjan', country: 'Côte d\'Ivoire', tz: 'Africa/Abidjan' },
  { name: 'Lagos', country: 'Nigeria', tz: 'Africa/Lagos' },
  { name: 'Kinshasa', country: 'RD Congo', tz: 'Africa/Kinshasa' },
  { name: 'Nairobi', country: 'Kenya', tz: 'Africa/Nairobi' },
  { name: 'Addis-Abeba', country: 'Éthiopie', tz: 'Africa/Addis_Ababa' },
  { name: 'Johannesbourg', country: 'Afrique du Sud', tz: 'Africa/Johannesburg' },
  { name: 'Le Cap', country: 'Afrique du Sud', tz: 'Africa/Johannesburg' },
  { name: 'Antananarivo', country: 'Madagascar', tz: 'Indian/Antananarivo' },
  { name: 'Saint-Denis', country: 'La Réunion', tz: 'Indian/Reunion' },
  { name: 'Port-Louis', country: 'Maurice', tz: 'Indian/Mauritius' },
  // Moyen-Orient et Asie
  { name: 'Jérusalem', country: 'Israël', tz: 'Asia/Jerusalem' },
  { name: 'Beyrouth', country: 'Liban', tz: 'Asia/Beirut' },
  { name: 'Riyad', country: 'Arabie saoudite', tz: 'Asia/Riyadh' },
  { name: 'Dubaï', country: 'Émirats arabes unis', tz: 'Asia/Dubai' },
  { name: 'Doha', country: 'Qatar', tz: 'Asia/Qatar' },
  { name: 'Téhéran', country: 'Iran', tz: 'Asia/Tehran' },
  { name: 'Kaboul', country: 'Afghanistan', tz: 'Asia/Kabul' },
  { name: 'Karachi', country: 'Pakistan', tz: 'Asia/Karachi' },
  { name: 'Bombay', country: 'Inde', tz: 'Asia/Kolkata' },
  { name: 'New Delhi', country: 'Inde', tz: 'Asia/Kolkata' },
  { name: 'Katmandou', country: 'Népal', tz: 'Asia/Kathmandu' },
  { name: 'Dacca', country: 'Bangladesh', tz: 'Asia/Dhaka' },
  { name: 'Rangoun', country: 'Birmanie', tz: 'Asia/Yangon' },
  { name: 'Bangkok', country: 'Thaïlande', tz: 'Asia/Bangkok' },
  { name: 'Hanoï', country: 'Viêt Nam', tz: 'Asia/Ho_Chi_Minh' },
  { name: 'Hô Chi Minh-Ville', country: 'Viêt Nam', tz: 'Asia/Ho_Chi_Minh' },
  { name: 'Phnom Penh', country: 'Cambodge', tz: 'Asia/Phnom_Penh' },
  { name: 'Kuala Lumpur', country: 'Malaisie', tz: 'Asia/Kuala_Lumpur' },
  { name: 'Singapour', country: 'Singapour', tz: 'Asia/Singapore' },
  { name: 'Jakarta', country: 'Indonésie', tz: 'Asia/Jakarta' },
  { name: 'Bali', country: 'Indonésie', tz: 'Asia/Makassar' },
  { name: 'Manille', country: 'Philippines', tz: 'Asia/Manila' },
  { name: 'Hong Kong', country: 'Chine', tz: 'Asia/Hong_Kong' },
  { name: 'Pékin', country: 'Chine', tz: 'Asia/Shanghai' },
  { name: 'Shanghai', country: 'Chine', tz: 'Asia/Shanghai' },
  { name: 'Taipei', country: 'Taïwan', tz: 'Asia/Taipei' },
  { name: 'Séoul', country: 'Corée du Sud', tz: 'Asia/Seoul' },
  { name: 'Tokyo', country: 'Japon', tz: 'Asia/Tokyo' },
  { name: 'Osaka', country: 'Japon', tz: 'Asia/Tokyo' },
  { name: 'Oulan-Bator', country: 'Mongolie', tz: 'Asia/Ulaanbaatar' },
  { name: 'Almaty', country: 'Kazakhstan', tz: 'Asia/Almaty' },
  { name: 'Tachkent', country: 'Ouzbékistan', tz: 'Asia/Tashkent' },
  { name: 'Novossibirsk', country: 'Russie', tz: 'Asia/Novosibirsk' },
  { name: 'Vladivostok', country: 'Russie', tz: 'Asia/Vladivostok' },
  // Océanie
  { name: 'Perth', country: 'Australie', tz: 'Australia/Perth' },
  { name: 'Darwin', country: 'Australie', tz: 'Australia/Darwin' },
  { name: 'Adélaïde', country: 'Australie', tz: 'Australia/Adelaide' },
  { name: 'Brisbane', country: 'Australie', tz: 'Australia/Brisbane' },
  { name: 'Sydney', country: 'Australie', tz: 'Australia/Sydney' },
  { name: 'Melbourne', country: 'Australie', tz: 'Australia/Melbourne' },
  { name: 'Nouméa', country: 'Nouvelle-Calédonie', tz: 'Pacific/Noumea' },
  { name: 'Auckland', country: 'Nouvelle-Zélande', tz: 'Pacific/Auckland' },
  { name: 'Fidji', country: 'Fidji', tz: 'Pacific/Fiji' },
  { name: 'Papeete', country: 'Polynésie française', tz: 'Pacific/Tahiti' },
  { name: 'Honolulu', country: 'États-Unis', tz: 'Pacific/Honolulu' },
  // Amériques
  { name: 'Anchorage', country: 'États-Unis', tz: 'America/Anchorage' },
  { name: 'Vancouver', country: 'Canada', tz: 'America/Vancouver' },
  { name: 'Seattle', country: 'États-Unis', tz: 'America/Los_Angeles' },
  { name: 'San Francisco', country: 'États-Unis', tz: 'America/Los_Angeles' },
  { name: 'Los Angeles', country: 'États-Unis', tz: 'America/Los_Angeles' },
  { name: 'Las Vegas', country: 'États-Unis', tz: 'America/Los_Angeles' },
  { name: 'Phoenix', country: 'États-Unis', tz: 'America/Phoenix' },
  { name: 'Denver', country: 'États-Unis', tz: 'America/Denver' },
  { name: 'Mexico', country: 'Mexique', tz: 'America/Mexico_City' },
  { name: 'Chicago', country: 'États-Unis', tz: 'America/Chicago' },
  { name: 'Houston', country: 'États-Unis', tz: 'America/Chicago' },
  { name: 'La Nouvelle-Orléans', country: 'États-Unis', tz: 'America/Chicago' },
  { name: 'Atlanta', country: 'États-Unis', tz: 'America/New_York' },
  { name: 'Miami', country: 'États-Unis', tz: 'America/New_York' },
  { name: 'Washington', country: 'États-Unis', tz: 'America/New_York' },
  { name: 'New York', country: 'États-Unis', tz: 'America/New_York' },
  { name: 'Boston', country: 'États-Unis', tz: 'America/New_York' },
  { name: 'Toronto', country: 'Canada', tz: 'America/Toronto' },
  { name: 'Montréal', country: 'Canada', tz: 'America/Toronto' },
  { name: 'Québec', country: 'Canada', tz: 'America/Toronto' },
  { name: 'Halifax', country: 'Canada', tz: 'America/Halifax' },
  { name: 'Saint-Pierre', country: 'Saint-Pierre-et-Miquelon', tz: 'America/Miquelon' },
  { name: 'La Havane', country: 'Cuba', tz: 'America/Havana' },
  { name: 'Port-au-Prince', country: 'Haïti', tz: 'America/Port-au-Prince' },
  { name: 'Fort-de-France', country: 'Martinique', tz: 'America/Martinique' },
  { name: 'Pointe-à-Pitre', country: 'Guadeloupe', tz: 'America/Guadeloupe' },
  { name: 'Cayenne', country: 'Guyane', tz: 'America/Cayenne' },
  { name: 'Bogota', country: 'Colombie', tz: 'America/Bogota' },
  { name: 'Lima', country: 'Pérou', tz: 'America/Lima' },
  { name: 'Caracas', country: 'Venezuela', tz: 'America/Caracas' },
  { name: 'Quito', country: 'Équateur', tz: 'America/Guayaquil' },
  { name: 'La Paz', country: 'Bolivie', tz: 'America/La_Paz' },
  { name: 'Santiago', country: 'Chili', tz: 'America/Santiago' },
  { name: 'Buenos Aires', country: 'Argentine', tz: 'America/Argentina/Buenos_Aires' },
  { name: 'Montevideo', country: 'Uruguay', tz: 'America/Montevideo' },
  { name: 'São Paulo', country: 'Brésil', tz: 'America/Sao_Paulo' },
  { name: 'Rio de Janeiro', country: 'Brésil', tz: 'America/Sao_Paulo' },
  { name: 'Manaus', country: 'Brésil', tz: 'America/Manaus' },
  { name: 'Nuuk', country: 'Groenland', tz: 'America/Nuuk' },
];

const KNOWN = new Set(CITIES.map((c) => c.tz));
export const isKnownTz = (tz: string): boolean => KNOWN.has(tz);

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function searchCities(query: string): City[] {
  const q = fold(query.trim());
  return q ? CITIES.filter((c) => fold(`${c.name} ${c.country}`).includes(q)) : [...CITIES];
}

// Décalage d'un fuseau sur UTC à l'instant donné, en minutes (heure d'été comprise). Formateurs mis en cache par fuseau.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(tz: string, at: Date): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

// Heure d'une ville : heure de la scène décalée de l'écart entre la ville et l'appareil (la scène suit l'heure locale de l'appareil).
export function cityMinutes(sceneMinutes: number, tz: string, now: Date): number {
  const delta = tzOffsetMinutes(tz, now) - -now.getTimezoneOffset();
  return (((sceneMinutes + delta) % 1440) + 1440) % 1440;
}

export function cityClock(sceneMinutes: number, city: CityTime | undefined, now: Date): { h: number; m: number; s: number } {
  const m = city ? cityMinutes(sceneMinutes, city.tz, now) : ((Math.round(sceneMinutes) % 1440) + 1440) % 1440;
  return { h: Math.floor(m / 60), m: m % 60, s: now.getSeconds() };
}
