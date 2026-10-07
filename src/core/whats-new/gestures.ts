export type Gesture = 'tap' | 'longpress' | 'pinch' | 'drag';

// Libellé et consigne de chaque geste, montrés dans l'encart de la visite (avec une animation du geste).
export const GESTURES: Record<Gesture, { label: string; caption: string }> = {
  tap: { label: 'Toucher', caption: 'Un appui bref, comme un clic.' },
  longpress: { label: 'Appui long', caption: 'Maintenez le doigt (ou le bouton de la souris) environ une demi-seconde, sans bouger.' },
  pinch: { label: 'Pincer', caption: 'Deux doigts qui s’écartent zooment, qui se rapprochent dézooment ; la molette de la souris fait de même.' },
  drag: { label: 'Glisser', caption: 'Posez le doigt (ou maintenez le bouton de la souris) et déplacez-le sans le lever.' },
};
