import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GESTURES, type Gesture } from '../core/whats-new/gestures';
import { pagesOf } from '../core/whats-new/pages';
import type { CardKind, TourStep } from '../core/whats-new/types';
import { bubbleTop, clampBubble, dockTop, planLayout, scaleToFit, spotlightBox, type Box, type Dock } from './tour-geometry';
import type { ScenePrep } from './tour-control';
import { scrollTargetBy } from './tour-scroll';
import { snapshot } from './tour-snapshot';
import { findTarget } from './tour-target';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const ACCENT = 'var(--color-accent, #34d399)';
const MAX_WIDTH = 420;
const ENCART_MAX_HEIGHT = 90;
const button = (primary: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: primary ? '#0d1117' : 'inherit',
    background: primary ? ACCENT : 'none',
    border: primary ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

export type TourOverlayProps = {
  steps: TourStep[];
  startIndex?: number;
  // Prépare l'écran de l'étape (page, mode, carte réelle ou démonstration) et dit ce qu'il faut montrer en plus.
  prepare?: (step: TourStep, index: number) => Promise<ScenePrep>;
  onIndex?: (index: number) => void;
  // Fiche de démonstration d'une nature de carte, montrée sous le projecteur.
  renderDemo?: (card: CardKind) => ReactNode;
  onDone: () => void;
};

const GESTURE_STYLE = `
@keyframes wmt-press{0%,100%{transform:translate(-50%,-50%) scale(1)}15%,85%{transform:translate(-50%,-50%) scale(.8)}}
@keyframes wmt-fill{0%{transform:translate(-50%,-50%) scale(.4);opacity:.15}85%{transform:translate(-50%,-50%) scale(1.5);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
@keyframes wmt-tap{0%,100%{transform:translate(-50%,-50%) scale(1)}30%{transform:translate(-50%,-50%) scale(.8)}}
@keyframes wmt-pulse{0%{transform:translate(-50%,-50%) scale(.6);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
@keyframes wmt-apart-a{from{transform:translate(-50%,-50%) translate(-4px,4px)}to{transform:translate(-50%,-50%) translate(-18px,18px)}}
@keyframes wmt-apart-b{from{transform:translate(-50%,-50%) translate(4px,-4px)}to{transform:translate(-50%,-50%) translate(18px,-18px)}}
@keyframes wmt-slide{from{transform:translate(-50%,-50%) translateX(-22px)}to{transform:translate(-50%,-50%) translateX(22px)}}
`;
const dot = { position: 'absolute', left: 0, top: 0, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', border: `2px solid ${ACCENT}`, boxSizing: 'border-box' } as const;
const ring = { position: 'absolute', left: 0, top: 0, width: 44, height: 44, borderRadius: '50%', border: `3px solid ${ACCENT}`, boxSizing: 'border-box' } as const;

// Le geste animé (doigt, cercle qui se remplit…), centré sur le point d'ancrage de son parent (un point, de taille nulle).
function GestureFigure({ gesture }: { gesture: Gesture }) {
  switch (gesture) {
    case 'longpress':
      return (
        <>
          <span style={{ ...ring, animation: 'wmt-fill 2s ease-out infinite' }} />
          <span style={{ ...dot, animation: 'wmt-press 2s ease-in-out infinite' }} />
        </>
      );
    case 'tap':
      return (
        <>
          <span style={{ ...ring, animation: 'wmt-pulse 1.2s ease-out infinite' }} />
          <span style={{ ...dot, animation: 'wmt-tap 1.2s ease-in-out infinite' }} />
        </>
      );
    case 'pinch':
      return (
        <>
          <span style={{ ...dot, width: 18, height: 18, animation: 'wmt-apart-a 1.4s ease-in-out infinite alternate' }} />
          <span style={{ ...dot, width: 18, height: 18, animation: 'wmt-apart-b 1.4s ease-in-out infinite alternate' }} />
        </>
      );
    case 'drag':
      return <span style={{ ...dot, animation: 'wmt-slide 1.4s ease-in-out infinite alternate' }} />;
  }
}

// Encart « Dans l'interface » : une copie réduite de l'élément visé, en surbrillance, pour savoir de quoi on parle ;
// et, quand l'étape demande un geste, ce geste en pictogramme animé avec sa consigne.
// Sans élément à l'écran ni geste, il montre le glyphe de la fonction.
function Encart({ step }: { step: TourStep }) {
  const holder = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    const target = step.target;
    if (!target) return;
    let done = false;
    const copy = () => {
      const element = findTarget(target);
      const slot = holder.current;
      if (!element || !slot) return;
      // L'élément visé fait partie de la bulle (visite qui explique la bulle) : pas de copie, le geste ou le glyphe suffit.
      if (slot.getRootNode() === element.getRootNode()) {
        done = true;
        return;
      }
      const clone = snapshot(element);
      done = true;
      if (!clone) return;
      const rect = element.getBoundingClientRect();
      const scale = scaleToFit(rect.width, rect.height, Math.max(slot.clientWidth, 160), ENCART_MAX_HEIGHT);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `width:${rect.width}px; transform:scale(${scale}); transform-origin:top left;`;
      wrapper.appendChild(clone);
      slot.style.height = `${Math.ceil(rect.height * scale)}px`;
      slot.replaceChildren(wrapper);
      setCopied(true);
    };
    copy();
    // L'élément peut n'apparaître qu'après la préparation de l'écran : on réessaie jusqu'à l'avoir copié.
    const timer = window.setInterval(() => {
      if (done) return window.clearInterval(timer);
      copy();
    }, 300);
    return () => window.clearInterval(timer);
  }, [step]);

  const gesture = step.gesture ? GESTURES[step.gesture] : null;
  return (
    <div data-wmt-encart="" style={{ margin: '6px 0 8px', padding: 6, borderRadius: 10, border: `2px solid ${ACCENT}`, background: 'rgba(52,211,153,0.10)', boxShadow: '0 0 0 4px rgba(52,211,153,0.15)' }}>
      <style>{GESTURE_STYLE}</style>
      <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600, color: ACCENT }}>{step.target ? 'Dans l’interface' : 'Le geste'}</div>
      <div ref={holder} style={{ overflow: 'hidden', display: copied ? 'block' : 'none' }} />
      {gesture && step.gesture && (
        <div data-wmt-gesture-figure={step.gesture} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: copied ? 6 : 0 }}>
          <div style={{ position: 'relative', width: 64, height: 48, flex: 'none', borderRadius: 8, border, background: 'rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
              <GestureFigure gesture={step.gesture} />
            </div>
          </div>
          <div style={{ fontSize: 12, lineHeight: '16px' }}>
            <strong style={{ display: 'block' }}>Geste : {gesture.label}</strong>
            <span style={{ opacity: 0.85 }}>{gesture.caption}</span>
          </div>
        </div>
      )}
      {!copied && !gesture && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
          <span aria-hidden="true" style={{ fontSize: 28 }}>{step.glyph ?? '◎'}</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>{step.title}</span>
        </div>
      )}
    </div>
  );
}

// Visite guidée : un projecteur sur l'élément réel (cherché jusque dans les shadow DOM) et une bulle Précédent / Suivant.
// Chaque étape se lit en pages courtes ; la bulle se déplace par sa poignée et reste toujours dans l'écran.
export function TourOverlay({ steps, startIndex = 0, prepare, onIndex, renderDemo, onDone }: TourOverlayProps) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(steps.length - 1, 0)));
  const [page, setPage] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  // Côté de l'écran où la bulle est calée (haut ou bas) pour laisser toute la zone visée visible.
  const [dock, setDock] = useState<Dock | null>(null);
  // L'élément visé fait partie de la bulle : on ne la déplace pas pour lui (elle bougerait avec sa cible, sans fin).
  const [selfTarget, setSelfTarget] = useState(false);
  const [prep, setPrep] = useState<ScenePrep>({});
  // Étape dont l'écran est prêt : « Préparation… » dure tant qu'elle diffère de l'étape affichée.
  const [readyIndex, setReadyIndex] = useState(-1);
  const [size, setSize] = useState({ width: 280, height: 170 });
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight });
  // Position choisie par l'utilisateur (poignée) : gardée d'une étape à l'autre pendant la visite.
  const [moved, setMoved] = useState<{ left: number; top: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  // Sens de la navigation : une étape facultative absente est sautée dans le même sens.
  const direction = useRef<'forward' | 'back'>('forward');
  const step = steps[index];
  const preparing = prepare !== undefined && readyIndex !== index;

  // Nouvelle étape : on retient l'index puis on prépare l'écran (navigation, carte, démonstration).
  useEffect(() => {
    onIndex?.(index);
    if (!prepare || !step) return;
    let cancelled = false;
    setPrep({});
    prepare(step, index)
      .catch((): ScenePrep => ({}))
      .then((next) => {
        if (cancelled) return;
        setPrep(next);
        setReadyIndex(index);
      });
    return () => {
      cancelled = true;
    };
    // `prepare` et `onIndex` sont stables ; seule l'étape compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Étape facultative dont l'élément n'est pas à l'écran (ex. « Plus » sur ordinateur) : on la saute.
  useEffect(() => {
    if (preparing || !step?.optional || prep.navigating) return;
    if (step.target && findTarget(step.target)) return;
    if (direction.current === 'back') {
      const previous = steps[index - 1];
      if (!previous) return;
      setIndex(index - 1);
      setPage(pagesOf(previous).length - 1);
      return;
    }
    if (index >= steps.length - 1) return onDone();
    setIndex(index + 1);
    setPage(0);
    // La décision ne se prend qu'une fois l'écran de l'étape prêt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, index]);

  useEffect(() => {
    const update = () => {
      const element = step?.target ? findTarget(step.target) : null;
      if (!element) {
        setSelfTarget(false);
        return setBox(null);
      }
      setSelfTarget(bubble.current?.contains(element) ?? false);
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

  // Mise en page : la bulle se cale en haut ou en bas, et la page défile pour que la zone visée tienne entière dans l'espace libre.
  // Elle se refait à chaque étape, page ou changement de taille de la bulle ; jamais quand l'utilisateur a déplacé la bulle lui-même.
  const hasBox = box !== null;
  useEffect(() => {
    setDock(null);
  }, [step]);
  useEffect(() => {
    if (moved || !hasBox || !step?.target) return;
    const element = findTarget(step.target);
    if (!element || bubble.current?.contains(element)) return;
    const rect = element.getBoundingClientRect();
    const plan = planLayout(spotlightBox({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }), size.height, screen.height);
    setDock(plan.dock);
    if (Math.abs(plan.scrollBy) >= 1) scrollTargetBy(element, plan.scrollBy);
    // Seul un changement d'étape, de page, de taille ou l'apparition de la zone relance la mise en page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, page, size.height, hasBox, moved, screen.height]);

  // Rotation ou redimensionnement : la bulle est replacée dans le nouvel écran.
  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const element = bubble.current;
    if (element) setSize({ width: element.offsetWidth, height: element.offsetHeight });
  }, [index, page, box, prep, preparing, screen]);

  if (!step) return null;
  const pages = pagesOf(step);
  const current = pages[Math.min(page, pages.length - 1)]!;
  const last = index === steps.length - 1;
  const lastPage = page >= pages.length - 1;
  const missing = prepare === undefined && step.target !== null && box === null;

  const next = () => {
    direction.current = 'forward';
    if (!lastPage) return setPage(page + 1);
    if (last) {
      track('visite-terminee');
      return onDone();
    }
    setIndex(index + 1);
    setPage(0);
  };
  const back = () => {
    direction.current = 'back';
    if (page > 0) return setPage(page - 1);
    const previous = steps[index - 1];
    if (!previous) return;
    setIndex(index - 1);
    setPage(pagesOf(previous).length - 1);
  };

  const width = Math.min(MAX_WIDTH, screen.width - 24);
  const automatic = { left: (screen.width - width) / 2, top: selfTarget ? dockTop('bottom', size.height, screen.height) : box && dock ? dockTop(dock, size.height, screen.height) : bubbleTop(box, screen.height, size.height) };
  const position = clampBubble(moved ?? automatic, { width, height: size.height }, screen);

  const onGripDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, left: position.left, top: position.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onGripMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setMoved(clampBubble({ left: start.left + event.clientX - start.x, top: start.top + event.clientY - start.y }, { width, height: size.height }, screen));
  };
  const onGripUp = () => {
    drag.current = null;
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }} role="dialog" aria-label="Visite guidée">
      <style>{GESTURE_STYLE}</style>
      {prep.demo && renderDemo?.(prep.demo)}
      {prep.note?.tone === 'real' && (
        <div style={{ position: 'fixed', left: 0, right: 0, top: 0, zIndex: 1, padding: '8px 12px', background: '#14532d', color: '#dcfce7', font: '600 12px system-ui, sans-serif' }}>{prep.note.text}</div>
      )}
      {box ? (
        <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)', border: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      )}
      <div
        ref={bubble}
        style={{ position: 'fixed', left: position.left, top: position.top, width, maxHeight: screen.height - 16, overflowY: 'auto', boxSizing: 'border-box', padding: '0 14px 14px', borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div
          data-wmt-grip=""
          role="separator"
          aria-label="Déplacer la bulle"
          title="Maintenir et glisser pour déplacer la bulle"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none', opacity: 0.55, fontSize: 16 }}
        >
          ⠿⠿⠿
        </div>
        <div data-wmt-tour-counter="" style={{ fontSize: 12, opacity: 0.7 }}>
          Étape {index + 1}/{steps.length}
          {pages.length > 1 ? ` · page ${page + 1}/${pages.length}` : ''}
        </div>
        <strong style={{ display: 'block', fontSize: 16, margin: '2px 0' }}>{step.title}</strong>
        {(current.encart || step.target === '[data-wmt-encart]') && <Encart step={step} />}
        <h4 style={{ margin: '4px 0 2px', fontSize: 12, fontWeight: 600, opacity: 0.65 }}>{current.label}</h4>
        <p style={{ margin: '0 0 8px', opacity: 0.92 }}>{current.text}</p>
        {pages.length > 1 && (
          <div aria-hidden="true" style={{ display: 'flex', gap: 5, justifyContent: 'center', margin: '4px 0 8px' }}>
            {pages.map((_, i) => (
              <i key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === page ? ACCENT : 'rgba(148,163,184,0.5)' }} />
            ))}
          </div>
        )}
        {preparing && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Préparation…</p>}
        {prep.navigating && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Changement de page…</p>}
        {(missing || prep.note?.tone === 'info') && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>{prep.note?.text ?? 'Ouvrez la page concernée pour voir l’élément éclairé.'}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          {(page > 0 || index > 0) && (
            <button type="button" data-wmt-tour-back="" onClick={back} style={button(false)}>
              Précédent
            </button>
          )}
          <button type="button" data-wmt-tour-next="" onClick={next} style={button(true)}>
            {last && lastPage ? 'Terminer' : 'Suivant'}
          </button>
        </div>
        <button type="button" data-wmt-tour-quit="" onClick={onDone} style={{ display: 'block', width: '100%', minHeight: 36, marginTop: 6, cursor: 'pointer', color: 'inherit', opacity: 0.7, background: 'none', border: 'none', font: '12px system-ui, sans-serif' }}>
          Quitter la visite
        </button>
      </div>
      {box && (
        <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 10, border: `2px solid ${ACCENT}`, pointerEvents: 'none' }} />
      )}
      {box && step.gesture && (
        <div data-wmt-gesture={step.gesture} style={{ position: 'fixed', left: box.left + box.width / 2, top: box.top + box.height / 2, width: 0, height: 0, pointerEvents: 'none' }}>
          <GestureFigure gesture={step.gesture} />
        </div>
      )}
    </div>
  );
}
