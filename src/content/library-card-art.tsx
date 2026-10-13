// src/content/library-card-art.tsx
import type { ShelfShape, StoredDisplay, VinylColor, WallShape } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';

const VINYL_COLORS: Record<VinylColor, string> = { black: '#1B1B1F', red: '#C0392B', blue: '#2E6DB4', green: '#2F8F5B', gold: '#C9A227' };

// referrerPolicy n'est pas typé sur <image> SVG : passé par déploiement d'objet.
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

const cut = (title: string, max: number) => (title.length > max ? `${title.slice(0, max - 1)}…` : title);

// Image rognée à la zone ; `clip` (identifiant de clipPath) arrondit ou découpe au besoin.
function Img({ url, x, y, w, h, clip }: { url: string; x: number; y: number; w: number; h: number; clip?: string }) {
  return <image href={url} x={x} y={y} width={w} height={h} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" clipPath={clip ? `url(#${clip})` : undefined} />;
}

type WallProps = { rect: PxRect; shape: WallShape; color?: VinylColor; title: string; imageUrl?: string; missing: boolean; id: string };

// Objet accroché au mur. `id` sert à nommer les clipPath (un par objet).
export function WallArt({ rect, shape, color = 'black', title, imageUrl, missing, id }: WallProps) {
  const { x, y, w, h } = rect;
  const url = missing ? undefined : imageUrl;
  const label = missing ? '' : title;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (shape === 'poster') {
    const imgH = h * 0.8;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="#F7F3EA" stroke="#C9B48E" strokeWidth={1.5} />
        {url ? <Img url={url} x={x + w * 0.1} y={y + h * 0.05} w={w * 0.8} h={imgH} /> : <rect x={x + w * 0.1} y={y + h * 0.05} width={w * 0.8} height={imgH} fill="#A8C5E6" />}
        <text x={cx} y={y + h - 4} fontSize={9} textAnchor="middle" fill="#555555">{cut(label, 14)}</text>
      </g>
    );
  }
  if (shape === 'vinyl') {
    const r = Math.min(w, h) / 2;
    const labelR = r * 0.36;
    const clip = `clip-vinyl-${id}`;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={VINYL_COLORS[color]} />
        <circle cx={cx} cy={cy} r={r * 0.85} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} />
        <circle cx={cx} cy={cy} r={r * 0.68} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} />
        <clipPath id={clip}><circle cx={cx} cy={cy} r={labelR} /></clipPath>
        <circle cx={cx} cy={cy} r={labelR} fill="#E8D3AE" />
        {url && <Img url={url} x={cx - labelR} y={cy - labelR} w={labelR * 2} h={labelR * 2} clip={clip} />}
        <text x={cx} y={cy + labelR + 9} fontSize={7} textAnchor="middle" fill="#FFFFFF">{cut(label, 14)}</text>
      </g>
    );
  }
  if (shape === 'sleeve-round') {
    const r = Math.min(w, h) / 2;
    const clip = `clip-round-${id}`;
    return (
      <g>
        <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
        <circle cx={cx} cy={cy} r={r} fill="#A8C5E6" />
        {url && <Img url={url} x={cx - r} y={cy - r} w={r * 2} h={r * 2} clip={clip} />}
      </g>
    );
  }
  if (shape === 'sleeve-frame') {
    const palette = paletteOf('scandinave');
    const frame = 5;
    const mat = 6;
    const inner = frame + mat;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={palette.woodDark} />
        <rect x={x + frame} y={y + frame} width={w - 2 * frame} height={h - 2 * frame} fill="#FFFFFF" />
        {url ? <Img url={url} x={x + inner} y={y + inner} w={w - 2 * inner} h={h - 2 * inner} /> : <rect x={x + inner} y={y + inner} width={w - 2 * inner} height={h - 2 * inner} fill="#A8C5E6" />}
      </g>
    );
  }
  // sleeve-square
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#FFFFFF" stroke="#C9B48E" strokeWidth={1} />
      {url ? <Img url={url} x={x} y={y} w={w} h={h} /> : <rect x={x} y={y} width={w} height={h} fill="#A8C5E6" />}
    </g>
  );
}

const SHELF_FILL: Record<ShelfShape, string> = { cd: '#D9DADF', dvd: '#1F3A5F', game: '#1B1B1F', book: '' };

// Couleur du dos d'un livre, dérivée du slug (donc stable).
export function spineColor(slug: string): string {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
  return `hsl(${sum % 360} 35% 45%)`;
}

type ShelfProps = { rect: PxRect; shape: ShelfShape; display?: StoredDisplay; title: string; imageUrl?: string; missing: boolean; slug?: string };

// Objet rangé dessiné à plat dans son rectangle (sa place réelle sur la tablette) : de face, la couverture (image de la carte) ;
// sur la tranche, le dos et son titre. Dessin provisoire en attendant les boîtes 3D.
export function ShelfItemArt({ rect, shape, display = shape === 'book' ? 'spine' : 'cover', title, imageUrl, missing, slug = '' }: ShelfProps) {
  const { x, y, w, h } = rect;
  const fill = shape === 'book' ? spineColor(slug || title) : SHELF_FILL[shape];
  const light = shape === 'cd';
  const url = missing ? undefined : imageUrl;
  if (display === 'spine') {
    // Titre couché sur la tranche, seulement si elle est assez large pour être lue.
    const font = Math.min(6, w * 0.8);
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={Math.min(1, w / 4)} fill={fill} stroke="#00000033" strokeWidth={0.3} />
        {shape === 'game' && <rect x={x} y={y} width={w} height={Math.min(3, h / 6)} fill="#E24B4A" />}
        {!missing && font >= 2.5 && (
          <text transform={`translate(${x + w / 2 - font / 3} ${y + 2}) rotate(90)`} fontSize={font} fill={light ? '#333333' : '#FFFFFF'}>
            {cut(title, 14)}
          </text>
        )}
      </g>
    );
  }
  // Couverture inscrite dans le boîtier (liseré) ; un jeu garde son bandeau rouge en haut.
  const inset = Math.min(1, w / 10);
  const band = shape === 'game' ? Math.min(3, h / 8) : 0;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1} fill={fill} stroke="#00000033" strokeWidth={0.5} />
      {band > 0 && <rect x={x} y={y} width={w} height={band} fill="#E24B4A" />}
      {url && <Img url={url} x={x + inset} y={y + inset + band} w={w - 2 * inset} h={h - 2 * inset - band} />}
    </g>
  );
}
