import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { doorsFor } from '../core/library/city/doors';
import { lampLit as streetLampLit, lampsFor } from '../core/library/city/lamps';
import { cityMetrics } from '../core/library/city/metrics';
import { citySkyline } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import { EntranceSprite, LampSprite, entranceLeft } from './city-sprites';
import type { SceneBodyProps } from './scene-panorama';

export function CityScene({ width, height, sky, minutes, seed, gloom = false, forcedNight = false }: SceneBodyProps): ReactElement {
  const metrics = cityMetrics(height);
  const { ground, unit } = metrics;
  const sidewalk = height * 0.07;
  const far = mixHex('#232B5C', '#9FB4C8', sky.daylight);
  const near = mixHex('#141A3E', '#7C8FA3', sky.daylight);
  const street = mixHex('#2A2D4A', '#B7B2A6', sky.daylight);
  const walk = mixHex('#3A3D5E', '#CFC9BB', sky.daylight);
  // Ciel sombre (gros nuages) : on allume en plein jour, et les lumières se voient.
  const dim = Math.max(1 - sky.daylight, gloom ? 0.7 : 0);
  const buildings = citySkyline(width, height, seed);
  const doors = doorsFor(width, height, seed);
  const lamps = lampsFor(width, seed);
  // Hall d'entrée éclairé la nuit (un peu plus d'une entrée sur deux).
  const dark = sky.daylight < 0.45;
  const lane = mixHex('#8A8C9E', '#F2EEE2', sky.daylight);
  return (
    <g data-scene-body>
      {buildings.filter((b) => b.far).map((b, i) => (
        <rect key={`f${i}`} x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={far} />
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
      {/* Trottoir contre les immeubles, puis la chaussée à deux files (fond vers la gauche, premier plan vers la droite). */}
      <rect x={0} y={ground} width={width} height={height - ground} fill={street} />
      <rect x={0} y={ground} width={width} height={sidewalk} fill={walk} />
      <rect x={0} y={ground + sidewalk - 1} width={width} height={2} fill="#00000033" />
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
        <g key={door.id} data-door={door.id} transform={`translate(${entranceLeft(door.x, unit).toFixed(1)} ${metrics.doorY.toFixed(1)}) scale(${unit})`}>
          <EntranceSprite variant={door.variant} hallLit={dark && door.hallU < 0.6} sky={sky} />
        </g>
      ))}
      {lamps.map((lamp) => {
        const lit = streetLampLit(lamp, minutes, sky.daylight, forcedNight);
        return (
          <g key={lamp.id} data-street-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} transform={`translate(${lamp.x} ${(ground + sidewalk).toFixed(1)}) scale(${unit})`}>
            <LampSprite lit={lit} />
          </g>
        );
      })}
    </g>
  );
}
