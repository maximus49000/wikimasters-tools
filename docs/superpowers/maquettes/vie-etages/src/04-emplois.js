// ───────────── emplois du temps (par foyer, par jour) ─────────────
// Un emploi du temps = liste de segments. Tout est une fonction pure de T : les captures sont déterministes.
//  { k:'lit', room, t0, t1, tone }          pièce allumée
//  { k:'shut'|'curt'|'win', room, t, to, dur } volets (1 = ouverts) / rideaux (1 = tirés) / fenêtre (1 = ouverte)
//  { k:'act', t0, t1, room, where:'in'|'lean'|'balcony', choreo, m, ... } un membre joue une chorégraphie
//  { k:'return'|'depart', t, m }            arrivée à la porte de l'immeuble / sortie par la porte (rue + cage)
//  { k:'sapin', t0, t1 } { k:'party', t0, t1 }
function buildSchedule(home, D, forced = {}) {
  const hh = home.hh, r = mulberry32(hh.seed), S = [];
  const rooms = home.rooms, has = (n) => rooms.includes(n);
  const K = has('cuisine') ? 'cuisine' : 'salon', L = 'salon', C = has('chambre') ? 'chambre' : null;
  const j = forced.jitter ?? hh.jitter, j2 = forced.jitter2 ?? hh.jitter2, we = D.weekend, [sr, ss] = SUNS[D.month - 1];
  const ms = hh.members.map((_, i) => i), n = ms.length, m2 = n > 1 ? 1 : 0;
  const lit = (room, t0, t1, tone) => S.push({ k: 'lit', room, t0, t1, tone: tone || hh.tone });
  const shut = (room, t, to, dur) => S.push({ k: 'shut', room, t, to, dur: dur || 1.2 * MIN });
  const curt = (room, t, to, dur) => S.push({ k: 'curt', room, t, to, dur: dur || 0.6 * MIN });
  const win = (room, t, to, dur) => S.push({ k: 'win', room, t, to, dur: dur || 0.25 * MIN });
  const act = (t0, dur, room, where, choreo, m, x) => S.push(Object.assign({ k: 'act', t0, t1: t0 + dur, room, where, choreo, m: m || 0 }, x || {}));
  const street = (kind, t, m) => S.push({ k: kind, t, m: m || 0 });
  // chorégraphies composées
  const openShutters = (room, t, m, slow) => { const d = slow ? 1.5 : 1; lit(room, t - 0.3 * MIN, t + 18 * MIN); act(t, 3.4 * MIN * d, room, 'in', 'openShutters', m); shut(room, t + 1.0 * MIN * d, 1, 1.3 * MIN * d); win(room, t + 2.35 * MIN * d, 1); };
  const quickShut = (room, t, m, to) => { act(t, 1.1 * MIN, room, 'in', 'armsUp', m); shut(room, t + 0.3 * MIN, to, 0.7 * MIN); };
  const closeShutters = (room, t, m) => { act(t, 1.6 * MIN, room, 'in', 'closeShutters', m); win(room, t + 0.35 * MIN, 0); shut(room, t + 0.6 * MIN, 0, 0.9 * MIN); };
  const drawCurt = (room, t, m) => { act(t, 1.0 * MIN, room, 'in', 'drawCurtains', m); curt(room, t + 0.3 * MIN, 1, 0.5 * MIN); };
  const openCurt = (room, t, m) => { act(t, 0.8 * MIN, room, 'in', 'drawCurtains', m, { reverse: true }); curt(room, t + 0.2 * MIN, 0, 0.4 * MIN); };
  const meal = (room, t, dur, who) => who.forEach((m, i) => act(t + i * 0.5 * MIN, dur - i * 0.5 * MIN - (i ? 0.6 * MIN : 0), room, 'in', 'table', m, { seat: i, party: who.length }));
  const tv = (t0, t1, who) => { lit(L, t0, t1, 'tv'); who.forEach((m, i) => act(t0 + 0.4 * MIN + i * 0.3 * MIN, t1 - t0 - 1.2 * MIN, L, 'in', 'tv', m, { seat: i })); };
  const smoke = (t, m) => { if (home.balcony) { act(t, 4.6 * MIN, L, 'balcony', 'smoke', m); win(L, t - 0.1 * MIN, 1); win(L, t + 4.6 * MIN, 0); } else { act(t, 3.6 * MIN, K, 'lean', 'smoke', m); win(K, t - 0.1 * MIN, 1); win(K, t + 3.6 * MIN, 0); } };
  const look = (t, dur, m, room = L) => { act(t, dur, room, home.balcony && room === L ? 'balcony' : 'lean', home.balcony && room === L ? 'leanRail' : 'lean', m); win(room, t - 0.1 * MIN, 1); win(room, t + dur, 0); };
  const arrive = (t, m) => { street('return', t, m); return t + home.climb; };
  const leave = (t, m) => { street('depart', t, m); };
  const nightfall = Math.max(ss + 0.35, 18.1);
  let shutUser = true, curtUser = true;

  switch (hh.type) {
    case 'couple': {
      const wake = (we ? 8.6 : 6.78) + j, out = wake + 52 * MIN;
      lit(K, wake, out + 3 * MIN); quickShut(K, wake + 0.4 * MIN, 0, 1); act(wake + 1.6 * MIN, 7 * MIN, K, 'in', 'cook', 0);
      openShutters(L, wake + 8 * MIN, 1); if (C) quickShut(C, wake + 14 * MIN, 1, 1);
      openCurt(L, wake + 11.6 * MIN, 1);
      meal(K, wake + 15 * MIN, 22 * MIN, ms);
      if (!we) { win(L, out - 2 * MIN, 0); leave(out, 0); leave(out + 14 * MIN, 1); }
      else { look(wake + 45 * MIN, 9 * MIN, 1); meal(K, 12.9 + j, 40 * MIN, ms); win(L, out, 0); leave(14.6 + j, 0); leave(14.6 + j + 0.3 * MIN, 1); }
      const back = (we ? 18.2 : 18.5) + j2, tA = arrive(back, 0);
      lit(K, tA, 21.3 + j2); act(tA + 0.15 * MIN, 0.5 * MIN, L, 'in', 'cross', 0); lit(L, tA + 0.3 * MIN, 23.1 + j2 * 0.5);
      drawCurt(L, tA + 1.0 * MIN, 0);
      const tB = arrive(back + 35 * MIN + r() * 15 * MIN, 1); act(tB + 0.15 * MIN, 0.5 * MIN, L, 'in', 'cross', 1);
      act(tB + 1 * MIN, 25 * MIN, K, 'in', 'cook', 1);
      meal(K, 20.45 + j2 * 0.5, 42 * MIN, ms);
      tv(21.2 + j2 * 0.5, 23.05 + j2 * 0.5, ms);
      if (hh.smoker) smoke(21.25 + j2 * 0.5, 0);
      closeShutters(L, 23.08 + j2 * 0.5, 1); if (C) { lit(C, 23.1 + j2 * 0.5, 23.5 + j2 * 0.5); act(23.15 + j2 * 0.5, 4 * MIN, C, 'in', 'stand', 0); closeShutters(C, 23.3 + j2 * 0.5, 0); }
      shut(K, 23.15 + j2 * 0.5, 0);
      break;
    }
    case 'famille': {
      const kids = ms.filter((i) => hh.members[i].size < 0.8), adults = ms.filter((i) => hh.members[i].size >= 0.8);
      const wake = (we ? 8.3 : 6.58) + j * 0.6, out = wake + 60 * MIN;
      lit(K, wake, out + 15 * MIN); quickShut(K, wake + 0.4 * MIN, 0, 1); act(wake + 1.6 * MIN, 9 * MIN, K, 'in', 'cook', 0);
      openShutters(L, wake + 9 * MIN, 1); if (C) { lit(C, wake + 14 * MIN, wake + 40 * MIN); quickShut(C, wake + 20 * MIN, 1, 1); }
      openCurt(L, wake + 12.8 * MIN, 1);
      meal(K, wake + 18 * MIN, 28 * MIN, ms);
      act(wake + 47 * MIN, 4 * MIN, L, 'lean', 'lean', kids[0], {}); // l'enfant regarde la rue avant de partir
      if (!we) { leave(out, kids[0]); leave(out + 0.25 * MIN, 0); if (kids[1] != null) leave(out + 0.5 * MIN, kids[1]); leave(out + 28 * MIN, 1); win(L, out + 24 * MIN, 0); }
      else { look(wake + 70 * MIN, 12 * MIN, 1); act(wake + 75 * MIN, 25 * MIN, L, 'lean', 'lean', kids[0]); meal(K, 12.6 + j * 0.5, 45 * MIN, ms); leave(14.8 + j, 0); leave(14.8 + j + 0.2 * MIN, kids[0]); leave(14.8 + j + 0.4 * MIN, 1); win(L, 14.7 + j, 0); }
      const back1 = (we ? 18.0 : 16.85) + j2 * 0.7, tA = arrive(back1, 0); street('return', back1 + 0.2 * MIN, kids[0]);
      lit(K, tA, 20.6 + j2 * 0.3); if (C) { lit(C, tA + 4 * MIN, 20.75 + j2 * 0.3); act(tA + 8 * MIN, 55 * MIN, C, 'in', 'table', kids[0], { seat: 0, party: 1, desk: true }); }
      act(tA + 0.2 * MIN, 0.5 * MIN, L, 'in', 'cross', 0);
      const back2 = back1 + 1.75 + r() * 0.5, tB = arrive(back2, 1); act(tB + 0.15 * MIN, 0.5 * MIN, L, 'in', 'cross', 1); lit(L, tB + 0.3 * MIN, 23.0 + j2 * 0.3); drawCurt(L, tB + 1.1 * MIN, 1);
      meal(K, 19.45 + j2 * 0.3, 40 * MIN, ms);
      if (C) { act(20.55 + j2 * 0.3, 10 * MIN, C, 'in', 'stand', 1); closeShutters(C, 20.62 + j2 * 0.3, 1); }
      tv(20.25 + j2 * 0.3, 22.55 + j2 * 0.3, adults);
      closeShutters(L, 22.58 + j2 * 0.3, 0); shut(K, 22.7 + j2 * 0.3, 0);
      break;
    }
    case 'retraite': {
      const wake = 7.7 + j * 0.5;
      lit(K, wake, 9.1); openShutters(K, wake + 4 * MIN, 0, true); openShutters(L, wake + 11 * MIN, 0, true); if (C) shut(C, wake + 18 * MIN, 1, 1.8 * MIN);
      openCurt(L, wake + 16 * MIN, 0);
      meal(K, wake + 22 * MIN, 32 * MIN, ms);
      // journée : arrosage, tapis, regarde la rue, lecture au balcon
      const tw = forced.water ?? 10.72 + j * 0.8;
      if (home.balcony) { act(tw, 4.2 * MIN, L, 'balcony', 'water', 0); win(L, tw - 0.1 * MIN, 1); win(L, tw + 4.2 * MIN, 0); }
      else { act(tw, 2.6 * MIN, K, 'lean', 'water', 0); win(K, tw - 0.1 * MIN, 1); win(K, tw + 2.6 * MIN, 0); }
      const tr = forced.rug ?? 11.25 + j * 0.9; act(tr, 1.5 * MIN, L, 'lean', 'shake', m2); win(L, tr - 0.1 * MIN, 1); win(L, tr + 1.5 * MIN, 0);
      look(13.95 + j, 7 * MIN, 0); look(16.4 + j * 0.5, 22 * MIN, m2);
      if (we) look(10.1 + j * 0.5, 15 * MIN, m2);
      lit(K, 18.0, 19.75); meal(K, 19.0 + j * 0.3, 36 * MIN, ms);
      closeShutters(K, nightfall + j * 0.2, 0); closeShutters(L, nightfall + 1.6 * MIN + j * 0.2, 0); if (C) shut(C, nightfall + 3.5 * MIN + j * 0.2, 0);
      tv(19.75 + j * 0.3, 21.55 + j * 0.3, ms);
      if (C) lit(C, 21.5 + j * 0.3, 21.95 + j * 0.3);
      break;
    }
    case 'etudiant': {
      shutUser = false;
      const wake = (we ? 10.5 : 8.45) + j * 0.5;
      lit(L, wake, wake + 30 * MIN, 'cool'); openCurt(L, wake + 2 * MIN, 0); act(wake + 6 * MIN, 6 * MIN, L, 'lean', 'lean', 0); win(L, wake + 5.9 * MIN, 1); win(L, wake + 12 * MIN, 0.35);
      if (!we) leave(wake + 32 * MIN, 0); else leave(13.2 + j, 0);
      const back = forced.lateReturn ? 0.44 : (we ? 2.05 : (hh.late ? 20.4 : 19.6) + j2 * 0.5);
      const tA = arrive(back, 0); win(L, tA + 0.3 * MIN, 0);
      lit(L, tA, back < 6 ? back + 1.15 : 25.45, 'cool'); act(tA + 0.2 * MIN, 0.4 * MIN, L, 'in', 'cross', 0);
      if (back > 6) { act(tA + 2 * MIN, 120 * MIN, L, 'in', 'table', 0, { seat: 0, party: 1, desk: true }); smoke(21.0 + j2 * 0.2, 0); act(23.1 + j2 * 0.2, 90 * MIN, L, 'in', 'table', 0, { seat: 0, party: 1, desk: true }); smoke(23.5 + j2 * 0.2, 0); drawCurt(L, 23.9 + j2 * 0.2, 0); }
      else { act(tA + 1 * MIN, 25 * MIN, L, 'in', 'table', 0, { seat: 0, party: 1, desk: true }); }
      break;
    }
    case 'coloc': {
      shutUser = false;
      const wakes = [7.3, 7.8, 8.5].slice(0, n);
      wakes.forEach((w, i) => { const t = (we ? w + 2.2 : w) + j * 0.3; lit(i === 0 ? K : L, t, t + 35 * MIN); if (i === 0) openCurt(L, t + 4 * MIN, 0); if (i === 1) look(t + 6 * MIN, 5 * MIN, 1); act(t + 2 * MIN, 8 * MIN, K, 'in', 'cook', i); if (!we) leave(t + 38 * MIN, i); else leave(13.5 + i * 0.4 + j, i); });
      const backs = [18.15, 19.5, 21.0].slice(0, n);
      backs.forEach((b, i) => { const tA = arrive(b + j2 * 0.4 + (we ? 0.5 : 0), i); lit(i === 0 ? K : L, tA, we ? 26.3 : 24.1 + i * 0.3); act(tA + 0.2 * MIN, 0.5 * MIN, L, 'in', 'cross', i); });
      meal(K, 20.5 + j2 * 0.3, 38 * MIN, ms);
      if (!we) { tv(21.3 + j2 * 0.3, 24.0, ms); if (home.balcony) { act(20.9 + j2 * 0.3, 5 * MIN, L, 'balcony', 'smoke', 0); act(20.95 + j2 * 0.3, 4.6 * MIN, L, 'balcony', 'smoke', 1, { slot: 1 }); win(L, 20.8 + j2 * 0.3, 1); win(L, 21.0 + j2 * 0.3, 0); } else smoke(20.95 + j2 * 0.3, 0); drawCurt(L, 23.5, 1); }
      else { S.push({ k: 'party', t0: 21.5, t1: 26.3 }); lit(L, 21.5, 26.3, 'orange'); win(L, 21.55, 1); for (let i = 0; i < 5; i++) act(21.6 + i * 0.03, 4.5, L, 'in', 'dance', i % n, { slot: i }); if (home.balcony) for (let k = 0; k < 7; k++) { act(21.9 + k * 0.42, 5 * MIN, L, 'balcony', 'smoke', k % n); act(21.92 + k * 0.42, 4.5 * MIN, L, 'balcony', 'leanRail', (k + 1) % n, { slot: 1 }); } }
      break;
    }
    default: { // solo
      const wake = (we ? 9.4 : 7.05) + j * 0.7;
      lit(K, wake, wake + 50 * MIN); openShutters(L, wake + 4 * MIN, 0); quickShut(K, wake + 8 * MIN, 0, 1); openCurt(L, wake + 7.6 * MIN, 0);
      act(wake + 10 * MIN, 8 * MIN, K, 'in', 'cook', 0); act(wake + 19 * MIN, 12 * MIN, K, 'in', 'table', 0, { seat: 0, party: 1 });
      if (we) { look(wake + 35 * MIN, 8 * MIN, 0); meal(K, 13.0 + j, 30 * MIN, ms); leave(15.0 + j, 0); } else leave(wake + 48 * MIN, 0);
      win(L, we ? 14.9 + j : wake + 46 * MIN, 0);
      const back = (we ? 19.0 : 19.45) + j2 * 0.8, tA = arrive(back, 0);
      lit(K, tA, 21.0 + j2 * 0.4); act(tA + 0.15 * MIN, 0.5 * MIN, L, 'in', 'cross', 0); lit(L, tA + 0.3 * MIN, 23.4 + j2 * 0.4); drawCurt(L, tA + 1.0 * MIN, 0);
      act(20.1 + j2 * 0.4, 22 * MIN, K, 'in', 'table', 0, { seat: 0, party: 1 });
      tv(20.65 + j2 * 0.4, 23.35 + j2 * 0.4, ms); if (hh.smoker) smoke(21.05 + j2 * 0.4, 0);
      closeShutters(L, 23.38 + j2 * 0.4, 0); shut(K, 23.45 + j2 * 0.4, 0);
    }
  }
  // ─── événements de la rue ───
  const awake = (t) => hh.type === 'retraite' ? t < 22.3 : hh.type === 'famille' ? t < 23.2 : true;
  if (D.event === 'feux' || D.event === 'nouvel-an') {
    const t0 = D.event === 'feux' ? 22 + 25 * MIN : 0, t1 = D.event === 'feux' ? 23 : 20 * MIN;
    if (awake(22.5) || D.event === 'nouvel-an') {
      const who = D.event === 'feux' ? ms : ms;
      if (home.balcony) { who.slice(0, 3).forEach((m, i) => act(t0 - 2 * MIN + i * 0.4 * MIN, t1 - t0 + 2 * MIN - i * 0.6 * MIN, L, 'balcony', 'leanRail', m, { slot: i })); win(L, t0 - 2.2 * MIN, 1); win(L, t1 + 1 * MIN, 0); }
      else { act(t0 - 1.5 * MIN, t1 - t0 + 1.5 * MIN, L, 'lean', 'lean', 0, { slot: 0 }); if (n > 1) act(t0 - 1.1 * MIN, t1 - t0 + 1.1 * MIN, K, 'lean', 'lean', 1, { slot: 0 }); win(L, t0 - 1.7 * MIN, 1); win(K, t0 - 1.3 * MIN, 1); win(L, t1 + 0.6 * MIN, 0); win(K, t1 + 0.8 * MIN, 0); }
      S.push({ k: 'dim', t0: t0 - 1 * MIN, t1: t1 + 0.5 * MIN });  // on éteint pour mieux voir
      if (D.event === 'nouvel-an' && (hh.type === 'coloc' || hh.type === 'couple')) { S.push({ k: 'party', t0: 21.5, t1: 26.5 }); lit(L, 21.5, 26.5, 'orange'); for (let i = 0; i < 4; i++) act(21.6 + i * 0.05, 2.3, L, 'in', 'dance', i % n, { slot: i }); }
    }
  }
  if (D.event === 'demenagement' && (hh.type === 'retraite' || (hh.type === 'etudiant' && we) || r() < 0.25)) { const t = 9.9 + r() * 0.3; look(t, 6 * MIN + r() * 8 * MIN, 0); }
  if (D.event === 'musique') { win(L, 21.0, 1); look(21.1 + r() * 0.4, 20 * MIN, 0); for (let i = 0; i < n; i++) act(21.6 + r() * 0.4, 30 * MIN, L, 'in', 'dance', i, { slot: i }); }
  if (D.event === 'sirene') { const t = forced.sirene ?? 15.0; if (r() < 0.45) look(t + 0.1 * MIN, 1.2 * MIN, 0); }
  if (D.decembre && hh.sapin) S.push({ k: 'sapin', t0: 16.8, t1: 23.6 });
  // valeur initiale des volets : fermés la nuit pour ceux qui les ferment
  home.shutUser = shutUser;
  home.schedule = S.sort((a, b) => (a.t ?? a.t0) - (b.t ?? b.t0));
  return S;
}
