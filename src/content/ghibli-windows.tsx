import type { ReactElement } from 'react';
import { windowLit, type WindowDay } from '../core/library/city/window-lights';
import { FAR_WINDOW, type Facade, type FarWindow } from '../core/library/city/facades';
import type { Lamp } from '../core/library/scene-world';

// Fenêtres allumées de la ville peinte (vague Ghibli, décor cellulo), hors filtre d'étalonnage : teinte variée par fenêtre
// (bleu froid, jaune, orange, crème), halo débordant à bord net, rideau en contre-jour, silhouette sombre dans certaines,
// trait encré et meneau. Mêmes positions et même logique d'allumage que la ville classique (city/window-lights.ts).
const INK = '#2A1A18';

export const windowTone = (lamp: Pick<Lamp, 'u' | 'blue'>): string => (lamp.blue ? '#9CC4FF' : lamp.u < 0.38 ? '#FFD86A' : lamp.u < 0.7 ? '#FFB048' : '#FFF0C0');
// Silhouette (tête + buste) dans ~12 % des fenêtres ; rideau dans la moitié des autres (tirages indépendants de l'allumage).
export const windowFigure = (lamp: Pick<Lamp, 'u'>): boolean => (lamp.u * 17) % 1 < 0.12;
export const windowCurtain = (lamp: Pick<Lamp, 'u'>): boolean => (lamp.u * 31) % 1 < 0.5;

function NearWindow({ lamp, lit, dim }: { lamp: Lamp; lit: boolean; dim: number }): ReactElement {
  const tone = windowTone(lamp);
  const { x, y } = lamp;
  return (
    <g data-lamp="" data-lit={lit ? 'true' : 'false'} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }}>
      <rect x={x - 2.5} y={y - 2.5} width={10} height={12} fill={tone} opacity={0.22} />
      <rect x={x} y={y} width={5} height={7} fill={tone} />
      {windowFigure(lamp) && (
        <g data-figure="" fill="#3A2018">
          <circle cx={x + 2.5} cy={y + 3.2} r={1.1} />
          <rect x={x + 1.2} y={y + 4.2} width={2.8} height={2.8} />
        </g>
      )}
      {windowCurtain(lamp) && <rect x={x} y={y} width={1.8} height={7} fill="#FFE8B8" />}
      <path d={`M${x} ${y}h5v7h-5zM${x + 2.5} ${y}v7`} fill="none" stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

function FarLight({ win, lit, dim, farLight }: { win: FarWindow; lit: boolean; dim: number; farLight: number }): ReactElement {
  return <rect data-far-lamp="" data-lit={lit ? 'true' : 'false'} x={win.x} y={win.y} width={FAR_WINDOW.w} height={FAR_WINDOW.h} fill={win.blue ? '#C4D8FF' : '#FFDFA0'} opacity={lit ? dim * farLight : 0} style={{ transition: 'opacity 4s ease' }} />;
}

export function GhibliWindows({ buildings, minutes, day, daylight, gloom, dim, farLight }: { buildings: Facade[]; minutes: number; day: WindowDay | undefined; daylight: number; gloom: boolean; dim: number; farLight: number }): ReactElement {
  return (
    <g data-ghibli-windows="">
      {buildings.map((b, i) =>
        b.far
          ? b.farWindows.map((win, j) => <FarLight key={`f${i}-${j}`} win={win} lit={windowLit(win.u, minutes, day, daylight, gloom)} dim={dim} farLight={farLight} />)
          : b.lamps.map((lamp, j) => <NearWindow key={`n${i}-${j}`} lamp={lamp} lit={windowLit(lamp.u, minutes, day, daylight, gloom)} dim={dim} />),
      )}
    </g>
  );
}
