// Mesure d'une ligne (largeur) à une taille de police donnée, fournie par l'appelant (canevas caché dans la pièce, chasse fixe en test).
export type Measure = (text: string, size: number) => number;

const MIN_SIZE = 1.5;
const STEP = 0.25;

function wrap(text: string, w: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (!cur || measure(next, size) <= w) cur = next;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    lines.push(cur);
  }
  // Lignes vides en bout de texte retirées ; une ligne vide au milieu (double retour) est gardée.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Plus grande taille (pas de 0,25) à laquelle le texte, passé à la ligne aux espaces, tient dans la boîte ; à défaut, la taille minimale.
export function fitText(text: string, box: { w: number; h: number }, measure: Measure, lineHeight: number): { size: number; lines: string[] } {
  if (!text.trim()) return { size: MIN_SIZE, lines: [] };
  for (let size = Math.floor(box.h / STEP) * STEP; size >= MIN_SIZE; size -= STEP) {
    const lines = wrap(text, box.w, size, measure);
    if (lines.length * size * lineHeight <= box.h && lines.every((l) => measure(l, size) <= box.w)) return { size, lines };
  }
  return { size: MIN_SIZE, lines: wrap(text, box.w, MIN_SIZE, measure) };
}
