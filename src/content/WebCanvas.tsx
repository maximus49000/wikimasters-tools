import { useCallback, useEffect, useRef, type HTMLAttributes, type MutableRefObject } from 'react';
import type { Focus } from '../core/links/web-graph';
import type { Point } from '../core/links/web-layout';
import { pickAt, type Level, type Scene } from '../core/links/web-scene';
import type { Transform } from '../core/links/web-view';
import { drawScene } from './web-draw';

// Au plus ce nombre d'images de cartes gardées en mémoire (au-delà, on repart de zéro).
const MAX_IMAGES = 600;

type Props = {
  scene: Scene;
  focus: Focus | null;
  picked: string | null;
  route: readonly (readonly [Point, Point])[];
  // L'image d'une carte (celle du jeu, sinon l'image de remplacement déjà trouvée) ; chargée seulement quand la carte est dessinée en grand.
  imageOf: (slug: string) => string | undefined;
  size: { width: number; height: number };
  // Le cadrage validé par React ; pendant un geste, `drawRef` reçoit le cadrage « vivant ».
  transform: Transform;
  drawRef: MutableRefObject<((t: Transform) => void) | null>;
  liveTransform: () => Transform;
  dragged: () => boolean;
  onCard: (slug: string) => void;
  onHub: (slug: string) => void;
  onBackground: () => void;
  // Les gestes (glisser, pincer) sont ceux du panneau, communs au SVG et au canvas.
  surface: Pick<HTMLAttributes<HTMLCanvasElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave'>;
};

export function WebCanvas({ scene, focus, picked, route, imageOf, size, transform, drawRef, liveTransform, dragged, onCard, onHub, onBackground, surface }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Le niveau de détail du dernier dessin : toucher la toile cherche dans ce que l'on voit.
  const level = useRef<Level>('clusters');
  const images = useRef(new Map<string, HTMLImageElement>());
  const colors = useRef({ ink: '#e6edf3', paper: '#0d1117' });
  const latest = useRef({ scene, focus, picked, route, imageOf, size });
  latest.current = { scene, focus, picked, route, imageOf, size };
  // Redessiner quand une image arrive (avec le cadrage du moment, même pendant un geste).
  const again = useRef<() => void>(() => undefined);

  const paint = useCallback((t: Transform, refreshColors = false) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    // Pas de contexte 2D (jsdom, ou navigateur à court de mémoire) : rien à dessiner.
    if (!canvas || !ctx) return;
    const { scene: s, focus: f, picked: p, route: r, imageOf: art, size: area } = latest.current;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(area.width * ratio);
    const h = Math.round(area.height * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (refreshColors) {
      const style = getComputedStyle(canvas);
      colors.current = { ink: style.color, paper: style.backgroundColor };
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const result = drawScene(ctx, s, t, area, {
      focusHub: f?.kind === 'hub' ? (s.hubIndex.get(f.slug) ?? -1) : -1,
      pickedCard: p ? (s.cardIndex.get(p) ?? -1) : -1,
      route: r,
      ink: colors.current.ink,
      paper: colors.current.paper,
      image: (card) => {
        const url = art(s.slugs[card]!);
        if (!url) return null;
        let image = images.current.get(url);
        if (!image) {
          if (images.current.size >= MAX_IMAGES) images.current.clear();
          image = new Image();
          image.onload = () => again.current();
          image.src = url;
          images.current.set(url, image);
        }
        return image.complete && image.naturalWidth > 0 ? image : null;
      },
    });
    level.current = result.level;
  }, []);
  again.current = () => paint(liveTransform());

  useEffect(() => {
    drawRef.current = (t) => paint(t);
    return () => {
      drawRef.current = null;
    };
  }, [paint, drawRef]);
  useEffect(() => {
    paint(transform, true);
  }, [paint, scene, focus, picked, route, imageOf, size, transform]);

  const onClick = (event: { clientX: number; clientY: number }) => {
    if (dragged()) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = pickAt(scene, liveTransform(), level.current, event.clientX - rect.left, event.clientY - rect.top);
    if (hit?.kind === 'hub') onHub(hit.slug);
    else if (hit?.kind === 'card') onCard(hit.slug);
    else onBackground();
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Toile des cartes de la Collection"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'grab',
        color: 'var(--color-foreground, #e6edf3)',
        background: 'var(--color-surface, #0d1117)',
      }}
      onClick={onClick}
      {...surface}
    />
  );
}
