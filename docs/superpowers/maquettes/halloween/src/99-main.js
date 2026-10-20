// ───────────── captures Halloween, mode animé, débogage ─────────────
function canvasFor(id, w, h, label) {
  const g = document.getElementById('gallery');
  const h2 = document.createElement('h2'); h2.textContent = label || id; g.appendChild(h2);
  const c = document.createElement('canvas'); c.id = id; c.width = w; c.height = h; g.appendChild(c);
  return c.getContext('2d');
}
// Vue rapprochée sur le lampadaire en cours de travail à l'heure T (camion-nacelle).
const lampView = (D, T, scale = 4) => { const s = buildStreet(D), A = hwDay(D.date) * 24 + T; const it = s.hwLamps.find((l) => hwLampState(l, A).crew) || s.hwLamps[1]; return { x0: Math.round(it.x - 170), y0: 150, w: 300, h: 260, scale }; };
// Immeuble héros, trottoir compris (la vue de vie-etages s'arrête au pied des façades).
const hwHeroView = (D, scale = 4) => { const h = buildStreet(D).hero; return { x0: Math.round(h.x + h.w / 2 - 150), y0: 66, w: 300, h: 280, scale }; };
const CAPTURES = [
  { id: 'mairie-24oct-10h', T: 10, date: '2026-10-24', zoom: 'lamp', note: 'samedi 24 oct. 10 h — la mairie pose les décors de lampadaire au camion-nacelle' },
  { id: 'habitants-24oct-15h05', T: 15 + 5.5 * MIN, date: '2026-10-24', note: 'samedi 24 oct. 15 h 05 — premiers habitants : toile sur la porte (escabeau), citrouilles' },
  { id: 'soir-27oct-19h', T: 19 + 0.6 * MIN, date: '2026-10-27', note: 'mardi 27 oct. 19 h — après le travail : sorcière posée au balcon, citrouilles allumées' },
  { id: 'nuit-31oct-21h', T: 21 + 0.5 * MIN, date: '2026-10-31', note: 'samedi 31 oct. 21 h — tout est posé, citrouilles et lanternes allumées' },
  { id: 'nuit-1nov-0h50', T: 50 * MIN, date: '2026-11-01', note: 'dimanche 1er nov. 0 h 50 — pièces éteintes, des citrouilles encore allumées' },
  { id: 'soir-2nov-21h', T: 21, date: '2026-11-02', note: 'lundi 2 nov. 21 h — la fête est passée : ce qui reste n’est plus allumé' },
  { id: 'retrait-3nov-11h', T: 11 + 0.2 * MIN, date: '2026-11-03', zoom: 'hero', note: 'mardi 3 nov. 11 h — retrait étalé : la mairie décroche, un habitant reprend sa toile' },
  { id: 'apres-9nov-12h', T: 12, date: '2026-11-09', note: 'lundi 9 nov. midi — plus rien' },
];
// Séquence de la porte (immeuble héros) : sortie avec l'escabeau, dépliage, montée, toile, descente, retour.
const DOOR_SEQ = [0.04, 0.12, 0.2, 0.28, 0.45, 0.64, 0.72, 0.82, 0.94].map((q) => 15 + q * 4 * MIN);
const LAMP_SEQ = [9.15, 9.5, 9.8, 10.2, 10.85, 11.1, 11.5];
function renderCaptures() {
  const ids = [];
  for (const cap of CAPTURES) {
    const D = dayContext(cap.date);
    renderScene(canvasFor(cap.id, W * 2, H * 2, `${cap.id} — ${cap.note}`), cap.T, D, fullView(2)); ids.push(cap.id);
    const view = cap.zoom === 'lamp' ? lampView(D, cap.T) : hwHeroView(D, 4);
    renderScene(canvasFor(cap.id + '-zoom', view.w * 4, view.h * 4, cap.id + '-zoom (×4)'), cap.T, D, view); ids.push(cap.id + '-zoom');
  }
  const D = dayContext('2026-10-24');
  DOOR_SEQ.forEach((T, i) => { const id = `porte-seq-${i + 1}`; renderScene(canvasFor(id, 1200, 1120, `${id} — ${fmtT(T)} (+${Math.round(((T - 15) * 3600))} s)`), T, D, hwHeroView(D, 4)); ids.push(id); });
  LAMP_SEQ.forEach((T, i) => { const id = `nacelle-seq-${i + 1}`; renderScene(canvasFor(id, 1200, 1040, `${id} — ${fmtT(T)}`), T, D, lampView(D, T)); ids.push(id); });
  renderHwPlanche(); ids.push('planche-decors');
  window.__ids = ids; window.__done = true;
}
const Q = new URLSearchParams(location.search);
if (Q.has('T')) { // débogage : ?T=18.98&date=2026-10-24&view=x0,y0,w,h,scale
  const D = dayContext(Q.get('date') || '2026-10-24');
  const v = (Q.get('view') || '0,0,900,400,2').split(',').map(Number); const view = { x0: v[0], y0: v[1], w: v[2], h: v[3], scale: v[4] };
  renderScene(canvasFor('dbg', view.w * view.scale, view.h * view.scale, 'dbg ' + fmtT(+Q.get('T'))), +Q.get('T'), D, view); window.__ids = ['dbg']; window.__done = true;
} else if (Q.has('h')) runAnimated(Q); else renderCaptures();
