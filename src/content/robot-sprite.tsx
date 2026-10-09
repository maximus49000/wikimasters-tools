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

// Dessin provisoire (tâche 6 : corps sur chenilles, écran-visage, poses).
export function robotBody(_pose: Pose, c: RobotColors, _still: boolean): ReactElement {
  return (
    <>
      <rect x="-14" y="-4" width="28" height="4" rx="2" fill={c.dark} />
      <rect x="-12" y="-26" width="24" height="22" rx="6" fill={c.body} />
      <rect x="-8" y="-22" width="16" height="10" rx="3" fill={c.belly} />
    </>
  );
}
