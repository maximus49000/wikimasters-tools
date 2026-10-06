import { useEffect, useRef, useState } from 'react';

// La valeur, livrée au plus une fois par fenêtre de `windowMs()` quand `throttle` est vrai (la dernière arrivée gagne, jamais repoussée
// par un flux continu) ; livrée tout de suite quand `throttle` est faux ou quand `flush` est vrai.
// Sert à la toile en mode grand : les liens arrivent par vagues (une par seconde pendant des minutes) et chaque reconstruction
// de la toile coûte plusieurs centaines de millisecondes ; la page doit rester utilisable entre deux.
export function useThrottledValue<T>(value: T, throttle: boolean, windowMs: () => number, flush: boolean): T {
  const shown = useRef(value);
  const lastAt = useRef(0);
  const [, tick] = useState(0);
  const immediate = !throttle || flush;
  // Écrit pendant le rendu, mais toujours avec la même valeur pour les mêmes entrées : sans effet de bord visible.
  if (immediate) shown.current = value;
  const windowRef = useRef(windowMs);
  windowRef.current = windowMs;

  // La première valeur compte comme une livraison : la fenêtre part de là.
  useEffect(() => {
    lastAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (immediate) {
      lastAt.current = Date.now();
      return;
    }
    if (Object.is(shown.current, value)) return;
    const wait = Math.max(0, lastAt.current + windowRef.current() - Date.now());
    const timer = setTimeout(() => {
      shown.current = value;
      lastAt.current = Date.now();
      tick((n) => n + 1);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, immediate]);

  return shown.current;
}
