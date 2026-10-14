import type { SceneCity } from '../core/library/scene-location';
import { positionFromTimezone, type Position } from '../core/library/sky';
import { locationSetting } from './location-setting';

// Source unique du lieu de la scène (spec lieu §3.2) : ville choisie, position de l'appareil ou repli par fuseau.
// La position de l'appareil n'est jamais enregistrée telle quelle : seule sa case de 0,1° part au relais (météo, commerces, bus).
let known: Position | null = null;
let cachedFallback: Position | null = null;
// Coordonnées de la ville, mémorisées par ville : useSyncExternalStore exige un snapshot stable entre deux lectures.
let cityPos: { city: SceneCity; pos: Position } | null = null;
const listeners = new Set<() => void>();
// Dernière raison d'échec, affichée à côté de « (simulée) » : sans elle, impossible de savoir pourquoi la météo reste simulée.
export type PositionFailure = 'denied' | 'unavailable' | 'timeout' | 'absent' | 'off';
let failure: PositionFailure | null = null;
export function positionFailure(): PositionFailure | null {
  return failure;
}

// Repli mémorisé : useSyncExternalStore exige un snapshot stable entre deux lectures.
const fallback = (): Position => (cachedFallback ??= positionFromTimezone(-new Date().getTimezoneOffset()));
// Seul le mode Géolocalisation lit (et demande) la position de l'appareil.
const geoMode = (): boolean => locationSetting.get().mode === 'geo';
function cityPosition(city: SceneCity): Position {
  if (cityPos?.city !== city) cityPos = { city, pos: { lat: city.lat, lon: city.lon } };
  return cityPos.pos;
}

// Ville : ses coordonnées. Géolocalisation : la position obtenue, sinon le repli par fuseau ; une position arrivée pendant un autre
// mode est gardée en mémoire pour le retour en géolocalisation. Désactivé : le repli.
export function currentPosition(): Position {
  const location = locationSetting.get();
  if (location.mode === 'city') return cityPosition(location.city);
  return (location.mode === 'geo' ? known : null) ?? fallback();
}

// Vrai si le lieu est réel (ville choisie, ou position donnée par l'appareil) : ouvre la météo réelle, les commerces, les bus et le
// département. Le repli par fuseau ne suffit pas.
export function isPositionKnown(): boolean {
  const location = locationSetting.get();
  return location.mode === 'city' || (location.mode === 'geo' && known !== null);
}

// Fuseau IANA de la scène : celui de la ville choisie, sinon null (fuseau de l'appareil).
export function sceneTimeZone(): string | null {
  const location = locationSetting.get();
  return location.mode === 'city' ? location.city.tz : null;
}

export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function resetPositionForTests(): void {
  known = null;
  cachedFallback = null;
  cityPos = null;
  askedThisPage = false;
  failure = null;
}

// Les abonnés (heure, météo, commerces, bus, département) se recalculent quand le joueur change de lieu.
locationSetting.subscribe(() => {
  for (const listener of listeners) listener();
});

// Une seule demande automatique par chargement de page : un refus ou une fermeture de la fenêtre du navigateur n'est pas redemandé à chaque ouverture.
let askedThisPage = false;
export function ensurePosition(): void {
  if (!geoMode() || known !== null || askedThisPage) return;
  askedThisPage = true;
  void requestPosition();
}

// Le navigateur demande alors l'accord du joueur ; sans lui (ou réglage « Position » désactivé), le repli par fuseau sert.
// Application Android : la position vient d'Android lui-même (`WmtLocation`), la géolocalisation de la WebView n'aboutissait pas sur certains téléphones.
type NativeLocationWindow = Window & {
  WmtLocation?: { request(id: string): void };
  __wmtLocationDone?: (id: string, lat: number, lon: number, error: string) => void;
};
let nativeCounter = 0;
function requestNativePosition(win: NativeLocationWindow, bridge: NonNullable<NativeLocationWindow['WmtLocation']>): Promise<Position> {
  return new Promise((resolve) => {
    const id = `loc-${(nativeCounter += 1)}`;
    const timer = window.setTimeout(() => {
      fail('timeout');
      resolve(currentPosition());
    }, 70000);
    const previous = win.__wmtLocationDone;
    win.__wmtLocationDone = (doneId, lat, lon, error) => {
      if (doneId !== id) return previous?.(doneId, lat, lon, error);
      window.clearTimeout(timer);
      win.__wmtLocationDone = previous;
      if (error) {
        fail(error === 'denied' || error === 'off' || error === 'timeout' ? error : 'unavailable');
        return resolve(currentPosition());
      }
      known = { lat, lon };
      failure = null;
      for (const listener of listeners) listener();
      resolve(known);
    };
    bridge.request(id);
  });
}

export function requestPosition(): Promise<Position> {
  return new Promise((resolve) => {
    if (!geoMode()) return resolve(currentPosition());
    const nativeWindow = typeof window === 'undefined' ? undefined : (window as NativeLocationWindow);
    if (nativeWindow?.WmtLocation) return void requestNativePosition(nativeWindow, nativeWindow.WmtLocation).then(resolve);
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
