/* NorthernKnife Creative Hub v2. All numbers come from Triple Whale (pipeline/build_data.py), daily, any date range. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FLAGS = {US:'🇺🇸',UK:'🇬🇧',AU:'🇦🇺',CA:'🇨🇦',DE:'🇩🇪',NL:'🇳🇱',ALL:'🌍'};
const SYM = {USD:'$',GBP:'£',AUD:'A$',CAD:'C$',EUR:'€'};
const MODELS = {fc:'First Click', ta:'Triple', pl:'Platform'};
const WIN_BAR = 10000;
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };

let D = null;
const S = {page:'hq', preset:'week', from:null, to:null, market:'ALL', model:'fc', cur:'USD', min:300, target:'auto', board:'editors', ins:'product', more:false, trend:'rev'};
const charts = {};
const memo = new Map();

/* ---------------- dates ---------------- */
const iso = d => d.toISOString().slice(0, 10);
const P = s => new Date(s + 'T00:00:00Z');
const addD = (s, n) => { const d = P(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monday = s => { const d = P(s); const wd = (d.getUTCDay() + 6) % 7; return addD(s, -wd); };
const nDays = (a, b) => Math.round((P(b) - P(a)) / 864e5) + 1;
const fmtD = s => P(s).toLocaleDateString('en-GB', {day:'numeric', month:'short', timeZone:'UTC'});
const PRESETS = [['week','This week'],['lastweek','Last week'],['month','This month'],['lastmonth','Last month'],['7d','Last 7 days'],['30d','Last 30 days']];
function presetRange(p) {
  const t = D.today, first = D.days[0];
  const clip = s => s < first ? first : s;
  if (p === 'week') return [monday(t), t];
  if (p === 'lastweek') { const m = addD(monday(t), -7); return [m, addD(m, 6)]; }
  if (p === 'month') return [clip(t.slice(0, 8) + '01'), t];
  if (p === 'lastmonth') { const m1 = t.slice(0, 8) + '01'; const e = addD(m1, -1); return [clip(e.slice(0, 8) + '01'), e]; }
  if (p === '7d') return [clip(addD(t, -6)), t];
  if (p === '30d') return [clip(addD(t, -29)), t];
  return [S.from, S.to];
}
function compareRange(a, b) {
  const n = nDays(a, b);
  if (S.preset === 'week' || S.preset === 'lastweek') return [addD(a, -7), addD(b, -7)];
  if (S.preset === 'month' || S.preset === 'lastmonth') {
    const d = P(a); d.setUTCMonth(d.getUTCMonth() - 1); const ca = iso(d);
    return [ca, addD(ca, n - 1)];
  }
  return [addD(a, -n), addD(a, -1)];
}
const R = () => [S.from, S.to];
const dIdx = s => { const i = D.days.indexOf(s); return i; };
function idxRange(a, b) { let i0 = D.days.indexOf(a), i1 = D.days.indexOf(b); if (i0 < 0) i0 = a < D.days[0] ? 0 : D.days.length; if (i1 < 0) i1 = b > D.days[D.days.length - 1] ? D.days.length - 1 : -1; return [i0, i1]; }
const inRange = (s, a, b) => !!s && s >= a && s <= b;
let FIRST = null; // concept key -> first day it spent anywhere (true launch date; the date in the name is the brief date)
function firstLive() {
  if (FIRST) return FIRST;
  FIRST = new Map();
  for (const r of D.rows) { if (r[2] <= 0) continue; const kk = ckey(D.ads[r[0]]); const cur = FIRST.get(kk); if (cur === undefined || r[1] < cur) FIRST.set(kk, r[1]); }
  return FIRST;
}
const isNew = (c, a, b) => { const i = firstLive().get(c.key); return i !== undefined && i > 0 && inRange(D.days[i], a, b); };

/* ---------------- money ---------------- */
const fx = st => (D.fx && D.fx[st]) || 1;
const localMode = () => S.cur === 'LOCAL' && S.market !== 'ALL';
const curCode = () => localMode() ? (D.stores.find(s => s.code === S.market) || {}).cur : 'USD';
const k = st => localMode() ? fx(st) / fx(S.market) : fx(st); // everything lands in the displayed currency
function money(v, dec) {
  const sym = SYM[curCode()] || '$', a = Math.abs(v || 0);
  let s;
  if (dec !== undefined) s = a.toLocaleString('en-US', {maximumFractionDigits:dec, minimumFractionDigits:dec});
  else if (a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
  else if (a >= 1e4) s = (a / 1e3).toFixed(1) + 'k';
  else s = Math.round(a).toLocaleString('en-US');
  return (v < 0 ? '-' : '') + sym + s;
}
const x2 = v => (isFinite(v) && v >= 0) ? v.toFixed(2) : '–';
const pct = (v, d = 1) => (v != null && isFinite(v)) ? (v * 100).toFixed(d) + '%' : '–';
const int = v => Math.round(v || 0).toLocaleString('en-US');
const initials = n => n.split(/[\s×]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();
function delta(cur, prev, invert) {
  if (!prev || !isFinite(cur / prev)) return '<span class="muted">no comparison</span>';
  const d = cur / prev - 1, good = invert ? d < 0 : d > 0;
  return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)}%</span>`;
}
const marketOk = st => S.market === 'ALL' || st === S.market;

/* ---------------- aggregation ---------------- */
function kpis(a, b, mkt = S.market) {
  const o = {sales:0, spend:0, profit:0, orders:0, ncOrders:0, ncSales:0, addBack:0, paidSp:0, paidFc:0, paidTa:0, metaSp:0, metaFc:0, metaTa:0, metaPl:0};
  const [i0, i1] = idxRange(a, b);
  for (let i = i0; i <= i1; i++) {
    for (const [st, q] of Object.entries(D.kpi[i] || {})) {
      if (mkt !== 'ALL' && st !== mkt) continue; const f = k(st);
      o.sales += q[0] * f; o.spend += q[1] * f; o.profit += q[2] * f; o.orders += q[3]; o.ncOrders += q[4]; o.ncSales += q[5] * f; o.addBack += (q[6] || 0) * f;
    }
    for (const [st, q] of Object.entries(D.paid[i] || {})) {
      if (mkt !== 'ALL' && st !== mkt) continue; const f = k(st);
      o.paidSp += q[0] * f; o.paidFc += q[1] * f; o.paidTa += q[2] * f; o.metaSp += q[3] * f; o.metaFc += q[4] * f; o.metaTa += q[5] * f; o.metaPl += q[6] * f;
    }
  }
  o.roas = o.spend ? o.sales / o.spend : 0; o.aov = o.orders ? o.sales / o.orders : 0; o.ncCpa = o.ncOrders ? o.spend / o.ncOrders : 0;
  o.r = {fc: o.paidSp ? o.paidFc / o.paidSp : 0, ta: o.paidSp ? o.paidTa / o.paidSp : 0, pl: o.metaSp ? o.metaPl / o.metaSp : 0};
  o.meta = {fc: o.metaSp ? o.metaFc / o.metaSp : 0, ta: o.metaSp ? o.metaTa / o.metaSp : 0, pl: o.metaSp ? o.metaPl / o.metaSp : 0};
  return o;
}
function adSums(a, b, mkt = S.market) {
  const key = ['ads', a, b, mkt, S.cur].join('|');
  if (memo.has(key)) return memo.get(key);
  const [i0, i1] = idxRange(a, b), m = new Map();
  for (const r of D.rows) {
    if (r[1] < i0 || r[1] > i1) continue;
    const ad = D.ads[r[0]]; if (mkt !== 'ALL' && ad.s !== mkt) continue;
    let o = m.get(r[0]); if (!o) { o = {ad, sp:0, pr:0, fc:0, ta:0, fco:0, im:0, cl:0, atc:0, usd:0}; m.set(r[0], o); }
    const f = k(ad.s);
    o.sp += r[2] * f; o.pr += r[3] * f; o.fc += r[4] * f; o.ta += r[5] * f; o.fco += r[6]; o.im += r[7]; o.cl += r[8]; o.atc += r[9]; o.usd += r[2] * fx(ad.s);
  }
  const out = [...m.values()]; memo.set(key, out); return out;
}
const revOf = (o, m = S.model) => m === 'fc' ? o.fc : m === 'ta' ? o.ta : o.pr;
const ckey = ad => ad.concept_id || ad.clean || ad.n;
function concepts(a, b, mkt = S.market) {
  const key = ['c', a, b, mkt, S.cur].join('|');
  if (memo.has(key)) return memo.get(key);
  const map = new Map();
  for (const x of adSums(a, b, mkt)) {
    const ad = x.ad; if (ad.kind === 'OTHER') continue;
    const id = ckey(ad);
    let c = map.get(id);
    if (!c) { c = {key:id, kind:ad.kind, id:ad.concept_id, title:ad.title, sp:0, pr:0, fc:0, ta:0, fco:0, im:0, cl:0, atc:0, usd:0, markets:new Set(), ads:[], _top:-1}; map.set(id, c); }
    c.sp += x.sp; c.pr += x.pr; c.fc += x.fc; c.ta += x.ta; c.fco += x.fco; c.im += x.im; c.cl += x.cl; c.atc += x.atc; c.usd += x.usd;
    c.markets.add(ad.s); c.ads.push(x);
    for (const f of ['product','editor','designer','strategist','format','angle','funnel','structure','creator','hook_tactic']) if (!c[f] && ad[f]) c[f] = ad[f];
    if (ad.launched && (!c.launched || ad.launched < c.launched)) c.launched = ad.launched;
    if (x.sp > c._top) { c._top = x.sp; if (ad.th) c.thumb = ad.th; if (ad.v) { c.video = ad.v; c.dur = ad.dur; } if (ad.hook != null) { c.hook = ad.hook; c.hold = ad.hold; } }
    if (!c.thumb && ad.th) c.thumb = ad.th; if (!c.video && ad.v) { c.video = ad.v; c.dur = ad.dur; }
  }
  const out = [...map.values()];
  for (const c of out) {
    c.r = {fc: c.sp ? c.fc / c.sp : 0, ta: c.sp ? c.ta / c.sp : 0, pl: c.sp ? c.pr / c.sp : 0};
    c.ctr = c.im ? c.cl / c.im : 0;
    const ratio = c.r.pl > 0 ? c.r.fc / c.r.pl : 0;
    c.role = ratio >= 0.9 ? 'acq' : ratio <= 0.5 ? 'close' : 'bal';
  }
  memo.set(key, out); return out;
}
const ROLE = {acq:['Acquirer','green','First Click holds up: this ad starts new journeys. Scale candidate.'],
              close:['Closer','blue','Platform far above First Click: mostly finishes journeys other ads started.'],
              bal:['Balanced','','Credit holds across models.']};
function benchmark(cs, m = S.model) { const sp = cs.reduce((a, c) => a + c.sp, 0); return sp ? cs.reduce((a, c) => a + revOf(c, m), 0) / sp : 0; }
function target(m = S.model) {
  if (S.target !== 'auto') return +S.target;
  const key = ['bm', S.from, S.to, S.market, m].join('|');
  if (!memo.has(key)) memo.set(key, benchmark(concepts(S.from, S.to), m));
  return memo.get(key);
}
const rc = (v, m = S.model) => !isFinite(v) || v <= 0 ? 'bad' : v >= target(m) ? 'good' : 'bad';
const minK = () => localMode() ? S.min / fx(S.market) : S.min;

/* ---------------- leaderboard ---------------- */
const LEVELS = [[0,'Thrall'],[500,'Karl'],[1500,'Huscarl'],[3500,'Jarl'],[7000,'Konungr']];
const level = xp => { let i = 0; LEVELS.forEach((L, j) => { if (xp >= L[0]) i = j; }); return {i, name:LEVELS[i][1], base:LEVELS[i][0], next:LEVELS[i + 1] ? LEVELS[i + 1][0] : null, nextName:LEVELS[i + 1] ? LEVELS[i + 1][1] : null}; };
const CLANS = {editors:{fld:'editor', kind:'VID', name:'Raiders', role:'Editors', title:'Blade of the edit'},
               designers:{fld:'designer', kind:'IMG', name:'Runecarvers', role:'Designers', title:'Carver of statics'},
               strategists:{fld:'strategist', kind:null, name:'War Council', role:'Strategists', title:'Keeper of the plan'}};
function board(a, b, clan, mkt = S.market) {
  const key = ['b', a, b, clan, mkt, S.model, S.cur].join('|');
  if (memo.has(key)) return memo.get(key);
  const C = CLANS[clan];
  const cs = concepts(a, b, mkt).filter(c => !C.kind || c.kind === C.kind);
  const bm = benchmark(cs);
  const topC = cs.slice().sort((x, y) => revOf(y) - revOf(x))[0];
  const ppl = new Map();
  for (const c of cs) {
    const who = c[C.fld]; if (!who) continue;
    let p = ppl.get(who);
    if (!p) { p = {name:who, sp:0, rev:0, fc:0, ta:0, pl:0, usdRev:0, concepts:[], launches:0, hits:0, mvp:false}; ppl.set(who, p); }
    p.sp += c.sp; p.rev += revOf(c); p.fc += c.fc; p.ta += c.ta; p.pl += c.pr; p.concepts.push(c);
    p.usdRev += revOf(c) * (localMode() ? fx(S.market) : 1);
    if (isNew(c, a, b)) p.launches++;
    if (c.usd >= 1000 && c.r[S.model] >= bm) p.hits++;
    if (topC && c.key === topC.key) p.mvp = true;
  }
  const out = [...ppl.values()].map(p => {
    p.xp = Math.round(p.usdRev / 100) + 25 * p.launches + 150 * p.hits + (p.mvp ? 250 : 0);
    p.r = {fc:p.sp ? p.fc / p.sp : 0, ta:p.sp ? p.ta / p.sp : 0, pl:p.sp ? p.pl / p.sp : 0};
    p.concepts.sort((x, y) => revOf(y) - revOf(x));
    return p;
  }).sort((x, y) => y.xp - x.xp);
  out.forEach((p, i) => p.rank = i + 1);
  memo.set(key, out); return out;
}
function fullWeeks() { const out = []; let m = monday(D.days[0]); if (m < D.days[0]) m = addD(m, 7); while (addD(m, 6) <= D.today) { out.push([m, addD(m, 6)]); m = addD(m, 7); } return out; }
function season(clan) { const t = {}; for (const [a, b] of fullWeeks()) for (const p of board(a, b, clan)) t[p.name] = (t[p.name] || 0) + p.xp; return t; }
function streak(clan, name) { let n = 0; for (const [a, b] of fullWeeks().reverse()) { const bb = board(a, b, clan); if (bb[0] && bb[0].name === name) n++; else break; } return n; }
function allTimeSpend() {
  if (memo.has('ats')) return memo.get('ats');
  const save = S.cur; S.cur = 'USD';
  const m = new Map(concepts(D.days[0], D.days[D.days.length - 1], 'ALL').map(c => [c.key, c]));
  S.cur = save; memo.set('ats', m); return m;
}

/* ---------------- shell ---------------- */
const ICONS = {
  hq:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  videos:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  statics:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  board:'<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  markets:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  rookies:'<path d="M12 2l2.9 6.9L22 10l-5.5 4.7L18 22l-6-3.6L6 22l1.5-7.3L2 10l7.1-1.1z"/>',
  road:'<path d="M4 20L10 4M20 20L14 4M12 6v2M12 11v2M12 16v2"/>',
  insights:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  guide:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>'
};
const PAGES = [['hq','HQ overview'],['videos','Top videos'],['statics','Top statics'],['board','The Great Hall'],['markets','Markets'],
               ['rookies','Rookies'],['road','Road to $10k'],['insights','Creative insights'],['guide','How to read this']];

function buildShell() {
  $('#nav').innerHTML = PAGES.map(([p, l]) => `<button class="nav-item" data-p="${p}"><svg viewBox="0 0 24 24">${ICONS[p]}</svg>${l}</button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { S.page = b.dataset.p; $('#side').classList.remove('open'); render(); window.scrollTo(0, 0); } };
  seg('#cMarket', ['ALL', ...D.stores.map(s => s.code)].map(c => [c, (FLAGS[c] || '') + ' ' + (c === 'ALL' ? 'All' : c)]), 'market', () => { if (S.market === 'ALL') S.cur = 'USD'; });
  seg('#cModel', Object.entries(MODELS), 'model');
  seg('#cCur', [['USD','USD'],['LOCAL','Local']], 'cur');
  const mi = $('#cMin'); mi.value = S.min; $('#cMinV').textContent = '$' + S.min;
  mi.oninput = () => { S.min = +mi.value; $('#cMinV').textContent = '$' + S.min; render(); };
  $('#cTarget').value = S.target; $('#cTarget').onchange = e => { S.target = e.target.value; render(); };
  $('#genAt').textContent = 'Synced ' + new Date(D.generated).toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'});
  $('#shareBtn').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.href); $('#shareBtn').textContent = 'Copied ✓'; setTimeout(() => $('#shareBtn').textContent = 'Copy link to this view', 1500); };
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  $('#scrim').onclick = closeDrawer;
}
function seg(sel, opts, key, after) {
  const el = $(sel);
  el.innerHTML = opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; S[key] = b.dataset.v; after && after(); render(); };
}
function syncControls() {
  for (const [sel, key] of [['#cMarket','market'],['#cModel','model'],['#cCur','cur']]) for (const b of $(sel).children) b.classList.toggle('on', b.dataset.v === S[key]);
  $('#cCur').querySelector('[data-v=LOCAL]').disabled = S.market === 'ALL';
  for (const b of $('#nav').children) b.classList.toggle('active', b.dataset.p === S.page);
  const h = new URLSearchParams({p:S.page, r:S.preset, m:S.market, a:S.model, c:S.cur, min:S.min, t:S.target});
  if (S.preset === 'custom') { h.set('from', S.from); h.set('to', S.to); }
  history.replaceState(null, '', '#' + h.toString());
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('p') && PAGES.some(p => p[0] === h.get('p'))) S.page = h.get('p');
  if (h.get('r')) S.preset = h.get('r');
  if (S.preset === 'custom' && h.get('from') && h.get('to')) { S.from = h.get('from'); S.to = h.get('to'); }
  if (h.get('m')) S.market = h.get('m');
  if (h.get('a') && MODELS[h.get('a')]) S.model = h.get('a');
  if (h.get('c')) S.cur = h.get('c');
  if (h.get('min')) S.min = +h.get('min');
  if (h.get('t')) S.target = h.get('t');
}
function applyPreset() { if (S.preset !== 'custom') [S.from, S.to] = presetRange(S.preset); }
function rangeBar() {
  const [ca, cb] = compareRange(S.from, S.to);
  return `<div class="rangebar"><div class="seg" id="rPre">${PRESETS.map(([v, l]) => `<button data-v="${v}" class="${S.preset === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <input type="date" id="rFrom" value="${S.from}" min="${D.days[0]}" max="${D.today}"> <span class="muted">→</span> <input type="date" id="rTo" value="${S.to}" min="${D.days[0]}" max="${D.today}">
    <span class="cmp">${fmtD(S.from)} – ${fmtD(S.to)} · ${S.market === 'ALL' ? 'all markets' : S.market} · compared with ${fmtD(ca)} – ${fmtD(cb)}</span></div>`;
}
function wireRange() {
  const pre = $('#rPre'); if (!pre) return;
  pre.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.preset = b.dataset.v; applyPreset(); render(); };
  const upd = () => { let a = $('#rFrom').value, b = $('#rTo').value; if (!a || !b) return; if (a > b) [a, b] = [b, a]; S.preset = 'custom'; S.from = a; S.to = b; render(); };
  $('#rFrom').onchange = upd; $('#rTo').onchange = upd;
}
function head(kicker, title) {
  return `<div class="page-head"><div><div class="kicker">${kicker}</div><h1>${title}</h1></div>
    <div class="meta">${FLAGS[S.market]} ${S.market === 'ALL' ? 'All markets combined' : S.market} · ROAS: <b style="color:var(--gold)">${MODELS[S.model]}</b> · ${curCode()}</div></div>` + rangeBar();
}
const afterRender = [];
function render() {
  Object.values(charts).forEach(c => c.destroy()); for (const kk in charts) delete charts[kk];
  syncControls();
  const v = $('#view');
  v.innerHTML = ({hq:pHQ, videos:() => pCreatives('VID'), statics:() => pCreatives('IMG'), board:pBoard, markets:pMarkets, rookies:pRookies,
                  road:pRoad, insights:pInsights, guide:pGuide}[S.page] || pHQ)();
  wireRange();
  wireCards(v);
  v.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { S.page = el.dataset.go; if (el.dataset.b) S.board = el.dataset.b; render(); window.scrollTo(0, 0); });
  afterRender.forEach(f => f()); afterRender.length = 0;
}
function wireCards(root) {
  root.querySelectorAll('[data-c]').forEach(el => el.onclick = () => openConcept(el.dataset.c));
  root.querySelectorAll('.cr').forEach(el => {
    const vid = el.querySelector('video'); if (!vid) return;
    el.onmouseenter = () => { if (!vid.src) { vid.src = vid.dataset.src; } vid.play().then(() => vid.classList.add('ready')).catch(() => {}); };
    el.onmouseleave = () => { vid.pause(); };
  });
}

/* ---------------- cards ---------------- */
function roas3(r) {
  return `<div class="roas3">${['fc','ta','pl'].map(m => `<div class="${m === S.model ? 'lead' : ''}"><b class="${rc(r[m], m)}">${x2(r[m])}</b><span>${m === 'fc' ? 'First click' : m === 'ta' ? 'Triple' : 'Platform'}</span></div>`).join('')}</div>`;
}
const durS = d => d ? (d >= 60 ? Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0') : '0:' + String(d).padStart(2, '0')) : '';
function card(c, rank) {
  const role = ROLE[c.role];
  const who = c.kind === 'VID' ? [c.editor && '✂ ' + c.editor, c.strategist && '♟ ' + c.strategist] : [c.designer && '✎ ' + c.designer, c.strategist && '♟ ' + c.strategist];
  const isV = c.kind === 'VID' && c.video;
  return `<div class="card cr" data-c="${esc(c.key)}">
    <div class="thumb" style="background-image:url('${esc(c.thumb || '')}')">
      ${isV ? `<video muted loop playsinline preload="none" data-src="${esc(c.video)}"></video><div class="play"></div>${c.dur ? `<span class="dur">${durS(+c.dur)}</span>` : ''}` : ''}
      ${rank ? `<span class="rank">#${rank}</span>` : ''}
      <div class="badges">${isNew(c, S.from, S.to) ? '<span class="pill gold">NEW</span>' : ''}<span class="pill ${role[1]}" title="${esc(role[2])}">${role[0]}</span></div></div>
    <div class="body"><div class="id">${esc(c.id || '')} ${c.product ? '· ' + esc(c.product) : ''}</div>
      <div class="ttl" title="${esc(c.title)}">${esc(c.title)}</div>
      <div class="who">${who.filter(Boolean).map(esc).join(' · ') || '<span class="muted">no names in ad name</span>'}</div>
      ${roas3(c.r)}
      <div class="stats"><span>Spend <b>${money(c.sp)}</b></span><span>${MODELS[S.model]} rev <b>${money(revOf(c))}</b></span></div>
      <div class="stats"><span>${c.kind === 'VID' && c.hook != null ? `Hook <b>${pct(c.hook, 0)}</b> · Hold <b>${pct(c.hold, 0)}</b>` : `CTR <b>${pct(c.ctr)}</b>`}</span><span class="mkts">${[...c.markets].map(m => FLAGS[m]).join('')}</span></div>
    </div></div>`;
}

/* ---------------- HQ ---------------- */
function pHQ() {
  const [a, b] = R(), [ca, cb] = compareRange(a, b);
  const o = kpis(a, b), p = kpis(ca, cb);
  const kp = (lbl, val, d, cls = '', tip = '') => `<div class="card kpi"><div class="lbl" title="${esc(tip)}">${lbl}</div><div class="val num ${cls}">${val}</div><div class="delta">${d}</div></div>`;
  const cs = concepts(a, b), mk = minK();
  const best = kind => cs.filter(c => c.kind === kind && c.sp >= mk).sort((x, y) => y.r[S.model] - x.r[S.model])[0];
  const bv = best('VID'), bs = best('IMG');
  const ed = board(a, b, 'editors')[0], de = board(a, b, 'designers')[0], stg = board(a, b, 'strategists')[0];
  const champ = (img, t, n, s, attrs) => `<div class="card hl" ${attrs}>${img}<div style="min-width:0"><div class="t">${t}</div><div class="b">${n}</div><div class="s">${s}</div></div></div>`;
  const thumb = c => c && c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : '<div class="ic">🎬</div>';
  const sh = n => `<div class="ic" style="font-family:Cinzel,serif;font-weight:800;color:var(--gold)">${esc(initials(n))}</div>`;
  let h = head('Performance & growth', 'HQ overview');
  h += `<div class="grid kpis hero">
    ${kp('Revenue', money(o.sales), delta(o.sales, p.sales))}
    ${kp('Ad spend', money(o.spend), delta(o.spend, p.spend))}
    ${kp(MODELS[S.model] + ' ROAS', x2(o.r[S.model]), delta(o.r[S.model], p.r[S.model]), rc(o.r[S.model]), 'Paid channels. Platform = Meta self-reported.')}
    ${kp('Net profit', money(o.profit), delta(o.profit, p.profit), o.profit >= 0 ? 'good' : 'bad', 'AU adds back its custom expenses')}
  </div>
  <div id="moreK" class="${S.more ? '' : 'hidden'}"><div class="grid kpis" style="margin-top:14px">
    ${kp('Blended ROAS', x2(o.roas), delta(o.roas, p.roas))}
    ${kp('First Click ROAS', x2(o.r.fc), delta(o.r.fc, p.r.fc), rc(o.r.fc, 'fc'))}
    ${kp('Triple ROAS', x2(o.r.ta), delta(o.r.ta, p.r.ta), rc(o.r.ta, 'ta'))}
    ${kp('Meta platform ROAS', x2(o.r.pl), delta(o.r.pl, p.r.pl))}
    ${kp('Orders', int(o.orders), delta(o.orders, p.orders))}
    ${kp('AOV', money(o.aov, 0), delta(o.aov, p.aov))}
    ${kp('New-customer CPA', money(o.ncCpa, 0), delta(o.ncCpa, p.ncCpa, true))}
  </div><div class="note">Net profit is Triple Whale's, with Australia's custom expenses added back (${money(o.addBack)} in this range).</div></div>
  <button class="btn ghost sm more-btn" id="moreBtn">${S.more ? 'Show less' : 'Show all numbers'}</button>
  <h2 class="sec">Champions <small>${fmtD(a)} – ${fmtD(b)}</small></h2>
  <div class="grid champs">
    ${bv ? champ(thumb(bv), '🏆 Best video', esc((bv.id || '') + ' ' + bv.title), `<span class="${rc(bv.r[S.model])}">${x2(bv.r[S.model])}</span> ${MODELS[S.model]} · ${money(bv.sp)}`, `data-c="${esc(bv.key)}"`) : ''}
    ${bs ? champ(thumb(bs), '🖼 Best static', esc((bs.id || '') + ' ' + bs.title), `<span class="${rc(bs.r[S.model])}">${x2(bs.r[S.model])}</span> ${MODELS[S.model]} · ${money(bs.sp)}`, `data-c="${esc(bs.key)}"`) : ''}
    ${ed ? champ(sh(ed.name), '✂ Top editor', esc(ed.name), `${int(ed.xp)} glory`, 'data-go="board" data-b="editors"') : ''}
    ${de ? champ(sh(de.name), '🎨 Top designer', esc(de.name), `${int(de.xp)} glory`, 'data-go="board" data-b="designers"') : ''}
    ${stg ? champ(sh(stg.name), '♟ Top strategist', esc(stg.name), `${int(stg.xp)} glory`, 'data-go="board" data-b="strategists"') : ''}
  </div>
  <h2 class="sec">Markets</h2>${marketTable(a, b, ca, cb)}
  <h2 class="sec">Trend <small>by week, ${S.market === 'ALL' ? 'all markets' : S.market}</small></h2>
  <div class="card chart-card"><div class="chart-top"><div class="tabs-mini" id="trTabs">${[['rev','Revenue'],['sp','Spend'],['roas','ROAS'],['profit','Net profit']].map(([v, l]) => `<button data-v="${v}" class="${S.trend === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${S.trend === 'roas' ? '<div class="legend" style="margin:0"><span><i style="background:var(--c-fc)"></i>First Click</span><span><i style="background:var(--c-ta)"></i>Triple</span><span><i style="background:var(--c-pl)"></i>Platform (dashed)</span></div>' : ''}</div>
  <div class="chart-wrap" style="height:260px"><canvas id="chTr"></canvas></div><div class="note">The current week is still running (marked *).</div></div>`;
  afterRender.push(() => {
    $('#moreBtn').onclick = () => { S.more = !S.more; render(); };
    $('#trTabs').onclick = e => { const bt = e.target.closest('button'); if (bt) { S.trend = bt.dataset.v; render(); } };
    document.querySelectorAll('[data-mk]').forEach(tr => tr.onclick = () => { S.market = tr.dataset.mk; render(); });
    trendChart();
  });
  return h;
}
function marketTable(a, b, ca, cb) {
  const save = S.market;
  const rows = D.stores.map(st => { const o = kpis(a, b, st.code), p = kpis(ca, cb, st.code); return {st, o, p}; }).filter(r => r.o.sales > 0 || r.o.spend > 50);
  S.market = save;
  const wd = (c, p) => !p ? '' : `<span class="${c >= p ? 'up' : 'down'}" style="font-size:11px;margin-left:4px">${c >= p ? '▲' : '▼'}${Math.abs((c / p - 1) * 100).toFixed(0)}%</span>`;
  return `<div class="tbl-wrap"><table><thead><tr><th>Market</th><th>Revenue</th><th>Spend</th><th>${MODELS[S.model]} ROAS</th><th>Net profit</th></tr></thead><tbody>
  ${rows.map(({st, o, p}) => `<tr style="cursor:pointer" data-mk="${st.code}"><td><span class="flag">${FLAGS[st.code]}</span>${st.name}</td>
    <td class="num">${money(o.sales)}${wd(o.sales, p.sales)}</td><td class="num">${money(o.spend)}</td>
    <td class="num ${rc(o.r[S.model])}">${x2(o.r[S.model])}${wd(o.r[S.model], p.r[S.model])}</td><td class="num ${o.profit < 0 ? 'bad' : ''}">${money(o.profit)}</td></tr>`).join('')}
  </tbody></table></div><div class="note">Click a market to focus the hub on it.</div>`;
}
function trendChart() {
  const weeks = []; let m = monday(D.days[0]); if (m < D.days[0]) m = addD(m, 7);
  while (m <= D.today) { weeks.push([m, addD(m, 6) > D.today ? D.today : addD(m, 6), addD(m, 6) > D.today]); m = addD(m, 7); }
  const ks = weeks.map(([a, b]) => kpis(a, b));
  const labels = weeks.map(([a, , part]) => fmtD(a) + (part ? '*' : ''));
  const base = {responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
    plugins:{legend:{display:false}, tooltip:{backgroundColor:'#1b1b1f', borderColor:'#36363e', borderWidth:1, padding:10}},
    scales:{x:{grid:{display:false}, ticks:{color:'#8a8a94', font:{size:11, family:'Poppins'}}}, y:{grid:{color:'#2a2a31'}, border:{display:false}, ticks:{color:'#8a8a94', font:{size:11, family:'Poppins'}}}}};
  if (S.trend === 'roas') {
    charts.tr = new Chart($('#chTr'), {type:'line', data:{labels, datasets:[
      {label:'First Click', data:ks.map(o => +o.r.fc.toFixed(2)), borderColor:'#b38b33', backgroundColor:'#b38b33', borderWidth:2, pointRadius:4, tension:.25},
      {label:'Triple', data:ks.map(o => +o.r.ta.toFixed(2)), borderColor:'#3a80c4', backgroundColor:'#3a80c4', borderWidth:2, pointRadius:4, tension:.25},
      {label:'Platform', data:ks.map(o => +o.r.pl.toFixed(2)), borderColor:'#cf4640', backgroundColor:'#cf4640', borderWidth:2, borderDash:[5, 4], pointRadius:4, tension:.25}]}, options:base});
  } else {
    const f = {rev:o => o.sales, sp:o => o.spend, profit:o => o.profit}[S.trend], lbl = {rev:'Revenue', sp:'Spend', profit:'Net profit'}[S.trend];
    charts.tr = new Chart($('#chTr'), {type:'bar', data:{labels, datasets:[{label:lbl, data:ks.map(f), backgroundColor:weeks.map(w => w[2] ? '#c7b48b55' : '#c7b48b'), borderRadius:4, maxBarThickness:40}]},
      options:{...base, scales:{...base.scales, y:{...base.scales.y, ticks:{...base.scales.y.ticks, callback:v => money(v)}}}, plugins:{...base.plugins, tooltip:{...base.plugins.tooltip, callbacks:{label:c => lbl + ': ' + money(c.raw, 0)}}}}});
  }
}

/* ---------------- creatives ---------------- */
function pCreatives(kind) {
  const isV = kind === 'VID', [a, b] = R(), mk = minK();
  let h = head(isV ? 'What is winning on video' : 'What is winning on static', isV ? 'Top videos' : 'Top statics');
  const all = concepts(a, b).filter(c => c.kind === kind);
  const products = [...new Set(all.map(c => c.product).filter(Boolean))].sort();
  const people = [...new Set(all.map(c => isV ? c.editor : c.designer).filter(Boolean))].sort();
  h += `<div class="toolbar">
    <select id="fMkt"><option value="ALL">🌍 All countries combined</option>${D.stores.map(s => `<option value="${s.code}" ${S.market === s.code ? 'selected' : ''}>${FLAGS[s.code]} ${s.name}</option>`).join('')}</select>
    <select id="fSort"><option value="roas">Sort: ${MODELS[S.model]} ROAS</option><option value="rev">Sort: ${MODELS[S.model]} revenue</option><option value="sp">Sort: spend</option>${isV ? '<option value="hook">Sort: hook rate</option>' : '<option value="ctr">Sort: CTR</option>'}<option value="new">Sort: newest launch</option></select>
    <select id="fProd"><option value="">All products</option>${products.map(p => `<option>${esc(p)}</option>`).join('')}</select>
    <select id="fWho"><option value="">All ${isV ? 'editors' : 'designers'}</option>${people.map(p => `<option>${esc(p)}</option>`).join('')}</select>
    <input type="search" id="fQ" placeholder="Search name, ID, angle..."></div><div id="crList"></div>`;
  if (S.market === 'ALL') {
    h += `<h2 class="sec">Best ${isV ? 'video' : 'static'} per country <small>${MODELS[S.model]} ROAS, min $${S.min} spend</small></h2><div class="grid strip">`;
    for (const st of D.stores) {
      const c = concepts(a, b, st.code).filter(x => x.kind === kind && x.usd >= S.min).sort((x, y) => y.r[S.model] - x.r[S.model])[0];
      h += c ? `<div class="card mk" data-c="${esc(c.key)}" data-st="${st.code}"><div class="thumb" style="background-image:url('${esc(c.thumb || '')}')"></div><div class="body"><div class="m">${FLAGS[st.code]} ${st.code}</div><div class="ttl">${esc((c.id || '') + ' ' + c.title)}</div><div class="s"><span class="${rc(c.r[S.model])}">${x2(c.r[S.model])}</span> ${MODELS[S.model]} · ${money(c.sp)}</div></div></div>`
             : `<div class="card mk"><div class="body"><div class="m">${FLAGS[st.code]} ${st.code}</div><div class="s">Nothing over the min spend</div></div></div>`;
    }
    h += '</div>';
  }
  afterRender.push(() => {
    $('#fMkt').onchange = e => { S.market = e.target.value; if (S.market === 'ALL') S.cur = 'USD'; render(); };
    const draw = () => {
      const sort = $('#fSort').value, prod = $('#fProd').value, who = $('#fWho').value, q = $('#fQ').value.toLowerCase();
      let cs = all.filter(c => c.sp >= mk && (!prod || c.product === prod) && (!who || (isV ? c.editor : c.designer) === who));
      if (q) cs = cs.filter(c => (c.key + ' ' + c.title + ' ' + (c.angle || '') + ' ' + (c.format || '') + ' ' + c.ads.map(x => x.ad.n).join(' ')).toLowerCase().includes(q));
      const f = {roas:c => c.r[S.model], rev:c => revOf(c), sp:c => c.sp, ctr:c => c.ctr, hook:c => c.hook || 0, new:c => c.launched || ''}[sort];
      cs.sort((x, y) => f(y) > f(x) ? 1 : f(y) < f(x) ? -1 : 0);
      $('#crList').innerHTML = cs.length ? `<div class="grid gallery">${cs.slice(0, 60).map((c, i) => card(c, i + 1)).join('')}</div><div class="note">${cs.length} concepts over $${S.min} spend, ${S.market === 'ALL' ? 'every country combined' : S.market + ' only'}. ${isV ? 'Hover a card to preview, click to watch with sound. ' : ''}Green = ROAS at or above ${S.target === 'auto' ? 'the account average' : S.target} (${x2(target())}).</div>`
        : '<div class="empty">Nothing matches. Lower the min spend in the control panel or widen the dates.</div>';
      wireCards($('#crList'));
    };
    ['#fSort','#fProd','#fWho'].forEach(s => $(s).onchange = draw); $('#fQ').oninput = draw;
    document.querySelectorAll('.strip [data-st]').forEach(el => el.onclick = () => openConcept(el.dataset.c, el.dataset.st));
    draw();
  });
  return h;
}

/* ---------------- the great hall ---------------- */
const SVG = {
  axe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4l6 6M4 20L15 9"/><path d="M14 4c-3 0-5 2-5 5l6 1c1-2 3-4 5-4"/></svg>',
  rune:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v18M8 7l8-4M8 12l8-4"/></svg>',
  helm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14a8 8 0 0 1 16 0v4H4z"/><path d="M12 6v12M4 14c-2-1-2-4 0-6M20 14c2-1 2-4 0-6"/></svg>',
  crown:'<svg class="crown" viewBox="0 0 44 28"><path d="M3 24 L6 6 L15 15 L22 2 L29 15 L38 6 L41 24 Z" fill="#f0d999" stroke="#8c6f3f" stroke-width="1.5"/><circle cx="22" cy="18" r="2.6" fill="#c12f27"/></svg>'
};
const BADGES = {
  berserker:['ᛒ','Berserker','3+ hits: concepts with $1k+ spend beating the account ROAS'],
  blood:['ᚠ','First Blood','Owns the #1 concept of the period'],
  raider:['ᚱ','Raider','Launched 3+ new concepts in the period'],
  wall:['ᛋ','Shield Wall','5+ concepts live at once'],
  edge:['ᛏ','Sharp Edge','Best ROAS of the clan ($1k+ spend)'],
  longship:['ᛚ','Longship','Owns a concept past the $10k win bar'],
  streak:['ᛁ','Iron Streak','#1 two weeks or more in a row']
};
function pBoard() {
  const [a, b] = R(), C = CLANS[S.board];
  const bd = board(a, b, S.board), [ca, cb] = compareRange(a, b), prev = board(ca, cb, S.board);
  const sx = season(S.board), ats = allTimeSpend();
  const edgeP = bd.filter(p => p.sp >= 1000 * (localMode() ? 1 / fx(S.market) : 1)).sort((x, y) => y.r[S.model] - x.r[S.model])[0];
  for (const p of bd) {
    p.badges = [];
    if (p.hits >= 3) p.badges.push('berserker');
    if (p.mvp) p.badges.push('blood');
    if (p.launches >= 3) p.badges.push('raider');
    if (p.concepts.length >= 5) p.badges.push('wall');
    if (edgeP && edgeP.name === p.name) p.badges.push('edge');
    if (p.concepts.some(c => (ats.get(c.key) || {}).sp >= WIN_BAR)) p.badges.push('longship');
    if (p.rank === 1 && streak(S.board, p.name) >= 2) p.badges.push('streak');
  }
  const badgeHtml = p => p.badges.map(k2 => `<span class="bdg" title="${esc(BADGES[k2][2])}"><i>${BADGES[k2][0]}</i>${BADGES[k2][1]}</span>`).join('');
  const lv = name => { const x = sx[name] || 0, L = level(x); return {x, L, prog:L.next ? (x - L.base) / (L.next - L.base) : 1}; };
  let h = rangeBar().replace('class="rangebar"', 'class="rangebar" style="margin-top:0"');
  h += `<div class="hall"><div class="hall-title"><div class="runes">ᚾᛟᚱᚦ · ᚲᚾᛁᚠ</div><h1>The Great Hall</h1><div class="sub">${fmtD(a)} – ${fmtD(b)} · ${MODELS[S.model]} · ${S.market === 'ALL' ? 'all markets' : S.market}</div></div>
    <div class="clans">${Object.entries(CLANS).map(([kk, c]) => `<button class="clan ${S.board === kk ? 'on' : ''}" data-bt="${kk}">${kk === 'editors' ? SVG.axe : kk === 'designers' ? SVG.rune : SVG.helm}<span>${c.name}<br><small>${c.role}</small></span></button>`).join('')}</div>`;
  if (!bd.length) h += '<div class="empty" style="margin-top:20px">No warriors credited in this range. Names must be in the ad name.</div>';
  else {
    const order = [bd[1], bd[0], bd[2]];
    h += `<div class="thrones">${order.map((p, i) => { if (!p) return '<div></div>'; const t = ['t2','t1','t3'][i], place = ['II · Silver','I · Champion','III · Bronze'][i], l = lv(p.name);
      return `<div class="throne ${t}">${t === 't1' ? SVG.crown : ''}<div class="place">${place}</div><div class="shield"><span>${esc(initials(p.name))}</span></div>
        <div class="nm">${esc(p.name)}</div><div class="title">${l.L.name} · ${C.title}</div>
        <div class="glory">${int(p.xp)}<small>GLORY</small></div>
        <div class="bar-xp"><i style="width:${(l.prog * 100).toFixed(0)}%"></i></div><div class="lvl-line">${l.L.next ? `${int(l.L.next - l.x)} season glory to ${l.L.nextName}` : 'Highest rank reached'}</div>
        <div class="lvl-line" style="margin-top:6px">${money(p.rev)} ${MODELS[S.model]} · ROAS <b class="${rc(p.r[S.model])}">${x2(p.r[S.model])}</b></div>
        <div class="badges-row">${badgeHtml(p)}</div>
        <div class="loot">${p.concepts.slice(0, 4).map(c => `<img src="${esc(c.thumb || '')}" title="${esc((c.id || '') + ' ' + c.title)}" data-c="${esc(c.key)}">`).join('')}</div></div>`; }).join('')}</div>`;
  }
  h += '</div>';
  // roster + side panels
  const team = concepts(a, b).filter(c => !C.kind || c.kind === C.kind);
  const weeksN = Math.max(1, nDays(a, b) / 7);
  const launches = team.filter(c => isNew(c, a, b)).length, bm = benchmark(team);
  const hits = team.filter(c => c.usd >= 1000 && c.r[S.model] >= bm).length;
  const bigRaid = team.slice().sort((x, y) => y.fc - x.fc)[0];
  const quests = [
    [`Launch ${Math.round(15 * weeksN)} new concepts`, launches, Math.round(15 * weeksN)],
    [`Land ${Math.round(5 * weeksN)} hits`, hits, Math.round(5 * weeksN)],
    ['One raid worth $5k First Click', bigRaid ? Math.min(bigRaid.fc * (localMode() ? fx(S.market) : 1), 5000) : 0, 5000]
  ];
  const log = [];
  if (bigRaid) log.push(['ᚠ', `<b>${esc(bigRaid[C.fld] || '?')}</b>'s ${esc(bigRaid.id || bigRaid.title)} brought home ${money(bigRaid.fc)} First Click`]);
  team.filter(c => isNew(c, a, b) && c.usd >= 300).sort((x, y) => y.r[S.model] - x.r[S.model]).slice(0, 2).forEach(c => log.push(['ᚱ', `New blade: <b>${esc(c.id || c.title)}</b> by ${esc(c[C.fld] || '?')} opens at <span class="${rc(c.r[S.model])}">${x2(c.r[S.model])}</span>`]));
  team.filter(c => { const t = ats.get(c.key); return t && t.sp >= WIN_BAR && t.sp - c.usd < WIN_BAR; }).slice(0, 3).forEach(c => log.push(['ᛚ', `<b>${esc(c.id || c.title)}</b> crossed the $10k win bar`]));
  const climber = bd.map(p => { const q = prev.find(x => x.name === p.name); return {p, up:q ? q.rank - p.rank : 0}; }).sort((x, y) => y.up - x.up)[0];
  if (climber && climber.up > 0) log.push(['ᛏ', `<b>${esc(climber.p.name)}</b> climbed ${climber.up} place${climber.up > 1 ? 's' : ''}`]);
  h += `<div class="hall-grid"><div class="roster"><div class="row h"><div>Rank</div><div>Warrior</div><div>Glory</div><div>${MODELS[S.model]} ROAS</div><div>Spend</div></div>
    ${bd.map(p => { const q = prev.find(x => x.name === p.name); const mv = !q ? '<span class="mv-new">NEW</span>' : q.rank > p.rank ? `<span class="mv-up">▲${q.rank - p.rank}</span>` : q.rank < p.rank ? `<span class="mv-dn">▼${p.rank - q.rank}</span>` : '<span class="muted">=</span>';
      const l = lv(p.name);
      return `<div class="row"><div class="rk">${p.rank}<div style="font-size:11px;font-family:Poppins">${mv}</div></div>
        <div class="who"><div class="mini-shield">${esc(initials(p.name))}</div><div style="min-width:0"><div class="nm2">${esc(p.name)} <span class="t2">· ${l.L.name}</span></div>
        <div class="t2">${p.concepts.length} live · ${p.launches} new · ${p.hits} hits ${p.badges.map(k2 => `<span title="${esc(BADGES[k2][1] + ': ' + BADGES[k2][2])}" style="font-family:'Noto Sans Runic';color:var(--gold)">${BADGES[k2][0]}</span>`).join(' ')}</div></div></div>
        <div><b style="color:#f0d999">${int(p.xp)}</b><div class="bar-xp" style="margin:4px 0 0"><i style="width:${(l.prog * 100).toFixed(0)}%"></i></div></div>
        <div class="${rc(p.r[S.model])}" style="font-weight:600">${x2(p.r[S.model])}</div><div>${money(p.sp)}</div></div>`; }).join('')}
  </div><div>
    <div class="panel-viking"><h3>Clan quests</h3>${quests.map(([t, v, goal]) => `<div class="quest ${v >= goal ? 'done' : ''}"><div class="q"><span>${v >= goal ? '✓ ' : ''}${t}</span><b>${goal >= 1000 ? money(v) : int(v)} / ${goal >= 1000 ? money(goal) : goal}</b></div><div class="bar-xp" style="max-width:none"><i style="width:${Math.min(100, v / goal * 100).toFixed(0)}%"></i></div></div>`).join('')}</div>
    <div class="panel-viking"><h3>Saga of the week</h3><ul class="log">${log.length ? log.map(([ic, t]) => `<li><span class="ic">${ic}</span><span>${t}</span></li>`).join('') : '<li>Quiet seas. No raids yet.</li>'}</ul></div>
  </div></div>
  <div class="panel-viking" style="margin-top:16px"><h3>Codex of glory</h3><div class="codex">
    <div><b>1 glory / $100</b>${MODELS[S.model]} revenue your ads brought in (USD)</div>
    <div><b>+150 per hit</b>concept with $1k+ spend beating the account ${MODELS[S.model]} ROAS</div>
    <div><b>+25 per launch</b>new concept launched in the period</div>
    <div><b>+250 First Blood</b>owning the #1 concept by revenue</div>
    <div><b>Ranks</b>season glory (all full weeks): Thrall · Karl 500 · Huscarl 1,500 · Jarl 3,500 · Konungr 7,000</div>
    ${Object.values(BADGES).map(([r, n, d]) => `<div><b><span style="font-family:'Noto Sans Runic'">${r}</span> ${n}</b>${d}</div>`).join('')}
  </div><div class="note">Andy and Claude fight as one strategist. Credit comes from the ad name: if your name is not in it, the ad does not count for you.</div></div>`;
  afterRender.push(() => document.querySelectorAll('[data-bt]').forEach(el => el.onclick = () => { S.board = el.dataset.bt; render(); }));
  return h;
}

/* ---------------- other pages ---------------- */
function pMarkets() {
  const [a, b] = R(), mk = minK();
  let h = head('Every country at a glance', 'Markets') + '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">';
  const save = S.market;
  for (const st of D.stores) {
    S.market = st.code;
    const o = kpis(a, b, st.code), cs = concepts(a, b, st.code);
    const bv = cs.filter(c => c.kind === 'VID' && c.sp >= mk).sort((x, y) => y.r[S.model] - x.r[S.model])[0];
    const bs = cs.filter(c => c.kind === 'IMG' && c.sp >= mk).sort((x, y) => y.r[S.model] - x.r[S.model])[0];
    const best = (c, lbl) => c ? `<div class="card mk" data-c="${esc(c.key)}" data-st="${st.code}" style="margin:0"><div class="thumb" style="background-image:url('${esc(c.thumb || '')}')"></div><div class="body"><div class="s">${lbl}</div><div class="ttl">${esc((c.id || '') + ' ' + c.title)}</div><div class="s"><span class="${rc(c.r[S.model])}">${x2(c.r[S.model])}</span> · ${money(c.sp)}</div></div></div>` : `<div class="empty" style="padding:20px">No ${lbl.toLowerCase()}</div>`;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div class="wordmark" style="font-size:28px">${FLAGS[st.code]} ${st.code}</div><span class="pill">${st.cur}</span></div>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0">
        <div><div class="muted" style="font-size:11px">REVENUE</div><b class="num">${money(o.sales)}</b></div>
        <div><div class="muted" style="font-size:11px">${MODELS[S.model].toUpperCase()} ROAS</div><b class="num ${rc(o.r[S.model])}">${x2(o.r[S.model])}</b></div>
        <div><div class="muted" style="font-size:11px">PROFIT</div><b class="num">${money(o.profit)}</b></div></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${best(bv, 'Best video')}${best(bs, 'Best static')}</div></div>`;
  }
  S.market = save;
  afterRender.push(() => document.querySelectorAll('.mk[data-st]').forEach(el => el.onclick = () => openConcept(el.dataset.c, el.dataset.st)));
  return h + '</div>';
}
function pRookies() {
  const [a, b] = R();
  const cs = concepts(a, b).filter(c => isNew(c, addD(a, -7), b)).sort((x, y) => y.r[S.model] * Math.min(1, y.usd / 500) - x.r[S.model] * Math.min(1, x.usd / 500));
  return head('Fresh blood', 'Rookies') + `<div class="note" style="margin:-8px 0 16px">Concepts launched in the selected dates (or the week before), ranked by ${MODELS[S.model]} ROAS weighted by spend earned so far (full weight at $500).</div>` +
    (cs.length ? `<div class="grid gallery">${cs.slice(0, 48).map((c, i) => card(c, i + 1)).join('')}</div>` : '<div class="empty">No new launches with spend in these dates.</div>');
}
function pRoad() {
  const ats = allTimeSpend();
  const cs = [...ats.values()].sort((x, y) => y.sp - x.sp).slice(0, 80);
  return `<div class="page-head"><div><div class="kicker">Win bar: $10,000 spend across all markets</div><h1>Road to $10k</h1></div><div class="meta">${fmtD(D.days[0])} – ${fmtD(D.today)} · all markets · USD</div></div>
  <div class="note" style="margin:-8px 0 16px">A concept wins when it passes $10,000 of spend across every market. Spend here covers everything in the hub (${fmtD(D.days[0])} onward), so older winners show less than their lifetime total.</div>
  <div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">Concept</th><th class="l">People</th><th>Spend</th><th class="l">Progress</th><th>FC ROAS</th><th>Triple</th><th>Platform</th></tr></thead><tbody>
  ${cs.map((c, i) => { const p = Math.min(1, c.sp / WIN_BAR), win = c.sp >= WIN_BAR;
    return `<tr data-c="${esc(c.key)}" style="cursor:pointer"><td>${i + 1}</td><td class="l"><b>${esc(c.id || '')}</b> ${esc(c.title)} ${win ? '<span class="pill gold">🏆 WINNER</span>' : ''}</td>
    <td class="l muted">${esc([c.editor || c.designer, c.strategist].filter(Boolean).join(' · '))}</td><td>$${int(c.sp)}</td>
    <td class="l"><div class="prog ${win ? 'win' : ''}"><i style="width:${(p * 100).toFixed(0)}%"></i></div></td><td class="${rc(c.r.fc, 'fc')}">${x2(c.r.fc)}</td><td>${x2(c.r.ta)}</td><td>${x2(c.r.pl)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function fatigue() {
  const [a, b] = R(), [ca, cb] = compareRange(a, b), mk = minK();
  const prev = new Map(concepts(ca, cb).map(c => [c.key, c]));
  return concepts(a, b).filter(c => c.sp >= mk && prev.get(c.key) && prev.get(c.key).sp >= mk)
    .map(c => ({c, prev:prev.get(c.key).r[S.model], drop:prev.get(c.key).r[S.model] ? 1 - c.r[S.model] / prev.get(c.key).r[S.model] : 0}))
    .filter(x => x.drop >= 0.3).sort((x, y) => y.c.sp * y.drop - x.c.sp * x.drop);
}
function pInsights() {
  const [a, b] = R(), cs = concepts(a, b), bm = benchmark(cs);
  const dims = [['product','Product'],['angle','Angle'],['format','Format / production type'],['hook_tactic','Hook tactic'],['structure','Script structure'],['funnel','Funnel stage'],['creator','Creator'],['kind','Video vs static']];
  const g = new Map();
  for (const c of cs) { const kk = S.ins === 'kind' ? (c.kind === 'VID' ? 'Video' : 'Static') : c[S.ins]; if (!kk) continue; const o = g.get(kk) || {k:kk, sp:0, fc:0, ta:0, pr:0, n:0}; o.sp += c.sp; o.fc += c.fc; o.ta += c.ta; o.pr += c.pr; o.n++; g.set(kk, o); }
  const rows = [...g.values()].sort((x, y) => y.sp - x.sp).slice(0, 20), maxSp = Math.max(1, ...rows.map(r => r.sp));
  const fat = fatigue();
  let h = head('Patterns behind the winners', 'Creative insights');
  h += `<div class="toolbar"><span class="muted">Break down by</span><select id="insDim">${dims.map(([kk, l]) => `<option value="${kk}" ${S.ins === kk ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="tbl-wrap"><table><thead><tr><th class="l">${esc(dims.find(d => d[0] === S.ins)[1])}</th><th>Concepts</th><th class="l">Spend</th><th>FC ROAS</th><th>Triple</th><th>Platform</th><th class="l">vs account</th></tr></thead><tbody>
  ${rows.map(r => { const rr = {fc:r.fc / r.sp, ta:r.ta / r.sp, pl:r.pr / r.sp}; const d = bm ? rr[S.model] / bm - 1 : 0;
    return `<tr><td class="l"><b>${esc(r.k)}</b></td><td>${r.n}</td><td class="l">${money(r.sp)}<span class="bar" style="width:${(r.sp / maxSp * 120).toFixed(0)}px"></span></td>
    <td class="${rc(rr.fc, 'fc')}">${x2(rr.fc)}</td><td class="${rc(rr.ta, 'ta')}">${x2(rr.ta)}</td><td>${x2(rr.pl)}</td><td class="l"><span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}%</span></td></tr>`; }).join('')}
  </tbody></table></div>
  <h2 class="sec">Acquirer or closer? <small>First Click vs Platform ROAS, bubble = spend</small></h2>
  <div class="card chart-card"><div class="legend"><span><i style="background:#b38b33"></i>Video</span><span><i style="background:#3a80c4"></i>Static</span><span class="muted">Above the line = starts journeys (scale it). Far below = retargeting asset.</span></div><div class="chart-wrap" style="height:340px"><canvas id="chSc"></canvas></div></div>
  <h2 class="sec">Fatigue watch <small>${MODELS[S.model]} ROAS down 30%+ vs the comparison dates</small></h2>
  ${fat.length ? `<div class="tbl-wrap"><table><thead><tr><th class="l">Concept</th><th>Spend</th><th>Before</th><th>Now</th><th>Change</th></tr></thead><tbody>${fat.slice(0, 15).map(f => `<tr data-c="${esc(f.c.key)}" style="cursor:pointer"><td class="l"><b>${esc(f.c.id || '')}</b> ${esc(f.c.title)}</td><td>${money(f.c.sp)}</td><td>${x2(f.prev)}</td><td class="${rc(f.c.r[S.model])}">${x2(f.c.r[S.model])}</td><td class="down">▼ ${(f.drop * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing fatiguing.</div>'}`;
  afterRender.push(() => {
    $('#insDim').onchange = e => { S.ins = e.target.value; render(); };
    const pts = cs.filter(c => c.sp >= minK() && c.r.pl > 0), maxS = Math.max(1, ...pts.map(c => c.sp));
    const ds = kk => ({label:kk, data:pts.filter(c => c.kind === kk).map(c => ({x:+c.r.pl.toFixed(2), y:+c.r.fc.toFixed(2), r:4 + 16 * Math.sqrt(c.sp / maxS), c})),
      backgroundColor:kk === 'VID' ? '#b38b3399' : '#3a80c499', borderColor:kk === 'VID' ? '#b38b33' : '#3a80c4', borderWidth:1.5});
    const mx = Math.max(2, ...pts.map(c => Math.max(c.r.pl, c.r.fc))) * 1.05;
    charts.sc = new Chart($('#chSc'), {type:'bubble', data:{datasets:[ds('VID'), ds('IMG'), {type:'line', label:'diag', data:[{x:0, y:0}, {x:mx, y:mx}], borderColor:'#36363e', borderDash:[4, 4], pointRadius:0, borderWidth:1}]},
      options:{responsive:true, maintainAspectRatio:false, onClick:(e, els) => { const el = els[0]; if (el) { const c = charts.sc.data.datasets[el.datasetIndex].data[el.index].c; if (c) openConcept(c.key); } },
        plugins:{legend:{display:false}, tooltip:{filter:i => i.dataset.label !== 'diag', callbacks:{label:i => { const c = i.raw.c; return `${c.id || ''} ${c.title} · FC ${x2(c.r.fc)} · Platform ${x2(c.r.pl)} · ${money(c.sp)}`; }}}},
        scales:{x:{min:0, max:mx, title:{display:true, text:'Platform ROAS', color:'#8a8a94'}, grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}, y:{min:0, max:mx, title:{display:true, text:'First Click ROAS', color:'#8a8a94'}, grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}}}});
  });
  return h;
}
function pGuide() {
  return `<div class="page-head"><div><div class="kicker">For designers, editors and strategists</div><h1>How to read this</h1></div></div><div class="guide">
  <h3>Dates</h3><p>The hub opens on <b>this week</b> (Monday to today). Switch to last week, this month, last month, the last 7 or 30 days, or pick any two dates. Every number is compared with the same dates one period earlier.</p>
  <h3>Three ROAS numbers, one verdict</h3><p><b style="color:var(--gold)">First Click</b> credits the ad that <i>started</i> the customer's journey: it decides whether an ad gets scaled. <b>Triple</b> spreads credit across the journey. <b>Platform</b> is what Meta reports about itself. <span class="good">Green</span> means at or above the target in the control panel (default: the account average for the same dates), <span class="bad">red</span> below.</p>
  <ul><li><span class="pill green">Acquirer</span> First Click holds close to Platform: the ad brings in new people. Iterate on these.</li><li><span class="pill blue">Closer</span> Platform far above First Click: mostly finishes journeys other ads started.</li></ul>
  <h3>Videos</h3><p>Hover a video card to preview it, click to watch with sound, every hook and every country. <b>Hook</b> = 3-second views ÷ impressions. <b>Hold</b> = ThruPlays ÷ 3-second views (last 7 days of delivery).</p>
  <h3>Where the numbers come from</h3><p>All of it is pulled every day from Triple Whale: revenue, spend, profit and orders from the Summary page, ad-level spend and revenue from pixel attribution (lifetime window) on Meta. USD by default with Triple Whale's own rates; pick one country and switch Currency to Local for its own currency. Net profit adds back Australia's custom expenses.</p>
  <h3>How you get credit in the Great Hall</h3><p>The hub reads the <b>ad name</b>: videos credit the editor and strategist in the name, statics the designer and strategist. If your name is missing, the ad does not count for you.</p></div>`;
}

/* ---------------- drawer ---------------- */
function openConcept(key, onlyStore) {
  const [a, b] = R();
  const mkt = onlyStore || S.market;
  const c = concepts(a, b, mkt).find(x => x.key === key) || [...allTimeSpend().values()].find(x => x.key === key);
  if (!c) return;
  const act = (c.thumb || '').match(/act_(\d+)/);
  const variants = c.ads.slice().sort((x, y) => y.sp - x.sp);
  const vids = variants.filter(x => x.ad.v);
  const weeks = []; let m = monday(D.days[0]); if (m < D.days[0]) m = addD(m, 7);
  while (m <= D.today) { const e = addD(m, 6) > D.today ? D.today : addD(m, 6); weeks.push([m, e, concepts(m, e, mkt).find(x => x.key === key)]); m = addD(m, 7); }
  const tags = ['product','format','angle','hook_tactic','structure','funnel','creator'].map(kk => c[kk] && `<span class="pill">${esc(c[kk])}</span>`).filter(Boolean).join(' ');
  $('#drawer').innerHTML = `<button class="close" id="dClose">✕</button>
    ${vids.length ? `<div style="padding:16px 20px 0"><video class="player" id="dPlayer" controls playsinline autoplay src="${esc(vids[0].ad.v)}" poster="${esc(vids[0].ad.th || '')}"></video>
      ${vids.length > 1 ? `<div class="vlist">${vids.slice(0, 12).map((x, i) => `<button class="btn ghost sm ${i === 0 ? 'on' : ''}" data-v="${esc(x.ad.v)}">${FLAGS[x.ad.s]} ${esc(x.ad.hook || 'cut ' + (i + 1))}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="dr-head">${vids.length ? '' : `<img src="${esc(c.thumb || '')}" alt="">`}<div style="min-width:0">
    <div class="muted" style="font-size:12px">${esc(c.id || '')} · ${c.kind === 'VID' ? 'Video' : 'Static'} ${(() => { const i = firstLive().get(c.key); return i > 0 ? '· first spend ' + fmtD(D.days[i]) : ''; })()} · ${mkt === 'ALL' ? 'all countries' : mkt}</div><h3>${esc(c.title)}</h3>
    <div class="muted" style="font-size:12.5px">${esc([c.editor && 'Editor ' + c.editor, c.designer && 'Designer ' + c.designer, c.strategist && 'Strategist ' + c.strategist].filter(Boolean).join(' · '))}</div>
    <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap"><span class="pill ${ROLE[c.role][1]}">${ROLE[c.role][0]}</span> ${tags}</div></div></div>
    <div class="dr-body">${roas3(c.r)}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;font-size:12px">
      <div class="card" style="padding:10px"><div class="muted">Spend</div><b>${money(c.sp)}</b></div>
      <div class="card" style="padding:10px"><div class="muted">${MODELS[S.model]} rev</div><b>${money(revOf(c))}</b></div>
      <div class="card" style="padding:10px"><div class="muted">${c.kind === 'VID' ? 'Hook / hold' : 'CTR'}</div><b>${c.kind === 'VID' ? pct(c.hook, 0) + ' / ' + pct(c.hold, 0) : pct(c.ctr)}</b></div>
      <div class="card" style="padding:10px"><div class="muted">FC orders</div><b>${int(c.fco)}</b></div></div>
    <h2 class="sec" style="font-size:20px">Week by week <small>${MODELS[S.model]} ROAS</small></h2>
    <div class="card chart-card"><div class="chart-wrap" style="height:150px"><canvas id="chDr"></canvas></div></div>
    <h2 class="sec" style="font-size:20px">Every hook &amp; country</h2>
    ${variants.map(x => `<div class="card" style="padding:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><b>${FLAGS[x.ad.s]} ${x.ad.s} ${esc(x.ad.hook || '')}</b>
      <span style="font-size:12px">Spend <b>${money(x.sp)}</b> · FC <b class="${rc(x.sp ? x.fc / x.sp : 0, 'fc')}">${x2(x.sp ? x.fc / x.sp : 0)}</b> · Triple <b class="${rc(x.sp ? x.ta / x.sp : 0, 'ta')}">${x2(x.sp ? x.ta / x.sp : 0)}</b> · Platform ${x2(x.sp ? x.pr / x.sp : 0)}</span></div>
      <div class="name-box">${esc(x.ad.n)}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${x.ad.v ? `<button class="btn ghost sm" data-v="${esc(x.ad.v)}">▶ Watch</button>` : ''}<button class="btn ghost sm" data-copy="${esc(x.ad.n)}">Copy name</button>
      ${act && x.ad.id ? `<a class="btn ghost sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act[1]}&selected_ad_ids=${encodeURIComponent(x.ad.id)}">Ads Manager ↗</a>` : ''}
      ${x.ad.v ? `<a class="btn ghost sm" style="text-decoration:none" href="${esc(x.ad.v)}" download target="_blank" rel="noopener">Download mp4</a>` : ''}</div></div>`).join('')}
    </div>`;
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); $('#drawer').scrollTop = 0;
  $('#dClose').onclick = closeDrawer;
  $('#drawer').querySelectorAll('[data-copy]').forEach(bt => bt.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(bt.dataset.copy); bt.textContent = 'Copied ✓'; });
  $('#drawer').querySelectorAll('[data-v]').forEach(bt => bt.onclick = () => { const p = $('#dPlayer'); if (p) { p.src = bt.dataset.v; p.play().catch(() => {}); $('#drawer').scrollTop = 0; } });
  if (charts.dr) charts.dr.destroy();
  charts.dr = new Chart($('#chDr'), {type:'bar', data:{labels:weeks.map(w => fmtD(w[0])), datasets:[{data:weeks.map(w => w[2] ? +w[2].r[S.model].toFixed(2) : null), backgroundColor:weeks.map(w => w[2] && w[2].r[S.model] >= target() ? '#52b788' : '#e0605a'), borderRadius:4, maxBarThickness:26}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:i => { const cc = weeks[i.dataIndex][2]; return cc ? `ROAS ${x2(cc.r[S.model])} · spend ${money(cc.sp)}` : 'not live'; }}}},
      scales:{x:{grid:{display:false}, ticks:{color:'#8a8a94', font:{size:10}}}, y:{grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}}}});
}
function closeDrawer() { const p = $('#dPlayer'); if (p) p.pause(); $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ---------------- boot ---------------- */
async function start() {
  const res = await fetch('data/hub.json', {cache:'no-store'});
  if (!res.ok) throw new Error('data file missing (' + res.status + ')');
  D = await res.json();
  if (D.v !== 2) throw new Error('old data format');
  LS('nkhub.pw', null);
  readHash(); applyPreset();
  if (!S.from) [S.from, S.to] = presetRange('week');
  $('#lock').classList.add('hidden'); $('#app').classList.remove('hidden');
  buildShell(); render();
}
start().catch(err => { $('#lockErr').textContent = 'Could not load data: ' + err.message; });
})();
