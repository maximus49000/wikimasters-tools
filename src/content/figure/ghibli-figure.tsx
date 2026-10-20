// src/content/figure/ghibli-figure.tsx
import { createContext, useContext, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { anchorsOf, keyString, type Anchor, type FigureKey } from '../../core/library/figure/bake';
import { GUISE_COLORS, guiseOutfit, shapeOf, signatureOf, type Work } from '../../core/library/figure/dress';
import type { ArmPose } from '../../core/library/figure/skeleton';
import type { Guise, Outfit } from '../../core/library/city/people';
import { mixHex, type Sky } from '../../core/library/sky';
import { hashString } from '../../core/library/scene-world';
import { citizenFromOutfit, type CitizenDesc, type CitizenKind, type Emotion } from '../../core/citizens/catalogue';
import { tone } from '../city-sprites';
import { moodOf } from '../../core/citizens/emotion';
import { citizenSeed } from '../../core/citizens/identity';
import { CITIZENS_3D, NIGHT_LIGHT } from './citizen-config';
import { HOLD_3D_FRAMES, SPRITE_BOX, spriteKey, useFigureRegistry, type FigureRegistry, type Palette, type SpriteAnchors } from './figure-host';

// Humain au trait Ghibli (G3) : un <g data-figure> qui porte sa palette (couleurs de la tenue avec la teinte de nuit comme
// le dessin classique, ombre violette, encre assombrie la nuit) et une <image> du sprite de la pose courante. Les boucles
// changent la pose par poseFigure, sans re-rendu. Repère : pieds à l'origine, comme PersonSprite ; jamais retourné en miroir.
// Habitants 3D (CITIZENS_3D) : la palette porte aussi la clé de l'habitant ; le registre sert son sprite 3D dès qu'il est
// rendu, le pantin en attendant (repli), et les figures montrées en pantin sont passées en 3D après les flush (watch).
const shadeOf = (c: string): string => mixHex(mixHex(c, '#4a3a6a', 0.3), '#000000', 0.05);

// Teinte de nuit au huitième de jour près : `daylight` change chaque minute pendant ≈ 2 h autour du lever et du coucher ;
// sans palier, toutes les figures changeaient de palette (sprites refaits) à chaque minute. Même palier pour la lumière 3D.
const PALETTE_STEPS = 8;
const step = (v: number): number => Math.round(v * PALETTE_STEPS) / PALETTE_STEPS;
// Sous la pluie, les hauts légers deviennent un imperméable (comme PersonSprite) ; même tenue pour le pantin et la 3D.
const RAINCOAT = '#2E5E8A';
const RAINCOAT_TOPS: ReadonlySet<Outfit['top']> = new Set(['jacket', 'sweater', 'tee', 'shirt']);
export const wearsRaincoat = (o: Outfit, rainy: boolean): boolean => rainy && RAINCOAT_TOPS.has(o.top);
export const rainOutfit = (o: Outfit, rainy: boolean): Outfit => (wearsRaincoat(o, rainy) ? { ...o, topColor: RAINCOAT } : o);
// Lumière du rendu 3D : NIGHT_LIGHT la nuit, 1 le jour ; le rendu en tire la teinte de nuit du pantin (lightColor).
export const citizenLight = (sky: Sky): number => NIGHT_LIGHT + (1 - NIGHT_LIGHT) * sky.daylight;

// Allure du pantin 2D (G5) : `santa` : tenue du père Noël (bottes noires ; les cases de la tenue sont toujours présentes, la
// clé de palette est complète) ; `haze` (0–1) : pantin lointain, couleurs mélangées au bleu de brume du décor du fond
// (#9CC0E4) avant la teinte du moment ; `silhouette` : palette unie SILHOUETTE (contre-jour derrière une fenêtre allumée la
// nuit, vie aux fenêtres), sans teinte du moment.
// `guise` : déguisement d'Halloween (couleurs de ses pièces : cases `cos`, `cos2`, `cos3`, `bone`).
export type FigureLook = { santa?: boolean; haze?: number; silhouette?: boolean; guise?: Guise };
const HAZE = '#9CC0E4';
export const SILHOUETTE = '#1A1422';
export function figurePalette(o: Outfit, sky: Sky, rainy: boolean, c3d?: { key: string; light: number }, look: FigureLook = {}): Palette {
  const { santa = false, haze = 0, silhouette = false, guise } = look;
  const lit: Sky = { ...sky, daylight: step(sky.daylight) };
  const t = (c: string): string => tone(haze > 0 ? mixHex(c, HAZE, haze) : c, lit);
  const slots: Record<string, string> = {
    skin: o.skin,
    top: guise ? o.topColor : rainOutfit(o, rainy).topColor,
    bottom: o.bottomColor,
    hair: o.hairColor,
    hat: o.hatColor,
    acc: o.accessoryColor,
    shoe: santa ? '#1E1A18' : '#3a2a24',
    umb: '#C0392B',
    // Tenues de travail : gilet orange, bande claire (rétroréfléchissante), tablier écru.
    vest: '#F28C28',
    band: '#E8E8E0',
    apron: '#F4F1EA',
    // Père Noël (G5) : barbe, fourrure et gants écrus, ceinture noire, boucle dorée, nez et joues rosés.
    beard: '#F6F3EC',
    fur: '#F6F3EC',
    glove: '#F6F3EC',
    belt: '#231A16',
    buckle: '#E8B93A',
    nose: '#E8A090',
    cheek: '#F0A8A0',
    ...(guise ? GUISE_COLORS[guise] : {}),
  };
  const p: Palette = { 'f-ink': t('#33241f'), 'f-ground': '#3a2f5a' };
  for (const [k, c] of Object.entries(slots)) {
    p[`f-${k}`] = t(c);
    p[`fs-${k}`] = t(shadeOf(c));
  }
  if (silhouette) for (const k of Object.keys(p)) p[k] = SILHOUETTE;
  if (CITIZENS_3D && c3d) {
    p.c3d = c3d.key;
    p['c3d-light'] = String(step(c3d.light));
  }
  return p;
}

// Tenue en chaîne, champs dans un ordre fixe ; graine par défaut d'un habitant (pas d'identité fournie) : son hachage stable.
const outfitKeyOf = (o: Outfit): string => [o.skin, o.hair, o.hairColor, o.hatColor, o.top, o.topColor, o.bottom, o.bottomColor, o.accessory, o.accessoryColor].join('|');
export const outfitSeed = (o: Outfit): number => hashString(outfitKeyOf(o));
// Descriptions 3D déjà tirées (la figure est re-rendue à chaque minute) ; vidées au-delà de 4096.
const descCache = new Map<string, CitizenDesc>();
function descOf(seed: number, o: Outfit, work: Work, umbrella: boolean, id: CitizenIdentity): CitizenDesc {
  const { kind, emotion, sex, beard } = id;
  const k = `${seed}|${outfitKeyOf(o)}|${work}|${umbrella ? 1 : 0}|${kind ?? ''}|${emotion ?? ''}|${sex ?? ''}|${beard ? 1 : 0}`;
  let d = descCache.get(k);
  if (!d) {
    d = citizenFromOutfit(seed, o, { work, umbrella, kind, sex, beard });
    if (emotion) d = { ...d, mood: emotion };
    if (descCache.size >= 4096) descCache.clear();
    descCache.set(k, d);
  }
  return d;
}

// Identité 3D d'une figure : graine (`citizen`, défaut : hachage de la tenue), type de corps, humeur du visage, sexe et barbe
// imposés (Père Noël).
export type CitizenIdentity = { citizen?: number; kind?: CitizenKind; emotion?: Emotion; sex?: 'm' | 'f'; beard?: boolean };
// Identité d'un personnage des commerces (client, employé) : graine tirée de son id (défaut : sa tenue — celle d'un employé
// suit déjà la personne d'un jour à l'autre et d'une vue à l'autre : vitrine, rue, terrasse) et humeur de fond tirée de la
// graine ; le visage de chaque geste en dérive (emotionFor, dans le registre : payer → content, trinquer → heureux…).
export function shopIdentity(outfit: Outfit, id?: string, kind?: CitizenKind): CitizenIdentity {
  const citizen = id === undefined ? undefined : citizenSeed(id);
  return { citizen, kind, emotion: moodOf(citizen ?? outfitSeed(outfit)) };
}
// Palette d'une figure, avec son habitant 3D quand la 3D est possible ici (sinon la palette 2D d'avant). Pour les boucles qui
// habillent elles-mêmes une figure de réserve (scène des commerces) : même palette que GhibliFigure pour la même identité.
export function citizenPalette(reg: FigureRegistry, outfit: Outfit, sky: Sky, rainy: boolean, umbrella: boolean, work: Work, id: CitizenIdentity = {}): Palette {
  let c3d: { key: string; light: number } | undefined;
  if (CITIZENS_3D) {
    const seed = id.citizen ?? outfitSeed(outfit);
    const ck = reg.citizen(descOf(seed, rainOutfit(outfit, rainy), work, umbrella, id), seed);
    if (ck !== null) c3d = { key: ck, light: citizenLight(sky) };
  }
  return figurePalette(outfit, sky, rainy, c3d);
}

// Pose demandée par les sites : geste des bras et penché facultatifs (défauts : balancement de marche, droit).
export type PoseIn = Omit<FigureKey, 'sig' | 'arms' | 'lean'> & { arms?: ArmPose; lean?: number };
const keyOf = (sig: string, p: PoseIn): FigureKey => ({ sig, yaw: p.yaw, gait: p.gait, phase: p.phase, head: p.head, arms: p.arms ?? 'swing', lean: p.lean ?? 0 });
// Objet tenu (outil, plateau, panneau…) : dessiné après l'<image>, translaté sur une accroche du pantin (repère du sprite) ;
// `hands` : milieu des deux mains (carton porté à deux mains).
export type HeldAnchor = Anchor | 'hands';
export type Held = { anchor: HeldAnchor; node: ReactNode };
type Pt = readonly [number, number];

// Transforms des accroches (chaînes prêtes, relues à chaque changement de pose) : par clé de pose pour le pantin, par clé de
// sprite pour la 3D (accroches du rendu, décalage d'épingle compris) ; vidées au-delà de 4096.
const heldCache = new Map<string, Record<HeldAnchor, string>>();
function transformsOf(a: Record<Anchor, Pt>): Record<HeldAnchor, string> {
  const tr = (p: Pt): string => `translate(${p[0]} ${p[1]})`;
  const hands = [(a.handR[0] + a.handL[0]) / 2, (a.handR[1] + a.handL[1]) / 2] as const;
  return { handR: tr(a.handR), handL: tr(a.handL), head: tr(a.head), headTop: tr(a.headTop), nape: tr(a.nape), seat: tr(a.seat), hands: tr(hands) };
}
// `a3` : accroches 3D (déjà décalées) de l'image montrée, sinon celles du pantin pour `key` (reg.anchors(sk) ?? anchorsOf(key)).
function heldTransforms(key: FigureKey, a3?: SpriteAnchors | null, sk?: string): Record<HeldAnchor, string> {
  const ks = a3 && sk ? `3d:${sk}` : keyString(key);
  let t = heldCache.get(ks);
  if (!t) {
    t = transformsOf(a3 ?? anchorsOf(key));
    if (heldCache.size >= 4096) heldCache.clear();
    heldCache.set(ks, t);
  }
  return t;
}
// Pose affichée par chaque nœud (posée par la boucle ou au rendu) : les objets tenus suivent l'image réellement montrée.
const shownPoses = new WeakMap<Element, FigureKey>();
// Accroches 3D de l'image montrée (décalage d'épingle compris) ; absentes pour un pantin.
const shownAnchors = new WeakMap<Element, SpriteAnchors>();
// Pose voulue par chaque nœud (dernier rendu ou dernier poseFigure) : relue quand une meilleure image arrive (watch).
const wantedPoses = new WeakMap<Element, FigureKey>();

// Sommet de la tête (repère local de la figure) de la pose actuellement montrée ; null si le nœud n'a aucune pose affichée.
// L'image du sprite a une grande marge transparente au-dessus du crâne : la boîte écran du nœud ne donne pas le haut de la tête.
export function figureHeadTop(node: Element): readonly [number, number] | null {
  const key = shownPoses.get(node);
  return key ? (shownAnchors.get(node)?.headTop ?? anchorsOf(key).headTop) : null;
}

// Accroches 3D de l'image que montre une figure (décalage d'épingle compris), ou null si elle montre un pantin (ou rien) :
// les objets posés par une boucle (laisse, enfant sur les épaules, objet en main, charge portée) s'y règlent.
export function shown3DAnchors(node: Element | null): SpriteAnchors | null {
  return (node && shownAnchors.get(node)) ?? null;
}

// Épingle (`data-pin`, ex. la selle d'un cycliste posée sur le vélo dessiné autour du pantin, rideFrame) : une image 3D est
// décalée pour que son accroche tombe où le pantin met la sienne. Rend les accroches décalées et le décalage, ou null (pantin).
function placed(reg: FigureRegistry, pin: Anchor | null, sk: string, key: FigureKey): { a: SpriteAnchors; off: Pt | null } | null {
  const a = reg.anchors(sk);
  if (!a) return null;
  if (!pin) return { a, off: null };
  const p2 = anchorsOf(key)[pin], p3 = a[pin];
  const off = [Math.round((p2[0] - p3[0]) * 100) / 100, Math.round((p2[1] - p3[1]) * 100) / 100] as const;
  const mv = (p: Pt): Pt => [p[0] + off[0], p[1] + off[1]];
  const moved = Object.fromEntries(Object.entries(a).map(([k, p]) => [k, mv(p)])) as SpriteAnchors;
  return { a: moved, off };
}
const pinOf = (node: Element): Anchor | null => node.getAttribute('data-pin') as Anchor | null;

// Réglages posés sur un groupe (charge portée à deux des équipes d'installation, CarryFitWatch) : rappelés dès qu'une figure du
// groupe passe du pantin à la 3D ou l'inverse (ses accroches changent), sans attendre le prochain flush utile.
const fitters = new WeakMap<Element, () => void>();
let fitterCount = 0;
export function setShown3DFitter(group: Element, fit: (() => void) | null): void {
  const had = fitters.has(group);
  if (fit) fitters.set(group, fit);
  else fitters.delete(group);
  fitterCount += (fit ? 1 : 0) - (had ? 1 : 0);
}
function shown3DChanged(node: Element): void {
  if (fitterCount === 0) return;
  for (let e = node.parentElement; e; e = e.parentElement) {
    const f = fitters.get(e);
    if (f) {
      f();
      return;
    }
  }
}
// Première image où une figure qui montrait de la 3D s'est vu servir un pantin.
const missSince = new WeakMap<Element, number>();
// Image 3D (clé spriteKey3D), quel que soit le registre qui l'a rendue.
const is3DKey = (sk: string | null): boolean => sk !== null && sk.includes('@3d');
// Une figure qui montre de la 3D ne reçoit un pantin que si le registre n'a plus aucune image 3D de son habitant (sinon il sert
// la plus proche) : elle garde alors sa dernière image 3D au plus HOLD_3D_FRAMES images, puis montre le pantin.
function holdLast3D(reg: FigureRegistry, node: Element | null, shown: string | null, got: { sk: string } | null): boolean {
  if (!node) return false;
  if (shown === null || got === null || !is3DKey(shown) || reg.anchors(got.sk) !== null) {
    missSince.delete(node);
    return false;
  }
  const f = reg.frameNo();
  const s = missSince.get(node);
  if (s === undefined) {
    missSince.set(node, f);
    return true;
  }
  return f - s < HOLD_3D_FRAMES;
}
const offTransform = (off: Pt | null | undefined): string | undefined => (off ? `translate(${off[0]} ${off[1]})` : undefined);

// Montre l'image `sk` (déjà détenue par le nœud) : href, clé, pose, accroches, objets tenus visibles à leurs accroches.
function showSprite(reg: FigureRegistry, node: Element, sk: string, href: string, key: FigureKey): void {
  node.setAttribute('data-key', sk);
  const img = node.firstElementChild;
  img?.setAttribute('href', href);
  shownPoses.set(node, key);
  const was3D = shownAnchors.has(node);
  const pl = placed(reg, pinOf(node), sk, key);
  if (pl) shownAnchors.set(node, pl.a);
  else shownAnchors.delete(node);
  if (was3D !== (pl !== null)) shown3DChanged(node);
  const tr = offTransform(pl?.off);
  if (tr) img?.setAttribute('transform', tr);
  else img?.removeAttribute('transform');
  const kids = node.children;
  if (kids.length < 2) return;
  const t = heldTransforms(key, pl?.a, sk);
  for (let i = 1; i < kids.length; i++) {
    const h = kids[i]!;
    const a = h.getAttribute('data-held') as HeldAnchor | null;
    if (a === null) continue;
    h.setAttribute('transform', t[a]);
    h.removeAttribute('visibility');
  }
}

// Mise à jour d'une figure qui attend mieux que son image (rappelée par le registre après un flush utile) : true quand il n'y a
// plus rien à attendre (image 3D exacte montrée, figure cachée, plus de 3D) ; visages animés : suivie tant qu'elle est 3D.
function refreshFigure(reg: FigureRegistry, node: Element): boolean {
  const key = wantedPoses.get(node);
  const pk = node.getAttribute('data-palette');
  if (!key || pk === null || node.getAttribute('data-sig') !== key.sig) return true;
  const shown = node.getAttribute('data-key');
  const want = reg.keyFor(pk, key);
  if (shown !== want) {
    const got = reg.pick(pk, key, shown === null, shown === null && node.hasAttribute('data-wait3d'), shown);
    if (!got) return !reg.is3D(pk);
    if (got.sk !== shown && !holdLast3D(reg, node, shown, got)) {
      const href = reg.hold(node, got.sk);
      if (href) showSprite(reg, node, got.sk, href, key);
    }
  }
  if (!reg.is3D(pk)) return true;
  return !reg.animatedFaces() && node.getAttribute('data-key') === want;
}
// Suivi d'une figure 3D tant qu'elle ne montre pas son image 3D exacte (pantin de repli, rien, autre palier de lumière), ou
// tout le temps avec les visages animés (clignements des figures fixes).
function track(reg: FigureRegistry, node: Element, pk: string, key: FigureKey, want: string): void {
  wantedPoses.set(node, key);
  if (reg.wants3D(pk) && (reg.animatedFaces() || node.getAttribute('data-key') !== want)) reg.watch(node, () => refreshFigure(reg, node));
  else reg.unwatch(node);
}

// `hidden` : nœud inactif (habitant chez lui, client absent, passant hors présence) : <image> sans href, aucun sprite peint ;
// la boucle le remet en place par poseFigure. La palette suit le rendu (à la minute, avec le ciel, par paliers) ; au rendu,
// rien n'est peint si la figure a déjà une image : sprite de la nouvelle clé s'il existe, sinon l'image affichée (et sa clé
// détenue) reste et la nouvelle clé est mise en file ; la boucle (poseFigure, data-palette déjà à jour) la pose dès qu'elle
// est peinte. Seule une première apparition peint tout de suite (ensure). La clé affichée est détenue dès la mise en page,
// libérée au démontage ; les sprites de l'ancienne palette, libérés, partent avec le plafond.
// `guise` : déguisement d'Halloween (signature, palette, pantin 2D forcé) ; `work` : tenue de travail (dans la signature) ; `santa` : tenue du père Noël (dans la signature et la palette) ; `held` :
// objets tenus, posés aux accroches de la pose affichée dès le rendu (les foules immobiles n'appellent jamais poseFigure),
// déplacés ensuite par poseFigure, cachés avec la figure. `santa` et `haze` (pantin voilé de brume) : toujours le pantin 2D,
// même avec CITIZENS_3D (pas de base 3D du père Noël, pas de brume sur les sprites 3D) ; de même `flat` (pantin derrière une
// vitre, vie aux fenêtres : jamais la 3D) et `silhouette` (palette unie SILHOUETTE, contre-jour de nuit).
// Habitants 3D : `citizen` (graine ; défaut : hachage de la tenue), `kind` (enfant, ancien…), `emotion` (humeur du visage),
// `waitFor3D` (aucune image tant que la 3D peut arriver, WAIT3D_FALLBACK_MS au plus, puis pantin), `pin` (accroche 3D posée
// sur celle du pantin : selle du cycliste).
export function GhibliFigure({
  outfit,
  sky,
  rainy,
  umbrella,
  initial,
  hidden = false,
  work = 'none',
  santa = false,
  haze = 0,
  held,
  citizen,
  kind,
  waitFor3D = false,
  emotion,
  sex,
  beard,
  pin,
  flat = false,
  silhouette = false,
  guise,
}: {
  outfit: Outfit;
  sky: Sky;
  rainy: boolean;
  umbrella: boolean;
  initial: PoseIn;
  hidden?: boolean;
  work?: Work;
  santa?: boolean;
  haze?: number;
  held?: readonly Held[];
  citizen?: number;
  kind?: CitizenKind;
  waitFor3D?: boolean;
  emotion?: Emotion;
  sex?: 'm' | 'f';
  beard?: boolean;
  pin?: Anchor;
  flat?: boolean;
  silhouette?: boolean;
  guise?: Guise | null;
}): ReactElement {
  const reg = useFigureRegistry();
  if (useContext(EnterWait3D)) waitFor3D = true;
  const ref = useRef<SVGGElement | null>(null);
  // Déguisé (Halloween) : tenue de base du déguisement, toujours le pantin 2D (pas de déguisement sur la base 3D).
  if (guise) outfit = guiseOutfit(outfit, guise);
  const sig = signatureOf(shapeOf(outfit, umbrella, work, santa, guise ?? undefined));
  const pk = reg.addPalette(
    santa || haze > 0 || flat || silhouette || guise
      ? figurePalette(outfit, sky, rainy, undefined, { santa, haze, silhouette, guise: guise ?? undefined })
      : citizenPalette(reg, outfit, sky, rainy, umbrella, work, { citizen, kind, emotion, sex, beard }),
  );
  const key = keyOf(sig, initial);
  const want = reg.keyFor(pk, key);
  let shownKey: string | undefined;
  let href: string | undefined;
  // Pose des objets tenus : celle de l'image gardée tant que la nouvelle clé n'est pas peinte.
  let heldPose = key;
  if (!hidden) {
    // Image déjà affichée par ce nœud (rendu précédent ou boucle) : lue sur le nœud lui-même.
    const node = ref.current;
    const prevKey = node?.getAttribute('data-key') ?? null;
    const prevHref = node?.firstElementChild?.getAttribute('href') ?? null;
    const fresh = prevKey === null || prevHref === null;
    // waitFor3D : seulement à la première apparition ; une figure déjà dessinée (demi-tour, nouveau registre) n'est jamais figée.
    const got = reg.pick(pk, key, fresh, fresh && waitFor3D, prevKey);
    if (got && !holdLast3D(reg, node, prevKey, got)) {
      shownKey = got.sk;
      href = got.url;
    } else if (!fresh) {
      shownKey = prevKey;
      href = prevHref;
      heldPose = (node && shownPoses.get(node)) ?? key;
    }
  }
  // Accroches de l'image montrée : celles du rendu 3D (décalées par l'épingle) pour un sprite 3D, sinon celles du pantin.
  const pl = shownKey === undefined ? null : placed(reg, pin ?? null, shownKey, heldPose);
  const heldAt = held && held.length > 0 ? heldTransforms(heldPose, pl?.a, shownKey) : null;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const shown = node.getAttribute('data-key');
    if (hidden) {
      reg.unwatch(node);
      return () => void reg.hold(node, null);
    }
    if (shown !== null && (shown === want || shown === spriteKey(pk, key))) {
      shownPoses.set(node, key);
      const p = placed(reg, pinOf(node), shown, key);
      if (p) shownAnchors.set(node, p.a);
      else shownAnchors.delete(node);
    }
    if (shown !== null) reg.hold(node, shown);
    track(reg, node, pk, key, want);
    return () => {
      reg.unwatch(node);
      reg.hold(node, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, want, hidden]);
  return (
    <g data-figure="" data-sig={sig} data-palette={pk} data-key={shownKey} data-wait3d={CITIZENS_3D && waitFor3D ? '' : undefined} data-pin={CITIZENS_3D ? pin : undefined} ref={ref}>
      <image href={href} x={SPRITE_BOX.x0} y={SPRITE_BOX.y0} width={SPRITE_BOX.w} height={SPRITE_BOX.h} transform={offTransform(pl?.off)} />
      {heldAt &&
        held!.map((h, i) => (
          <g key={i} data-held={h.anchor} transform={heldAt[h.anchor]} visibility={hidden ? 'hidden' : undefined}>
            {h.node}
          </g>
        ))}
    </g>
  );
}

// Groupe qui entre par un bord avec ses personnages (vélo et cycliste, véhicule et occupants, unité du défilé) : sous ce
// contexte, chaque figure attend sa 3D (waitFor3D, en tête de file) ; la boucle du groupe le cache tant qu'il est hors champ et
// qu'un de ses personnages attend encore (gateEntering). Il entre ainsi directement en 3D : ni pantin qui change de modèle
// sous les yeux, ni véhicule vide.
export const EnterWait3D = createContext(false);
// Figures en attente d'un groupe (cherchées une fois par nœud ; vidée quand toutes ont une image).
const waitingOf = new WeakMap<Element, Element[]>();
// Groupe `root` montrable ? Hors champ (`onScreen` faux) : ses figures attendent leur 3D (false tant qu'une attend : le groupe
// reste caché). Dans le champ : l'attente est levée, pantin de repli tout de suite pour qui n'a pas encore sa 3D (true) — un
// groupe entré dans le champ est toujours montré entier.
export function gateEntering(reg: FigureRegistry, root: Element, onScreen: boolean): boolean {
  let figs = waitingOf.get(root);
  if (!figs) waitingOf.set(root, (figs = [...root.querySelectorAll('[data-figure][data-wait3d]')]));
  if (figs.length === 0) return true;
  let ready = true;
  for (const f of figs) {
    if (f.hasAttribute('data-key') || !f.hasAttribute('data-wait3d')) continue;
    if (onScreen) releaseWait3D(reg, f);
    else ready = false;
  }
  if (ready) waitingOf.set(root, figs.filter((f) => !f.hasAttribute('data-key') && f.hasAttribute('data-wait3d')));
  return ready;
}
// Fin de l'attente 3D d'une figure pas encore montrée : sa pose voulue est montrée tout de suite (3D si elle est là, sinon pantin).
function releaseWait3D(reg: FigureRegistry, node: Element): void {
  node.removeAttribute('data-wait3d');
  const key = wantedPoses.get(node);
  const pk = node.getAttribute('data-palette');
  if (!key || pk === null || node.getAttribute('data-sig') !== key.sig) return;
  const got = reg.pick(pk, key, true, false, null);
  if (!got) return;
  const href = reg.hold(node, got.sk);
  if (href) showSprite(reg, node, got.sk, href, key);
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; sprite manquant → demandé, image courante gardée. Une
// figure cachée (sans data-key) est remise en place tout de suite (sprite peint au besoin) : pas d'image vide à l'apparition
// (sauf waitFor3D : rien tant que la 3D peut arriver). Les objets tenus (enfants [data-held] après l'<image>) suivent la
// nouvelle image et redeviennent visibles. Habitant 3D montré en pantin : suivi jusqu'à son image 3D (track).
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: PoseIn): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  const pk = node.getAttribute('data-palette');
  if (!sig || pk === null) return;
  const key = keyOf(sig, pose);
  const want = reg.keyFor(pk, key);
  const shown = node.getAttribute('data-key');
  if (shown === want) return;
  const got = reg.pick(pk, key, shown === null, shown === null && node.hasAttribute('data-wait3d'), shown);
  if (got && got.sk !== shown && !holdLast3D(reg, node, shown, got)) {
    const href = reg.hold(node, got.sk);
    if (href) showSprite(reg, node, got.sk, href, key);
  }
  if (reg.wants3D(pk)) track(reg, node, pk, key, want);
}

// Demande d'avance des cycles 3D de poses à venir d'une figure (même cachée : sa palette et sa signature sont sur le nœud) :
// un habitant qui va sortir de sa porte apparaît directement en 3D. À renouveler avant PREWARM_TTL images. `lead` : secondes
// avant qu'il paraisse (priorité, voir FigureRegistry.prewarm ; inconnu : la plus basse).
export function prewarmFigure(reg: FigureRegistry, node: Element | null, poses: readonly PoseIn[], lead = Infinity): void {
  const sig = node?.getAttribute('data-sig');
  const pk = node?.getAttribute('data-palette');
  if (!CITIZENS_3D || !sig || pk === null || pk === undefined) return;
  for (const p of poses) reg.prewarm(pk, keyOf(sig, p), lead);
}
// Même chose pour un personnage qui n'a pas encore de nœud (voyageur encore dans le bus) : sa palette est celle que
// GhibliFigure calculera pour les mêmes réglages et la même identité.
export function prewarmCitizen(reg: FigureRegistry, look: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; work?: Work; id?: CitizenIdentity }, poses: readonly PoseIn[], lead = Infinity): void {
  if (!CITIZENS_3D) return;
  const work = look.work ?? 'none';
  const pk = reg.addPalette(citizenPalette(reg, look.outfit, look.sky, look.rainy, look.umbrella, work, look.id));
  const sig = signatureOf(shapeOf(look.outfit, look.umbrella, work));
  for (const p of poses) reg.prewarm(pk, keyOf(sig, p), lead);
}

// Cache une figure (nœud devenu inactif) : <image> sans href, data-key effacé, clé libérée, objets tenus cachés. Idempotent.
export function hideFigure(reg: FigureRegistry, node: Element | null): void {
  if (!node) return;
  reg.unwatch(node);
  wantedPoses.delete(node);
  const img = node.firstElementChild;
  if (!node.hasAttribute('data-key') && !img?.hasAttribute('href')) return;
  img?.removeAttribute('href');
  node.removeAttribute('data-key');
  shownPoses.delete(node);
  if (shownAnchors.delete(node)) shown3DChanged(node);
  reg.hold(node, null);
  const kids = node.children;
  for (let i = 1; i < kids.length; i++) if (kids[i]!.hasAttribute('data-held')) kids[i]!.setAttribute('visibility', 'hidden');
}
