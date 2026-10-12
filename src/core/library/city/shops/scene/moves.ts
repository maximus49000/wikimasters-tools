import type { ArmPose, Gait } from '../../../figure/skeleton';

// Bibliothèque de gestes des commerces (G4b) : chaque geste est une chorégraphie de poses clés discrètes (le sprite du
// pantin est cuit par pose : pas d'interpolation de bras, une pose tient jusqu'à la suivante). Portée de la maquette du
// 2026-10-12 : les gestes continus de la maquette (sinus, easing) deviennent 2 à 4 poses clés ; le penché (`lean`) et la
// rotation de tête (`headYaw`, radians, > 0 vers le spectateur quand le pantin regarde à droite) rythment ce que les bras ne
// disent pas à 21 px (les gestes main-au-visage se ressemblent : la tête et le tempo les distinguent). Le metteur en scène
// tire la durée dans `dur`, place les objets (`prop`) et les pictos (`picto`) aux fractions indiquées, et appelle `keyAtTime`.
export type PictoId = 'question' | 'bang' | 'note' | 'joy' | 'sweat' | 'heart';
export type PropId = 'coin' | 'card' | 'ticket' | 'menu' | 'notepad' | 'plate' | 'glass' | 'parcel' | 'bouquet' | 'frames' | 'mirror' | 'sample' | 'cup' | 'book' | 'bag' | 'accessory';
export type KeyGait = Extract<Gait, 'stand' | 'seated' | 'crouch' | 'step'>;
// `at` : fraction du geste (ou d'une période pour une boucle) à laquelle la pose prend ; `gait` absent = allure du metteur en scène.
export type Key = { at: number; arms: ArmPose; lean: 0 | 1 | 2; headYaw: number; gait?: KeyGait };
export type Move = {
  id: MoveId;
  dur: readonly [number, number]; // durée min/max (s), tirée par le metteur en scène
  keys: readonly Key[]; // at ∈ [0,1], croissant, premier at = 0 ; boucle si `loop`
  loop?: boolean; // poses clés rejouées en boucle pendant la durée (essuyer, ciseaux…)
  period?: number; // boucle : durée (s) d'un cycle des poses clés
  prop?: { id: PropId; hand: 'handR' | 'handL'; from: number; to: number }; // objet tenu entre deux fractions du geste entier
  picto?: { id: PictoId; at: number }; // picto au-dessus de la tête, à cette fraction du geste entier
};

export const MOVE_IDS = [
  // Accueil
  'greet', 'nod', 'wave-hello', 'wave-bye',
  // Demande
  'ask', 'point-item', 'chin-think', 'change-mind', 'ask-way', 'point-aisle',
  // Service
  'fetch', 'hand-over', 'take-item', 'prepare', 'put-down', 'carry-out',
  // Paiement
  'pay-card', 'pay-cash', 'count-change', 'search-wallet', 'give-change', 'print-ticket',
  // Attente
  'wait', 'wait-impatient', 'beckon-wait', 'call-colleague', 'lean-counter', 'chat', 'listen', 'cross-arms',
  // Boutique vide
  'tidy-shelf', 'wipe-counter', 'look-window', 'phone-idle', 'yawn', 'stretch', 'read-idle', 'colleague-chat', 'browse-shelf',
  // Aléas
  'drop-coin', 'pick-coin', 'sneeze', 'phone-ring', 'child-tug', 'hold-child', 'child-point', 'shrug',
  // Groupes
  'couple-look', 'toast', 'drink', 'ask-bill',
  // Reconnaissance
  'recognize', 'hug-hello', 'let-pass', 'after-you',
  // Restaurant
  'sit', 'show-table', 'hand-menu', 'read-menu', 'take-order', 'carry-plates', 'serve-plate', 'eat', 'clear-table', 'bring-bill',
  // Signatures
  'weigh', 'wrap', 'cut-sample', 'taste', 'offer-frames', 'try-frames', 'look-mirror', 'hold-mirror', 'shampoo', 'cut-hair', 'lie-back',
  'pick-stems', 'compose-bouquet', 'pour-wine', 'sniff-wine', 'sip-wine', 'tattoo', 'wince', 'explain-box', 'listen-nod', 'brew-coffee',
  // Réactions à la rue
  'look-street', 'wait-rain', 'head-turn',
] as const;
export type MoveId = (typeof MOVE_IDS)[number];

type Opts = Pick<Move, 'prop' | 'picto'>;
// Pose clé : `k(at, bras, penché, tête, allure)`.
const k = (at: number, arms: ArmPose, lean: 0 | 1 | 2 = 0, headYaw = 0, gait?: KeyGait): Key => gait ? { at, arms, lean, headYaw, gait } : { at, arms, lean, headYaw };
const mv = (id: MoveId, dur: readonly [number, number], keys: readonly Key[], o: Opts = {}): Move => ({ id, dur, keys, ...o });
// Boucle : `dur[0]` ≥ `period` (au moins un cycle complet).
const loop = (id: MoveId, period: number, dur: readonly [number, number], keys: readonly Key[], o: Opts = {}): Move => ({ id, dur, keys, loop: true, period, ...o });
const R = 'handR' as const;
const L = 'handL' as const;
const held = (id: PropId, from: number, to: number, hand: 'handR' | 'handL' = R) => ({ id, hand, from, to });
const picto = (id: PictoId, at: number) => ({ id, at });
// Tête : un cran de sprite (π/8) et un demi-cran.
const H = Math.PI / 8;
const h = H / 2;

export const MOVES: Readonly<Record<MoveId, Move>> = {
  // ---- Accueil : courts, le penché fait le salut de tête ----
  greet: mv('greet', [1, 1.6], [k(0, 'wave'), k(0.45, 'down', 1), k(0.8, 'down')]),
  nod: mv('nod', [0.8, 1.2], [k(0, 'down'), k(0.3, 'down', 1), k(0.7, 'down')]),
  'wave-hello': mv('wave-hello', [1, 1.6], [k(0, 'wave'), k(0.4, 'wave', 0, h), k(0.8, 'down')]),
  // Au revoir : la tête reste tournée vers l'employé pendant qu'on s'en va, bras baissé plus tard.
  'wave-bye': mv('wave-bye', [1.2, 2], [k(0, 'wave', 0, H), k(0.5, 'wave', 1, H), k(0.85, 'down', 0, h)]),

  // ---- Demande ----
  ask: mv('ask', [2, 4], [k(0, 'give'), k(0.4, 'hold', 1), k(0.85, 'down')]),
  'point-item': mv('point-item', [1.5, 2.5], [k(0, 'point', 1, h), k(0.5, 'point', 1), k(0.85, 'down')]),
  // Hésite : main au menton, tête qui penche d'un côté puis de l'autre (pas de penché du buste : c'est l'inverse du bâillement).
  'chin-think': mv('chin-think', [2.5, 5], [k(0, 'chin', 0, h), k(0.5, 'chin', 0, -h)], { picto: picto('question', 0.2) }),
  // Indécis : désigne, se ravise (menton), redésigne ailleurs (`!`).
  'change-mind': mv('change-mind', [3.5, 5], [k(0, 'point', 1, H), k(0.3, 'chin', 0, 0), k(0.6, 'point', 1, -H), k(0.9, 'down')], { picto: picto('bang', 0.65) }),
  // Perdu : regarde partout puis demande, main ouverte.
  'ask-way': mv('ask-way', [3, 5], [k(0, 'down', 0, 2 * H), k(0.3, 'down', 0, -2 * H), k(0.6, 'give', 0, 0), k(0.9, 'down')], { picto: picto('question', 0.35) }),
  'point-aisle': mv('point-aisle', [1.5, 2.5], [k(0, 'point', 0, 2 * H), k(0.55, 'point', 0, H), k(0.85, 'down')]),

  // ---- Service : l'objet apparaît à la prise (`take`) et part à la remise (`give`) ----
  fetch: mv('fetch', [2, 4], [k(0, 'down', 0, -H), k(0.3, 'take', 1, -h), k(0.55, 'hold'), k(0.8, 'hold', 0, H)], { prop: held('accessory', 0.45, 1) }),
  'hand-over': mv('hand-over', [1.5, 2.5], [k(0, 'hold'), k(0.3, 'give', 1), k(0.6, 'give'), k(0.85, 'down')], { prop: held('accessory', 0, 0.7) }),
  'take-item': mv('take-item', [1.2, 2], [k(0, 'reach'), k(0.3, 'take', 1), k(0.6, 'hold')], { prop: held('accessory', 0.4, 1) }),
  prepare: loop('prepare', 5, [5, 20], [k(0, 'work', 1), k(0.3, 'take', 1), k(0.55, 'work', 1, h), k(0.8, 'work', 2)]),
  'put-down': mv('put-down', [1, 1.6], [k(0, 'hold'), k(0.3, 'take', 1), k(0.7, 'down')], { prop: held('accessory', 0, 0.5) }),
  'carry-out': mv('carry-out', [2, 6], [k(0, 'hold'), k(0.5, 'hold', 0, h)], { prop: held('accessory', 0, 1) }),

  // ---- Paiement ----
  'pay-card': mv('pay-card', [2, 3.5], [k(0, 'take'), k(0.3, 'pay-card', 1), k(0.6, 'pay-card', 1, h), k(0.8, 'take')], { prop: held('card', 0.25, 0.85) }),
  'pay-cash': mv('pay-cash', [2.5, 4], [k(0, 'take'), k(0.3, 'pay-cash'), k(0.65, 'give', 1), k(0.9, 'down')], { prop: held('coin', 0.3, 0.8) }),
  'count-change': mv('count-change', [2, 4], [k(0, 'work', 1), k(0.3, 'take', 1), k(0.55, 'work', 2), k(0.85, 'hold')], { prop: held('coin', 0.35, 1) }),
  // Cherche sa monnaie : les deux mains aux poches, tête baissée qui va et vient (goutte de gêne).
  'search-wallet': loop('search-wallet', 2.4, [2.4, 6], [k(0, 'pay-cash', 1), k(0.4, 'take', 1, -h), k(0.7, 'pay-cash', 1, h)], { picto: picto('sweat', 0.6) }),
  'give-change': mv('give-change', [1.2, 2], [k(0, 'give', 1), k(0.4, 'give'), k(0.7, 'down')], { prop: held('coin', 0, 0.55) }),
  'print-ticket': mv('print-ticket', [2.5, 4], [k(0, 'work', 1), k(0.3, 'down', 0, -H), k(0.55, 'take', 1), k(0.75, 'give')], { prop: held('ticket', 0.6, 1) }),

  // ---- Attente ----
  wait: loop('wait', 6, [6, 25], [k(0, 'down'), k(0.4, 'down', 0, H), k(0.7, 'down', 0, -h)]),
  // S'impatiente : bras croisés, regarde la file, consulte sa montre (mains devant soi, penché).
  'wait-impatient': loop('wait-impatient', 4, [4, 20], [k(0, 'crossed'), k(0.35, 'crossed', 0, 2 * H), k(0.6, 'read', 1), k(0.85, 'crossed', 0, -h)], { picto: picto('sweat', 0.5) }),
  // « J'arrive » : bras levé vers le suivant, tête tournée vers lui.
  'beckon-wait': mv('beckon-wait', [1.2, 2], [k(0, 'beckon', 0, H), k(0.35, 'beckon', 0, h), k(0.7, 'down')]),
  // Appelle le collègue en réserve : bras levé vers l'arrière-boutique (`!`), puis geste de la main.
  'call-colleague': mv('call-colleague', [1.5, 2.5], [k(0, 'beckon', 0, -2 * H), k(0.4, 'wave', 0, -2 * H), k(0.8, 'down')], { picto: picto('bang', 0.1) }),
  'lean-counter': loop('lean-counter', 6, [6, 25], [k(0, 'work', 2, h), k(0.5, 'work', 2, -H)]),
  // Bavarde : petits gestes des mains, tête qui bouge.
  chat: loop('chat', 5, [5, 25], [k(0, 'hold', 0, h), k(0.3, 'give', 0, 0), k(0.55, 'down', 0, H), k(0.8, 'hold', 0, -h)]),
  listen: loop('listen', 4, [4, 12], [k(0, 'down', 0, h), k(0.5, 'down', 1, h), k(0.75, 'down', 0, 0)]),
  'cross-arms': mv('cross-arms', [2, 4], [k(0, 'crossed'), k(0.6, 'crossed', 0, h)]),

  // ---- Boutique vide : boucles lentes ----
  'tidy-shelf': loop('tidy-shelf', 6, [6, 20], [k(0, 'take', 1), k(0.3, 'shelve'), k(0.55, 'shelve', 0, H), k(0.8, 'take', 1, h)]),
  'wipe-counter': loop('wipe-counter', 1.6, [5, 20], [k(0, 'wipe-1', 1), k(0.5, 'wipe-2', 1), k(0.8, 'wipe-2', 2, -h)]),
  // Regarde par la vitrine, bras croisés, tête qui suit la rue.
  'look-window': loop('look-window', 8, [8, 25], [k(0, 'crossed', 0, 2 * H), k(0.4, 'crossed', 0, H), k(0.7, 'crossed', 0, 3 * H)]),
  // Téléphone en main (pas de prop : l'écran est trop petit), penché dessus.
  'phone-idle': loop('phone-idle', 7, [7, 25], [k(0, 'read', 1), k(0.45, 'read', 1, -h), k(0.75, 'read', 2)]),
  // Bâille : buste droit, tête relevée (la main-au-visage de l'hésitation a le buste droit mais la tête penchée de côté).
  yawn: mv('yawn', [2, 3], [k(0, 'down'), k(0.2, 'yawn'), k(0.75, 'down', 0, h)]),
  stretch: mv('stretch', [2.5, 4], [k(0, 'down'), k(0.2, 'stretch-1'), k(0.5, 'stretch-2'), k(0.75, 'stretch-1', 0, h), k(0.9, 'down')]),
  // Lit : tourne une page une fois par cycle.
  'read-idle': loop('read-idle', 8, [8, 25], [k(0, 'read', 1), k(0.5, 'read', 1, h), k(0.85, 'take', 1)], { prop: held('book', 0, 1, L) }),
  'colleague-chat': loop('colleague-chat', 6, [8, 25], [k(0, 'crossed', 0, h), k(0.3, 'give', 0, h), k(0.6, 'down', 0, H), k(0.8, 'crossed', 0, 0)]),
  // Feuillette un rayon : prend, lit, repose, regarde plus loin.
  'browse-shelf': loop('browse-shelf', 8, [8, 25], [k(0, 'take', 0, h), k(0.25, 'read', 1), k(0.65, 'shelve'), k(0.85, 'down', 0, -H)]),

  // ---- Aléas ----
  'drop-coin': mv('drop-coin', [1.2, 2], [k(0, 'pay-cash'), k(0.35, 'down', 1, -H), k(0.6, 'down', 2, -H)], { prop: held('coin', 0, 0.35), picto: picto('sweat', 0.45) }),
  // Ramasse : plié, accroupi (`pick` va avec `crouch`), se relève la pièce en main.
  'pick-coin': mv('pick-coin', [2, 3], [k(0, 'down', 1, -h, 'stand'), k(0.25, 'pick', 1, 0, 'crouch'), k(0.65, 'take', 1, 0, 'stand'), k(0.85, 'hold')], { prop: held('coin', 0.6, 1) }),
  // Éternue : tête en arrière (buste droit, main devant), puis coup sec plié en deux, se redresse.
  sneeze: mv('sneeze', [1.4, 2], [k(0, 'down', 0, -h), k(0.25, 'sneeze', 0, -h), k(0.55, 'sneeze', 2, 0), k(0.75, 'down', 1), k(0.9, 'down')]),
  'phone-ring': mv('phone-ring', [4, 8], [k(0, 'down', 0, -H), k(0.15, 'take', 1), k(0.3, 'phone'), k(0.6, 'phone', 0, H), k(0.9, 'down')], { picto: picto('bang', 0.1) }),
  // L'enfant tire la manche, tête levée vers l'adulte.
  'child-tug': mv('child-tug', [2, 3.5], [k(0, 'tug', 0, H), k(0.3, 'tug', 1, H), k(0.55, 'tug', 0, H), k(0.85, 'down', 0, h)]),
  'hold-child': loop('hold-child', 5, [5, 25], [k(0, 'hold-child', 0, H), k(0.4, 'hold-child', 1, 2 * H), k(0.7, 'hold-child', 0, h)]),
  'child-point': mv('child-point', [2, 3], [k(0, 'point', 0, H), k(0.3, 'point', 1, 0), k(0.6, 'down', 0, 2 * H)], { picto: picto('bang', 0.1) }),
  // S'excuse (complet, rupture) : main ouverte, tête penchée.
  shrug: mv('shrug', [1.2, 2], [k(0, 'give', 0, H), k(0.5, 'give', 1, H), k(0.85, 'down')]),

  // ---- Groupes ----
  'couple-look': mv('couple-look', [2, 3.5], [k(0, 'down', 0, 2 * H), k(0.4, 'down', 1, 2 * H), k(0.8, 'down', 0, H)], { picto: picto('heart', 0.3) }),
  toast: mv('toast', [2.5, 4], [k(0, 'toast-1'), k(0.3, 'toast-2', 1), k(0.55, 'toast-2'), k(0.8, 'toast-1')], { prop: held('glass', 0, 1), picto: picto('note', 0.4) }),
  drink: mv('drink', [2, 3.5], [k(0, 'toast-1'), k(0.3, 'taste', 0, 0), k(0.7, 'toast-1', 0, h)], { prop: held('glass', 0, 1) }),
  // Demande la note d'un signe : bras levé vers le serveur, puis « griffonne » en l'air.
  'ask-bill': mv('ask-bill', [1.5, 2.5], [k(0, 'beckon', 0, H), k(0.35, 'notepad', 0, H), k(0.8, 'down')]),

  // ---- Reconnaissance ----
  recognize: mv('recognize', [1.5, 2.5], [k(0, 'down', 0, 2 * H), k(0.3, 'wave', 0, 2 * H), k(0.65, 'wave', 0, H)], { picto: picto('bang', 0.15) }),
  'hug-hello': mv('hug-hello', [2, 3.5], [k(0, 'wave'), k(0.3, 'carry', 1), k(0.5, 'carry', 2), k(0.8, 'down')], { picto: picto('joy', 0.45) }),
  // Cède son tour : main ouverte vers le comptoir, tête vers l'autre.
  'let-pass': mv('let-pass', [1.2, 2], [k(0, 'give', 1, -2 * H), k(0.5, 'give', 1, -H), k(0.85, 'down')]),
  'after-you': mv('after-you', [1.2, 1.6], [k(0, 'give', 0, -H), k(0.4, 'give', 1, -H), k(0.85, 'down', 0, -h)]),

  // ---- Restaurant ----
  // Assis au repos (table, fauteuil, chaise d'attente) : le client attablé ou installé attend assis, pas debout.
  sit: loop('sit', 6, [6, 25], [k(0, 'down', 0, 0, 'seated'), k(0.5, 'down', 0, h, 'seated')]),
  'show-table': mv('show-table', [1.5, 2.5], [k(0, 'point', 0, -H), k(0.4, 'point', 1, -H), k(0.7, 'give', 1, 0)]),
  'hand-menu': mv('hand-menu', [1.2, 2], [k(0, 'hold'), k(0.3, 'give', 1), k(0.75, 'down')], { prop: held('menu', 0, 0.65) }),
  'read-menu': loop('read-menu', 6, [6, 25], [k(0, 'read', 1, 0, 'seated'), k(0.4, 'read', 1, H, 'seated'), k(0.7, 'read', 2, 0, 'seated')], { prop: held('menu', 0, 1, L) }),
  // Prend la commande : regarde le client, écrit, regarde l'autre.
  'take-order': loop('take-order', 5, [5, 20], [k(0, 'notepad', 1, H), k(0.35, 'notepad', 1, 0), k(0.7, 'notepad', 0, -H)], { prop: held('notepad', 0, 1, L) }),
  'carry-plates': mv('carry-plates', [2, 6], [k(0, 'plates'), k(0.5, 'plates', 1)], { prop: held('plate', 0, 1) }),
  'serve-plate': mv('serve-plate', [1.5, 2.5], [k(0, 'plates'), k(0.35, 'take', 1), k(0.7, 'down', 1), k(0.9, 'down')], { prop: held('plate', 0, 0.5) }),
  eat: loop('eat', 5, [10, 25], [k(0, 'work', 1, 0, 'seated'), k(0.3, 'taste', 0, 0, 'seated'), k(0.55, 'taste', 0, h, 'seated'), k(0.75, 'work', 1, 0, 'seated')]),
  'clear-table': mv('clear-table', [2, 4], [k(0, 'take', 1), k(0.3, 'take', 2), k(0.6, 'plates')], { prop: held('plate', 0.55, 1) }),
  'bring-bill': mv('bring-bill', [1.2, 2], [k(0, 'hold'), k(0.35, 'give', 1), k(0.8, 'down')], { prop: held('ticket', 0, 0.7) }),

  // ---- Signatures ----
  weigh: loop('weigh', 3, [3, 6], [k(0, 'take', 1), k(0.3, 'weigh', 1), k(0.65, 'weigh', 2)]),
  // Emballe : mains qui se croisent, le paquet apparaît à la fin.
  wrap: loop('wrap', 2, [4, 8], [k(0, 'wrap-1', 1), k(0.25, 'wrap-2', 1), k(0.5, 'wrap-1', 2), k(0.75, 'wrap-2', 1)], { prop: held('parcel', 0.8, 1) }),
  'cut-sample': mv('cut-sample', [2, 3.5], [k(0, 'work', 1), k(0.5, 'take', 1), k(0.75, 'give')], { prop: held('sample', 0.55, 1) }),
  // Goûte : prend l'éclat, le porte à la bouche, savoure la tête tournée (traits de joie).
  taste: mv('taste', [2.5, 4], [k(0, 'take'), k(0.3, 'taste'), k(0.65, 'taste', 0, H)], { prop: held('sample', 0, 0.3), picto: picto('joy', 0.75) }),
  'offer-frames': mv('offer-frames', [1.5, 2.5], [k(0, 'take', 1), k(0.35, 'give'), k(0.8, 'give', 0, h)], { prop: held('frames', 0.2, 1) }),
  // Essaie : prend la monture, la pose aux tempes, tourne la tête, et la garde sur le nez (le metteur en scène la lui laisse,
  // `carry: 'frames'`). Convention de rendu (signatures.ts) : la monture est en main dans la fenêtre d'objet d'un geste,
  // portée sur le visage partout ailleurs (ici dès 0,3 ; pendant `look-mirror` qui suit).
  'try-frames': mv('try-frames', [3, 5], [k(0, 'take'), k(0.3, 'frames'), k(0.6, 'frames', 0, 2 * H), k(0.85, 'down', 0, 2 * H)], { prop: held('frames', 0.1, 0.3) }),
  // Se regarde dans le miroir : tête tournée vers lui, un penché pour mieux voir ; ça plaît (traits de joie).
  'look-mirror': mv('look-mirror', [2, 4], [k(0, 'down', 0, 2 * H), k(0.4, 'down', 1, 3 * H), k(0.75, 'down', 0, H)], { picto: picto('joy', 0.6) }),
  'hold-mirror': mv('hold-mirror', [3, 5], [k(0, 'take'), k(0.15, 'mirror', 0, H), k(0.6, 'mirror', 1, H)], { prop: held('mirror', 0.15, 1) }),
  shampoo: loop('shampoo', 2.4, [6, 25], [k(0, 'shampoo', 1), k(0.4, 'shampoo', 2), k(0.7, 'shampoo', 1, h)]),
  'cut-hair': loop('cut-hair', 1.6, [8, 25], [k(0, 'scissors-1', 1), k(0.25, 'scissors-2', 1), k(0.5, 'scissors-1', 1, -h), k(0.75, 'scissors-2', 1)]),
  // Client renversé au bac : assis, tête en arrière.
  'lie-back': mv('lie-back', [1.5, 2.5], [k(0, 'down', 0, 0, 'seated'), k(0.5, 'down', 0, -h, 'seated')]),
  // Aux seaux : s'accroupit, choisit, se relève les tiges en main.
  'pick-stems': mv('pick-stems', [3, 5], [k(0, 'down', 1, 0, 'stand'), k(0.2, 'pick', 1, 0, 'crouch'), k(0.45, 'pick', 1, H, 'crouch'), k(0.7, 'take', 1, 0, 'stand'), k(0.9, 'hold')], { prop: held('bouquet', 0.65, 1) }),
  'compose-bouquet': loop('compose-bouquet', 3, [6, 12], [k(0, 'wrap-1', 1), k(0.3, 'work', 1), k(0.55, 'wrap-2', 1), k(0.8, 'work', 2)], { prop: held('bouquet', 0.85, 1) }),
  'pour-wine': mv('pour-wine', [2.5, 4], [k(0, 'take', 1), k(0.25, 'pour', 1), k(0.6, 'pour', 2), k(0.8, 'give')], { prop: held('glass', 0.75, 1) }),
  // Sent le verre : penché dessus, tête qui s'incline (♪).
  'sniff-wine': mv('sniff-wine', [3, 5], [k(0, 'take', 1), k(0.25, 'sniff', 1), k(0.6, 'sniff', 1, -h)], { prop: held('glass', 0, 1), picto: picto('note', 0.8) }),
  // Goûte le fond de verre (déjà en main) : lève, boit, savoure la tête tournée (traits de joie) ; le verre reste en main.
  'sip-wine': mv('sip-wine', [2.5, 4], [k(0, 'toast-1'), k(0.3, 'taste'), k(0.65, 'toast-1', 0, H)], { prop: held('glass', 0, 1), picto: picto('joy', 0.8) }),
  tattoo: loop('tattoo', 8, [10, 25], [k(0, 'work', 2), k(0.3, 'work', 2, h), k(0.6, 'wipe-2', 2), k(0.8, 'work', 2)]),
  // Le client grimace : assis, crispé, tête détournée (goutte).
  wince: mv('wince', [1.5, 2.5], [k(0, 'crossed', 1, -H, 'seated'), k(0.3, 'crossed', 2, -H, 'seated'), k(0.7, 'crossed', 1, 0, 'seated')], { picto: picto('sweat', 0.35) }),
  // Pharmacien : prend la boîte, pointe la notice, la tend.
  'explain-box': mv('explain-box', [3, 5], [k(0, 'take'), k(0.3, 'point', 1), k(0.55, 'point', 1, h), k(0.8, 'give')], { prop: held('accessory', 0.1, 1, L) }),
  'listen-nod': mv('listen-nod', [2, 4], [k(0, 'down'), k(0.3, 'down', 1), k(0.55, 'down'), k(0.8, 'down', 1)]),
  // Barista : machine, mouture, tasse posée.
  'brew-coffee': loop('brew-coffee', 5, [5, 10], [k(0, 'work', 1), k(0.3, 'pour', 1), k(0.6, 'work', 1, -H), k(0.85, 'take', 1)], { prop: held('cup', 0.85, 1) }),

  // ---- Réactions à la rue ----
  'look-street': mv('look-street', [2, 5], [k(0, 'down', 0, 3 * H), k(0.6, 'down', 0, 2 * H)]),
  'wait-rain': loop('wait-rain', 6, [6, 25], [k(0, 'crossed', 0, H), k(0.4, 'crossed', 0, -h), k(0.7, 'down', 0, 2 * H)]),
  // Klaxon, bus : tête seule, ~1 s.
  'head-turn': mv('head-turn', [1, 1.6], [k(0, 'down', 0, 2 * H), k(0.7, 'down')]),
};

// Pose clé courante : `u` ∈ [0,1] fraction du geste (ou d'une période pour une boucle) ; une pose tient jusqu'à la suivante.
export function keyAt(m: Move, u: number): Key {
  const v = u < 0 ? 0 : u > 1 ? 1 : u;
  let cur = m.keys[0]!;
  for (const key of m.keys) {
    if (key.at > v) break;
    cur = key;
  }
  return cur;
}

// Pose clé à `elapsedS` secondes du début d'un geste de durée `durS` : fraction du geste, ou de la période s'il boucle.
export function keyAtTime(m: Move, elapsedS: number, durS: number): Key {
  if (m.loop && m.period) {
    const r = elapsedS % m.period;
    return keyAt(m, (r < 0 ? r + m.period : r) / m.period);
  }
  return keyAt(m, durS > 0 ? elapsedS / durS : 0);
}
