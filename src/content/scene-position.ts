import { positionFromTimezone, type Position } from '../core/library/sky';
import { positionSetting } from './position-setting';

// La position n'est jamais stockée ni envoyée : elle ne sert qu'au calcul du lever et du coucher, sur l'appareil.
let known: Position | null = null;
let cachedFallback: Position | null = null;
const listeners = new Set<() => void>();
// Dernière raison d'échec, affichée à côté de « (simulée) » : sans elle, impossible de savoir pourquoi la météo reste simulée.
export type PositionFailure = 'denied' | 'unavailable' | 'timeout' | 'absent';
let failure: PositionFailure | null = null;
export function positionFailure(): PositionFailure | null {
  return failure;
}

// Repli mémorisé : useSyncExternalStore exige un snapshot stable entre deux lectures.
const fallback = (): Position => (cachedFallback ??= positionFromTimezone(-new Date().getTimezoneOffset()));

// Réglage « Position » désactivé : la vraie position n'est plus lue (le fuseau horaire sert de repli) et celle déjà obtenue est ignorée.
export function currentPosition(): Position {
  return (positionSetting.enabled() ? known : null) ?? fallback();
}

// Vrai seulement si l'appareil a donné sa vraie position (le repli par fuseau ne suffit pas à interroger la météo réelle).
export function isPositionKnown(): boolean {
  return known !== null && positionSetting.enabled();
}

export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function resetPositionForTests(): void {
  known = null;
  cachedFallback = null;
  askedThisPage = false;
  failure = null;
}

// Les abonnés (heure, météo) se redessinent quand le joueur active ou désactive le réglage.
positionSetting.subscribe(() => {
  for (const listener of listeners) listener();
});

// Une seule demande automatique par chargement de page : un refus ou une fermeture de la fenêtre du navigateur n'est pas redemandé à chaque ouverture.
let askedThisPage = false;
export function ensurePosition(): void {
  if (!positionSetting.enabled() || known !== null || askedThisPage) return;
  askedThisPage = true;
  void requestPosition();
}

// Le navigateur demande alors l'accord du joueur ; sans lui (ou réglage « Position » désactivé), le repli par fuseau sert.
export function requestPosition(): Promise<Position> {
  return new Promise((resolve) => {
    if (!positionSetting.enabled()) return resolve(currentPosition());
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geo) {
      fail('absent');
      return resolve(currentPosition());
    }
    // Premier relevé parfois long (accord du joueur, puis réseau ou satellites) : un délai court donnait toujours « simulée » sur téléphone.
    const timer = window.setTimeout(() => resolve(currentPosition()), 60000);
    const done = (): void => window.clearTimeout(timer);
    const attempt = (highAccuracy: boolean): void =>
      geo.getCurrentPosition(
        (p) => {
          done();
          known = { lat: p.coords.latitude, lon: p.coords.longitude };
          failure = null;
          for (const listener of listeners) listener();
          resolve(known);
        },
        (e) => {
          // Sans relevé « réseau » (téléphone sans position par le réseau), le GPS prend le relais avant d'abandonner.
          if (!highAccuracy && e.code !== 1) return attempt(true);
          done();
          fail(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');
          resolve(currentPosition());
        },
        { maximumAge: 3600000, timeout: highAccuracy ? 30000 : 12000, enableHighAccuracy: highAccuracy },
      );
    attempt(false);
  });
}

function fail(reason: PositionFailure): void {
  failure = reason;
  for (const listener of listeners) listener();
}
