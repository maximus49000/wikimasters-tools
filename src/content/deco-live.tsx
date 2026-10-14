import { memo, useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { cityClock } from '../core/library/clock-cities';
import type { CityTime, DecoKind } from '../core/library/deco';
import { shownTempC, type DecoWeather } from '../core/library/deco-weather';
import type { DecoPlaced, StyleId } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';
import { clockNowMs, subscribeClockTick } from './clock-tick';
import { DecoArt, TableFace, type DecoView } from './deco-art';
import type { ItemContent } from './model3d-art';
import type { SceneView } from './RoomView';
import { currentPosition } from './scene-position';

// Horloges, météomètres et panneaux « vivants » : la pièce leur passe une scène STABLE (heure figée ou réelle, météo, lumière du jour,
// mode Aménager) ; seuls les objets qui montrent l'heure s'abonnent à la seconde partagée et se redessinent seuls (spec §4.1).

// `live` : heure réelle (heures et minutes relues à la seconde) ; sinon `minutes` de la scène, figées.
export type DecoScene = { minutes: number; live: boolean; tz: string | null; weather: DecoWeather; daylight: number; editing: boolean };

// Scène des objets décoratifs, calculée seulement si la pièce en contient (`active`) et mémoïsée : elle ne change qu'avec la minute
// de la scène, la météo, le ciel ou le mode Aménager. Sans vue (zoom isolé, test) : heure réelle, ciel couvert de jour.
export function useDecoScene(view: SceneView | undefined, editing: boolean, active: boolean): DecoScene | undefined {
  const deco = view?.deco;
  return useMemo(() => {
    if (!active) return undefined;
    const night = view ? view.sky.phase === 'night' : false;
    const state = deco?.state ?? 'cloudy';
    const tempC = shownTempC({ realTempC: deco?.tempC ?? null, lat: currentPosition().lat, now: new Date(), state, night });
    return {
      minutes: view?.minutes ?? 0,
      live: (view?.mode ?? 'real') === 'real',
      tz: view?.tz ?? null,
      weather: { state, label: deco?.label ?? '', night, tempC },
      daylight: view?.sky.daylight ?? 1,
      editing,
    };
  }, [active, view?.minutes, view?.mode, view?.tz, view?.sky, deco?.state, deco?.label, deco?.tempC, editing]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Finesse de l'heure montrée : la seconde (aiguilles, deux-points qui clignotent), la minute (heure écrite de la station) ou rien.
type Precision = 'second' | 'minute' | 'none';
const noSubscribe = () => () => undefined;
const atSecond = (): number => Math.floor(clockNowMs() / 1000);
const atMinute = (): number => Math.floor(clockNowMs() / 60000);
const never = (): number => 0;

// Vue d'un objet : relue seulement quand sa seconde (ou sa minute) change ; « rien » : aucun abonnement.
function useDecoView(scene: DecoScene, city: CityTime | undefined, precision: Precision): DecoView {
  const stamp = useSyncExternalStore(precision === 'none' ? noSubscribe : subscribeClockTick, precision === 'second' ? atSecond : precision === 'minute' ? atMinute : never);
  return useMemo(
    () => ({ time: cityClock(scene.minutes, city, new Date(clockNowMs()), scene.live, scene.tz), city: city?.name, weather: scene.weather, daylight: scene.daylight, editing: scene.editing }),
    [scene, city, stamp], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

const precisionOf = (deco: DecoKind): Precision => (deco === 'wall-clock' || deco === 'digital-clock' ? 'second' : deco === 'weather-station' ? 'minute' : 'none');

function LiveDecoArtImpl({ placed, rect, style, palette, scene }: { placed: DecoPlaced; rect: PxRect; style: StyleId; palette: Palette; scene: DecoScene }): ReactElement {
  const view = useDecoView(scene, placed.city, precisionOf(placed.deco));
  return <DecoArt placed={placed} rect={rect} style={style} palette={palette} view={view} />;
}
// Mémoïsé : le rectangle est recalculé à chaque rendu de la pièce, on le compare par valeur.
export const LiveDecoArt = memo(
  LiveDecoArtImpl,
  (a, b) => a.placed === b.placed && a.style === b.style && a.palette === b.palette && a.scene === b.scene
    && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h,
);

type TableItem = 'alarm' | 'clock' | 'station';
function LiveTableFace({ item, w, h, style, scene, city }: { item: TableItem; w: number; h: number; style: StyleId; scene: DecoScene; city?: CityTime }): ReactElement {
  const view = useDecoView(scene, city, item === 'station' ? 'minute' : 'second');
  return <TableFace item={item} w={w} h={h} style={style} view={view} />;
}

// Face d'un objet de table (pièce et zoom) : la face relit elle-même la seconde ; la clé (mémo du modèle 3D) ne change qu'avec ce qui
// change son dessin hors de l'heure réelle.
export function tableFaceContent(item: TableItem, city: CityTime | undefined, style: StyleId, scene: DecoScene): ItemContent {
  const w = scene.weather;
  const key = `${item}|${city?.name ?? ''}|${city?.tz ?? ''}|${style}|${scene.live ? 'live' : scene.minutes}|${scene.tz ?? ''}|${w.state}|${w.label}|${w.tempC}|${w.night}`;
  return { face: { key, draw: (fw: number, fh: number) => <LiveTableFace item={item} w={fw} h={fh} style={style} scene={scene} city={city} /> } };
}

export const isTableClock = (item: string): item is TableItem => item === 'alarm' || item === 'clock' || item === 'station';
