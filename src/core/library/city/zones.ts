export type Zone = 'A' | 'B' | 'C' | 'Corse';
export const ZONES: readonly Zone[] = ['A', 'B', 'C', 'Corse'];
// Zone choisie quand ni la position ni le réglage ne la donnent (Paris, Toulouse, Montpellier).
export const DEFAULT_ZONE: Zone = 'C';

// Département → académie → zone (calendrier scolaire de métropole).
export const BY_ZONE: Record<Zone, readonly string[]> = {
  A: ['25', '39', '70', '90', '24', '33', '40', '47', '64', '03', '15', '43', '63', '21', '58', '71', '89', '07', '26', '38', '73', '74', '19', '23', '87', '01', '42', '69', '16', '17', '79', '86'],
  B: ['04', '05', '13', '84', '02', '60', '80', '14', '50', '61', '27', '76', '59', '62', '54', '55', '57', '88', '44', '49', '53', '72', '85', '06', '83', '18', '28', '36', '37', '41', '45', '08', '10', '51', '52', '22', '29', '35', '56', '67', '68'],
  C: ['77', '93', '94', '11', '30', '34', '48', '66', '75', '09', '12', '31', '32', '46', '65', '81', '82', '78', '91', '92', '95'],
  Corse: ['2A', '2B'],
};
const TABLE = new Map<string, Zone>();
for (const zone of ZONES) for (const code of BY_ZONE[zone]) TABLE.set(code, zone);

export const zoneOfDepartment = (code: string): Zone | null => TABLE.get(code.toUpperCase()) ?? null;
export const isAlsaceMoselle = (code: string): boolean => code === '57' || code === '67' || code === '68';
