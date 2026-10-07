import { useEffect, useMemo } from 'react';
import type { CardKind } from '../core/whats-new/types';
import { createDemoGameService, DEMO_GAME_SLUG, DEMO_GAME_TITLE } from './demo-game';
import { GameSection } from './GameSection';
import { getGameService, setGameService } from './game-registry';

const stripes = 'repeating-linear-gradient(135deg, rgba(148,163,184,0.06) 0 22px, rgba(148,163,184,0.12) 22px 44px)';

// Fiche de démonstration : montre à quoi ressemble une section quand la Collection n'a aucune carte de ce type.
// Illustrative seulement : données fictives, aucune requête, aucune écriture ; la carte n'entre jamais dans la Collection.
export function DemoCard({ card }: { card: CardKind }) {
  const demoGame = useMemo(() => (card === 'game' ? createDemoGameService() : null), [card]);

  // Les sections lisent leur service dans un registre : on y met celui de la démo, puis on rétablit l'ancien.
  useEffect(() => {
    if (!demoGame) return;
    const previous = getGameService();
    setGameService(demoGame);
    return () => setGameService(previous);
  }, [demoGame]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: `var(--color-surface, #0d1117) ${stripes}`, color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif', pointerEvents: 'none' }}>
      <div style={{ padding: '8px 12px', background: '#78350f', color: '#fef3c7', font: '600 12px system-ui, sans-serif' }}>
        Illustration : cette carte n’existe pas et n’entre pas dans votre Collection.
      </div>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: 16 }}>
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px dashed rgba(148,163,184,0.5)', opacity: 0.7 }}>Carte fictive</div>
        {demoGame ? (
          <>
            <strong style={{ display: 'block', fontSize: 18, margin: '12px 0 4px' }}>{DEMO_GAME_TITLE}</strong>
            <div data-wmt-game="">
              <GameSection slug={DEMO_GAME_SLUG} title={DEMO_GAME_TITLE} />
            </div>
          </>
        ) : (
          <p style={{ margin: '12px 0', opacity: 0.8 }}>Illustration indisponible pour ce type de carte pour l’instant.</p>
        )}
      </div>
    </div>
  );
}
