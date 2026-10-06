import { useEffect, useState, type CSSProperties } from 'react';
import type { Listen } from '../core/music/listen';
import { tidalUrl } from '../core/tidal/tidal-listen';
import { Glyph } from './Glyphs';
import { getMusicService } from './music-registry';
import { SoundtrackDialog } from './SoundtrackDialog';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: SIZE, padding: '0 4px 0 8px', boxSizing: 'border-box', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, textAlign: 'left', font: '13px system-ui, sans-serif', textDecoration: 'none' };
const ellipsis: CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const settings: CSSProperties = { position: 'relative', width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };

// « Bande originale » du film, de la série ou du jeu, au-dessus de la bande-annonce : trouvée à l'ouverture de la fiche (et gardée) sur la plateforme choisie.
// Une ligne « lecture » quand une BO est connue (Spotify : un clic la lance, album ou playlist ; Tidal : un lien ↗ ouvre l'album),
// et toujours le bouton musique, qui ouvre le réglage (recherche automatique relancée, ou recherche manuelle). Rien d'affiché sans compte lié.
export function SoundtrackButton({ soundtrackKey, title, originalTitle }: { soundtrackKey: string; title: string; originalTitle?: string }) {
  const service = getMusicService();
  const [linked, setLinked] = useState(false);
  const [listen, setListen] = useState<Listen | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  const key = soundtrackKey;
  const titles = originalTitle ? [title, originalTitle] : [title];

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setLinked(false);
    setListen(null);
    setMessage(null);
    setSetting(false);
    const load = () => {
      void service.isLinked().then(async (isLinked) => {
        if (cancelled) return;
        setLinked(isLinked);
        if (!isLinked) return setListen(null);
        const found = await service.soundtrack(key, originalTitle ? [title, originalTitle] : [title]);
        if (!cancelled) setListen(found);
      });
    };
    load();
    // Un compte lié ou délié, ou une autre plateforme choisie : la BO se redemande (depuis le dépôt, sans nouvel appel si elle est gardée).
    const off = service.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [service, key, title, originalTitle]);

  if (!service || !linked) return null;
  const link = listen?.albumUri ? tidalUrl(listen.albumUri) : null;
  const first = listen?.items[0] ?? null;
  // Une playlist n'a pas de liste de pistes : elle se lance par son contexte.
  const playable = listen !== null && (link !== null || first !== null || listen.albumUri !== undefined);

  const label = `Écouter la bande originale${listen?.album ? ` : ${listen.album.name}` : ''}`;
  const body = listen && (
    <>
      <Glyph name={listen.albumUri?.startsWith('spotify:playlist:') ? 'playlist' : 'note'} size={18} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...ellipsis, fontWeight: 600 }}>{listen.album?.name ?? 'Bande originale'}</span>
        <span style={{ ...ellipsis, fontSize: 11, opacity: 0.7 }}>Bande originale{listen.album?.artist ? ` · ${listen.album.artist}` : ''}</span>
      </span>
      <span style={{ width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Glyph name={link ? 'external' : 'play'} size={link ? 16 : 20} />
      </span>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {listen && playable ? (
          link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" aria-label={label} title="Ouvrir la bande originale sur Tidal" style={row}>
              {body}
            </a>
          ) : (
            <button type="button" onClick={() => void service.play(first, listen).then(setMessage)} aria-label={label} title="Écouter la bande originale" style={row}>
              {body}
            </button>
          )
        ) : (
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, opacity: 0.7 }}>Pas de bande originale</span>
        )}
        <button type="button" onClick={() => setSetting(true)} aria-label="Régler la bande originale" title="Régler la bande originale" style={settings}>
          <Glyph name="note" size={18} />
          {listen && <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent, #34d399)' }} />}
        </button>
      </div>
      {message && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {message}
        </p>
      )}
      {setting && (
        <SoundtrackDialog
          service={service}
          soundtrackKey={key}
          titles={titles}
          current={listen}
          initialQuery={title}
          onChange={(next) => {
            setListen(next);
            setMessage(null);
          }}
          onClose={() => setSetting(false)}
        />
      )}
    </div>
  );
}
