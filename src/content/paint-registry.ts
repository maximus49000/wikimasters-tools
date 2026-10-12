// Registre d'images peintes (commerces G4a, accessoires G5) : chaque clé est peinte UNE fois sur un canvas hors écran
// puis gardée en data URL ; les peintures sont étalées (`perFrame` par image) et le cache plafonné à `max` images (la
// moins récemment lue part en premier).
// Lumière quantifiée au 1/8 de jour : une image par palier, pas une par image d'animation.
export const quantDay = (daylight: number): number => Math.round(daylight * 8) / 8;

export class PaintRegistry {
  private readonly sprites = new Map<string, string>();
  private readonly queue = new Map<string, { paint: () => string; done: Set<() => void> }>();
  private pending = false;
  private readonly max: number;
  private readonly perFrame: number;
  private readonly schedule: (cb: () => void) => void;
  constructor(
    readonly label: string,
    opts: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void } = {},
  ) {
    this.max = opts.max ?? 400;
    this.perFrame = opts.perFrame ?? 1;
    this.schedule = opts.schedule ?? ((cb) => void requestAnimationFrame(() => cb()));
  }
  size(): number {
    return this.sprites.size;
  }
  // Image de la clé (rang rafraîchi : la moins récemment lue part en premier au-delà du plafond), sinon null.
  get(k: string): string | null {
    const url = this.sprites.get(k);
    if (url === undefined) return null;
    this.sprites.delete(k);
    this.sprites.set(k, url);
    return url;
  }
  // Demande de peinture : `done` est appelé quand l'image est prête. Rend l'annulation : une clé dont plus personne
  // n'attend l'image (clé changée, composant démonté) n'est pas peinte.
  want(k: string, paint: () => string, done: () => void): () => void {
    const q = this.queue.get(k);
    if (q) q.done.add(done);
    else this.queue.set(k, { paint, done: new Set([done]) });
    this.pump();
    return () => {
      const p = this.queue.get(k);
      if (!p) return;
      p.done.delete(done);
      if (p.done.size === 0) this.queue.delete(k);
    };
  }
  private pump(): void {
    if (this.pending || this.queue.size === 0) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      let made = 0;
      for (const [k, q] of [...this.queue]) {
        if (made >= this.perFrame) break;
        this.queue.delete(k);
        this.sprites.set(k, q.paint());
        made++;
        while (this.sprites.size > this.max) this.sprites.delete(this.sprites.keys().next().value as string);
        for (const d of q.done) d();
      }
      this.pump();
    });
  }
}

// Canvas hors écran partagé par les peintres d'images (commerces, accessoires) : la peinture est synchrone, une seule
// surface suffit. null quand le canvas 2D manque (tests sans canvas, navigateur limité).
let surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;
export function paintSurface(): typeof surface {
  if (surface !== undefined) return surface;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    surface = ctx ? { canvas, ctx } : null;
  } catch {
    surface = null;
  }
  return surface;
}
