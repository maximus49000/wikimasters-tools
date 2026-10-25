// Planche du catalogue : planche.html?kind=<kind|all>&style=<StyleId>&res=1 — kinds × 8 angles, rendus par le moteur seul (canvas).
import { yawOf } from '../../src/core/library/cel/camera';
import { REST_LIFE } from '../../src/core/library/cel/life-state';
import { lookOf } from '../../src/core/library/cel/looks';
import { celPartsOf } from '../../src/core/library/cel/models';
import type { Angle } from '../../src/core/library/footprint';
import { FURNITURE_MODELS } from '../../src/core/library/furniture-models';
import { FACE_CAMERA, spriteFrameOf } from '../../src/core/library/furniture-render3d';
import { STANDING_KINDS, STYLE_IDS, type StandingKind, type StyleId } from '../../src/core/library/library-types';
import { spriteJob } from '../../src/content/furniture/sprite-paint';

const q = new URLSearchParams(location.search);
const style = (STYLE_IDS as readonly string[]).includes(q.get('style') ?? '') ? (q.get('style') as StyleId) : 'scandinave';
const res = Number(q.get('res') ?? 1);
const kindQ = q.get('kind') ?? 'all';
const kinds = kindQ === 'all' ? [...STANDING_KINDS] : kindQ.split(',').filter((k): k is StandingKind => (STANDING_KINDS as readonly string[]).includes(k));
const LABELS = ['0 face', '1 ¾ avant gauche', '2 profil gauche', '3 ¾ arrière gauche', '4 dos', '5 ¾ arrière droit', '6 profil droit', '7 ¾ avant droit'];
const SHOW = 1.5; // px écran par px de pièce
const CELL = 190;

const out = document.getElementById('out')!;
const table = document.createElement('table');
table.style.cssText = 'border-collapse:collapse';
const head = table.insertRow();
head.insertCell().textContent = style;
for (const l of LABELS) {
  const c = head.insertCell();
  c.textContent = l;
  c.style.cssText = 'padding:2px 6px;font-weight:bold';
}
out.append(table);

void (async () => {
  for (const kind of kinds) {
    const tr = table.insertRow();
    const name = tr.insertCell();
    name.textContent = kind;
    name.style.cssText = 'padding:2px 6px;font-weight:bold;white-space:nowrap';
    for (let a = 0; a < 8; a++) {
      const angle = a as Angle;
      const frame = spriteFrameOf(FURNITURE_MODELS[kind], angle, FACE_CAMERA);
      const parts = celPartsOf(kind, lookOf(style), REST_LIFE, { lit: true });
      const job = spriteJob(parts, { cam: frame.cam, yaw: yawOf(angle), side: 'left', px: res, ss: 2 }, frame.anchor);
      while (!job.step(8)) await new Promise((r) => setTimeout(r));
      const sp = job.finish();
      const td = tr.insertCell();
      td.style.cssText = `width:${CELL}px;height:${CELL}px;position:relative;overflow:hidden;border:1px solid #bbb;background:#e8e2d6`;
      const img = document.createElement('img');
      // Dessin ajusté à la case (au plus ×1,5), centré : la planche sert à juger la forme, pas l'échelle.
      const k = Math.min(SHOW, (CELL - 10) / Math.max(sp.box.w, sp.box.h));
      img.style.cssText = `position:absolute;left:${(CELL - sp.box.w * k) / 2}px;top:${(CELL - sp.box.h * k) / 2}px;width:${sp.box.w * k}px;height:${sp.box.h * k}px`;
      img.src = sp.url;
      td.append(img);
    }
  }
  (window as unknown as { done: boolean }).done = true;
})();
