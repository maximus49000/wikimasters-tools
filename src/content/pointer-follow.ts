// Près du bord de la pièce visible, le glissé la fait défiler : zone sensible et vitesse (pixels par image).
const EDGE_ZONE = 48;
const EDGE_SPEED = 8;

// Suit le doigt (ou la souris) jusqu'au relâcher : la page ne défile pas sous le doigt, et les bords de la pièce la font défiler.
// `onEnd` reçoit la dernière position (au relâcher comme à l'interruption). Renvoie la fonction qui arrête le suivi sans `onEnd`.
export function followPointer({ scroll, start, onMove, onEnd }: { scroll: () => HTMLElement | null; start: { x: number; y: number }; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void }): () => void {
  let last = start;
  const move = (event: PointerEvent): void => {
    last = { x: event.clientX, y: event.clientY };
    onMove(last.x, last.y);
  };
  const up = (event: PointerEvent): void => {
    stop();
    onEnd(event.clientX, event.clientY);
  };
  const cancel = (): void => {
    stop();
    onEnd(last.x, last.y);
  };
  const touch = (event: TouchEvent): void => {
    if (event.cancelable) event.preventDefault();
  };
  let frame = 0;
  const tick = (): void => {
    const el = scroll();
    if (el) {
      const box = el.getBoundingClientRect();
      const step = last.x < box.left + EDGE_ZONE ? -EDGE_SPEED : last.x > box.right - EDGE_ZONE ? EDGE_SPEED : 0;
      if (step !== 0) {
        const before = el.scrollLeft;
        el.scrollLeft = before + step;
        if (el.scrollLeft !== before) onMove(last.x, last.y);
      }
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('touchmove', touch, { passive: false });
  function stop(): void {
    window.cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', touch);
  }
  return stop;
}
