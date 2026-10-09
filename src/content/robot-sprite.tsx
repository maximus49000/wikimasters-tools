import type { ReactElement } from 'react';
import type { RobotCoat } from '../core/library/library-types';
import type { Pose } from '../core/library/pets/runner';

export type RobotColors = { body: string; belly: string; dark: string };

export const ROBOT_COAT_COLORS: Record<RobotCoat, RobotColors> = {
  white: { body: '#ECEFF3', belly: '#FFFFFF', dark: '#AEB5BF' },
  blue: { body: '#4A86D8', belly: '#8DB6EE', dark: '#2D5CA0' },
  yellow: { body: '#E9BE2F', belly: '#F6DC85', dark: '#B08A0F' },
  red: { body: '#D2493F', belly: '#EC8F87', dark: '#97271F' },
  graphite: { body: '#4A4F59', belly: '#6C727E', dark: '#2A2D34' },
  mint: { body: '#5CC9A7', belly: '#A0E3CD', dark: '#34987B' },
};
export const ROBOT_COAT_LABELS: Record<RobotCoat, string> = { white: 'Blanc', blue: 'Bleu', yellow: 'Jaune', red: 'Rouge', graphite: 'Graphite', mint: 'Menthe' };

type Eyes = 'normal' | 'heart' | 'warn' | 'dash' | 'scan';
type Led = 'orange' | 'green' | null;

const EYE = '#7FF0FF';
const HEART = 'M0 2 C-3.4 -0.6 -2.6 -3.4 0 -1.8 C2.6 -3.4 3.4 -0.6 0 2Z';

function eyesOf(kind: Eyes, still: boolean): ReactElement {
  switch (kind) {
    case 'heart':
      return (
        <g data-robot-eyes="heart">
          <path d={HEART} transform="translate(-4.2 -17.5)" fill="#FF6A8A" />
          <path d={HEART} transform="translate(4.2 -17.5)" fill="#FF6A8A" />
        </g>
      );
    case 'warn':
      return (
        <g data-robot-eyes="warn">
          <polygon points="0,-22 5.2,-13.6 -5.2,-13.6" fill="none" stroke="#FFC23D" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M0 -19.6v3" stroke="#FFC23D" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="0" cy="-14.9" r="0.8" fill="#FFC23D" />
        </g>
      );
    case 'dash':
      return (
        <g data-robot-eyes="dash">
          <path d="M-6.6 -17.5h4.8 M1.8 -17.5h4.8" stroke={EYE} strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
        </g>
      );
    case 'scan':
      return (
        <g data-robot-eyes="scan">
          <circle cx="-4.2" cy="-17.5" r="3.1" fill="none" stroke={EYE} strokeWidth="0.9" />
          <circle cx="4.2" cy="-17.5" r="3.1" fill="none" stroke={EYE} strokeWidth="0.9" />
          <g>
            <circle cx="-4.2" cy="-17.5" r="1.5" fill={EYE} />
            <circle cx="4.2" cy="-17.5" r="1.5" fill={EYE} />
            {!still && <animateTransform attributeName="transform" type="translate" values="-1.6 0;1.6 0;-1.6 0" dur="1.4s" repeatCount="indefinite" />}
          </g>
        </g>
      );
    default:
      return (
        <g data-robot-eyes="normal">
          <circle cx="-4.2" cy="-17.5" r="2" fill={EYE} />
          <circle cx="4.2" cy="-17.5" r="2" fill={EYE} />
        </g>
      );
  }
}

// Les chenilles : un galet tourne sous chaque roue pendant la marche, immobile sinon.
function Tracks({ c, rolling, still }: { c: RobotColors; rolling: boolean; still: boolean }): ReactElement {
  return (
    <g data-robot-tracks="">
      <rect x="-16" y="-8" width="32" height="8" rx="4" fill={c.dark} />
      {[-10, 0, 10].map((x) => (
        <g key={x}>
          <circle cx={x} cy="-4" r="2.7" fill={c.body} />
          <path d={`M${x - 2} -4h4`} stroke={c.dark} strokeWidth="1.1" strokeLinecap="round">
            {rolling && !still && <animateTransform attributeName="transform" type="rotate" values={`0 ${x} -4;360 ${x} -4`} dur="0.5s" repeatCount="indefinite" />}
          </path>
        </g>
      ))}
    </g>
  );
}

function Antenna({ c, mode, still }: { c: RobotColors; mode: 'rest' | 'sway' | 'up' | 'bent'; still: boolean }): ReactElement {
  const top = mode === 'up' ? -39 : -33;
  const lean = mode === 'bent' ? 6 : 0;
  return (
    <g data-robot-antenna={mode}>
      <path d={`M-9 -26 L${-9 + lean} ${top}`} stroke={c.dark} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={-9 + lean} cy={top} r="2" fill={mode === 'up' ? '#FF6A8A' : c.belly} stroke={c.dark} strokeWidth="0.8" />
      {mode === 'sway' && !still && <animateTransform attributeName="transform" type="rotate" values="-14 -9 -26;14 -9 -26;-14 -9 -26" dur="1.4s" repeatCount="indefinite" />}
    </g>
  );
}

function Led({ kind, still }: { kind: Exclude<Led, null>; still: boolean }): ReactElement {
  const fill = kind === 'green' ? '#37D67A' : '#FF9A1F';
  return (
    <circle data-robot-led={kind} cx="9.4" cy="-9.8" r="1.5" fill={fill}>
      {!still && <animate attributeName="opacity" values="1;0.25;1" dur={kind === 'green' ? '0.9s' : '2.2s'} repeatCount="indefinite" />}
    </circle>
  );
}

function robot(c: RobotColors, still: boolean, opts: { eyes: Eyes; antenna: 'rest' | 'sway' | 'up' | 'bent'; led?: Led; rolling?: boolean; tilt?: number; dx?: number; sway?: boolean }): ReactElement {
  const { eyes, antenna, led = null, rolling = false, tilt = 0, dx = 0, sway = false } = opts;
  return (
    <g transform={tilt || dx ? `translate(${dx} 0) rotate(${tilt} 0 0)` : undefined}>
      <Tracks c={c} rolling={rolling} still={still} />
      <g>
        <Antenna c={c} mode={antenna} still={still} />
        {/* Le dos reste plat à y = -26 : le chat s'y couche (RIDE_LIFT = 26). */}
        <rect data-robot-back="" x="-14" y="-26" width="28" height="18" rx="5" fill={c.body} />
        <rect x="-12" y="-11" width="24" height="2.6" rx="1.3" fill={c.belly} />
        <rect x="-10.6" y="-23.4" width="21.2" height="12.6" rx="3.6" fill="#14202B" stroke={c.dark} strokeWidth="1" />
        {eyesOf(eyes, still)}
        {led && <Led kind={led} still={still} />}
        {sway && !still && <animateTransform attributeName="transform" type="translate" values="0 0;0 -0.8;0 0" dur="0.5s" repeatCount="indefinite" />}
      </g>
    </g>
  );
}

export function robotBody(pose: Pose, c: RobotColors, still: boolean): ReactElement {
  switch (pose) {
    case 'walk':
      return robot(c, still, { eyes: 'normal', antenna: 'sway', rolling: true, sway: true });
    case 'scan':
      return robot(c, still, { eyes: 'scan', antenna: 'sway' });
    case 'standby':
      return robot(c, still, { eyes: 'dash', antenna: 'rest', led: 'orange' });
    case 'charge':
      return robot(c, still, { eyes: 'dash', antenna: 'rest', led: 'green' });
    case 'beep':
      return robot(c, still, { eyes: 'heart', antenna: 'up', sway: true });
    case 'greet':
      return robot(c, still, { eyes: 'normal', antenna: 'up' });
    case 'cower':
      return robot(c, still, { eyes: 'warn', antenna: 'bent', tilt: -5, dx: -2 });
    case 'umbrella':
      // Parapluie : manche fin jusqu'à l'antenne, calotte en demi-disque aux couleurs du robot.
      return (
        <>
          {robot(c, still, { eyes: 'normal', antenna: 'rest' })}
          <g data-robot-umbrella="">
            <rect x="-9.6" y="-50" width="1.2" height="17" rx="0.6" fill={c.dark} />
            <path d="M-22 -50 A22 22 0 0 1 22 -50 Z" fill={c.belly} stroke={c.dark} strokeWidth="1" strokeLinejoin="round" />
          </g>
        </>
      );
    case 'shortcircuit': {
      // Écran barré d'une croix rouge, étincelles jaunes qui clignotent, léger tremblement.
      const sparks = ['-12,-30 -9,-34 -11,-35 -8,-39', '12,-28 9,-32 11,-33 8,-37', '0,-34 3,-38 1,-39 4,-43'];
      return (
        <g data-robot-shortcircuit="">
          {!still && <animateTransform attributeName="transform" type="translate" values="-0.8 0;0.8 0.4;-0.8 0" dur="0.12s" repeatCount="indefinite" />}
          {robot(c, still, { eyes: 'normal', antenna: 'bent' })}
          <rect x="-10.6" y="-23.4" width="21.2" height="12.6" rx="3.6" fill="#14202B" />
          <path d="M-6 -21 L6 -13 M6 -21 L-6 -13" stroke="#d33" strokeWidth="2" strokeLinecap="round" />
          {sparks.map((points, i) => (
            <polyline key={points} points={points} fill="none" stroke="#ffd23a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              {!still && <animate attributeName="opacity" values="1;0;1" dur="0.25s" begin={`${i * 0.08}s`} repeatCount="indefinite" />}
            </polyline>
          ))}
        </g>
      );
    }
    case 'reboot':
      // Redémarrage : l'écran se rallume (voile sombre qui se dissipe), figé allumé en mouvement réduit.
      return (
        <>
          {robot(c, still, { eyes: 'normal', antenna: 'rest' })}
          {!still && (
            <rect data-robot-reboot="" x="-10.6" y="-23.4" width="21.2" height="12.6" rx="3.6" fill="#14202B" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0" dur="1.5s" fill="freeze" />
            </rect>
          )}
        </>
      );
    default:
      return robot(c, still, { eyes: 'normal', antenna: 'rest' });
  }
}
