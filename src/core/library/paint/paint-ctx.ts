// Sous-ensemble du contexte Canvas 2D utilisé par le peintre. Un vrai CanvasRenderingContext2D le satisfait ; les tests
// passent un faux contexte qui enregistre les appels. Aucune transformation n'est utilisée par le moteur : tout est
// tracé en coordonnées du monde (la tranche est décalée par l'appelant).
export type GradientLike = { addColorStop(offset: number, color: string): void };

export interface PaintCtx {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
}
