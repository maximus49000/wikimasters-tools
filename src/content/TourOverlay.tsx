import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourStep } from '../core/whats-new/types';
import { bubbleTop, spotlightBox, type Box } from './tour-geometry';
import { findTarget } from './tour-target';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const button = (primary: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: primary ? '#0d1117' : 'inherit',
    background: primary ? 'var(--color-accent, #34d399)' : 'none',
    border: primary ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

// Visite guidée : un projecteur sur l'élément réel (cherché jusque dans les shadow DOM) et une bulle Précédent / Suivant.
// Si l'élément n'est pas à l'écran, l'étape s'affiche en texte seul avec une indication.
export function TourOverlay({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(170);
  const bubble = useRef<HTMLDivElement>(null);
  const step = steps[index];

  useEffect(() => {
    let scrolled = false;
    const update = () => {
      const element = step?.target ? findTarget(step.target) : null;
      if (!element) return setBox(null);
      if (!scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const r = element.getBoundingClientRect();
      setBox((prev) => {
        const next = spotlightBox({ left: r.left, top: r.top, width: r.width, height: r.height });
        return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    update();
    // L'élément peut apparaître plus tard (chargement) ou bouger (défilement, rotation) : on le suit.
    const timer = window.setInterval(update, 300);
    return () => window.clearInterval(timer);
  }, [step]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleHeight(bubble.current.offsetHeight);
  }, [index, box]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const missing = step.target !== null && box === null;

  return (
    <div style={{ position: 'fixed', inset: 0 }} role="dialog" aria-label="Visite guidée">
      {box ? (
        <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)', border: '2px solid var(--color-accent, #34d399)', pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      )}
      <div
        ref={bubble}
        style={{ position: 'fixed', left: 12, right: 12, top: bubbleTop(box, window.innerHeight, bubbleHeight), maxWidth: 400, margin: '0 auto', boxSizing: 'border-box', padding: 14, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Étape {index + 1}/{steps.length}
        </div>
        <strong style={{ display: 'block', fontSize: 16, margin: '2px 0' }}>{step.title}</strong>
        <p style={{ margin: '0 0 8px', opacity: 0.85 }}>{step.text}</p>
        {missing && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Ouvrez la page concernée pour voir l’élément éclairé.</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} style={button(false)}>
              Précédent
            </button>
          )}
          <button type="button" onClick={() => (last ? onDone() : setIndex(index + 1))} style={button(true)}>
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </div>
        <button type="button" onClick={onDone} style={{ display: 'block', width: '100%', minHeight: 36, marginTop: 6, cursor: 'pointer', color: 'inherit', opacity: 0.7, background: 'none', border: 'none', font: '12px system-ui, sans-serif' }}>
          Quitter la visite
        </button>
      </div>
    </div>
  );
}
