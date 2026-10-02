import type { Platform, PlatformSetting } from '../core/music/platform';
import type { MusicService } from './music-service';

export type PlatformServiceLike = Pick<MusicService, 'view' | 'refresh' | 'play' | 'link' | 'unlink' | 'subscribe' | 'isLinked' | 'playingSlugs'>;

// Un seul service pour l'interface : il délègue à la plateforme choisie (Spotify si elle n'est pas disponible).
export function createPlatformMusicService(setting: PlatformSetting, services: Partial<Record<Platform, PlatformServiceLike>>): MusicService {
  const active = (): PlatformServiceLike => services[setting.current()] ?? (services.spotify as PlatformServiceLike);

  return {
    view: (slug, title) => active().view(slug, title),
    refresh: (slug, title) => active().refresh(slug, title),
    play: (item, listen, card) => active().play(item, listen, card),
    link: () => active().link(),
    unlink: () => active().unlink(),
    isLinked: () => active().isLinked(),
    playingSlugs: (cards, track) => active().playingSlugs(cards, track),
    // Le réglage change, ou un compte est lié ou délié : la fiche se recharge.
    subscribe: (listener) => {
      const offs = [setting.subscribe(listener), ...Object.values(services).map((service) => service.subscribe(listener))];
      return () => offs.forEach((off) => off());
    },
  };
}
