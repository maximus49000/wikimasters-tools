// relay/src/dashboard.ts
// Tableau de bord : une page, sans dépendance. Le jeton est saisi une fois puis gardé dans le navigateur ; toutes les valeurs
// sont posées avec `textContent` (jamais de HTML injecté).
export const DASHBOARD_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Usage — Wikimasters Tools</title>
<style>
:root{--bg:#f6f7f9;--fg:#111827;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--accent:#2563eb;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9ca3af;--card:#161b22;--line:#30363d;--accent:#60a5fa;--bad:#f87171}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:0 0 8px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
select,input,button{min-height:44px;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:0 10px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px;overflow-x:auto}
.tile b{display:block;font-size:28px}.tile span{color:var(--muted);font-size:13px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);font-size:14px}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
svg{width:100%;height:120px;display:block}
.muted{color:var(--muted)}.bad{color:var(--bad)}
#login{display:none}
</style>
</head>
<body>
<main>
<h1>Usage de Wikimasters Tools</h1>
<form id="login" class="card"><h2>Jeton d’accès</h2><div class="bar"><input id="token" type="password" autocomplete="off" aria-label="Jeton" placeholder="Jeton"><button>Valider</button></div><p id="loginError" class="bad"></p></form>
<div id="app" hidden>
<div class="bar">
<select id="platform" aria-label="Plateforme"><option value="">Toutes plateformes</option><option value="extension">Extension</option><option value="android">Android</option></select>
<select id="channel" aria-label="Canal"><option value="">Tous canaux</option><option value="prod">Production</option><option value="preprod">Pré-production</option></select>
<select id="days" aria-label="Période"><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option></select>
<button id="logout" type="button">Changer de jeton</button>
</div>
<div class="tiles"><div class="card tile"><b id="t-today">–</b><span>actifs aujourd’hui</span></div><div class="card tile"><b id="t-week">–</b><span>actifs 7 jours</span></div><div class="card tile"><b id="t-month">–</b><span>actifs 30 jours</span></div></div>
<div class="card"><h2>Actifs par jour</h2><div id="c-active"></div></div>
<div class="card"><h2>Actions les plus utilisées</h2><div id="c-actions"></div></div>
<div class="card"><h2>Erreurs</h2><div id="c-errors"></div><div id="c-errors-day"></div></div>
<div class="card"><h2>Versions installées</h2><div id="c-versions"></div></div>
<div class="card"><h2>Mises à jour réalisées</h2><div id="c-updates"></div></div>
<p id="status" class="muted"></p>
</div>
</main>
<script>
(function () {
  var KEY = 'wmt-stats-token';
  var $ = function (id) { return document.getElementById(id); };
  var token = ''; try { token = localStorage.getItem(KEY) || ''; } catch (e) {}
  function el(tag, text, cls) { var n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; }
  function table(target, head, rows) {
    target.textContent = '';
    if (!rows.length) { target.appendChild(el('p', 'Aucune donnée sur la période.', 'muted')); return; }
    var t = el('table'), h = el('tr');
    head.forEach(function (c, i) { h.appendChild(el('th', c, i === head.length - 1 ? 'n' : '')); });
    t.appendChild(h);
    rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { tr.appendChild(el('td', c, i === r.length - 1 ? 'n' : '')); }); t.appendChild(tr); });
    target.appendChild(t);
  }
  function bars(target, points, label) {
    target.textContent = '';
    if (!points.length) { target.appendChild(el('p', 'Aucune donnée sur la période.', 'muted')); return; }
    var ns = 'http://www.w3.org/2000/svg', max = Math.max.apply(null, points.map(function (p) { return p.count; })) || 1;
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + points.length * 10 + ' 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    points.forEach(function (p, i) {
      var h = Math.max(1, (p.count / max) * 96), r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', i * 10 + 1); r.setAttribute('y', 100 - h); r.setAttribute('width', 8); r.setAttribute('height', h); r.setAttribute('fill', 'var(--accent)');
      var tip = document.createElementNS(ns, 'title'); tip.textContent = p.day + ' : ' + p.count; r.appendChild(tip); svg.appendChild(r);
    });
    target.appendChild(svg);
    target.appendChild(el('p', points[0].day + ' → ' + points[points.length - 1].day + ' (max ' + max + ')', 'muted'));
  }
  function render(s) {
    $('t-today').textContent = s.actives.today; $('t-week').textContent = s.actives.week; $('t-month').textContent = s.actives.month;
    bars($('c-active'), s.activeByDay, 'Actifs par jour');
    table($('c-actions'), ['Action', 'Détail', 'Utilisateurs', 'Fois'], s.actions.map(function (a) { return [a.name, a.detail, a.users, a.count]; }));
    table($('c-errors'), ['Erreur', 'Service', 'Fois'], s.errors.map(function (e) { return [e.name, e.detail, e.count]; }));
    bars($('c-errors-day'), s.errorsByDay, 'Erreurs par jour');
    table($('c-versions'), ['Version', 'Installations'], s.versions.map(function (v) { return [v.version, v.count]; }));
    table($('c-updates'), ['Jour', 'De', 'Vers', 'Installations'], s.updates.map(function (u) { return [u.day, u.from, u.to, u.count]; }));
  }
  function show(loggedIn) { $('login').style.display = loggedIn ? 'none' : 'block'; $('app').hidden = !loggedIn; }
  function load() {
    var q = '?days=' + $('days').value + '&platform=' + $('platform').value + '&channel=' + $('channel').value;
    $('status').textContent = 'Chargement…';
    fetch('/stats' + q, { headers: { 'x-stats': token } }).then(function (r) {
      if (r.status === 401) { token = ''; try { localStorage.removeItem(KEY); } catch (e) {} $('loginError').textContent = 'Jeton refusé.'; show(false); return null; }
      return r.json();
    }).then(function (body) {
      if (!body) return;
      if (!body.ok) { $('status').textContent = 'Service non configuré (' + body.reason + ').'; return; }
      show(true); render(body.stats); $('status').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR') + '.';
    }).catch(function () { $('status').textContent = 'Impossible de joindre le relais.'; });
  }
  $('login').addEventListener('submit', function (e) { e.preventDefault(); token = $('token').value.trim(); if (!token) return; try { localStorage.setItem(KEY, token); } catch (err) {} $('token').value = ''; $('loginError').textContent = ''; load(); });
  $('logout').addEventListener('click', function () { token = ''; try { localStorage.removeItem(KEY); } catch (e) {} show(false); });
  ['platform', 'channel', 'days'].forEach(function (id) { $(id).addEventListener('change', load); });
  if (token) load(); else show(false);
})();
</script>
</body>
</html>`;
