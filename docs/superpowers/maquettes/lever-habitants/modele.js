// Maquette « lever et journées des habitants » : modèle pur (JS simple, aucune dépendance), tirages déterministes.
// Chaque personne a ses traits fixes (horaire de travail, trajet, préparation, besoin de sommeil, heure de coucher habituelle)
// et, CHAQUE JOUR, un tirage propre (lever libre, bruit de quelques minutes, sorties, rendez-vous). Rien n'est un trait figé
// du lever : seuls les horaires de travail le rendent stable les jours travaillés.
// Utilisable dans le navigateur (window.Modele) et dans Node (module.exports).
(function (root) {
  'use strict';

  const SEED = 20261103;
  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Un flux de tirages par (personne, jour, usage) : l'ordre de calcul ne change jamais les nombres.
  const rngOf = (...parts) => mulberry32(hashString(SEED + '|' + parts.join('|')));
  const step5 = (x) => Math.round(x / 5) * 5;
  const U = (r, a, b) => a + r() * (b - a);
  const U5 = (r, a, b) => step5(U(r, a, b));
  const H = (h, m = 0) => h * 60 + m;
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // ─── Format ───
  const pad = (n) => String(n).padStart(2, '0');
  function hm(m) { m = Math.round(m); const x = ((m % 1440) + 1440) % 1440; return `${Math.floor(x / 60)} h ${pad(x % 60)}`; }
  function duree(m) { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`; }
  const accord = (p, mot) => (p.f ? mot + 'e' : mot);

  // ─── Calendrier (mêmes notions que calendar.ts : week-end, férié, vacances scolaires zone C) ───
  const FERIES = { '2026-11-01': 'Toussaint', '2026-11-11': 'Armistice', '2026-12-25': 'Noël' };
  const VACANCES = [['2026-10-17', '2026-11-01'], ['2026-12-19', '2027-01-03']]; // inclusives, zone C (Paris)
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function isoAdd(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const weekday = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
  function semaineISO(iso) {
    const wd = weekday(iso);
    const jeudi = isoAdd(iso, 3 - ((wd + 6) % 7));
    const y = +jeudi.slice(0, 4);
    return Math.floor((Date.parse(jeudi) - Date.UTC(y, 0, 1)) / 864e5 / 7) + 1;
  }
  // Lever / coucher du soleil à Paris (approché, linéaire sur novembre 2026, minutes locales).
  function soleil(iso) {
    const n = (Date.parse(iso) - Date.parse('2026-11-01')) / 864e5;
    return { lever: 447 + 1.25 * n, coucher: 1045 - 1.1 * n };
  }
  function jourCtx(iso) {
    const wd = weekday(iso);
    const ferie = FERIES[iso] || null;
    const vacances = VACANCES.some(([a, b]) => iso >= a && iso <= b);
    const weekend = wd === 0 || wd === 6;
    const ouvre = !weekend && !ferie; // jour travaillé pour un salarié (hors congés)
    return { iso, wd, ferie, vacances, weekend, ouvre, ecole: ouvre && !vacances, semaine: semaineISO(iso), soleil: soleil(iso),
      titre: `${JOURS[wd]} ${+iso.slice(8)} ${MOIS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` };
  }
  // Vacances scolaires 2026 (zone C) en semaines ISO : hiver 8-9, printemps 16-17, été 28-35, Toussaint 43-44, Noël 52.
  const VAC = { hiver: [8, 9], printemps: [16, 17], ete: [28, 29, 30, 31, 32, 33, 34, 35], toussaint: [43, 44], noel: [52] };
  const lundiSemaine = (w) => isoAdd('2025-12-29', (w - 1) * 7); // lundi de la semaine ISO w de 2026
  // Contrats : heures effectives par jour, jours de congés payés (ouvrés), RTT par an.
  const CONTRATS = {
    '35h': { lab: '35 h', eff: H(7), cp: 25, rtt: 0 },
    '39h': { lab: '39 h + 11 RTT', eff: 468, cp: 25, rtt: 11 },
    forfait: { lab: 'forfait jours (cadre)', eff: null, cp: 25, rtt: 11 },
    fp: { lab: 'fonction publique', eff: H(7, 30), cp: 25, rtt: 15 },
    hcr: { lab: 'restauration (HCR)', eff: null, cp: 25, rtt: 0 },
    nounou: { lab: 'particulier employeur', eff: null, cp: 25, rtt: 0 },
  };

  // ─── L'immeuble : 12 logements, 25 habitants, + la nounou de la famille Martin ───
  // statut : cadre | non-cadre | chômeur | retraité | étudiant | enfant | nounou. f : féminin (accords).
  // pieces : comme `roomsFor` de households.ts (1 travée → salon ; 2 → cuisine, salon ; 3+ → cuisine, chambre, salon).
  const ECOLE = { depose: H(8, 20), sortie: H(16, 30), pied: 10, garderieMax: H(18, 30) };
  const LOGEMENTS = [
    { id: '1g', nom: '1er gauche', type: 'famille', pieces: ['cuisine', 'chambre', 'salon'], ensemble: true, membres: [
      { id: 'karim', contrat: '39h', prenom: 'Karim', age: 38, statut: 'non-cadre', metier: 'technicien' },
      { id: 'sophie', contrat: 'forfait', prenom: 'Sophie', age: 36, statut: 'cadre', metier: 'ingénieure', f: true },
      { id: 'lea', prenom: 'Léa', age: 6, statut: 'enfant', niveau: 'CP', f: true },
      { id: 'tom', prenom: 'Tom', age: 3, statut: 'enfant', niveau: 'maternelle' }] },
    { id: '1d', nom: '1er droite', type: 'retraite', pieces: ['cuisine', 'chambre', 'salon'], ensemble: true, membres: [
      { id: 'gerard', prenom: 'Gérard', age: 73, statut: 'retraité', fixe: { leveTot: 0.85 } },
      { id: 'monique', prenom: 'Monique', age: 70, statut: 'retraité', f: true, fixe: { leveTot: 0.2 } }] },
    { id: '2g', nom: '2e gauche', type: 'famille', pieces: ['cuisine', 'chambre', 'salon'], ensemble: true, nounou: 'fatou', famille: 'Martin', membres: [
      { id: 'julie', contrat: 'forfait', prenom: 'Julie', age: 34, statut: 'cadre', metier: 'avocate', f: true },
      { id: 'marc', contrat: 'forfait', prenom: 'Marc', age: 37, statut: 'cadre', metier: 'chef de projet' },
      { id: 'emma', prenom: 'Emma', age: 8, statut: 'enfant', niveau: 'CE2', f: true },
      { id: 'hugo', prenom: 'Hugo', age: 5, statut: 'enfant', niveau: 'maternelle' }] },
    { id: '2d', nom: '2e droite', type: 'retraite', pieces: ['cuisine', 'chambre', 'salon'], membres: [
      { id: 'jeanne', prenom: 'Jeanne', age: 81, statut: 'retraité', f: true }] },
    { id: '3g', nom: '3e gauche', type: 'solo', pieces: ['cuisine', 'chambre', 'salon'], membres: [
      { id: 'camille', contrat: '39h', prenom: 'Camille', age: 29, statut: 'cadre', metier: 'chargée de com', f: true }] },
    { id: '3d', nom: '3e droite', type: 'solo', pieces: ['cuisine', 'chambre', 'salon'], membres: [
      { id: 'nicolas', prenom: 'Nicolas', age: 47, statut: 'chômeur', metier: 'ex-comptable' }] },
    { id: '4g', nom: '4e gauche', type: 'famille', pieces: ['cuisine', 'chambre', 'salon'], ensemble: true, membres: [
      { id: 'yasmine', contrat: 'fp', prenom: 'Yasmine', age: 41, statut: 'non-cadre', metier: 'aide-soignante', f: true },
      { id: 'samir', contrat: 'forfait', prenom: 'Samir', age: 43, statut: 'cadre', metier: 'informaticien' },
      { id: 'ines', prenom: 'Inès', age: 13, statut: 'enfant', niveau: 'collège', f: true,
        college: { 1: [H(8), H(16, 30)], 2: [H(9), H(17, 30)], 3: [H(8), H(12)], 4: [H(8), H(15, 30)], 5: [H(10), H(16, 30)] } },
      { id: 'adam', prenom: 'Adam', age: 9, statut: 'enfant', niveau: 'CM1' }] },
    { id: '4d', nom: '4e droite', type: 'couple', pieces: ['cuisine', 'chambre', 'salon'], ensemble: true, membres: [
      { id: 'leo', contrat: '35h', prenom: 'Léo', age: 31, statut: 'non-cadre', metier: 'magasinier' },
      { id: 'manon', contrat: '39h', prenom: 'Manon', age: 30, statut: 'cadre', metier: 'pharmacienne', f: true }] },
    { id: '5g', nom: '5e gauche', type: 'coloc', pieces: ['cuisine', 'chambre', 'salon'], membres: [
      { id: 'lucas', prenom: 'Lucas', age: 23, statut: 'étudiant', metier: 'master',
        cours: { 1: [H(10), H(18)], 2: [H(8), H(17)], 3: [H(9), H(12)], 4: [H(13, 30), H(18)] } },
      { id: 'sarah', contrat: 'hcr', prenom: 'Sarah', age: 25, statut: 'non-cadre', metier: 'serveuse, horaires coupés', f: true,
        // Horaires coupés (restauration) : du mardi au samedi, repos dimanche + lundi.
        coupe: { jours: [2, 3, 4, 5, 6], services: [[H(11), H(14, 30)], [H(18, 30), H(22, 30)]], maison: 0.75 } },
      { id: 'theo', contrat: 'forfait', prenom: 'Théo', age: 26, statut: 'cadre', metier: 'consultant' }] },
    { id: '5d', nom: '5e droite', type: 'solo', pieces: ['cuisine', 'chambre', 'salon'], membres: [
      { id: 'helene', contrat: 'fp', prenom: 'Hélène', age: 58, statut: 'cadre', metier: 'directrice d’agence publique', f: true }] },
    { id: '6g', nom: '6e gauche (sous les toits)', type: 'etudiant', pieces: ['salon'], membres: [
      { id: 'chloe', prenom: 'Chloé', age: 21, statut: 'étudiant', metier: 'licence', f: true,
        cours: { 1: [H(8, 30), H(17, 30)], 2: [H(10), H(16)], 3: [H(14), H(18)], 4: [H(8, 30), H(17)], 5: [H(10), H(13)] } }] },
    { id: '6d', nom: '6e droite (sous les toits)', type: 'retraite', pieces: ['cuisine', 'salon'], membres: [
      { id: 'bernard', prenom: 'Bernard', age: 67, statut: 'retraité' }] },
  ];
  const NOUNOU = { id: 'fatou', contrat: 'nounou', prenom: 'Fatou', age: 45, statut: 'nounou', f: true, metier: 'nounou des Martin', logement: null };

  // Exemples imposés pour que les planches montrent chaque règle (tout le reste est tiré).
  const IMPOSES = {
    sorties: {
      'chloe|2026-11-03': { lab: 'boîte', dep: H(23, 15), ret: H(28, 0) }, // soirée étudiante du mardi, retour 4 h
      'camille|2026-11-05': { lab: 'boîte', dep: H(23), ret: H(27, 30) }, // minorité : boîte un jeudi, travaille le vendredi
      'camille|2026-11-07': { lab: 'boîte', dep: H(23, 30), ret: H(28, 40) }, // samedi : rattrapage le dimanche
      '2g|2026-11-07': { lab: 'resto', dep: H(20), ret: H(23, 30) }, // famille Martin au restaurant, Fatou garde les enfants
    },
    rdv: {
      'nicolas|2026-11-03': { h: H(9, 30), lab: 'France Travail', trajet: 25 },
      'monique|2026-11-06': { h: H(9), lab: 'kiné', trajet: 15 },
    },
    // Hélène : une de ses semaines de congé est la semaine 45 ; Camille : RTT le lundi 2 novembre (pont après la Toussaint),
    // et aucun autre congé tiré cette semaine-là (pour que la planche « semaine » la montre au travail).
    // Sarah rentre chez elle pendant sa coupure du mardi (pour la planche « porte »).
    coupureMaison: { 'sarah|2026-11-03': true },
    conges: { helene: { semaines: [45] }, camille: { rtt: ['2026-11-02'], sansSemaines: [45] } },
  };

  // ─── Paramètres (notes.md : « proposition » sauf mention) ───
  const P = {
    cadreDebut: [H(8, 30), H(9, 30)], cadreFlex: 15, cadreEffectif: [H(7, 30), H(8, 30)], cadrePause: [45, 90], cadreTard: { p: 0.12, extra: [30, 60] }, cadreFinMax: H(19, 30),
    nonCadreDebut: [H(6, 30), H(8)], nonCadreEffectif: [H(7), H(7, 45)], nonCadrePause: 30,
    // Droit du travail (Code du travail) : limites vérifiées par `verifierDroit`.
    loi: { jourMax: H(10), semaineMax: H(48), sansPause: H(6), pauseMin: 20, amplitudeMax: H(11), amplitudeCoupeMax: H(13), reposJour: H(11), reposSemaine: H(35) },
    trajet: [10, 50], prep: [30, 60], prepBruit: 5,
    sommeil: { adulte: 450, retraite: 420, etudiant: 480, ecart: 30 },
    coucherHabituel: { jeune: [H(23, 45), H(24, 45)], adulte: [H(22, 45), H(23, 45)], senior: [H(22), H(23, 15)], bruit: 25 },
    respectSommeil: 0.85,
    leverRetraite: { tot: [H(6, 45), H(7, 30)], tard: [H(7, 30), H(9, 30)] },
    leverChomeur: [H(7, 30), H(10)], leverLibreActif: [H(8), H(10, 30)], leverLibreEtudiant: [H(9), H(11, 30)],
    leverEnfant: { petit: [H(7), H(8, 15)], grand: [H(8, 30), H(10, 30)] }, prepEnfant: 40,
    rattrapage: { moins: 30, plus: 10, max: H(13) },
    rdv: { chomeur: 0.2, retraite: 0.1 },
    congesSemaines: 5,
    autonome: 11,
  };

  // ─── Traits fixes de chaque personne ───
  const TOUS = [];
  for (const lg of LOGEMENTS) for (const m of lg.membres) { m.logement = lg; TOUS.push(m); }
  TOUS.push(NOUNOU);
  const actif = (p) => p.statut === 'cadre' || p.statut === 'non-cadre';
  const adultes = (lg) => lg.membres.filter((m) => m.statut !== 'enfant');
  const petits = (lg) => lg.membres.filter((m) => m.statut === 'enfant' && m.age < P.autonome);
  const parent = (p) => p.logement && p.statut !== 'enfant' && lg_aEnfants(p.logement);
  function lg_aEnfants(lg) { return lg.membres.some((m) => m.statut === 'enfant'); }
  function profil(p) {
    if (p.statut === 'enfant') return 'enfant';
    if (p.statut === 'retraité' || p.age >= 65) return 'senior';
    if (p.logement && lg_aEnfants(p.logement)) return 'famille';
    return p.age < 35 ? 'jeune' : 'adulte';
  }

  // Congés de l'année 2026 d'une personne : Map date ISO → 'CP' | 'RTT'. Congés payés : 25 jours ouvrés (5 semaines),
  // parents : 3 semaines l'été + Noël + 1 semaine de petites vacances ; sans enfant : 2-3 semaines l'été + 1 semaine l'hiver
  // + jours épars ; fonction publique : + 15 RTT (≈ 8 semaines en tout) ; 39 h : 11 RTT ; forfait jours : 11 RTT.
  // Les RTT sont des jours isolés, surtout le vendredi ou le lundi (ponts, longs week-ends).
  function planConges(p) {
    const c = CONTRATS[p.contrat], rc = rngOf('conges', p.id), imp = IMPOSES.conges[p.id] || {};
    const jours = p.coupe ? p.coupe.jours : [1, 2, 3, 4, 5];
    const out = new Map(), sans = imp.sansSemaines || [];
    const ouvre = (iso) => jours.includes(weekday(iso)) && !FERIES[iso];
    const semaine = (w, type) => { for (let i = 0; i < 7; i++) { const iso = isoAdd(lundiSemaine(w), i); if (ouvre(iso) && !out.has(iso)) out.set(iso, type); } };
    const cp = () => [...out.values()].filter((v) => v === 'CP').length;
    const semaines = [];
    const famille = p === NOUNOU ? true : parent(p);
    if (famille) {
      const debut = VAC.ete[Math.floor(rc() * (VAC.ete.length - 2))];
      semaines.push(debut, debut + 1, debut + 2, ...VAC.noel, pick(rc, [...VAC.hiver, ...VAC.printemps, ...VAC.toussaint]));
    } else {
      const n = rc() < 0.5 ? 2 : 3, debut = 27 + Math.floor(rc() * (36 - 27 - n));
      for (let i = 0; i < n; i++) semaines.push(debut + i);
      semaines.push(pick(rc, [52, 1, 7, 8, 9]));
    }
    for (const w of imp.semaines || []) if (!semaines.includes(w)) semaines.splice(semaines.length - 1, 1, w);
    for (const w of semaines) if (!sans.includes(w)) semaine(w, 'CP');
    // Jours épars pour compléter les 25 jours (vendredi ou lundi de préférence).
    const isole = (type) => {
      for (let essai = 0; essai < 200; essai++) {
        const w = 1 + Math.floor(rc() * 52);
        if (sans.includes(w)) continue;
        const x = rc(), wd = x < 0.6 ? 5 : x < 0.8 ? 1 : 2 + Math.floor(rc() * 3);
        const iso = isoAdd(lundiSemaine(w), wd - 1);
        if (ouvre(iso) && !out.has(iso)) { out.set(iso, type); return; }
      }
    };
    while (cp() < c.cp) isole('CP');
    for (const iso of imp.rtt || []) out.set(iso, 'RTT');
    while ([...out.values()].filter((v) => v === 'RTT').length < c.rtt) isole('RTT');
    return out;
  }

  const T = {};
  for (const p of TOUS) {
    const r = rngOf('trait', p.id);
    const t = {};
    if (p.statut === 'cadre') { t.debut = U5(r, ...P.cadreDebut); t.eff = U5(r, ...P.cadreEffectif); t.pause = U5(r, ...P.cadrePause); }
    else if (p.statut === 'non-cadre') { t.debut = U5(r, ...P.nonCadreDebut); t.eff = U5(r, ...P.nonCadreEffectif); t.pause = P.nonCadrePause; }
    else { r(); r(); }
    t.trajet = U5(r, ...P.trajet);
    t.mode = t.trajet <= 15 ? 'à pied' : r() < 0.7 ? 'métro' : 'bus';
    t.prep = U5(r, ...P.prep);
    const e = U5(r, -P.sommeil.ecart, P.sommeil.ecart);
    if (p.statut === 'enfant') { t.sommeil = p.age <= 5 ? 690 : p.age < 11 ? 630 : 570; t.prep = P.prepEnfant; t.trajet = ECOLE.pied; t.mode = 'à pied'; }
    else if (p.statut === 'retraité') t.sommeil = P.sommeil.retraite + e;
    else if (p.statut === 'étudiant') t.sommeil = P.sommeil.etudiant + e;
    else t.sommeil = P.sommeil.adulte + e;
    const pr = profil(p);
    const ch = pr === 'jeune' ? P.coucherHabituel.jeune : pr === 'senior' ? P.coucherHabituel.senior : P.coucherHabituel.adulte;
    t.coucher = U5(r, ...ch);
    t.leveTot = p.statut === 'retraité' ? 0.15 + 0.7 * r() : 0;
    if (p.contrat && CONTRATS[p.contrat].eff) t.eff = CONTRATS[p.contrat].eff;
    t.conges = p.contrat ? planConges(p) : new Map();
    Object.assign(t, p.fixe || {});
    T[p.id] = t;
  }

  // ─── Obligations du jour (indépendantes du sommeil) ───
  function travailDuJour(p, iso) {
    if (!actif(p)) return null;
    const j = jourCtx(iso);
    const t = T[p.id];
    if (p.coupe ? j.ferie || !p.coupe.jours.includes(j.wd) : !j.ouvre) return null;
    if (t.conges.has(iso)) return { conge: t.conges.get(iso) };
    const r = rngOf(p.id, iso, 'travail');
    const prep = t.prep + Math.round(U(r, -P.prepBruit, P.prepBruit));
    if (p.coupe) {
      const sv = p.coupe.services.map((x) => x.slice());
      return amenage({ coupe: true, services: sv, prep, trajet: t.trajet, tard: 0, maison: (r() < p.coupe.maison) || !!IMPOSES.coupureMaison[p.id + '|' + iso] });
    }
    const debut = t.debut + (p.statut === 'cadre' ? U5(r, -P.cadreFlex, P.cadreFlex) : 0);
    const tard = p.statut === 'cadre' && r() < P.cadreTard.p ? U5(r, ...P.cadreTard.extra) : 0;
    const pause = p.statut === 'cadre' ? Math.min(P.cadrePause[1], Math.max(P.cadrePause[0], t.pause + U5(r, -15, 15))) : t.pause;
    const midi = p.statut === 'cadre' ? U5(r, H(12), H(13)) - debut : U5(r, 210, 270); // minutes de travail avant la pause
    return journee({ debut, eff: t.eff + tard, pause, midi, prep, trajet: t.trajet, tard, cadre: p.statut === 'cadre' });
  }
  // Journée continue avec pause déjeuner : matin ≤ 6 h, après-midi ≤ 6 h, effectif ≤ 10 h, fin ≤ 19 h 30 (cadre).
  function journee(w) {
    const L = P.loi;
    w.midi = Math.max(120, Math.min(L.sansPause, w.midi));
    w.eff = Math.min(w.eff, L.jourMax, w.midi + L.sansPause);
    if (w.cadre) w.eff = Math.min(w.eff, P.cadreFinMax - w.debut - w.pause);
    const pa = w.debut + w.midi;
    w.services = [[w.debut, pa], [pa + w.pause, w.debut + w.eff + w.pause]];
    return amenage(w);
  }
  function amenage(w) {
    w.debut = w.services[0][0];
    w.fin = w.services[w.services.length - 1][1];
    w.effectif = w.services.reduce((n, [a, b]) => n + b - a, 0);
    return w;
  }
  function ligneTravail(w, p) {
    const c = p && p.contrat ? CONTRATS[p.contrat].lab + ' · ' : '';
    if (!w) return p && p.contrat ? c + 'pas travaillé ce jour' : '';
    if (w.conge) return c + (w.conge === 'RTT' ? 'RTT aujourd’hui' : 'congé payé aujourd’hui');
    const sv = w.services;
    if (w.coupe) return c + `services ${hm(sv[0][0])} – ${hm(sv[0][1])} et ${hm(sv[1][0])} – ${hm(sv[1][1])} (coupure ${duree(sv[1][0] - sv[0][1])}) = ${duree(w.effectif)}`;
    return c + `travail ${hm(w.debut)} – ${hm(w.fin)} (pause ${hm(sv[0][1])} – ${hm(sv[1][0])}) = ${duree(w.effectif)}${w.tard ? ' (journée longue)' : ''}`;
  }
  function coursDuJour(p, iso) {
    const j = jourCtx(iso);
    if (!p.cours || !j.ouvre) return null;
    const c = p.cours[j.wd];
    return c ? { debut: c[0], fin: c[1] } : null;
  }
  function ecoleDuJour(k, iso) {
    const j = jourCtx(iso);
    if (k.statut !== 'enfant' || !j.ecole) return null;
    if (k.age >= P.autonome) { const c = k.college[j.wd]; return c ? { debut: c[0], fin: c[1], seul: true } : null; }
    return { debut: ECOLE.depose, fin: ECOLE.sortie, mercredi: j.wd === 3 };
  }
  function rdvDuJour(p, iso) {
    const forced = IMPOSES.rdv[p.id + '|' + iso];
    if (forced) return { ...forced, duree: 45 };
    const j = jourCtx(iso);
    if (!j.ouvre) return null;
    const r = rngOf(p.id, iso, 'rdv');
    if (p.statut === 'chômeur' && r() < P.rdv.chomeur) return { h: U5(r, H(8, 45), H(10)), lab: pick(r, ['France Travail', 'entretien', 'formation']), trajet: U5(r, 15, 35), duree: 60 };
    if (p.statut === 'retraité' && r() < P.rdv.retraite) return { h: U5(r, H(8, 30), H(10, 30)), lab: pick(r, ['médecin', 'kiné', 'banque']), trajet: U5(r, 10, 25), duree: 45 };
    return null;
  }

  // ─── Simulation : du dimanche 1er au dimanche 8 novembre (le 9 sert au coucher du dimanche) ───
  const DEBUT = '2026-11-01';
  const NJ = 9; // jours dans les tableaux (le dernier ne sert qu'à finir la nuit)
  const N = NJ * 1440;
  const DAYS = Array.from({ length: NJ }, (_, i) => isoAdd(DEBUT, i));
  const IDX = Object.fromEntries(DAYS.map((d, i) => [d, i]));

  const W = {}, C = {}, K = {}; // travail, cours, école par personne et par jour
  for (const p of TOUS) { W[p.id] = {}; C[p.id] = {}; K[p.id] = {}; for (const d of DAYS) { W[p.id][d] = travailDuJour(p, d); C[p.id][d] = coursDuJour(p, d); K[p.id][d] = ecoleDuJour(p, d); } }
  const travaille = (p, d) => !!(W[p.id][d] && !W[p.id][d].conge);
  const retourTravail = (p, d) => W[p.id][d].fin + W[p.id][d].trajet;

  // Logistique des familles : qui dépose (8 h 20), qui va chercher (16 h 30) ; un seul parent suffit à chaque fois.
  const LOG = {};
  for (const lg of LOGEMENTS) {
    LOG[lg.id] = {};
    const kids = petits(lg);
    if (!kids.length) continue;
    const pars = adultes(lg);
    for (const d of DAYS) {
      if (!kids.some((k) => K[k.id][d])) continue;
      const r = rngOf(lg.id, d, 'ecole');
      const libres = pars.filter((p) => !travaille(p, d));
      // Dépose : un parent libre ; sinon un cadre (horaire souple) ; sinon un non-cadre qui commence assez tard.
      let cand = libres.length ? libres : pars.filter((p) => p.statut === 'cadre');
      if (!cand.length) cand = pars.filter((p) => W[p.id][d].debut >= ECOLE.depose + W[p.id][d].trajet);
      const depose = cand.length ? cand[Math.floor(r() * cand.length)] : null;
      if (depose && travaille(depose, d)) {
        const w = W[depose.id][d];
        const debut = Math.max(w.debut, ECOLE.depose + w.trajet);
        if (debut > w.debut) W[depose.id][d] = journee({ ...w, midi: w.midi - (debut - w.debut), debut });
        W[depose.id][d].depose = true;
      }
      // Sortie d'école : un parent libre ou rentré avant 16 h 20 ; sinon la nounou ; sinon garderie jusqu'au premier retour.
      const dispo = pars.filter((p) => !travaille(p, d) || retourTravail(p, d) <= ECOLE.sortie - 10);
      let cherche;
      if (dispo.length) cherche = { qui: dispo[Math.floor(r() * dispo.length)], mode: 'pied' };
      else {
        const premier = pars.slice().sort((a, b) => retourTravail(a, d) - retourTravail(b, d))[0];
        cherche = lg.nounou ? { qui: NOUNOU, mode: 'nounou', jusque: retourTravail(premier, d), relais: premier }
          : { qui: premier, mode: 'garderie', a: Math.min(retourTravail(premier, d), ECOLE.garderieMax) };
      }
      LOG[lg.id][d] = { depose, cherche };
    }
  }

  // Lever obligé (travail, école, cours, rendez-vous) et son explication.
  function leverOblige(p, d) {
    const lg = p.logement;
    if (p.statut === 'enfant') {
      const e = K[p.id][d];
      if (!e) return null;
      if (e.seul) {
        const dep = e.debut - 15;
        return { lever: dep - P.prepEnfant, dep, strict: true, expl: `collège ${hm(e.debut)} − 15 min à pied, ${accord(p, 'seul')} − 40 min = ${hm(dep - P.prepEnfant)}` };
      }
      const L = LOG[lg.id][d];
      const dep = ECOLE.depose - ECOLE.pied;
      const qui = L.depose ? L.depose.prenom : 'accueil du matin';
      return { lever: dep - P.prepEnfant, dep, strict: true, expl: `école ${hm(ECOLE.depose)} − 10 min à pied − 40 min = ${hm(dep - P.prepEnfant)} (${accord(p, 'réveillé')} par ${qui})` };
    }
    const w = W[p.id][d];
    if (w && !w.conge) {
      if (w.depose) {
        const dep = ECOLE.depose - ECOLE.pied;
        return { lever: dep - w.prep, dep, strict: true, depose: true,
          expl: `dépose à l'école ${hm(ECOLE.depose)} − 10 min − ${w.prep} min préparation = ${hm(dep - w.prep)} (puis travail ${hm(w.debut)})` };
      }
      const dep = w.debut - w.trajet;
      return { lever: dep - w.prep, dep, strict: true, expl: `travail ${hm(w.debut)} − ${w.trajet} min trajet − ${w.prep} min préparation = ${hm(dep - w.prep)}` };
    }
    // Parent libre (congé, chômage) qui dépose les enfants.
    if (lg && LOG[lg.id][d] && LOG[lg.id][d].depose === p) {
      const dep = ECOLE.depose - ECOLE.pied, prep = T[p.id].prep;
      return { lever: dep - prep, dep, strict: true, depose: true, expl: `dépose à l'école ${hm(ECOLE.depose)} − 10 min − ${prep} min préparation = ${hm(dep - prep)}` };
    }
    const c = C[p.id][d];
    if (c) {
      const t = T[p.id], dep = c.debut - t.trajet;
      return { lever: dep - t.prep, dep, strict: false, expl: `cours ${hm(c.debut)} − ${t.trajet} min trajet − ${t.prep} min préparation = ${hm(dep - t.prep)}` };
    }
    const v = rdvDuJour(p, d);
    if (v) {
      const prep = T[p.id].prep, dep = v.h - v.trajet;
      return { lever: dep - prep, dep, strict: false, rdv: v, expl: `RDV ${v.lab} ${hm(v.h)} − ${v.trajet} min trajet − ${prep} min préparation = ${hm(dep - prep)}` };
    }
    return null;
  }
  const OB = {};
  for (const p of TOUS) { OB[p.id] = {}; if (p === NOUNOU) continue; for (const d of DAYS) OB[p.id][d] = leverOblige(p, d); }

  // ─── Tableaux minute par minute (indice 0 = dimanche 1er novembre 0 h 00) ───
  // k : activité ; lab : étiquette ; room : pièce occupée (éveillé à la maison) ou ''.
  const A = {};
  for (const p of TOUS) A[p.id] = { k: new Array(N).fill(p === NOUNOU ? 'ailleurs' : 'sommeil'), lab: new Array(N).fill(''), room: new Array(N).fill('') };
  function paint(p, a, b, k, lab = '', room = '') {
    const X = A[p.id];
    for (let i = Math.max(0, Math.round(a)); i < Math.min(N, Math.round(b)); i++) { X.k[i] = k; X.lab[i] = lab; X.room[i] = room; }
  }
  function roomIf(p, a, b, room, kinds = ['maison']) {
    const X = A[p.id];
    for (let i = Math.max(0, Math.round(a)); i < Math.min(N, Math.round(b)); i++) if (kinds.includes(X.k[i])) X.room[i] = room;
  }

  const INFO = {}; // INFO[p][d] = { lever, expl, coucher, nuitCourte, ... }
  for (const p of TOUS) INFO[p.id] = {};
  const SORTIES = {}; // SORTIES[d] = [{qui:[...], lab, dep, ret}]
  const BED = {};
  // Coucher de la veille du 1er novembre (samedi 31 octobre) : habituel.
  for (const p of TOUS) if (p !== NOUNOU) BED[p.id] = T[p.id].coucher - 1440;

  function leverLibre(p, d, base) {
    const r = rngOf(p.id, d, 'lever');
    if (p.statut === 'retraité') {
      const tot = r() < T[p.id].leveTot;
      return { lever: base + U5(r, ...(tot ? P.leverRetraite.tot : P.leverRetraite.tard)), expl: tot ? 'jour libre — tirage du jour : lève-tôt aujourd’hui' : 'jour libre — tirage du jour' };
    }
    if (p.statut === 'chômeur') return { lever: base + U5(r, ...P.leverChomeur), expl: 'jour libre — tirage du jour' };
    if (p.statut === 'enfant') return { lever: base + U5(r, ...(p.age < P.autonome ? P.leverEnfant.petit : P.leverEnfant.grand)), expl: 'pas d’école — tirage du jour' };
    if (p.statut === 'étudiant') return { lever: base + U5(r, ...P.leverLibreEtudiant), expl: 'pas de cours — tirage du jour' };
    const conge = W[p.id][d] && W[p.id][d].conge;
    return { lever: base + U5(r, ...P.leverLibreActif), expl: conge === 'RTT' ? 'jour de RTT — tirage du jour' : conge ? 'en congé — tirage du jour' : 'jour libre — tirage du jour' };
  }

  for (let di = 0; di < NJ - 1; di++) {
    const d = DAYS[di], base = di * 1440, j = jourCtx(d), next = DAYS[di + 1];
    const leve = {}, dehors = {}; // lever absolu ; blocs hors de chez soi [{a,b,k,lab}]

    // 1. Lever de chacun.
    for (const p of TOUS) {
      if (p === NOUNOU) continue;
      const ob = OB[p.id][d];
      const lib = leverLibre(p, d, base);
      // Rattrapage : couché tard, sans obligation, on dort son besoin de sommeil.
      const rr = rngOf(p.id, d, 'rattrapage');
      const besoin = BED[p.id] + T[p.id].sommeil + U5(rr, -P.rattrapage.moins, P.rattrapage.plus);
      let libre = lib;
      if (p.statut !== 'enfant' && besoin > lib.lever) {
        const L = Math.min(besoin, base + P.rattrapage.max);
        libre = { lever: L, expl: `${accord(p, 'couché')} ${hm(BED[p.id])} + ${duree(T[p.id].sommeil)} de sommeil ≈ ${hm(L)} (rattrapage)`, rattrapage: true };
      }
      let res;
      if (ob && ob.strict) res = { lever: base + ob.lever, expl: ob.expl };
      else if (ob && base + ob.lever < libre.lever) res = { lever: base + ob.lever, expl: ob.expl };
      else res = libre;
      leve[p.id] = res;
    }
    // Parents un jour libre avec de jeunes enfants à la maison : l'un se lève avec eux (pas de rattrapage pour lui).
    for (const lg of LOGEMENTS) {
      const kids = petits(lg);
      if (!kids.length || kids.some((k) => K[k.id][d])) continue;
      const pars = adultes(lg).filter((p) => !travaille(p, d) && !(OB[p.id][d] && OB[p.id][d].strict));
      if (!pars.length) continue;
      const r = rngOf(lg.id, d, 'garde');
      const g = pars[Math.floor(r() * pars.length)];
      const kw = Math.min(...kids.map((k) => leve[k.id].lever));
      const L = kw + U5(r, 0, 10);
      if (L < leve[g.id].lever) leve[g.id] = { lever: L, expl: `${kids.map((k) => k.prenom).join(' et ')} debout à ${hm(kw)} : ${g.prenom} se lève avec ${kids.length > 1 ? 'eux' : kids[0].f ? 'elle' : 'lui'}` };
    }

    // 2. Journée : blocs hors de chez soi.
    for (const p of TOUS) { if (p !== NOUNOU) dehors[p.id] = []; }
    const bloc = (p, a, b, k, lab) => { if (b > a) dehors[p.id].push({ a: base + a, b: base + b, k, lab }); };
    for (const p of TOUS) {
      if (p === NOUNOU || p.statut === 'enfant') continue;
      const w = W[p.id][d], ob = OB[p.id][d];
      if (w && !w.conge) {
        if (w.depose) {
          bloc(p, ECOLE.depose - ECOLE.pied, ECOLE.depose, 'accomp', 'école');
          bloc(p, ECOLE.depose, w.debut, 'trajet', T[p.id].mode);
        } else bloc(p, w.debut - w.trajet, w.debut, 'trajet', T[p.id].mode);
        w.services.forEach(([a, b], i) => {
          bloc(p, a, b, 'travail', w.coupe ? 'service' : 'travail');
          const nx = w.services[i + 1];
          if (!nx) return;
          if (!w.coupe) bloc(p, b, nx[0], 'pause', 'pause déjeuner');
          else if (w.maison) { bloc(p, b, b + w.trajet, 'trajet', T[p.id].mode); bloc(p, nx[0] - w.trajet, nx[0], 'trajet', T[p.id].mode); }
          else bloc(p, b, nx[0], 'dehors', 'coupure en ville');
        });
        bloc(p, w.fin, w.fin + w.trajet, 'trajet', T[p.id].mode);
        continue;
      }
      if (ob && ob.depose) bloc(p, ECOLE.depose - ECOLE.pied, ECOLE.depose + ECOLE.pied, 'accomp', 'école');
      const c = C[p.id][d];
      if (c) {
        const t = T[p.id];
        bloc(p, c.debut - t.trajet, c.debut, 'trajet', t.mode);
        bloc(p, c.debut, c.fin, 'ecole', 'cours');
        bloc(p, c.fin, c.fin + t.trajet, 'trajet', t.mode);
      }
      const v = rdvDuJour(p, d);
      if (v) {
        bloc(p, v.h - v.trajet, v.h, 'trajet', '');
        bloc(p, v.h, v.h + v.duree, 'rdv', 'RDV ' + v.lab);
        bloc(p, v.h + v.duree, v.h + v.duree + v.trajet, 'trajet', '');
      }
    }
    // Enfants : école, collège.
    for (const lg of LOGEMENTS) {
      for (const k of lg.membres.filter((m) => m.statut === 'enfant')) {
        const e = K[k.id][d];
        if (!e) continue;
        if (e.seul) { bloc(k, e.debut - 15, e.debut, 'trajet', 'à pied'); bloc(k, e.debut, e.fin, 'ecole', 'collège'); bloc(k, e.fin, e.fin + 15, 'trajet', 'à pied'); continue; }
        const L = LOG[lg.id][d];
        bloc(k, ECOLE.depose - ECOLE.pied, ECOLE.depose, 'accomp', L.depose ? 'avec ' + L.depose.prenom : '');
        if (e.mercredi) { bloc(k, ECOLE.depose, H(11, 30), 'ecole', 'école'); bloc(k, H(11, 30), ECOLE.sortie, 'ecole', 'centre de loisirs'); }
        else bloc(k, ECOLE.depose, ECOLE.sortie, 'ecole', 'école');
        const c = L.cherche;
        if (c.mode === 'garderie') {
          bloc(k, ECOLE.sortie, c.a - ECOLE.pied, 'ecole', 'garderie');
          bloc(k, c.a - ECOLE.pied, c.a, 'accomp', 'avec ' + c.qui.prenom);
        } else bloc(k, ECOLE.sortie, ECOLE.sortie + ECOLE.pied, 'accomp', 'avec ' + c.qui.prenom);
      }
      const L = LOG[lg.id][d];
      if (!L) continue;
      const c = L.cherche;
      if (c.mode === 'pied') bloc(c.qui, ECOLE.sortie - ECOLE.pied, ECOLE.sortie + ECOLE.pied, 'accomp', 'sortie d’école');
      if (c.mode === 'garderie') {
        // Le parent passe par l'école en rentrant : les 10 dernières minutes du trajet deviennent « chercher ».
        const tr = dehors[c.qui.id].find((x) => x.k === 'trajet' && x.b === base + retourTravail(c.qui, d));
        if (tr) { tr.b -= ECOLE.pied; bloc(c.qui, c.a - ECOLE.pied, c.a, 'accomp', 'garderie'); }
      }
    }
    // Sorties de jour (courses, promenade) pour ceux qui sont libres.
    for (const lg of LOGEMENTS) {
      const kids = petits(lg);
      const famLibre = kids.length && !kids.some((k) => K[k.id][d]) && adultes(lg).every((p) => !travaille(p, d));
      if (famLibre) {
        const r = rngOf(lg.id, d, 'parc');
        if (r() < 0.7) { const a = U5(r, H(15), H(15, 30)), b = a + U5(r, 90, 120); for (const m of lg.membres) bloc(m, a, b, 'dehors', pick(r, ['parc', 'balade', 'square'])); }
        if (r() < 0.6) { const qui = pick(r, adultes(lg)), a = U5(r, H(10, 30), H(11, 15)); bloc(qui, a, a + U5(r, 45, 75), 'dehors', 'courses'); }
        continue;
      }
      for (const p of adultes(lg)) {
        if (travaille(p, d)) continue;
        const r = rngOf(p.id, d, 'dehors');
        const libreMatin = !dehors[p.id].some((x) => x.a < base + H(12, 30));
        const lv = leve[p.id].lever - base;
        const pMatin = p.statut === 'retraité' ? 0.65 : j.weekend || (W[p.id][d] && W[p.id][d].conge) ? 0.55 : p.statut === 'chômeur' ? 0.35 : 0.2;
        const rm = r(), am = U5(r, Math.max(H(9, 30), lv + 50), Math.max(H(11), lv + 60)), dm = U5(r, 45, 90);
        if (libreMatin && rm < pMatin && am + dm < H(13)) bloc(p, am, am + dm, 'dehors', pick(r, p.statut === 'retraité' ? ['marché', 'courses', 'café', 'boulangerie'] : ['courses', 'sport', 'marché']));
        const pAprem = p.statut === 'retraité' ? 0.5 : p.statut === 'chômeur' ? 0.4 : j.weekend ? 0.5 : 0.25;
        const ra = r(), aa = U5(r, H(14, 30), H(16)), da = U5(r, 60, 150);
        const occupe = dehors[p.id].some((x) => x.b > base + aa - 10 && x.a < base + aa + da + 10);
        const doitChercher = LOG[lg.id][d] && LOG[lg.id][d].cherche.qui === p;
        if (!occupe && ra < pAprem && aa > lv + 60) {
          const fin = doitChercher ? Math.min(aa + da, ECOLE.sortie - 20) : aa + da;
          bloc(p, aa, fin, 'dehors', pick(r, p.statut === 'retraité' ? ['promenade', 'club', 'bibliothèque', 'visite'] : ['balade', 'ciné', 'amis', 'expo']));
        }
      }
    }

    // 3. Sorties du soir (décidées d'après le lendemain : travail ou non).
    SORTIES[d] = [];
    const nextLibre = (p) => { const o = OB[p.id][next]; return !o || o.lever >= H(11); };
    const rentre = (p) => Math.max(leve[p.id].lever - base, ...dehors[p.id].filter((x) => x.a < base + H(19, 30)).map((x) => x.b - base));
    const groupes = [];
    for (const lg of LOGEMENTS) {
      if (lg.ensemble) groupes.push({ cle: lg.id, qui: adultes(lg), lg });
      else for (const p of adultes(lg)) groupes.push({ cle: p.id, qui: [p], lg });
    }
    for (const g of groupes) {
      const pr = profil(g.qui[0]);
      const libre = g.qui.every(nextLibre);
      const r = rngOf(g.cle, d, 'soir');
      let s = IMPOSES.sorties[g.cle + '|' + d] || null;
      if (!s) {
        const x = r();
        if (pr === 'jeune') {
          if (libre && x < 0.45) s = r() < 0.35 ? { lab: 'boîte', dep: U5(r, H(22, 30), H(23, 30)), ret: U5(r, H(27, 30), H(29)) } : { lab: 'bar', dep: U5(r, H(19, 30), H(21)), ret: U5(r, H(24, 30), H(26)) };
          else if (!libre && x < 0.12) s = { lab: 'bar', dep: U5(r, H(19, 30), H(20, 30)), ret: U5(r, H(22, 45), H(24)) };
          else if (!libre && j.wd === 4 && x < 0.22) s = { lab: 'boîte', dep: U5(r, H(22, 30), H(23, 15)), ret: U5(r, H(26, 45), H(27, 45)) };
        } else if (pr === 'adulte') {
          if (libre && x < 0.25) s = { lab: pick(r, ['resto', 'bar', 'amis']), dep: U5(r, H(19, 45), H(20, 15)), ret: U5(r, H(23), H(24, 15)) };
          else if (!libre && x < 0.06) s = { lab: 'resto', dep: U5(r, H(19, 45), H(20, 15)), ret: U5(r, H(22, 30), H(23, 30)) };
        } else if (pr === 'senior') {
          const ps = j.wd === 6 ? 0.3 : j.wd === 5 ? 0.15 : 0.06;
          if (x < ps) s = { lab: pick(r, ['resto', 'resto', 'théâtre', 'amis']), dep: U5(r, H(19, 15), H(19, 45)), ret: Math.min(H(23), U5(r, H(22), H(23))) };
        } else if (pr === 'famille' && g.lg.nounou && j.wd === 6 && x < 0.15) {
          s = { lab: 'resto', dep: U5(r, H(19, 45), H(20, 15)), ret: U5(r, H(23), H(24)) };
        }
      }
      if (!s) continue;
      if (pr === 'famille' && !g.lg.nounou) continue; // familles sans nounou : pas de sortie le soir
      const dep = Math.max(s.dep, ...g.qui.map((p) => rentre(p) + 30));
      for (const p of g.qui) bloc(p, dep, s.ret, 'sortie', s.lab);
      SORTIES[d].push({ qui: g.qui, lab: s.lab, dep, ret: s.ret, lg: g.lg });
    }

    // 4. Peinture de la journée et coucher.
    for (const p of TOUS) {
      if (p === NOUNOU) continue;
      const lv = leve[p.id].lever;
      paint(p, BED[p.id], lv, 'sommeil');
      const blocs = dehors[p.id].sort((a, b) => a.a - b.a);
      const finJour = Math.max(lv + 60, ...blocs.map((x) => x.b));
      // Coucher : après une sortie, au retour ; sinon l'habitude, avancée pour dormir assez avant une obligation (majorité).
      const r = rngOf(p.id, d, 'coucher');
      const ob2 = OB[p.id][next];
      const sortie = blocs.find((x) => x.k === 'sortie');
      let bed, respect = true;
      if (p.statut === 'enfant') {
        const veilleEcole = ob2 && ob2.strict;
        const centre = base + 1440 + (veilleEcole ? ob2.lever : H(7, 30)) - T[p.id].sommeil;
        bed = centre + U5(r, -10, 10) + (veilleEcole ? 0 : 30);
      } else if (sortie) bed = sortie.b + U5(r, 10, 20);
      else {
        const habit = base + T[p.id].coucher + U5(r, -P.coucherHabituel.bruit, P.coucherHabituel.bruit) + (!ob2 ? 20 : 0);
        respect = r() < P.respectSommeil;
        bed = ob2 && respect ? Math.min(habit, base + 1440 + ob2.lever - T[p.id].sommeil + U5(r, -20, 0)) : habit;
        bed = Math.max(bed, finJour + 45);
      }
      paint(p, lv, bed, 'maison', '', 'salon');
      const ob = OB[p.id][d];
      const prepFin = ob && ob.strict ? base + ob.dep : (ob && lv === base + ob.lever ? base + ob.dep : null);
      if (prepFin) { paint(p, lv, prepFin, 'prep', 'préparation', 'salon'); roomIf(p, lv, lv + 8, 'chambre', ['prep']); roomIf(p, lv + 8, lv + 28, 'cuisine', ['prep']); }
      else { roomIf(p, lv, lv + 6, 'chambre'); roomIf(p, lv + 6, lv + 40, 'cuisine'); }
      for (const x of blocs) paint(p, x.a, x.b, x.k, x.lab);
      if (p.statut === 'enfant') roomIf(p, base + H(19), base + H(19, 30), 'cuisine', ['maison', 'nounou']);
      else roomIf(p, base + H(19, 45), base + H(20, 30), 'cuisine');
      roomIf(p, bed - (p.statut === 'enfant' ? 20 : 15), bed, 'chambre', ['maison', 'nounou']);
      const nuitAvant = lv - BED[p.id];
      INFO[p.id][d] = { travail: ligneTravail(W[p.id][d], p), lever: lv - base, expl: leve[p.id].expl, coucher: bed - base, nuitAvant, nuitCourte: nuitAvant < T[p.id].sommeil - 90, sortie: sortie ? { lab: sortie.lab, dep: sortie.a - base, ret: sortie.b - base } : null, respect };
      BED[p.id] = bed;
    }

    // 5. La nounou (vraie personne : elle vient à pied, prend les enfants à l'école, entre avec eux, part au retour d'un parent).
    for (const lg of LOGEMENTS) {
      if (!lg.nounou) continue;
      const L = LOG[lg.id][d];
      const kids = petits(lg);
      const r = rngOf(NOUNOU.id, d, 'trajet');
      const visite = [];
      if (L && L.cherche.mode === 'nounou') {
        const fin = L.cherche.jusque + U5(r, 5, 10);
        paint(NOUNOU, base + ECOLE.sortie - 25, base + ECOLE.sortie, 'trajet', 'à pied');
        paint(NOUNOU, base + ECOLE.sortie, base + ECOLE.sortie + ECOLE.pied, 'accomp', 'sortie d’école');
        paint(NOUNOU, base + ECOLE.sortie + ECOLE.pied, base + fin, 'nounou', 'chez les ' + lg.famille, 'salon');
        roomIf(NOUNOU, base + ECOLE.sortie + ECOLE.pied, base + ECOLE.sortie + ECOLE.pied + 20, 'cuisine', ['nounou']);
        paint(NOUNOU, base + fin, base + fin + 20, 'trajet', 'à pied');
        for (const k of kids) { paint(k, base + ECOLE.sortie + ECOLE.pied, base + L.cherche.jusque, 'nounou', 'avec ' + NOUNOU.prenom, 'salon'); roomIf(k, base + ECOLE.sortie + ECOLE.pied, base + ECOLE.sortie + ECOLE.pied + 20, 'cuisine', ['nounou']); }
        visite.push({ arrive: ECOLE.sortie + ECOLE.pied, part: fin, motif: 'sortie d’école', relais: L.cherche.relais.prenom });
      }
      const s = SORTIES[d].find((x) => x.lg === lg);
      if (s) {
        const arr = s.dep - 10, fin = s.ret + U5(r, 5, 10);
        paint(NOUNOU, base + arr - 20, base + arr, 'trajet', 'à pied');
        paint(NOUNOU, base + arr, base + fin, 'nounou', 'garde du soir', 'salon');
        paint(NOUNOU, base + fin, base + fin + 20, 'trajet', 'taxi');
        for (const k of kids) {
          const X = A[k.id];
          for (let i = base + arr; i < base + s.ret; i++) if (X.k[i] === 'maison') { X.k[i] = 'nounou'; X.lab[i] = 'avec ' + NOUNOU.prenom; }
        }
        visite.push({ arrive: arr, part: fin, motif: 'garde du soir (parents au ' + s.lab + ')' });
      }
      INFO[NOUNOU.id][d] = { visite, expl: visite.length ? visite.map((v) => `${v.motif} : arrive ${hm(v.arrive)}, repart ${hm(v.part)}` + (v.relais ? ` (retour de ${v.relais})` : '')).join(' ; ') : 'pas de garde ce jour-là' };
    }
  }
  // Fin de la dernière nuit.
  for (const p of TOUS) if (p !== NOUNOU) paint(p, BED[p.id], N, 'sommeil');

  // ─── Lectures pour les planches ───
  const DEDANS = new Set(['sommeil', 'maison', 'prep', 'nounou']);
  // Segments d'une personne sur la fenêtre [a, b) minutes absolues.
  function segments(p, a, b) {
    const X = A[p.id], out = [];
    for (let i = a; i < b; i++) {
      const last = out[out.length - 1];
      if (last && last.k === X.k[i] && last.lab === X.lab[i]) last.b = i + 1;
      else out.push({ a: i, b: i + 1, k: X.k[i], lab: X.lab[i] });
    }
    return out;
  }
  // Pièces allumées d'un logement (seulement quand il fait sombre dehors : avant le lever + 20 min, après le coucher − 20 min).
  function lumieres(lg, a, b) {
    const qui = lg.membres.slice();
    if (lg.nounou) qui.push(NOUNOU);
    const map = (room) => (lg.pieces.includes(room) ? room : 'salon');
    const out = {};
    for (const room of lg.pieces) out[room] = [];
    for (let i = a; i < b; i++) {
      const di = Math.floor(i / 1440), m = i - di * 1440;
      const sol = soleil(DAYS[di]);
      const sombre = m < sol.lever + 20 || m > sol.coucher - 20;
      const on = new Set();
      if (sombre) for (const p of qui) { const X = A[p.id]; if (DEDANS.has(X.k[i]) && X.k[i] !== 'sommeil' && X.room[i]) on.add(map(X.room[i])); }
      for (const room of lg.pieces) {
        const seg = out[room], last = seg[seg.length - 1], v = on.has(room);
        if (last && last.on === v) last.b = i + 1; else seg.push({ a: i, b: i + 1, on: v });
      }
    }
    return out;
  }
  // Passages à la porte de l'immeuble (entrées / sorties), regroupés quand on passe ensemble.
  function porte(a, b) {
    const ev = [];
    for (const p of TOUS) {
      const X = A[p.id];
      for (let i = a; i < b; i++) {
        const avant = DEDANS.has(X.k[i - 1]), apres = DEDANS.has(X.k[i]);
        if (avant !== apres) ev.push({ t: i, sens: apres ? 'entre' : 'sort', p });
      }
    }
    const groupes = [];
    for (const e of ev.sort((x, y) => x.t - y.t)) {
      const lgOf = e.p === NOUNOU ? LOGEMENTS.find((l) => l.nounou) : e.p.logement;
      const g = groupes.find((x) => x.t === e.t && x.sens === e.sens && x.lg === lgOf);
      if (g) g.qui.push(e.p); else groupes.push({ t: e.t, sens: e.sens, qui: [e.p], lg: lgOf });
    }
    return groupes;
  }
  function etiquette(p) {
    if (p === NOUNOU) return `${p.prenom}, ${p.age} ans, nounou (vient chez les Martin)`;
    const st = p.statut === 'enfant' ? p.niveau : p.statut === 'retraité' ? accord(p, 'retraité') : p.statut === 'étudiant' ? accord(p, 'étudiant') + (p.metier ? ' en ' + p.metier : '') : p.statut + (p.metier ? ' (' + p.metier + ')' : '');
    return `${p.prenom}, ${p.age} ans, ${st}`;
  }

  // ─── Vérification du droit du travail sur la semaine générée (lun. 2 → dim. 8) : lève une erreur au moindre écart ───
  // Limites (P.loi) : 10 h effectives par jour, 6 h au plus sans pause de 20 min, amplitude 11 h (13 h en horaires coupés,
  // convention HCR), 11 h de repos entre deux jours, 48 h par semaine, 35 h de repos hebdomadaire d'affilée.
  function periodesTravail(p, d) {
    if (p === NOUNOU) {
      const i = INFO[p.id][d];
      // Elle travaille de la sortie d'école (16 h 30) ou de son arrivée le soir jusqu'à son départ.
      return i ? i.visite.map((v) => [v.motif.startsWith('sortie') ? ECOLE.sortie : v.arrive, v.part]) : [];
    }
    const w = W[p.id][d] !== undefined ? W[p.id][d] : travailDuJour(p, d); // hors simulation (veille, lendemain) : tirage direct
    return w && !w.conge ? w.services.map((x) => x.slice()) : [];
  }
  // Pour la nounou hors des jours simulés : la sortie d'école prévue par la logistique (ou rien).
  function periodesNounou(d) {
    const lg = LOGEMENTS.find((l) => l.nounou), L = LOG[lg.id][d];
    if (INFO[NOUNOU.id][d]) return periodesTravail(NOUNOU, d);
    return L && L.cherche.mode === 'nounou' ? [[ECOLE.sortie, L.cherche.jusque + 10]] : [];
  }
  function verifierDroit() {
    const L = P.loi, semaine = DAYS.slice(1, 8), erreurs = [], bilan = [];
    for (const p of TOUS.filter((q) => actif(q) || q === NOUNOU)) {
      let total = 0, ampMax = 0, effMax = 0, reposMin = Infinity, prec = null;
      const per = [], tout = [];
      // Semaine vérifiée : lun. 2 → dim. 8 ; on lit aussi le sam. 31 oct. et les lun. 9 / mar. 10 pour les repos à cheval.
      const jours = [isoAdd(DEBUT, -1), ...DAYS, isoAdd(DEBUT, NJ)];
      jours.forEach((d, k) => {
        const di = k - 1;
        const sv = p === NOUNOU ? periodesNounou(d) : periodesTravail(p, d);
        if (!sv.length) return;
        const eff = sv.reduce((n, [a, b]) => n + b - a, 0), amp = sv[sv.length - 1][1] - sv[0][0];
        const coupe = !!p.coupe;
        const ou = `${p.prenom} ${d}`;
        if (eff > L.jourMax) erreurs.push(`${ou} : ${duree(eff)} de travail effectif (> 10 h)`);
        for (const [a, b] of sv) if (b - a > L.sansPause) erreurs.push(`${ou} : ${duree(b - a)} sans pause (> 6 h)`);
        for (let i = 1; i < sv.length; i++) if (sv[i][0] - sv[i - 1][1] < L.pauseMin) erreurs.push(`${ou} : pause < 20 min`);
        if (amp > (coupe ? L.amplitudeCoupeMax : L.amplitudeMax)) erreurs.push(`${ou} : amplitude ${duree(amp)}`);
        const abs = sv.map(([a, b]) => [di * 1440 + a, di * 1440 + b]);
        // Repos quotidien compté depuis la fin du DERNIER service de la veille.
        if (prec !== null) { const repos = abs[0][0] - prec; reposMin = Math.min(reposMin, repos); if (repos < L.reposJour) erreurs.push(`${ou} : repos quotidien ${duree(repos)} (< 11 h)`); }
        prec = abs[abs.length - 1][1];
        tout.push(...abs);
        if (semaine.includes(d)) { total += eff; ampMax = Math.max(ampMax, amp); effMax = Math.max(effMax, eff); per.push(...abs); }
      });
      if (total > L.semaineMax) erreurs.push(`${p.prenom} : ${duree(total)} dans la semaine (> 48 h)`);
      // Repos hebdomadaire : plus long intervalle sans travail qui touche la semaine (lundi 0 h → lundi suivant 0 h),
      // y compris à cheval sur la semaine voisine (dimanche + lundi de repos de Sarah).
      const bornes = [-1440, ...tout.flat(), (NJ + 1) * 1440];
      let reposSem = 0;
      for (let i = 0; i < bornes.length; i += 2) if (bornes[i + 1] > 1440 && bornes[i] < 8 * 1440) reposSem = Math.max(reposSem, bornes[i + 1] - bornes[i]);
      if (reposSem < L.reposSemaine) erreurs.push(`${p.prenom} : repos hebdomadaire ${duree(reposSem)} (< 35 h)`);
      const cp = [...T[p.id].conges.values()].filter((v) => v === 'CP').length, rtt = T[p.id].conges.size - cp;
      if (cp < 25) erreurs.push(`${p.prenom} : ${cp} jours de congés payés dans l’année (< 25 jours ouvrés = 5 semaines)`);
      bilan.push({ cp, rtt, contrat: CONTRATS[p.contrat].lab, qui: p.prenom, semaine: total, effMax, ampMax, reposMin: reposMin === Infinity ? null : reposMin, reposSem });
    }
    if (erreurs.length) throw new Error('Droit du travail non respecté :\n' + erreurs.join('\n'));
    return bilan;
  }
  const DROIT = verifierDroit();

  const Modele = { CONTRATS, DROIT, ligneTravail,  SEED, LOGEMENTS, NOUNOU, TOUS, T, P, W, OB, LOG, INFO, SORTIES, DAYS, IDX, IMPOSES, ECOLE,
    jourCtx, soleil, hm, duree, segments, lumieres, porte, etiquette, profil };
  if (typeof module !== 'undefined' && module.exports) module.exports = Modele;
  else root.Modele = Modele;
})(typeof window !== 'undefined' ? window : globalThis);
