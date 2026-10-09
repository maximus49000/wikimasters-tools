import type { ReactElement } from 'react';
import { DOOR_WIDTH } from '../core/library/city/doors';
import type { Outfit } from '../core/library/city/people';
import type { Vehicle } from '../core/library/city/vehicles';
import type { Sky } from '../core/library/sky';
import { mixHex } from '../core/library/sky';

// Sprites de la ville (portés de la maquette v3 validée). Repère « pieds à l'origine » :
// base à y = 0, la silhouette regarde vers +x. Aucun id SVG fixe. Pas de décor de fête (vague 1b).

// Plus sombre la nuit, pour rester lisible sur le ciel.
const tone = (c: string, sky: Sky): string => mixHex(mixHex(c, '#0B1030', 0.55), c, sky.daylight);

// ---------- Passant (hauteur ≈ 40, tête centrée à y = -33) ----------
export function PersonSprite({ outfit: o, sky, rainy, umbrella }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const skin = t(o.skin);
  const pants = t(o.bottomColor);
  const hair = t(o.hairColor);
  const hat = t(o.hatColor);
  const acc = t(o.accessoryColor);
  // Sous la pluie, les hauts légers deviennent un imperméable.
  const raincoat = rainy && (o.top === 'jacket' || o.top === 'sweater' || o.top === 'tee' || o.top === 'shirt');
  const topFill = t(raincoat ? '#2E5E8A' : o.topColor);
  return (
    <g>
      {/* Bas */}
      {(o.bottom === 'skirt' || o.bottom === 'dress') && (
        <>
          <rect x={-3} y={-8} width={2.4} height={8} fill={skin} />
          <rect x={0.6} y={-8} width={2.4} height={8} fill={skin} />
          <path d="M-5.5 -15 H5.5 L7 -7 H-7Z" fill={pants} />
        </>
      )}
      {o.bottom === 'shorts' && (
        <>
          <rect x={-3.5} y={-6} width={2.6} height={6} fill={skin} />
          <rect x={0.9} y={-6} width={2.6} height={6} fill={skin} />
          <rect x={-4} y={-15} width={8} height={8} fill={pants} />
        </>
      )}
      {o.bottom !== 'skirt' && o.bottom !== 'dress' && o.bottom !== 'shorts' && (
        // pants | jeans | jogging, et toute valeur future : jambes pleines
        <>
          <rect x={-4} y={-15} width={3.4} height={15} fill={pants} />
          <rect x={0.6} y={-15} width={3.4} height={15} fill={pants} />
        </>
      )}
      {/* Sac à dos (derrière) */}
      {o.accessory === 'backpack' && <rect x={-9} y={-27} width={5} height={12} rx={1.5} fill={acc} />}
      {/* Haut : le manteau descend plus bas */}
      <rect x={-5} y={-28} width={10} height={o.top === 'coat' ? 19 : 14} rx={2} fill={topFill} />
      {o.top === 'suit' && (
        <>
          <path d="M0 -28 L-2 -22 L0 -15 L2 -22Z" fill={t('#F2F2F2')} />
          <rect x={-0.6} y={-26} width={1.2} height={9} fill={t('#B03030')} />
        </>
      )}
      {o.top === 'jersey' && <rect x={-5} y={-22} width={10} height={2.4} fill={t('#FFFFFF')} opacity={0.8} />}
      {o.accessory === 'scarf' && <rect x={-5} y={-29} width={10} height={3} rx={1} fill={acc} />}
      {/* Tête */}
      <circle cx={0} cy={-33} r={4.6} fill={skin} />
      {/* Coiffure ('bald' : rien) */}
      {o.hair === 'short' && <path d="M-4.8 -33 A4.8 4.8 0 0 1 4.8 -33 Z" fill={hair} />}
      {o.hair === 'long' && (
        <>
          <rect x={-5.2} y={-37} width={10.4} height={4} rx={3} fill={hair} />
          <rect x={-5.4} y={-35} width={3} height={11} rx={1.5} fill={hair} />
        </>
      )}
      {o.hair === 'bun' && (
        <>
          <path d="M-4.8 -33 A4.8 4.8 0 0 1 4.8 -33 Z" fill={hair} />
          <circle cx={-1} cy={-39} r={2.4} fill={hair} />
        </>
      )}
      {o.hair === 'cap' && (
        <>
          <path d="M-4.9 -33.5 A4.9 4.9 0 0 1 4.9 -33.5 Z" fill={hat} />
          <rect x={2} y={-35} width={6} height={1.6} fill={hat} />
        </>
      )}
      {o.hair === 'beanie' && (
        <>
          <path d="M-5 -33 A5 5 0 0 1 5 -33 Z" fill={hat} />
          <circle cx={0} cy={-38.4} r={1.4} fill={hat} />
        </>
      )}
      {/* Accessoires à la main */}
      {o.accessory === 'bag' && <rect x={5} y={-17} width={6} height={7} rx={1.5} fill={acc} />}
      {o.accessory === 'case' && <rect x={5} y={-10} width={9} height={6.5} rx={1} fill={t('#4A3B2A')} />}
      {o.accessory === 'ball' && <circle cx={11} cy={-3} r={3.2} fill={t('#E8E8E8')} stroke="#555" strokeWidth={0.6} />}
      {/* Parapluie : au-dessus de la tête, manche jusqu'à la main */}
      {umbrella && (
        <g data-umbrella="">
          <line x1={4} y1={-18} x2={4} y2={-44} stroke="#4A3B2A" strokeWidth={1} />
          <path d="M-9 -44 Q4 -58 17 -44 Z" fill={t('#C0392B')} />
        </g>
      )}
    </g>
  );
}

// ---------- Cycliste assis (repère du vélo : il est dessiné à l'échelle des véhicules, ≈ 0,65 de celle d'un passant) ----------
const DEFAULT_RIDER: Outfit = { skin: '#E0A97F', hair: 'short', hairColor: '#3B2A1E', hatColor: '#3B6FD6', top: 'jacket', topColor: '#3B6FD6', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' };

function Cyclist({ outfit: o, sky }: { outfit: Outfit; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const covered = o.hair === 'cap' || o.hair === 'beanie';
  return (
    <g data-rider="" stroke="none">
      {/* Jambe : hanche sur la selle, genou levé, pied sur la pédale */}
      <path data-rider-leg="" d="M-3 -16 L2.5 -12 L0.5 -6" stroke={t(o.bottomColor)} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      {/* Buste penché vers le guidon, bras tendu */}
      <path data-rider-torso="" d="M-4.6 -16.5 L-2 -24 L1.6 -23 L-0.6 -15.5Z" fill={t(o.topColor)} />
      <path d="M0.4 -22 L2.6 -15.4" stroke={t(o.topColor)} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      {/* Tête */}
      <circle data-rider-head="" cx={0} cy={-26.6} r={2.6} fill={t(o.skin)} />
      {o.hair !== 'bald' && <path d="M-2.7 -26.6 A2.7 2.7 0 0 1 2.7 -26.6 Z" fill={t(covered ? o.hatColor : o.hairColor)} />}
    </g>
  );
}

// ---------- Véhicules (roues à y = 0, regardent vers +x ; la file du fond est retournée par l'appelant) ----------
const GLASS = '#CFE4F2';

export function VehicleSprite({ vehicle, sky, lights }: { vehicle: Vehicle; sky: Sky; lights: boolean }): ReactElement {
  const body = tone(vehicle.color, sky);
  const glass = tone(GLASS, sky);
  switch (vehicle.kind) {
    case 'bus':
      return (
        <g>
          <rect x={-34} y={-26} width={68} height={22} rx={3} fill={tone('#2E8B6A', sky)} />
          {[-28, -18, -8, 2, 12, 22].map((x) => (
            <rect key={x} x={x} y={-23} width={7} height={8} fill={glass} opacity={0.85} />
          ))}
          <circle cx={-20} cy={-3} r={4} fill="#222" />
          <circle cx={20} cy={-3} r={4} fill="#222" />
          {lights && (
            <g data-headlight="">
              <circle cx={34} cy={-10} r={2.5} fill="#FFE9A0" />
              <path d="M34 -10 L56 -5 L56 -15Z" fill="#FFE9A0" opacity={0.25} />
            </g>
          )}
        </g>
      );
    case 'van':
      // Camionnette : corps 46×18 à toit plat, pare-brise à l'avant (+x), deux roues.
      return (
        <g>
          <rect x={-23} y={-22} width={46} height={18} rx={3} fill={body} />
          <rect x={10} y={-19} width={9} height={7} fill={glass} opacity={0.85} />
          <circle cx={-12} cy={-3} r={4} fill="#222" />
          <circle cx={13} cy={-3} r={4} fill="#222" />
          {lights && (
            <g data-headlight="">
              <circle cx={23} cy={-9} r={2.5} fill="#FFE9A0" />
              <path d="M23 -9 L45 -4 L45 -14Z" fill="#FFE9A0" opacity={0.25} />
            </g>
          )}
        </g>
      );
    case 'bike':
      // Vélo : deux roues (cercles vides) + cadre en V, et son cycliste assis (selle en (-3, -15), guidon en (2, -15)).
      return (
        <g fill="none" stroke={tone('#3B3F4A', sky)} strokeWidth={1.2}>
          <circle cx={-7} cy={-5} r={5} />
          <circle cx={7} cy={-5} r={5} />
          <path d="M-7 -5 L0 -12 L7 -5 M0 -12 L2 -15 M0 -12 L-3 -15" stroke={body} strokeWidth={1.4} />
          <Cyclist outfit={vehicle.rider ?? DEFAULT_RIDER} sky={sky} />
          {lights && (
            <g data-headlight="">
              <circle cx={9} cy={-14} r={1.6} fill="#FFE9A0" stroke="none" />
              <path d="M9 -14 L24 -10 L24 -18Z" fill="#FFE9A0" opacity={0.25} stroke="none" />
            </g>
          )}
        </g>
      );
    case 'car':
      return (
        <g>
          <rect x={-20} y={-13} width={40} height={9} rx={3} fill={body} />
          <rect x={-11} y={-21} width={22} height={9} rx={3} fill={body} />
          <rect x={-8} y={-19} width={7} height={6} fill={glass} opacity={0.85} />
          <rect x={1} y={-19} width={7} height={6} fill={glass} opacity={0.85} />
          <circle cx={-11} cy={-3} r={4} fill="#222" />
          <circle cx={11} cy={-3} r={4} fill="#222" />
          {lights && (
            <g data-headlight="">
              <circle cx={20} cy={-9} r={2.5} fill="#FFE9A0" />
              <path d="M20 -9 L42 -4 L42 -14Z" fill="#FFE9A0" opacity={0.25} />
            </g>
          )}
        </g>
      );
    default: {
      // Exhaustivité : une nouvelle sorte de véhicule doit être dessinée ici.
      const never: never = vehicle.kind;
      return never;
    }
  }
}

// ---------- Lampadaire (pied y = 0, haut y = -80) ----------
export function LampSprite({ lit }: { lit: boolean }): ReactElement {
  return (
    <g>
      <rect x={-1.5} y={-72} width={3} height={72} fill="#3B3F4A" />
      <path d="M0 -72 q0 -6 8 -6" stroke="#3B3F4A" strokeWidth={2.4} fill="none" />
      <rect x={5} y={-80} width={8} height={4} rx={1.5} fill="#3B3F4A" />
      {lit && (
        <g data-lamp-glow="">
          <path d="M9 -76 L-6 -20 L24 -20Z" fill="#FFE9A0" opacity={0.22} />
          <ellipse cx={9} cy={-76} rx={9} ry={7} fill="#FFE9A0" opacity={0.45} />
          <rect x={6} y={-77} width={6} height={2.4} fill="#FFF3C4" />
        </g>
      )}
    </g>
  );
}

// Bord gauche d'une entrée dessinée à l'échelle `unit`, pour que son centre reste à door.x + 11 (là où partent les habitants).
export const entranceLeft = (doorX: number, unit: number): number => doorX + (DOOR_WIDTH / 2) * (1 - unit);

// ---------- Entrée d'immeuble : sprite 22 × 27 de x = 0 à 22, auvent un peu plus large, base à y = 0 ----------
// Dessinée à l'échelle STREET_SCALE.entranceX × entranceY (metrics.ts) : cadre de DOOR_WIDTH = 12 px de large à l'écran.
export function EntranceSprite({ variant, hallLit, sky }: { variant: 0 | 1 | 2; hallLit: boolean; sky: Sky }): ReactElement {
  const glass = hallLit ? '#FFD27A' : sky.daylight < 0.4 ? '#232A4A' : '#9FB8C6';
  return (
    <g data-entrance="">
      <rect x={-2} y={-31} width={26} height={4} fill="#4A4F5A" />
      <rect x={0} y={-27} width={22} height={27} fill="#5A606C" />
      {variant === 0 && (
        // Double porte vitrée avec montant central
        <>
          <rect x={2} y={-25} width={8.5} height={25} fill={glass} />
          <rect x={11.5} y={-25} width={8.5} height={25} fill={glass} />
          <line x1={11} y1={-25} x2={11} y2={0} stroke="#333" />
        </>
      )}
      {variant === 1 && (
        // Porte cochère cintrée
        <>
          <path d="M2 0 V-19 A9 9 0 0 1 20 -19 V0Z" fill="#7A3B2A" />
          <rect x={5} y={-22} width={12} height={6} fill={glass} />
        </>
      )}
      {variant === 2 && (
        // Porte vitrée simple avec traverse
        <>
          <rect x={2} y={-25} width={18} height={25} fill={glass} />
          <line x1={11} y1={-25} x2={11} y2={0} stroke="#333" />
          <line x1={2} y1={-13} x2={20} y2={-13} stroke="#333" strokeWidth={0.7} />
        </>
      )}
      {/* Plaque de numéro (droite) et interphone (gauche) */}
      <rect x={23} y={-17} width={4} height={7} fill="#D8D2C0" />
      <rect x={-5} y={-14} width={4} height={5} fill="#E8D08A" />
      {hallLit && <g data-hall-lit="" />}
    </g>
  );
}
