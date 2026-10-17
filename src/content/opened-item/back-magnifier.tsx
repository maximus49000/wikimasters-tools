// Loupe sur le dos de la boîte de jeu retournée : le dos entier, ajusté à l'écran (rien de coupé), dans sa meilleure définition
// (originale de TheGamesDB, la medium en repli pendant le chargement ; dos fabriqué si aucune image ne vient).
// Pincer = zoom (1× à 6×), glisser = déplacement borné aux bords du dos, double toucher = retour à 1× ; molette sur ordinateur.
// ✕ et Échap ferment ; le retour Android passe par la couche (backRef de OpenedItemLayer). Événements pointeur, sans bibliothèque.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import { BOX_FORMATS } from '../../core/game/platform-boxes';
import { layerFrame } from '../../core/library/opened-item';
import type { GameBox } from '../game-box-service';
import { MadeBack } from './game-outside';

export const MAGNIFIER_MIN = 1;
export const MAGNIFIER_MAX = 6;
const TAP_MS = 300;
const TAP_PX = 12;
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

const BUTTON: CSSProperties = {
  position: 'absolute', top: 8, right: 8, zIndex: 1, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', font: '600 20px system-ui, sans-serif', color: '#FBF6EA', background: 'rgba(43,29,22,.72)',
  border: '1px solid rgba(251,246,234,.5)', borderRadius: '50%', padding: 0,
};

type View = { s: number; x: number; y: number };
type Pt = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Déplacement d'écran → repère du calque : tourné de 90° (écran en hauteur), (dx, dy) devient (dy, −dx).
const toLayer = (p: Pt): Pt => (layerFrame({ w: window.innerWidth, h: window.innerHeight }).rotated ? { x: p.y, y: -p.x } : p);

export function BackMagnifier({ box, onClose }: { box: GameBox; onClose: () => void }): ReactElement {
  const t = BOX_FORMATS[box.format];
  const w = t.w * 10;
  const h = t.h * 10;
  const [lowFailed, setLowFailed] = useState(false);
  const [full, setFull] = useState<'loading' | 'ready' | 'failed'>('loading');
  // Proportions du dos : celles de l'image chargée, sinon celles du gabarit.
  const [ratio, setRatio] = useState(w / h);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  // Geste en cours : départ (vue, doigts) d'un pincement, et si c'est encore un toucher simple (pour le double toucher).
  const pinchStart = useRef<{ view: View; dist: number; mid: Pt } | null>(null);
  const tap = useRef<{ at: number; x: number; y: number; ok: boolean } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fullUrl = box.backFullUrl && full !== 'failed' ? box.backFullUrl : undefined;
  const lowUrl = box.backUrl && !lowFailed ? box.backUrl : undefined;
  const made = !lowUrl && !fullUrl;

  // Vue bornée : à l'échelle s, le dos ajusté (contain) ne peut pas laisser de vide de son côté.
  const bounded = (v: View): View => {
    const el = stageRef.current;
    const W = el?.clientWidth ?? 0;
    const H = el?.clientHeight ?? 0;
    const s = clamp(v.s, MAGNIFIER_MIN, MAGNIFIER_MAX);
    const cw = W > 0 && H > 0 ? Math.min(W, H * ratio) : 0;
    const ch = W > 0 && H > 0 ? Math.min(H, W / ratio) : 0;
    const mx = Math.max(0, (s * cw - W) / 2);
    const my = Math.max(0, (s * ch - H) / 2);
    return { s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
  };
  const apply = (v: View) => setView(bounded(v));

  // Centre de la zone, à l'écran.
  const centre = (): Pt => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
  };
  const pair = (): [Pt, Pt] | null => {
    const ps = [...pointers.current.values()];
    return ps.length >= 2 ? [ps[0]!, ps[1]!] : null;
  };
  const startPinch = () => {
    const p = pair();
    if (!p) { pinchStart.current = null; return; }
    pinchStart.current = { view: viewRef.current, dist: Math.max(1, Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y)), mid: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointeur déjà relâché */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) tap.current = { at: Date.now(), x: e.clientX, y: e.clientY, ok: true };
    else { if (tap.current) tap.current.ok = false; startPinch(); }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    e.stopPropagation();
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (tap.current && Math.hypot(cur.x - tap.current.x, cur.y - tap.current.y) > TAP_PX) tap.current.ok = false;
    const p = pair();
    const ps = pinchStart.current;
    if (p && ps) {
      // Zoom autour du point entre les doigts, et déplacement de ce point.
      const dist = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const s = clamp(ps.view.s * (dist / ps.dist), MAGNIFIER_MIN, MAGNIFIER_MAX);
      const k = s / ps.view.s;
      const c = centre();
      const f = toLayer({ x: ps.mid.x - c.x, y: ps.mid.y - c.y });
      const m = toLayer({ x: mid.x - ps.mid.x, y: mid.y - ps.mid.y });
      apply({ s, x: f.x - (f.x - ps.view.x) * k + m.x, y: f.y - (f.y - ps.view.y) * k + m.y });
      return;
    }
    if (pointers.current.size === 1 && viewRef.current.s > MAGNIFIER_MIN) {
      const d = toLayer({ x: cur.x - prev.x, y: cur.y - prev.y });
      apply({ ...viewRef.current, x: viewRef.current.x + d.x, y: viewRef.current.y + d.y });
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    e.stopPropagation();
    if (pointers.current.size >= 2) { startPinch(); return; }
    pinchStart.current = null;
    if (pointers.current.size > 0) return;
    const tp = tap.current;
    tap.current = null;
    const now = Date.now();
    if (!tp || !tp.ok || now - tp.at > TAP_MS) { lastTap.current = null; return; }
    const lt = lastTap.current;
    if (lt && now - lt.at <= TAP_MS && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) <= TAP_PX * 2) {
      lastTap.current = null;
      setView({ s: 1, x: 0, y: 0 });
      return;
    }
    lastTap.current = { at: now, x: e.clientX, y: e.clientY };
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = viewRef.current;
    const s = clamp(v.s * Math.exp(-e.deltaY * 0.0015), MAGNIFIER_MIN, MAGNIFIER_MAX);
    apply({ s, x: v.x * (s / v.s), y: v.y * (s / v.s) });
  };

  const img = (which: 'low' | 'full', src: string, style: CSSProperties) => (
    <img data-magnifier-img={which} src={src} alt={which === 'full' ? `Dos de la boîte : ${box.title}` : ''} draggable={false} {...NO_REFERRER}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth > 0 && el.naturalHeight > 0) setRatio(el.naturalWidth / el.naturalHeight);
        if (which === 'full') setFull('ready');
      }}
      onError={() => (which === 'full' ? setFull('failed') : setLowFailed(true))}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none', ...style }} />
  );

  return (
    <div data-back-magnifier="" role="dialog" aria-label={`Dos de la boîte : ${box.title}`}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(20,13,9,.92)', overflow: 'hidden' }}>
      <div ref={stageRef} data-magnifier-stage="" data-scale={String(view.s)} data-tx={String(view.x)} data-ty={String(view.y)}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
        // touch-action: none : le WebView laisse le pincement et le glissé à la loupe (pas de zoom ni de défilement de la page).
        style={{ position: 'absolute', inset: 8, touchAction: 'none', cursor: view.s > 1 ? 'grab' : 'zoom-in', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: '50% 50%', willChange: 'transform' }}>
          {made
            ? (
              <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
                <MadeBack box={box} />
              </svg>
            )
            : <>
                {lowUrl && img('low', lowUrl, {})}
                {/* L'originale par-dessus la medium, visible une fois chargée (sans medium : visible tout de suite). */}
                {fullUrl && img('full', fullUrl, { opacity: full === 'ready' || !lowUrl ? 1 : 0 })}
              </>}
        </div>
      </div>
      <button type="button" data-action="close-magnifier" aria-label="Fermer la loupe" title="Fermer la loupe" onClick={onClose} style={BUTTON}>✕</button>
    </div>
  );
}
