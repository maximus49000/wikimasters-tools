export const LONG_PRESS_MS = 500;
// Au-delà, le doigt (ou la souris) fait défiler : ce n'est plus un appui long.
const MOVE_TOLERANCE = 10;

// Détecte un appui prolongé. Après un appui long, le clic qui suit le relâchement doit être ignoré (`consumeClick`).
export function createLongPress(onLongPress: () => void, delay = LONG_PRESS_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin = { x: 0, y: 0 };
  let fired = false;

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    start(x: number, y: number): void {
      cancel();
      fired = false;
      origin = { x, y };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onLongPress();
      }, delay);
    },
    move(x: number, y: number): void {
      if (timer !== null && Math.hypot(x - origin.x, y - origin.y) > MOVE_TOLERANCE) cancel();
    },
    cancel,
    // Vrai une seule fois après un appui long : ce clic-là n'est pas un vrai clic.
    consumeClick(): boolean {
      const was = fired;
      fired = false;
      return was;
    },
  };
}
