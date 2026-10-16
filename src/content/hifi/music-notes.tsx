// Fable n'est pas passé : à reprendre lors d'un rattrapage Fable.
// Notes de musique qui montent au-dessus de la chaîne pendant la lecture. Une note naît toutes les 700 ms juste au-dessus du haut du
// poste (jamais sur le lecteur), monte d'environ 110 px en ondulant sur 3,4 s puis s'efface. Style cellulo : aplat, trait encré,
// ombre nette décalée, petit reflet sur la tête. Le mouvement est une animation CSS sur chaque petite note (une seule règle
// `@keyframes` partagée) : React ne redessine qu'à la naissance et à la fin d'une note, jamais à chaque image.
// À la pause, plus aucune note ne naît ; celles en vol finissent leur course. Mouvement réduit : aucune note.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

export const NOTE_EVERY_MS = 700;
export const NOTE_LIFE_MS = 3400;
export const NOTE_INK = '#2C2C2A';
const OUTLINE = '#22191A';
// Ombre : aplat plein dans un groupe translucide (les formes qui se chevauchent ne foncent pas).
const SHADOW = '#100A0E';
const SHINE = '#F4EEDF';
// Montée (px de la scène) : ~110 px, ondulation latérale de ±7 px dans le sens propre à la note (`--wm-sway`).
const KEYFRAMES =
  '@keyframes wmt-hifi-note-rise{'
  + '0%{opacity:0;transform:translate(0,0) scale(.55) rotate(0deg)}'
  + '10%{opacity:1;transform:translate(calc(var(--wm-sway) * 3px),-10px) scale(1) rotate(calc(var(--wm-sway) * 6deg))}'
  + '30%{transform:translate(calc(var(--wm-sway) * 7px),-34px) rotate(calc(var(--wm-sway) * 10deg))}'
  + '55%{opacity:1;transform:translate(calc(var(--wm-sway) * -5px),-62px) rotate(calc(var(--wm-sway) * -6deg))}'
  + '80%{opacity:.75;transform:translate(calc(var(--wm-sway) * 6px),-90px) rotate(calc(var(--wm-sway) * 8deg))}'
  + '100%{opacity:0;transform:translate(calc(var(--wm-sway) * -2px),-110px) scale(.9) rotate(calc(var(--wm-sway) * -4deg))}}';

type Glyph = 'croche' | 'double' | 'liees';
type Note = { id: number; x: number; y: number; color: string; glyph: Glyph; sway: 1 | -1; size: number };

const GLYPHS: readonly Glyph[] = ['croche', 'double', 'croche', 'liees', 'double'];

// Trait d'une forme : liseré d'encre, ou rien pour l'ombre (même silhouette en aplat sombre).
type Pen = { fill: string; shadow: boolean };
const line = (pen: Pen, w: number) => (pen.shadow ? { stroke: 'none' } : { stroke: OUTLINE, strokeWidth: w, strokeLinejoin: 'round' as const });

// Tête de note : ovale penché, son reflet clair en haut à gauche.
function head(cx: number, cy: number, pen: Pen, key: string): ReactElement {
  return (
    <g key={key}>
      <ellipse cx={cx} cy={cy} rx={3.3} ry={2.35} transform={`rotate(-22 ${cx} ${cy})`} fill={pen.fill} {...line(pen, 0.7)} />
      {!pen.shadow && <path d={`M${cx - 2} ${cy - 0.4} q0.9 -1.3 2.3 -1.5`} fill="none" stroke={SHINE} strokeWidth={0.75} strokeLinecap="round" opacity={0.85} />}
    </g>
  );
}
// Hampe : un trait plein et son liseré (épaisseur lisible même petite).
function stem(x: number, y0: number, y1: number, pen: Pen, key: string): ReactElement {
  return <path key={key} d={`M${x - 0.75} ${y0} L${x - 0.75} ${y1} L${x + 0.75} ${y1} L${x + 0.75} ${y0} Z`} fill={pen.fill} {...line(pen, 0.55)} />;
}
// Crochet en goutte qui retombe le long de la hampe.
function flag(x: number, y: number, pen: Pen, key: string): ReactElement {
  return <path key={key} d={`M${x} ${y} c0.6 2.4 4.6 3.6 4.2 7.6 c-0.2 1.2 -0.8 2 -1.4 2.6 c0.5 -2.8 -0.9 -4.6 -2.8 -5.4 Z`} fill={pen.fill} {...line(pen, 0.6)} />;
}

// Dessin d'une note, sa tête posée à l'origine (le reste au-dessus, y négatifs), dans une boîte d'environ 12 × 18.
function NoteArt({ glyph, pen }: { glyph: Glyph; pen: Pen }): ReactElement {
  if (glyph === 'liees') {
    // Deux croches liées par une barre épaisse.
    return (
      <g>
        {stem(-0.2, -15, -0.6, pen, 's1')}
        {stem(7.8, -17, -2.6, pen, 's2')}
        <path d="M-0.95 -15.6 L8.55 -17.8 L8.55 -14.6 L-0.95 -12.4 Z" fill={pen.fill} {...line(pen, 0.6)} />
        {head(-3, 0, pen, 'h1')}
        {head(5, -2, pen, 'h2')}
      </g>
    );
  }
  return (
    <g>
      {stem(2.6, -16, -0.6, pen, 's')}
      {flag(3.35, -16, pen, 'f1')}
      {glyph === 'double' && flag(3.35, -11.5, pen, 'f2')}
      {head(0, 0, pen, 'h')}
    </g>
  );
}

// Une note : position de départ en attribut SVG, la montée en CSS sur un petit groupe intérieur.
function NoteNode({ note }: { note: Note }): ReactElement {
  const style = {
    '--wm-sway': note.sway,
    transformBox: 'fill-box', transformOrigin: '50% 100%',
    animation: `wmt-hifi-note-rise ${NOTE_LIFE_MS}ms cubic-bezier(.25,.6,.4,1) forwards`,
    opacity: 0,
  } as CSSProperties;
  return (
    <g data-music-note="" data-x={note.x} data-y={note.y} data-color={note.color} transform={`translate(${note.x} ${note.y}) scale(${note.size})`}>
      <g style={style}>
        {/* Ombre nette décalée (même silhouette en aplat), puis la note encrée. */}
        <g transform="translate(1.3 1.3)" opacity={0.3}><NoteArt glyph={note.glyph} pen={{ fill: SHADOW, shadow: true }} /></g>
        <NoteArt glyph={note.glyph} pen={{ fill: note.color, shadow: false }} />
      </g>
    </g>
  );
}

// `anchor` : haut du poste dans le repère de la scène (x, y du bord haut, largeur). `active` : un disque tourne au poste.
// `accent` : couleur de la pochette en cours (une note sur quatre). `reduced` : mouvement réduit, aucune note.
export function MusicNotes({ anchor, active, accent, reduced }: { anchor: { x: number; y: number; w: number }; active: boolean; accent: string; reduced: boolean }): ReactElement | null {
  const [notes, setNotes] = useState<Note[]>([]);
  const count = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // Lu à la naissance de chaque note : un déplacement du poste ou un changement d'album n'arrête pas la cadence.
  const live = useRef({ anchor, accent });
  live.current = { anchor, accent };

  useEffect(() => {
    if (!active || reduced) return undefined;
    const every = setInterval(() => {
      const n = count.current++;
      const { anchor: a, accent: c } = live.current;
      // Abscisse étalée sur la largeur du poste (suite à faible écart, sans hasard), en gardant une marge sur les bords.
      const t = (n * 0.618034 + 0.31) % 1;
      const x = Math.round((a.x + a.w * (0.18 + 0.64 * t)) * 10) / 10;
      const note: Note = {
        id: n, x, y: a.y - 5, color: n % 4 === 3 ? c : NOTE_INK,
        glyph: GLYPHS[n % GLYPHS.length] ?? 'croche', sway: n % 2 === 0 ? 1 : -1, size: 0.9 + ((n * 0.37) % 1) * 0.3,
      };
      setNotes((list) => [...list, note]);
      const end = setTimeout(() => {
        timers.current.delete(end);
        setNotes((list) => list.filter((m) => m.id !== note.id));
      }, NOTE_LIFE_MS);
      timers.current.add(end);
    }, NOTE_EVERY_MS);
    return () => clearInterval(every);
  }, [active, reduced]);
  // Les fins de course ne sont annulées qu'au démontage : à la pause, les notes en vol finissent leur montée.
  useEffect(() => {
    const set = timers.current;
    return () => { for (const t of set) clearTimeout(t); set.clear(); };
  }, []);

  if (reduced || notes.length === 0) return null;
  return (
    <g data-music-notes="" pointerEvents="none" aria-hidden="true">
      <style>{KEYFRAMES}</style>
      {notes.map((n) => <NoteNode key={n.id} note={n} />)}
    </g>
  );
}
