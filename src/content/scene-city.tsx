import { useMemo, type ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { doorsFor } from '../core/library/city/doors';
import { FAR_WINDOW, cityFacades } from '../core/library/city/facades';
import { STREET_SCALE, cityMetrics } from '../core/library/city/metrics';
import { mixHex } from '../core/library/sky';
import { EntranceSprite, entranceLeft } from './city-sprites';
import type { SceneBodyProps } from './scene-panorama';
import { ShopFront } from './shop-sprites';
import { ShopInterior, sliceCount } from './shop-interiors';
import { furnitureAt } from '../core/library/city/shops/view';
import { useStreetShops } from './use-street-shops';

// Lumière des fenêtres du fond par rapport au premier plan (dissipée par la distance).
const FAR_LIGHT = 0.5;

// Les lampadaires ne sont pas ici : ils sont dans le calque animé, devant les passants (StreetLamps, city-life.tsx).
// Locaux commerciaux (vague 1b-iv-a) : devanture et intérieur dans le décor fixe ; clients et équipe du chantier dans le
// calque animé (city-shops-life.tsx). Sans `city.shops`, aucun commerce n'est dessiné.
export function CityScene({ width, height, sky, minutes, seed, gloom = false, city }: SceneBodyProps): ReactElement {
  const metrics = cityMetrics(height);
  const { ground, unit } = metrics;
  const far = mixHex('#232B5C', '#9FB4C8', sky.daylight);
  const near = mixHex('#141A3E', '#7C8FA3', sky.daylight);
  const street = mixHex('#2A2D4A', '#B7B2A6', sky.daylight);
  const walk = mixHex('#3A3D5E', '#CFC9BB', sky.daylight);
  // Ciel sombre (gros nuages) : on allume en plein jour, et les lumières se voient.
  const dim = Math.max(1 - sky.daylight, gloom ? 0.7 : 0);
  // Immeubles étirés (proportions avec les passants), fenêtres d'origine en haut et étages ajoutés : voir facades.ts.
  const buildings = useMemo(() => cityFacades(width, height, seed), [width, height, seed]);
  const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
  // Hall d'entrée éclairé la nuit (un peu plus d'une entrée sur deux).
  const dark = sky.daylight < 0.45;
  const lane = mixHex('#8A8C9E', '#F2EEE2', sky.daylight);
  const { frames, views, street: slotDays } = useStreetShops(width, height, seed, city);
  return (
    <g data-scene-body>
      {buildings.filter((b) => b.far).map((b, i) => (
        <g key={`f${i}`}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={far} />
          {/* Fenêtres du fond : même activité qu'au premier plan, mais petites, froides et dissipées par la distance. */}
          {b.farWindows.map((win, j) => {
            const lit = lampLit(win.u, minutes) || (gloom && win.u < 0.55);
            return (
              <rect
                key={j}
                data-far-lamp=""
                data-lit={lit ? 'true' : 'false'}
                x={win.x}
                y={win.y}
                width={FAR_WINDOW.w}
                height={FAR_WINDOW.h}
                fill={win.blue ? '#B8D0FF' : '#FFE3A0'}
                opacity={lit ? dim * FAR_LIGHT : 0}
                style={{ transition: 'opacity 4s ease' }}
              />
            );
          })}
        </g>
      ))}
      {buildings.filter((b) => !b.far).map((b, i) => (
        <g key={`n${i}`}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={near} />
          {b.lamps.map((lamp, j) => {
            const lit = lampLit(lamp.u, minutes) || (gloom && lamp.u < 0.55);
            return (
              <rect
                key={j}
                data-lamp=""
                data-lit={lit ? 'true' : 'false'}
                x={lamp.x}
                y={lamp.y}
                width={5}
                height={7}
                fill={lamp.blue ? '#9FC4FF' : '#FFD27A'}
                opacity={lit ? dim : 0}
                style={{ transition: 'opacity 4s ease' }}
              />
            );
          })}
        </g>
      ))}
      {/* Locaux : la vitrine montre l'intérieur (rogné par le <svg> imbriqué de ShopFront) ; la nuit, seuls les commerces
          ouverts sont éclairés. Jour de changement : le mobilier de l'ancien commerce sort par tranches, puis celui du nouveau
          rentre (furnitureAt) ; il reste en place pendant le chantier d'enseigne. Personnel, premier plan de l'intérieur ouvert
          (devant le personnel) et rideau roulant sont dans le calque animé (StaffLayer, city-shops-life.tsx). */}
      {views.map((view, i) => {
        const frame = frames.get(view.slot.id)!;
        const open = view.phase === 'open';
        const w = frame.window.w;
        const n = sliceCount(w);
        const change = slotDays[i]?.change ?? null;
        const moving = view.interior ? null : furnitureAt(view, n);
        const type = moving ? (moving.from === 'before' ? change?.before?.type : change?.after?.type) ?? null : null;
        return (
          <ShopFront key={view.slot.id} frame={frame} view={view} sky={sky} lit={dark && open} shutter={false}>
            {view.interior && <ShopInterior type={view.interior} w={w} h={frame.window.h} sky={sky} lit={dark && open} front={!open} />}
            {moving && type && (
              <ShopInterior type={type} w={w} h={frame.window.h} sky={sky} lit={false} slices={{ shown: moving.shown, n, doorRight: view.slot.doorSide === 'left' }} />
            )}
          </ShopFront>
        );
      })}
      {/* Trottoir contre les immeubles, chaussée à deux files (fond vers la gauche, premier plan vers la droite), trottoir d'en face. */}
      <rect x={0} y={ground} width={width} height={height - ground} fill={street} />
      <rect x={0} y={ground} width={width} height={metrics.curb - ground} fill={walk} />
      <rect x={0} y={metrics.curb - 1} width={width} height={2} fill="#00000033" />
      <rect data-far-sidewalk="" x={0} y={metrics.farSide} width={width} height={height - metrics.farSide} fill={walk} />
      <rect x={0} y={metrics.farSide} width={width} height={2} fill="#00000033" />
      <line
        data-lane-mark=""
        x1={0}
        x2={width}
        y1={(metrics.laneY.far + metrics.laneY.near) / 2 - 8 * unit}
        y2={(metrics.laneY.far + metrics.laneY.near) / 2 - 8 * unit}
        stroke={lane}
        strokeWidth={1.6 * unit}
        strokeDasharray={`${14 * unit} ${12 * unit}`}
        opacity={0.8}
      />
      <rect x={0} y={ground - 2} width={width} height={3} fill="#00000022" />
      {doors.map((door) => (
        <g
          key={door.id}
          data-door={door.id}
          transform={`translate(${entranceLeft(door.x, unit).toFixed(1)} ${metrics.doorY.toFixed(1)}) scale(${(unit * STREET_SCALE.entranceX).toFixed(3)} ${(unit * STREET_SCALE.entranceY).toFixed(3)})`}
        >
          <EntranceSprite variant={door.variant} hallLit={dark && door.hallU < 0.6} sky={sky} />
        </g>
      ))}
    </g>
  );
}
