import { useId, useMemo, type ReactElement } from 'react';
import { nightness, roomLit, roomTone, windowLit, type WindowDay } from '../core/library/city/window-lights';
import { FAR_WINDOW, GROUND_FLOOR, type Facade, type FarWindow } from '../core/library/city/facades';
import { PODIUM_H } from '../core/library/scene-world';
import type { FacadeWindow, Home, Level } from '../core/library/city/facade-layout';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { Rgb } from '../core/library/paint/color';
import type { LightTone } from '../core/library/city/schedules';
import { GlowDefs, LitWindow, NightGlass, glowBound, glowId, glowSize } from './ghibli-window-art';
import { lifeStates, type SceneLife } from './use-scene-life';

// Calque des fenêtres de la ville peinte (vague Ghibli), hors filtre d'étalonnage, au-dessus des tranches du décor. Ordre :
// 1. lumières du mur du fond (déjà privées de celles que cache le premier plan, facades.ts) ;
// 2. vitres éteintes de nuit, un groupe par immeuble proche puis par socle de jumeaux (opacité = obscurité du ciel, jamais
//    le mauvais temps : un ciel couvert à midi ne bleuit pas les vitres) ;
// 3. fenêtres allumables (logements), une par fenêtre. Avec `life` (use-scene-life.ts) : allumée si la pièce de la fenêtre
//    l'est dans l'état du logement à la minute (homeState, présence des habitants) et qu'il fait nuit (nightness > 0 : pas
//    de lumière dessinée de jour), teinte de la pièce ; rideaux et voilages laissés au calque de la vie aux fenêtres. Sans
//    `life` (aperçus) : allumage du chantier 1, par logement (seuil commun), pièce principale seule selon l'heure
//    (city/window-lights.ts), teinte du logement et télé le soir.
// Rien n'apparaît ni ne disparaît sur place : tous les nœuds restent montés, seule l'opacité bascule (fondu de 4 s). La cage
// d'escalier (minuterie des halls) est dans le calque des halls ; l'entresol ne s'allume jamais.
const FADE = 'opacity 4s ease';

function FarLight({ win, lit, dim, farLight }: { win: FarWindow; lit: boolean; dim: number; farLight: number }): ReactElement {
  return <rect data-far-lamp="" data-lit={lit ? 'true' : 'false'} x={win.x} y={win.y} width={FAR_WINDOW.w} height={FAR_WINDOW.h} fill={win.blue ? '#C4D8FF' : '#FFDFA0'} opacity={lit ? dim * farLight : 0} style={{ transition: FADE }} />;
}

const hex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Fenêtre allumable et ce qu'il faut pour la dessiner : logement, étage (null : lucarne, socle), x de la façade (barreaux
// des balcons filants), hauteur bornée de la lueur (`dMax`, undefined : lueur entière), groupe du logement.
type Slot = { win: FacadeWindow; home: Home; level: Level | null; facadeX: number | undefined; dMax: number | undefined; group: string };

// Plancher sous lequel la lueur ne retombe pas (sur le bandeau d'enseigne des boutiques) : étage le plus bas de la tour
// (index 0 : juste au-dessus du rez-de-chaussée, ou l'entresol jamais allumé) ; haut du rez-de-chaussée sous le socle des
// jumeaux (vitre centrée dans la bande de PODIUM_H − GROUND_FLOOR, podiumLayout). Ailleurs aucun : la lueur des étages
// intermédiaires passe le bandeau (maquette).
function floorOf(win: FacadeWindow, level: Level | null, podium: boolean): number | null {
  if (podium) return win.y + win.h + (PODIUM_H - GROUND_FLOOR - win.h) / 2;
  return win.level === 0 && level ? level.y + level.h : null;
}

function slotsOf(buildings: readonly Facade[]): Slot[] {
  const out: Slot[] = [];
  buildings.forEach((b, i) => {
    if (b.far) return;
    // Les fenêtres du socle suivent celles de la tour dans `lamps` ; leur `level` est celui du socle, pas de la tour.
    const tower = b.layout?.windows.length ?? 0;
    b.lamps.forEach((win, j) => {
      if (win.home < 0) return;
      const level = j < tower && win.level >= 0 ? (b.layout!.levels[win.level] ?? null) : null;
      const dMax = glowBound(win.y, win.h, floorOf(win, level, j >= tower));
      out.push({ win, home: b.homes[win.home]!, level, facadeX: b.layout?.x, dMax, group: `${i}:${win.home}` });
    });
  });
  return out;
}

// `plan` : plan peint de la ville (mur recoloré de la 2e tour d'un socle, pierre du socle) ; sans plan, mur de la mise en page.
// `life` : vie des logements (mêmes `buildings`) ; null ou absent : allumage du chantier 1.
export function GhibliWindows({ buildings, minutes, day, daylight, gloom, dim, farLight, plan, life }: { buildings: Facade[]; minutes: number; day: WindowDay | undefined; daylight: number; gloom: boolean; dim: number; farLight: number; plan?: Pick<CityPaintPlan, 'buildings' | 'podiums'> | null; life?: SceneLife | null }): ReactElement {
  const prefix = `w${useId().replace(/:/g, '')}`;
  const slots = useMemo(() => slotsOf(buildings), [buildings]);
  // Une lueur par taille de fenêtre (arrondie au demi-pixel) et hauteur bornée, partagée par <use>.
  const sizes = useMemo(() => {
    const seen = new Map<string, { w: number; h: number; dMax?: number }>();
    for (const s of slots) seen.set(glowId('', s.win.w, s.win.h, s.dMax), glowSize(s.win.w, s.win.h, s.dMax));
    return [...seen.values()];
  }, [slots]);
  const panes = useMemo(() => {
    const towers = buildings.flatMap((b, i) => (b.far || !b.layout ? [] : [{ key: `g${i}`, layout: b.layout, wall: plan?.buildings[i]?.layout?.wall ?? b.layout.wall }]));
    const podiums = buildings.flatMap((b) => {
      if (b.far || !b.podiumLayout || !b.podium) return [];
      const stone = plan?.podiums.find((p) => p.id === b.podium!.id)?.stone;
      return [{ key: `p${b.podium.id}`, layout: { windows: b.podiumLayout.windows, dormers: [], homes: b.podiumLayout.homes }, wall: stone ? hex(stone) : (b.layout?.wall ?? '#EDE2C8') }];
    });
    return [...towers, ...podiums];
  }, [buildings, plan]);
  const glass = Number(nightness(daylight).toFixed(3));
  // État de chaque logement à la minute de la scène (recalculé quand elle change).
  const states = useMemo(() => (life ? lifeStates(life, minutes) : null), [life, minutes]);
  const night = nightness(daylight) > 0;
  return (
    <g data-ghibli-windows="">
      <GlowDefs prefix={prefix} sizes={sizes} />
      {buildings.map((b, i) => b.farWindows.map((win, j) => <FarLight key={`f${i}-${j}`} win={win} lit={windowLit(win.u, minutes, day, daylight, gloom)} dim={dim} farLight={farLight} />))}
      {panes.map((p) => <NightGlass key={p.key} layout={p.layout} wall={p.wall} opacity={glass} curtains={!life} />)}
      {slots.map(({ win, home, level, facadeX, dMax, group }, k) => {
        let lit: boolean;
        let tone: LightTone;
        const st = states?.get(group);
        const room = st ? life!.byFacadeHome.get(group)!.roomOfWindow.get(win.bay) : undefined;
        if (st && room) {
          lit = night && !!st.lit[room];
          tone = st.tone[room] ?? home.tone;
        } else {
          lit = roomLit(win, minutes, day, daylight, gloom);
          tone = roomTone(home, win.main, minutes);
        }
        return (
          <g key={k} data-lamp="" data-lit={lit ? 'true' : 'false'} data-home={group} data-main={win.main ? 'true' : 'false'} opacity={lit ? dim : 0} style={{ transition: FADE }}>
            <LitWindow win={win} home={home} level={level} facadeX={facadeX} tone={tone} glow={glowId(prefix, win.w, win.h, dMax)} curtains={!life} />
          </g>
        );
      })}
    </g>
  );
}
