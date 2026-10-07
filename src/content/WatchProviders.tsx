import { posterUrl } from '../core/screen/screen-format';
import type { WatchInfo, WatchProvider } from '../core/screen/tmdb-api';
import { Glyph, type GlyphName } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

function Logo({ provider, size }: { provider: WatchProvider; size: number }) {
  const src = posterUrl(provider.logoPath);
  const box = { width: size, height: size, flex: 'none', borderRadius: 10, border } as const;
  return src ? (
    <img src={src} alt={provider.name} title={provider.name} width={size} height={size} loading="lazy" style={{ ...box, objectFit: 'cover' }} />
  ) : (
    <span role="img" aria-label={provider.name} title={provider.name} style={{ ...box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
      {provider.name.slice(0, 2)}
    </span>
  );
}

function Row({ glyph, label, providers, size }: { glyph: GlyphName; label: string; providers: WatchProvider[]; size: number }) {
  if (providers.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span role="img" aria-label={label} title={label} style={{ width: 22, display: 'inline-flex', justifyContent: 'center', flex: 'none', opacity: 0.7 }}>
        <Glyph name={glyph} size={18} />
      </span>
      {providers.map((provider) => (
        <Logo key={provider.id} provider={provider} size={size} />
      ))}
    </div>
  );
}

// « Où le voir » en France (données JustWatch via TMDB) : abonnement ou gratuit en grand, location et achat en plus petit.
// Pas de lien direct vers le film : le bouton ↗ ouvre la page « où regarder » de TMDB.
export function WatchProviders({ watch }: { watch: WatchInfo }) {
  const none = watch.stream.length === 0 && watch.rentBuy.length === 0;
  return (
    <div data-wmt-watch="" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row glyph="ticket" label="Abonnement ou gratuit" providers={watch.stream} size={44} />
        <Row glyph="cart" label="Location ou achat" providers={watch.rentBuy} size={36} />
        {none && (
          <p role="status" style={{ margin: 0, fontSize: 12, minHeight: 44, display: 'flex', alignItems: 'center', opacity: 0.8 }}>
            Aucune offre en France connue
          </p>
        )}
      </div>
      {watch.link && (
        <a
          href={watch.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Voir où regarder (JustWatch)"
          title="Voir où regarder (JustWatch)"
          style={{ width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', border, borderRadius: 8 }}
        >
          <Glyph name="external" />
        </a>
      )}
    </div>
  );
}
