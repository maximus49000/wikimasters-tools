/**
 * Estimateur de tempo (BPM) d'un extrait audio — module pur, sans dépendance.
 *
 * À quoi ça sert : faire monter les notes de musique au-dessus de la chaîne hi-fi au rythme du morceau
 * qui joue. L'entrée est l'extrait de 30 s (Deezer) décodé en PCM mono.
 *
 * Comment ça marche :
 * 1. Le signal est coupé en 8 bandes d'une octave environ (< 100 Hz, 100-200, … , > 6,4 kHz) par des filtres
 *    passe-bas du 1er ordre en cascade ; on mesure l'énergie de chaque bande toutes les 10 ms.
 * 2. Par bande : énergie en échelle log (avec un plancher, pour ne pas amplifier le bruit d'une bande vide),
 *    puis « flux positif » (ce qui monte d'une trame à l'autre = attaques). Les bandes sont additionnées :
 *    une grosse caisse, une caisse claire et un accord de piano comptent chacun.
 * 3. Ce flux est lissé (gaussienne de 20 ms : une attaque un peu en avance ou en retard compte quand même),
 *    centré (moyenne locale retirée) puis autocorrélé et normalisé (r(0) = 1).
 * 4. Chaque tempo candidat de 60 à 200 BPM (pas de 0,5) reçoit la corrélation au décalage d'un temps,
 *    pondérée par une préférence douce (log-gaussienne centrée sur 110 BPM, écart-type 0,9 octave).
 * 5. « Douteux » (null) : silence, signal trop court, flux sans attaques nettes (bruit : écart-type / moyenne
 *    du flux trop faible), ou corrélation trop faible au tempo retenu. Un multiple (×2, ×1,5) reste possible : c'est la limite connue de la méthode.
 * 6. Indice (`hint`, p. ex. le champ `bpm` de Deezer) : il ne répond jamais seul ; il choisit seulement parmi
 *    {bpm, bpm/2, bpm×2, bpm×2/3, bpm×3/2} celui qui lui est le plus proche, s'il est à ±8 %.
 *
 * Réglages choisis sur 16 extraits Deezer réels (12 justes à ±4 %, les erreurs sont des multiples) ; voir
 * `.superpowers/sdd/2026-10-16-notes-tempo/task-1-report.md`. Le renfort par les harmoniques (2 et 4 temps)
 * a été essayé puis retiré : il poussait les ballades (Hello, All of Me) vers le double tempo.
 */

const MIN_BPM = 60;
const MAX_BPM = 200;
const BPM_STEP = 0.5;
/** Pas d'analyse : 10 ms. */
const FRAME_SECONDS = 0.01;
/** Coupures des bandes (Hz), une octave chacune. */
const BAND_EDGES = [100, 200, 400, 800, 1600, 3200, 6400];
/** Plancher du log d'une bande, en fraction de son énergie moyenne. */
const BAND_FLOOR = 0.01;
/** Lissage du flux : écart-type de la gaussienne, en trames. */
const SMOOTH_FRAMES = 2;
/** Fenêtre de la moyenne locale retirée au flux (trames). */
const CENTER_WINDOW = 50;
/** Préférence de tempo : log-gaussienne centrée sur 110 BPM, écart-type 0,9 octave. */
const PRIOR_CENTER = 110;
const PRIOR_SIGMA_OCTAVES = 0.9;
/** En dessous de cette corrélation normalisée au tempo retenu, le résultat est jugé douteux. */
const MIN_PEAK = 0.1;
/**
 * Contraste minimal des attaques (écart-type / moyenne du flux) : un bruit sans attaques reste vers 0,9,
 * la musique mesurée est au-dessus de 1,3. En dessous : douteux.
 */
const MIN_ONSET_CONTRAST = 1.15;
/** Durée minimale exploitable (s). */
const MIN_SECONDS = 6;
const HINT_TOLERANCE = 0.08;

/** Énergie par bande et par trame de 10 ms (tableau trames × bandes), ou null si le signal est muet. */
const bandEnergies = (samples: Float32Array, sampleRate: number, frames: number): Float64Array | null => {
  const hop = sampleRate * FRAME_SECONDS;
  const bands = BAND_EDGES.length + 1;
  const energy = new Float64Array(frames * bands);
  const alphas = BAND_EDGES.map((edge) => 1 - Math.exp((-2 * Math.PI * edge) / sampleRate));
  const lows = new Float64Array(BAND_EDGES.length);
  let index = 0;
  let total = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const end = Math.min(samples.length, Math.round((frame + 1) * hop));
    const base = frame * bands;
    for (; index < end; index += 1) {
      const x = samples[index] ?? 0;
      let below = 0;
      for (let b = 0; b < lows.length; b += 1) {
        const low = (lows[b] ?? 0) + (alphas[b] ?? 0) * (x - (lows[b] ?? 0));
        lows[b] = low;
        const band = low - below;
        energy[base + b] = (energy[base + b] ?? 0) + band * band;
        below = low;
      }
      const high = x - below;
      energy[base + bands - 1] = (energy[base + bands - 1] ?? 0) + high * high;
    }
  }
  for (let i = 0; i < energy.length; i += 1) total += energy[i] ?? 0;
  return total > 1e-9 * frames ? energy : null;
};

/** Flux d'attaques par bandes, lissé et centré, une valeur par trame de 10 ms. */
const onsetEnvelope = (samples: Float32Array, sampleRate: number): Float64Array | null => {
  const frames = Math.floor(samples.length / (sampleRate * FRAME_SECONDS));
  const energy = bandEnergies(samples, sampleRate, frames);
  if (!energy) return null;
  const bands = BAND_EDGES.length + 1;

  const floors = new Float64Array(bands);
  for (let b = 0; b < bands; b += 1) {
    let sum = 0;
    for (let f = 0; f < frames; f += 1) sum += energy[f * bands + b] ?? 0;
    floors[b] = (sum / frames) * BAND_FLOOR + 1e-12;
  }
  const flux = new Float64Array(frames);
  for (let f = 1; f < frames; f += 1) {
    let sum = 0;
    for (let b = 0; b < bands; b += 1) {
      const floor = floors[b] ?? 1e-12;
      const rise = Math.log((energy[f * bands + b] ?? 0) + floor) - Math.log((energy[(f - 1) * bands + b] ?? 0) + floor);
      if (rise > 0) sum += rise;
    }
    flux[f] = sum;
  }
  let mean = 0;
  for (let f = 0; f < frames; f += 1) mean += flux[f] ?? 0;
  mean /= frames;
  let variance = 0;
  for (let f = 0; f < frames; f += 1) variance += ((flux[f] ?? 0) - mean) ** 2;
  if (!(mean > 0) || Math.sqrt(variance / frames) / mean < MIN_ONSET_CONTRAST) return null;

  // Lissage gaussien (noyau normalisé, bords tronqués).
  const radius = Math.ceil(SMOOTH_FRAMES * 3);
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i += 1) kernel.push(Math.exp(-0.5 * (i / SMOOTH_FRAMES) ** 2));
  const kernelSum = kernel.reduce((a, b) => a + b, 0);
  const smooth = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) {
      const j = f + i;
      if (j >= 0 && j < frames) sum += (flux[j] ?? 0) * (kernel[i + radius] ?? 0);
    }
    smooth[f] = sum / kernelSum;
  }

  // Centrage : moyenne glissante retirée (cumul pour rester en O(n)).
  const cumulative = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f += 1) cumulative[f + 1] = (cumulative[f] ?? 0) + (smooth[f] ?? 0);
  const half = CENTER_WINDOW >> 1;
  const centered = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const from = Math.max(0, f - half);
    const to = Math.min(frames, f + half + 1);
    centered[f] = (smooth[f] ?? 0) - ((cumulative[to] ?? 0) - (cumulative[from] ?? 0)) / (to - from);
  }
  return centered;
};

/** Autocorrélation normalisée (r(0) = 1, moyenne par terme pour ne pas pénaliser les grands décalages). */
const autocorrelation = (x: Float64Array, maxLag: number): Float64Array | null => {
  const n = x.length;
  const out = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag && lag < n; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < n; i += 1) sum += (x[i] ?? 0) * (x[i + lag] ?? 0);
    out[lag] = sum / (n - lag);
  }
  const zero = out[0] ?? 0;
  if (!(zero > 0)) return null;
  for (let lag = 0; lag <= maxLag; lag += 1) out[lag] = (out[lag] ?? 0) / zero;
  return out;
};

/** Valeur interpolée linéairement à un décalage fractionnaire. */
const at = (r: Float64Array, lag: number): number => {
  const i = Math.floor(lag);
  const t = lag - i;
  return (r[i] ?? 0) * (1 - t) + (r[i + 1] ?? 0) * t;
};

const applyHint = (bpm: number, hint: number): number => {
  let best = bpm;
  let bestGap = Infinity;
  for (const candidate of [bpm, bpm / 2, bpm * 2, (bpm * 2) / 3, (bpm * 3) / 2]) {
    if (candidate < MIN_BPM || candidate > MAX_BPM) continue;
    const gap = Math.abs(candidate - hint) / hint;
    if (gap <= HINT_TOLERANCE && gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return Math.round(best / BPM_STEP) * BPM_STEP;
};

/**
 * Tempo moyen (BPM, dans [60, 200]) de l'extrait, ou null si douteux.
 * `hint` (facultatif, 0 ou null = ignoré) ne sert qu'à départager les multiples du tempo mesuré.
 */
export const estimateBpm = (samples: Float32Array, sampleRate: number, hint?: number | null): number | null => {
  if (!(sampleRate > 0) || samples.length < sampleRate * MIN_SECONDS) return null;
  const onsets = onsetEnvelope(samples, sampleRate);
  if (!onsets) return null;
  const framesPerMinute = 60 / FRAME_SECONDS;
  const maxLag = Math.min(onsets.length - 1, Math.ceil(framesPerMinute / MIN_BPM) + 1);
  const r = autocorrelation(onsets, maxLag);
  if (!r) return null;

  let bestBpm = 0;
  let bestScore = -Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += BPM_STEP) {
    const octaves = Math.log2(bpm / PRIOR_CENTER) / PRIOR_SIGMA_OCTAVES;
    const score = Math.max(0, at(r, framesPerMinute / bpm)) * Math.exp(-0.5 * octaves * octaves);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  if (bestBpm === 0 || at(r, framesPerMinute / bestBpm) < MIN_PEAK) return null;
  return hint && hint > 0 ? applyHint(bestBpm, hint) : bestBpm;
};
