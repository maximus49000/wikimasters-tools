// Fable n'est pas passé : à reprendre lors d'un rattrapage Fable.
//
// Vol du disque : il sort du plateau du boîtier ouvert (qui reste en grand, centré) et file jusqu'au poste, par-dessus le boîtier,
// en rapetissant jusqu'à la taille du disque posé. Trajectoire courbe : un calque glisse en largeur, l'autre en hauteur avec une
// courbe qui soulève d'abord le disque hors du plateau (il grossit un instant, plus près de l'œil) avant de redescendre ; le disque
// tourne sur lui-même pendant le vol (reflet asymétrique fixe : la rotation se voit). Même dessin que le disque posé sur le poste (HifiDisc), style cellulo.
// Une cartouche (jeu Switch, DS…) fait le même trajet sans tourner, et se pose couchée.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { Box } from '../../core/library/zoom-target';
import { HIFI_CART, HifiDisc, type DiscKind } from '../hifi/hifi-art';

export const DISC_FLIGHT_MS = 900;

// Carré de vol d'un support : le disque remplit le carré -60…60 du dessin ; la cartouche n'en occupe que la hauteur HIFI_CART.h,
// d'où un carré agrandi autour d'elle pour qu'au départ le dessin recouvre la cartouche du plateau.
export function flightBoxOf(kind: DiscKind, support: Box): Box {
  if (kind !== 'cart') return support;
  const side = (support.h * 120) / HIFI_CART.h;
  return { x: support.x + support.w / 2 - side / 2, y: support.y + support.h / 2 - side / 2, w: side, h: side };
}

type Props = {
  // Rectangles dans le repère du calque : le disque dans le plateau, le disque posé sur le poste.
  from: Box;
  to: Box;
  cover: string | null;
  color: string;
  kind?: DiscKind;
  // Mouvement réduit : pas de vol, le disque est posé aussitôt.
  reduced: boolean;
  onLanded(): void;
};

const round = (n: number): number => Math.round(n * 100) / 100;

export function DiscFlight({ from, to, cover, color, kind = 'cd', reduced, onLanded }: Props): ReactElement | null {
  const landed = useRef(onLanded);
  landed.current = onLanded;
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (reduced) { landed.current(); return; }
    // Deux images : le départ est peint avant que la transition ne parte.
    let raf = window.requestAnimationFrame(() => { raf = window.requestAnimationFrame(() => setGo(true)); });
    const timer = window.setTimeout(() => landed.current(), DISC_FLIGHT_MS);
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (reduced) return null;

  const dx = round(to.x + to.w / 2 - (from.x + from.w / 2));
  const dy = round(to.y + to.h / 2 - (from.y + from.h / 2));
  const s = Math.round((Math.min(to.w, to.h) / Math.max(1, Math.min(from.w, from.h))) * 10000) / 10000;
  const outer: CSSProperties = {
    position: 'absolute', left: round(from.x), top: round(from.y), width: round(from.w), height: round(from.h), zIndex: 5, pointerEvents: 'none',
    transform: go ? `translateX(${dx}px)` : 'none',
    transition: `transform ${DISC_FLIGHT_MS}ms cubic-bezier(.45,.05,.55,.95)`,
  };
  const inner: CSSProperties = {
    position: 'absolute', inset: 0, transformOrigin: 'center',
    transform: go ? `translateY(${dy}px) scale(${s})` : 'none',
    transition: `transform ${DISC_FLIGHT_MS}ms cubic-bezier(.3,-.45,.6,1)`,
  };
  return (
    <div data-disc-flight="" data-kind={kind} aria-hidden="true" style={outer}>
      <div data-disc-flight-y="" style={inner}>
        {/* Ombre nette décalée du disque soulevé ; seul le calque intérieur du disque tourne (reflet et ombre fixes). */}
        <svg viewBox="-60 -60 120 120" width="100%" height="100%" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(6px 9px 0 rgba(28,18,12,.3))' }}>
          <HifiDisc cover={cover} color={color} spinning kind={kind} />
        </svg>
      </div>
    </div>
  );
}
