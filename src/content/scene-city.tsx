import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { citySkyline } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

export function CityScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.78;
  const far = mixHex('#232B5C', '#9FB4C8', sky.daylight);
  const near = mixHex('#141A3E', '#7C8FA3', sky.daylight);
  const street = mixHex('#2A2D4A', '#B7B2A6', sky.daylight);
  const walk = mixHex('#3A3D5E', '#CFC9BB', sky.daylight);
  const dim = 1 - sky.daylight;
  const buildings = citySkyline(width, height, seed);
  return (
    <g data-scene-body>
      {buildings.filter((b) => b.far).map((b, i) => (
        <rect key={`f${i}`} x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={far} />
      ))}
      {buildings.filter((b) => !b.far).map((b, i) => (
        <g key={`n${i}`}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={near} />
          {b.lamps.map((lamp, j) => {
            const lit = lampLit(lamp.u, minutes);
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
      <rect x={0} y={ground} width={width} height={height - ground} fill={street} />
      <rect x={0} y={ground} width={width} height={height * 0.07} fill={walk} />
      <rect x={0} y={ground - 2} width={width} height={3} fill="#00000022" />
    </g>
  );
}
