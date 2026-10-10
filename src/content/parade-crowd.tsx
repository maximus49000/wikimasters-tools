import { memo, useMemo, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { crowdFor, crowdLevel, type Spectator } from '../core/library/city/parade';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';

// Foule de spectateurs du 14 juillet (spec §7.4) : massée sur le trottoir, derrière les barrières (dessinées plus tard, sur la
// chaussée), en trois rangs. Positions statiques calculées par crowdFor (aucun placement par image) ; seule la présence change,
// à la minute (u < crowdLevel), avec un fondu CSS. Les spectateurs dont le seuil est proche du niveau des minutes voisines
// restent montés à opacité 0 pour que l'arrivée et le départ se fassent en fondu.
// Hors du plafond des figurants (shopSpriteBudget) : la foule remplace les marcheurs (×0,3 pendant la fermeture) et a sa
// propre densité bornée ; comptée dans le plafond, elle ferait disparaître clients et équipes.

const FADE_S = 3;
// Pied de chaque rang (en unités au-dessus du bord du trottoir) et échelle : les rangs de derrière, plus hauts sur le
// trottoir, sont un peu plus petits.
const ROW_Y = [1.2, 5, 8.8] as const;
const ROW_SCALE = [1, 0.96, 0.92] as const;
const LOOKAROUND = 3; // minutes

type Props = { width: number; seed: number; sky: Sky; still: boolean; rainy: boolean; dayFests: readonly FestivityId[]; minutes: number; metrics: CityMetrics; doorXs: readonly number[] };

// Bras levé (repère du PersonSprite : épaule vers (4, -26)) tenant un drapeau tricolore, un téléphone ou la main ouverte.
function RaisedArm({ s, sky, still }: { s: Spectator; sky: Sky; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const dur = 1.1 + s.phase * 0.8;
  return (
    <g data-arm="" data-prop={s.prop}>
      {!still && s.prop !== 'phone' && (
        <animateTransform attributeName="transform" type="rotate" values="-12 4 -26;12 4 -26;-12 4 -26" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />
      )}
      <path d="M4 -26 L7.2 -37" stroke={t(s.outfit.topColor)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <circle cx={7.4} cy={-38} r={s.prop === 'wave' ? 1.7 : 1.3} fill={t(s.outfit.skin)} />
      {s.prop === 'flag' && (
        <>
          <line x1={7.4} y1={-37} x2={7.4} y2={-49} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={7.4} y={-49} width={2.4} height={5} fill={t('#2B4FA0')} />
          <rect x={9.8} y={-49} width={2.4} height={5} fill={t('#F2F2F2')} />
          <rect x={12.2} y={-49} width={2.4} height={5} fill={t('#C0302B')} />
        </>
      )}
      {s.prop === 'phone' && (
        <>
          <rect x={5.6} y={-43.5} width={3.6} height={5.4} rx={0.6} fill="#1E1E24" />
          <rect x={6.1} y={-43} width={2.6} height={4.2} fill="#9FD3FF" opacity={0.85} />
        </>
      )}
    </g>
  );
}

const SpectatorSprite = memo(function SpectatorSprite({ s, sky, still, rainy }: { s: Spectator; sky: Sky; still: boolean; rainy: boolean }): ReactElement {
  const arm = s.prop !== 'none' ? <RaisedArm s={s} sky={sky} still={still} /> : null;
  return (
    <>
      {/* Enfant sur les épaules : dessiné avant l'adulte, dont la tête cache le bas de ses jambes. */}
      {s.kind === 'shoulders' && s.child && (
        <g data-shoulders="" transform="translate(0 -27) scale(0.62)">
          <PersonSprite outfit={s.child} sky={sky} rainy={rainy} umbrella={false} />
        </g>
      )}
      <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} />
      {arm}
    </>
  );
});

export function ParadeCrowd({ width, seed, sky, still, rainy, dayFests, minutes, metrics, doorXs }: Props): ReactElement | null {
  const bastille = dayFests.includes('bastille');
  const all = useMemo(() => (bastille ? crowdFor(seed, width) : []), [bastille, seed, width]);
  const level = bastille ? crowdLevel(minutes) : 0;
  const reach = bastille ? Math.max(level, crowdLevel(minutes - LOOKAROUND), crowdLevel(minutes + LOOKAROUND)) : 0;
  // Devant une entrée, le rang du fond s'écarte : on voit encore la porte entre les têtes.
  const doorClear = DOOR_WIDTH / 2 + 2;
  const list = useMemo(
    () => all.filter((s) => s.u < reach && !(s.row === 2 && doorXs.some((d) => Math.abs(d + DOOR_WIDTH / 2 - s.x) < doorClear))).sort((a, b) => b.row - a.row),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, reach, doorXs.join(',')],
  );
  if (list.length === 0) return null;
  const u = metrics.unit;
  const style = still ? undefined : { transition: `opacity ${FADE_S}s ease` };
  return (
    <g data-parade-crowd="" data-level={level.toFixed(2)}>
      {list.map((s) => {
        const present = s.u < level;
        const k = u * STREET_SCALE.person * ROW_SCALE[s.row] * (s.kind === 'child' ? 0.7 : 1);
        const y = metrics.curb - (ROW_Y[s.row] + s.jitter * 1.2) * u;
        return (
          <g
            key={s.id}
            data-spectator=""
            data-row={s.row}
            data-kind={s.kind}
            data-present={present ? 'true' : 'false'}
            transform={`translate(${s.x.toFixed(1)} ${y.toFixed(1)}) scale(${(s.dir * k).toFixed(3)} ${k.toFixed(3)})`}
            opacity={present ? 1 : 0}
            style={style}
          >
            <SpectatorSprite s={s} sky={sky} still={still} rainy={rainy} />
          </g>
        );
      })}
    </g>
  );
}
