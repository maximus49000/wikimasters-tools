// src/content/vehicle/exhaust-puffs.tsx
import type { ReactElement } from 'react';
import { puffView, type PuffPool } from '../../core/library/city/traffic/exhaust';

// Fumée d'échappement d'une voie (spec véhicules §3) : un pool FIXE de bouffées (core/…/exhaust.ts), chacune dessinée par
// deux cercles créés une fois (corps, puis lumière en haut à gauche) ; la boucle de la voie n'écrit que cx, cy, r, fill et
// opacity. Coordonnées du monde (groupe de la voie). Les bouffées sombres (accélération) sont grises, les autres pâles.
export function ExhaustPuffs({ pool }: { pool: PuffPool }): ReactElement {
  return (
    <g data-exhaust="">
      {pool.puffs.map((_, i) => (
        <g key={i}>
          <circle cx={0} cy={0} r={0} opacity={0} />
          <circle cx={0} cy={0} r={0} opacity={0} />
        </g>
      ))}
    </g>
  );
}

export function placePuffs(el: Element | null, pool: PuffPool, t: number): void {
  if (!el) return;
  const groups = el.children;
  for (let i = 0; i < pool.puffs.length && i < groups.length; i++) {
    const g = groups[i]!;
    const body = g.firstElementChild!;
    const lit = g.lastElementChild!;
    const v = puffView(pool.puffs[i]!, t);
    if (!v) {
      if (body.getAttribute('opacity') !== '0') {
        body.setAttribute('opacity', '0');
        lit.setAttribute('opacity', '0');
      }
      continue;
    }
    const dark = pool.puffs[i]!.dark;
    body.setAttribute('cx', v.cx.toFixed(1));
    body.setAttribute('cy', v.cy.toFixed(1));
    body.setAttribute('r', v.r.toFixed(2));
    body.setAttribute('fill', dark ? '#6a6670' : '#d9d6e4');
    body.setAttribute('opacity', v.alpha.toFixed(3));
    lit.setAttribute('cx', (v.cx - v.r * 0.3).toFixed(1));
    lit.setAttribute('cy', (v.cy - v.r * 0.3).toFixed(1));
    lit.setAttribute('r', (v.r * 0.55).toFixed(2));
    lit.setAttribute('fill', dark ? '#8e8a94' : '#f4f2f8');
    lit.setAttribute('opacity', (v.alpha * 0.6).toFixed(3));
  }
}
