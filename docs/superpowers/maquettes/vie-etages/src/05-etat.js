// ───────────── état d'un foyer à l'instant T ─────────────
// Piste de valeur (volets, rideaux, fenêtre) : la valeur à 0 h est celle de la fin de la veille (continuité).
function trackValue(evts, T, init) {
  if (!evts.length) return init;
  let v = evts[evts.length - 1].to;
  for (const e of evts) { if (T < e.t) break; v = lerp(v, e.to, smooth(ramp(T, e.t, e.dur))); }
  return v;
}
const inSeg = (s, T) => (T >= s.t0 && T < s.t1) || (T + 24 >= s.t0 && T + 24 < s.t1);
const segP = (s, T) => { const t = T >= s.t0 ? T : T + 24; return (t - s.t0) / (s.t1 - s.t0); };
const ANIMATED = new Set(['openShutters', 'closeShutters', 'armsUp', 'drawCurtains', 'cross', 'water', 'shake', 'smoke', 'dance', 'cook']);
const PRIO = { event: 5, cross: 4, drawCurtains: 4, openShutters: 3, closeShutters: 3, armsUp: 3, water: 3, shake: 3, smoke: 3, dance: 2, cook: 1 };
function homeState(home, T) {
  const S = home.schedule || [], st = { lit: {}, tone: {}, shut: {}, curt: {}, win: {}, actors: [], sapin: false, party: false, dim: false };
  for (const room of home.rooms) {
    st.shut[room] = trackValue(S.filter((s) => s.k === 'shut' && s.room === room), T, home.shutUser ? 0 : 1);
    st.curt[room] = trackValue(S.filter((s) => s.k === 'curt' && s.room === room), T, 0);
    st.win[room] = trackValue(S.filter((s) => s.k === 'win' && s.room === room), T, 0);
    st.lit[room] = false;
  }
  for (const s of S) {
    if (s.k === 'lit' && inSeg(s, T)) { st.lit[s.room] = true; st.tone[s.room] = s.tone; }
    else if (s.k === 'sapin' && inSeg(s, T)) st.sapin = true;
    else if (s.k === 'party' && inSeg(s, T)) st.party = true;
    else if (s.k === 'dim' && inSeg(s, T)) st.dim = true;
    else if (s.k === 'act' && inSeg(s, T)) {
      const p = segP(s, T), c = choreo(s, p, T, home);
      if (!c) continue;
      const room = c.room || s.room;
      st.actors.push({ room, where: c.where || s.where, m: s.m, member: home.hh.members[s.m] || home.hh.members[0], P: c.P, dx: c.dx, facing: c.facing, props: c.props || [], size: c.size || 1, choreo: s.choreo, animated: ANIMATED.has(s.choreo) && !c.still, prio: (s.slot != null && s.choreo === 'leanRail') || s.choreo === 'lean' ? 2 : PRIO[s.choreo] || 1, seat: s.seat, party: s.party, desk: s.desk, slot: s.slot || 0 });
    }
  }
  if (st.dim) for (const room of home.rooms) if (room !== 'cuisine') st.lit[room] = false;
  return st;
}
// Rue + cage : pour chaque 'return' / 'depart', un marcheur, la porte, la minuterie et la silhouette qui monte / descend.
// Vitesse de marche ≈ 7,6 px/s (1,3 m/s à 5,9 px/m). La porte s'ouvre 3 s avant le passage, se referme 6 s après.
const WALK = 7.6 * 3600; // px / heure
function streetEvents(f, T, W) {
  const out = { walkers: [], door: 0, stairLit: false, stairFig: null };
  const dx = f.bayX(f.doorBay);
  for (const hm of f.homes) {
    if (!hm.schedule) continue;
    for (const s of hm.schedule) {
      if (s.k !== 'return' && s.k !== 'depart') continue;
      const mem = hm.hh.members[s.m] || hm.hh.members[0];
      const side = (hm.hh.seed + s.m) % 2 ? 1 : -1;            // d'où il vient / où il va
      const edge = side > 0 ? W + 12 : -12;
      const dist = Math.abs(edge - dx), dur = dist / WALK;
      const tDoor = s.t;
      if (s.k === 'return') {
        if (T >= tDoor - dur && T < tDoor) { const p = (T - (tDoor - dur)) / dur; out.walkers.push({ x: lerp(edge, dx, p), facing: -side, mem, ph: (T - tDoor) * WALK / 9, entering: 0 }); }
        else if (T >= tDoor && T < tDoor + 14 * SEC) out.walkers.push({ x: dx, facing: -side, mem, ph: (T - tDoor) * WALK / 9, entering: (T - tDoor) / (14 * SEC) });
        out.door = Math.max(out.door, sat(1 - Math.abs(T - (tDoor + 4 * SEC)) / (10 * SEC)) * (T < tDoor + 20 * SEC && T > tDoor - 8 * SEC ? 1 : 0));
        if (T >= tDoor + 3 * SEC && T < tDoor + 3 * MIN) out.stairLit = true;
        const tc = tDoor + 10 * SEC, climb = hm.climb - 12 * SEC;
        if (T >= tc && T < tc + climb && f.stairBay >= 0) out.stairFig = { frac: (T - tc) / climb, floor: hm.floorIdx, mem, up: true };
      } else {
        const tOut = s.t; // sort de la porte à tOut ; a quitté le logement à tOut - climb
        if (T >= tOut && T < tOut + dur) { const p = (T - tOut) / dur; out.walkers.push({ x: lerp(dx, edge, p), facing: side, mem, ph: (T - tOut) * WALK / 9, entering: 0 }); }
        else if (T >= tOut - 12 * SEC && T < tOut) out.walkers.push({ x: dx, facing: side, mem, ph: (T - tOut) * WALK / 9, entering: (tOut - T) / (12 * SEC) });
        out.door = Math.max(out.door, sat(1 - Math.abs(T - (tOut - 2 * SEC)) / (10 * SEC)) * (T < tOut + 12 * SEC && T > tOut - 16 * SEC ? 1 : 0));
        if (T >= tOut - hm.climb && T < tOut + 2.5 * MIN) out.stairLit = true;
        const tc = tOut - hm.climb + 2 * SEC, climb = hm.climb - 14 * SEC;
        if (T >= tc && T < tc + climb && f.stairBay >= 0) out.stairFig = { frac: (T - tc) / climb, floor: hm.floorIdx, mem, up: false };
      }
    }
  }
  return out;
}
// Borne d'animation : au plus MAX_ANIM fenêtres animées à la fois (les poses fixes ne comptent pas) ; priorité puis proximité du centre.
const MAX_ANIM = 8;
function cullAnimated(facades, states, W) {
  const all = [];
  facades.forEach((f, fi) => f.homes.forEach((hm, hi) => { const st = states[fi][hi]; if (!st) return; st.actors.forEach((a) => { if (a.animated) all.push({ a, prio: a.prio, d: Math.abs(f.bayX(hm.bays[0]) - W / 2) }); }); }));
  all.sort((p, q) => q.prio - p.prio || p.d - q.d);
  all.forEach((e, i) => { if (i >= MAX_ANIM) e.a.culled = true; });
  return { animated: all.length, shown: Math.min(all.length, MAX_ANIM) };
}
