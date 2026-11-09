/* NorthernKnife Creative Hub — all numbers come from Triple Whale (see pipeline/build_data.py). */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FLAGS = {US:'🇺🇸',UK:'🇬🇧',AU:'🇦🇺',CA:'🇨🇦',DE:'🇩🇪',NL:'🇳🇱',ALL:'🌍'};
const SYM = {USD:'$',GBP:'£',AUD:'A$',CAD:'C$',EUR:'€'};
const MODELS = {fc:'First Click', ta:'Triple', pl:'Platform'};
const WIN_BAR = 10000; // Andy's win definition: >$10k spend across all markets
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };

let D = null; // decrypted data
const S = {page:'hq', week:null, market:'ALL', model:'fc', cur:'USD', min:300, sort:'roas', q:'', board:'editors', ins:'product'};
const charts = {};

/* ---------------- decrypt ---------------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function unlock(pw) {
  const res = await fetch('data/hub.enc.json', {cache: 'no-store'});
  if (!res.ok) throw new Error('Data file missing (' + res.status + ')');
  const box = await res.json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:b64(box.salt), iterations:box.iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
  let plain;
  try { plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64(box.iv)}, key, b64(box.ct)); }
  catch (e) { throw new Error('Wrong password'); }
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* ---------------- money / format ---------------- */
const fx = st => (D.fx && D.fx[st]) || 1;
const localMode = () => S.cur === 'LOCAL' && S.market !== 'ALL';
const curCode = () => localMode() ? (D.stores.find(s => s.code === S.market) || {}).cur : 'USD';
const conv = (v, st) => (v || 0) * (localMode() ? 1 : fx(st));
function money(v, dec) {
  const sym = SYM[curCode()] || '$';
  const a = Math.abs(v);
  let s;
  if (dec !== undefined) s = a.toLocaleString('en-US', {maximumFractionDigits: dec, minimumFractionDigits: dec});
  else if (a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
  else if (a >= 1e4) s = (a / 1e3).toFixed(1) + 'k';
  else s = Math.round(a).toLocaleString('en-US');
  return (v < 0 ? '-' : '') + sym + s;
}
const x2 = v => (isFinite(v) && v >= 0) ? v.toFixed(2) : '–';
const pct = v => isFinite(v) ? (v * 100).toFixed(1) + '%' : '–';
const int = v => Math.round(v || 0).toLocaleString('en-US');
function delta(cur, prev, invert) {
  if (!prev || !isFinite(cur / prev)) return '<span class="muted">no prior week</span>';
  const d = cur / prev - 1, good = invert ? d < 0 : d > 0;
  return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)}%</span> <span class="muted">vs prior week</span>`;
}
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'});
const weekLabel = w => `${fmtDate(w.start)} – ${fmtDate(w.end)}${w.partial ? ' (in progress)' : w.settling ? ' (settling)' : ''}`;
const initials = n => n.split(/[\s×]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();

/* ---------------- data helpers ---------------- */
const weekIdx = w => D.weeks.findIndex(x => x.start === w);
const prevWeek = w => { const i = weekIdx(w); return D.weeks[i + 1] ? D.weeks[i + 1].start : null; };
const marketOk = st => S.market === 'ALL' || st === S.market;
const adsFor = (w, allMarkets) => D.ads.filter(a => a.w === w && (allMarkets || marketOk(a.s)));
const revOf = (o, m = S.model) => m === 'fc' ? o.fc : m === 'ta' ? o.ta : o.pr;

function concepts(ads) {
  const map = new Map();
  for (const a of ads) {
    if (a.kind === 'OTHER') continue;
    const key = a.concept_id || a.clean;
    let c = map.get(key);
    if (!c) {
      c = {key, kind:a.kind, id:a.concept_id, title:a.title, product:a.product, editor:a.editor, designer:a.designer,
           strategist:a.strategist, format:a.format, angle:a.angle, hook_tactic:a.hook_tactic, funnel:a.funnel,
           structure:a.structure, creator:a.creator, launched:a.launched, sp:0, fc:0, ta:0, pr:0, fco:0, im:0, cl:0, oc:0, atc:0,
           markets:new Set(), ads:[], _top:0, thumb:null};
      map.set(key, c);
    }
    const f = fx(a.s), k = localMode() ? 1 : f;
    c.sp += a.sp * k; c.fc += a.fc * k; c.ta += a.ta * k; c.pr += a.pr * k; c.usd = (c.usd || 0) + a.sp * f;
    c.fco += a.fco; c.im += a.im; c.cl += a.cl; c.oc += a.oc; c.atc += a.atc;
    c.markets.add(a.s); c.ads.push(a);
    for (const fld of ['product','editor','designer','strategist','format','angle','funnel','structure','creator','hook_tactic']) if (!c[fld] && a[fld]) c[fld] = a[fld];
    if (a.launched && (!c.launched || a.launched < c.launched)) c.launched = a.launched;
    if (a.th && a.sp > c._top) { c._top = a.sp; c.thumb = a.th; }
  }
  for (const c of map.values()) {
    c.r = {fc: c.fc / c.sp, ta: c.ta / c.sp, pl: c.pr / c.sp};
    c.ctr = c.im ? c.cl / c.im : 0;
    const ratio = c.r.pl > 0 ? c.r.fc / c.r.pl : 0;
    c.role = ratio >= 0.9 ? 'acq' : ratio <= 0.5 ? 'close' : 'bal';
  }
  return [...map.values()];
}
const ROLE = {acq:['Acquirer','green','First Click holds up: this ad starts new journeys. Scale candidate.'],
              close:['Closer','blue','Platform >> First Click: mostly finishes journeys others started (retargeting asset).'],
              bal:['Balanced','', 'Credit holds across models.']};
function benchmark(cs) { const sp = cs.reduce((a, c) => a + c.sp, 0); const r = cs.reduce((a, c) => a + revOf(c), 0); return sp ? r / sp : 0; }
const inWeek = (d, w) => { if (!d) return false; const wk = D.weeks.find(x => x.start === w); return d >= wk.start && d <= wk.end; };
const minK = () => localMode() ? S.min / fx(S.market) : S.min; // min spend is set in USD

function storeKpis(w, allMarkets) {
  const o = {sales:0, spend:0, profit:0, orders:0, ncOrders:0, ncSales:0, metaSp:0, metaFc:0, metaTa:0, metaPl:0, paidSp:0, paidFc:0, paidTa:0, visitors:0};
  const k = D.kpis[w] || {}, ch = D.channels[w] || {};
  for (const st of Object.keys(k)) {
    if (!allMarkets && !marketOk(st)) continue;
    const q = k[st], c = v => conv(v, st);
    o.sales += c(q.sales); o.spend += c(q.blendedAds); o.profit += c(q.totalNetProfit); o.orders += q.orders || q.shopifyOrders || 0;
    o.ncOrders += q.newCustomersOrders || 0; o.ncSales += c(q.newCustomerSales);
    const m = q.meta || {}; o.metaSp += c(m.spend); o.metaFc += c(m.pixelConversionValue); o.metaTa += c(m.ta_rev); o.metaPl += c(m.conversionValue);
    for (const r of Object.values(ch[st] || {})) if (r.spend > 0) { o.paidSp += c(r.spend); o.paidFc += c(r.fc_rev); o.paidTa += c(r.ta_rev); }
  }
  o.roas = o.spend ? o.sales / o.spend : 0; o.mer = o.sales ? o.spend / o.sales : 0; o.aov = o.orders ? o.sales / o.orders : 0;
  o.ncCpa = o.ncOrders ? o.spend / o.ncOrders : 0; o.fcRoas = o.paidSp ? o.paidFc / o.paidSp : 0; o.taRoas = o.paidSp ? o.paidTa / o.paidSp : 0;
  o.metaR = {fc: o.metaFc / o.metaSp, ta: o.metaTa / o.metaSp, pl: o.metaPl / o.metaSp};
  return o;
}

/* ---------------- leaderboard ---------------- */
const LEVELS = [[0,'Thrall'],[500,'Karl'],[1500,'Huscarl'],[3500,'Jarl'],[7000,'Konungr']];
const level = xp => { let l = LEVELS[0]; for (const L of LEVELS) if (xp >= L[0]) l = L; const i = LEVELS.indexOf(l), nx = LEVELS[i + 1]; return {name:l[1], next:nx ? nx[0] : null, base:l[0]}; };
const ROLEFIELD = {editors:['editor','VID'], designers:['designer','IMG'], strategists:['strategist',null]};
function board(w, kind) {
  const [fld, only] = ROLEFIELD[kind];
  const cs = concepts(adsFor(w)).filter(c => !only || c.kind === only);
  const bm = benchmark(cs);
  const topC = cs.slice().sort((a, b) => revOf(b) - revOf(a))[0];
  const ppl = new Map();
  for (const c of cs) {
    const who = c[fld]; if (!who) continue;
    let p = ppl.get(who);
    if (!p) { p = {name:who, sp:0, rev:0, fc:0, ta:0, pl:0, usdRev:0, concepts:[], launches:0, hits:0, mvp:false}; ppl.set(who, p); }
    p.sp += c.sp; p.rev += revOf(c); p.fc += c.fc; p.ta += c.ta; p.pl += c.pr; p.concepts.push(c);
    p.usdRev += revOf(c) * (localMode() ? fx(S.market) : 1);
    if (inWeek(c.launched, w)) p.launches++;
    if (c.usd >= 1000 && c.r[S.model] >= bm) p.hits++;
    if (topC && c.key === topC.key) p.mvp = true;
  }
  const out = [...ppl.values()].map(p => {
    p.xp = Math.round(p.usdRev / 100) + 25 * p.launches + 150 * p.hits + (p.mvp ? 250 : 0);
    p.r = {fc:p.fc / p.sp, ta:p.ta / p.sp, pl:p.pl / p.sp};
    p.concepts.sort((a, b) => revOf(b) - revOf(a));
    return p;
  }).sort((a, b) => b.xp - a.xp);
  out.forEach((p, i) => p.rank = i + 1);
  return out;
}
function seasonXp(kind) {
  const tot = {};
  for (const w of D.weeks) { if (w.partial) continue; for (const p of board(w.start, kind)) tot[p.name] = (tot[p.name] || 0) + p.xp; }
  return tot;
}
function streak(kind, name) {
  let n = 0;
  for (let i = weekIdx(S.week); i < D.weeks.length; i++) { const b = board(D.weeks[i].start, kind); if (b[0] && b[0].name === name) n++; else break; }
  return n;
}

/* ---------------- shell ---------------- */
const ICONS = {
  hq:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  markets:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  videos:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  statics:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  board:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  rookies:'<path d="M12 2l2.9 6.9L22 10l-5.5 4.7L18 22l-6-3.6L6 22l1.5-7.3L2 10l7.1-1.1z"/>',
  road:'<path d="M4 20L10 4M20 20L14 4M12 6v2M12 11v2M12 16v2"/>',
  insights:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  channels:'<path d="M4 6h16M4 12h10M4 18h6"/>',
  guide:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>'
};
const PAGES = [['hq','HQ overview'],['markets','Markets'],['videos','Top videos'],['statics','Top statics'],['board','Leaderboard'],
               ['rookies','Rookies of the week'],['road','Road to $10k'],['insights','Creative insights'],['channels','Channels'],['guide','How to read this']];

function buildShell() {
  $('#nav').innerHTML = PAGES.map(([k, l]) => `<button class="nav-item" data-p="${k}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${l}</button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { S.page = b.dataset.p; $('#side').classList.remove('open'); render(); window.scrollTo(0, 0); } };
  $('#cWeek').innerHTML = D.weeks.map(w => `<option value="${w.start}">${weekLabel(w)}</option>`).join('');
  $('#cWeek').onchange = e => { S.week = e.target.value; render(); };
  seg('#cMarket', ['ALL', ...D.stores.map(s => s.code)].map(c => [c, (FLAGS[c] || '') + ' ' + (c === 'ALL' ? 'All' : c)]), 'market', () => { if (S.market === 'ALL') S.cur = 'USD'; });
  seg('#cModel', Object.entries(MODELS), 'model');
  seg('#cCur', [['USD','USD'],['LOCAL','Local']], 'cur');
  const mi = $('#cMin'); mi.value = S.min; $('#cMinV').textContent = '$' + S.min;
  mi.oninput = () => { S.min = +mi.value; $('#cMinV').textContent = '$' + S.min; render(); };
  $('#genAt').textContent = 'Synced ' + new Date(D.generated).toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'});
  $('#lockBtn').onclick = () => { LS('nkhub.pw', null); location.reload(); };
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
  $('#cWeek').value = S.week;
  for (const [sel, key] of [['#cMarket','market'],['#cModel','model'],['#cCur','cur']]) for (const b of $(sel).children) b.classList.toggle('on', b.dataset.v === S[key]);
  $('#cCur').querySelector('[data-v=LOCAL]').disabled = S.market === 'ALL';
  for (const b of $('#nav').children) b.classList.toggle('active', b.dataset.p === S.page);
  const h = new URLSearchParams({p:S.page, w:S.week, m:S.market, a:S.model, c:S.cur, min:S.min});
  history.replaceState(null, '', '#' + h.toString());
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('p') && PAGES.some(p => p[0] === h.get('p'))) S.page = h.get('p');
  if (h.get('w') && D.weeks.some(w => w.start === h.get('w'))) S.week = h.get('w');
  if (h.get('m')) S.market = h.get('m');
  if (h.get('a') && MODELS[h.get('a')]) S.model = h.get('a');
  if (h.get('c')) S.cur = h.get('c');
  if (h.get('min')) S.min = +h.get('min');
}
function head(kicker, title, extra = '') {
  const w = D.weeks.find(x => x.start === S.week);
  return `<div class="page-head"><div><div class="kicker">${kicker}</div><h1>${title}</h1></div>
    <div class="meta">${FLAGS[S.market]} ${S.market === 'ALL' ? 'All markets' : S.market} · ${weekLabel(w)}<br>ROAS model: <b style="color:var(--gold)">${MODELS[S.model]}</b> · ${curCode()}${extra}</div></div>`;
}
function render() {
  Object.values(charts).forEach(c => c.destroy()); for (const k in charts) delete charts[k];
  syncControls();
  const v = $('#view');
  v.innerHTML = ({hq:pHQ, markets:pMarkets, videos:() => pCreatives('VID'), statics:() => pCreatives('IMG'), board:pBoard, rookies:pRookies,
                  road:pRoad, insights:pInsights, channels:pChannels, guide:pGuide}[S.page])();
  v.querySelectorAll('[data-c]').forEach(el => el.onclick = () => openConcept(el.dataset.c, el.dataset.k));
  v.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { S.page = el.dataset.go; if (el.dataset.b) S.board = el.dataset.b; render(); window.scrollTo(0, 0); });
  afterRender.forEach(f => f()); afterRender.length = 0;
}
const afterRender = [];

/* ---------------- creative card ---------------- */
function roas3(r) {
  return `<div class="roas3">${['fc','ta','pl'].map(m => `<div class="${m === S.model ? 'lead' : ''}"><b>${x2(r[m])}</b><span>${m === 'fc' ? 'First click' : m === 'ta' ? 'Triple' : 'Platform'}</span></div>`).join('')}</div>`;
}
function card(c, rank, w) {
  const role = ROLE[c.role];
  const who = c.kind === 'VID' ? [c.editor && '✂ ' + c.editor, c.strategist && '♟ ' + c.strategist] : [c.designer && '✎ ' + c.designer, c.strategist && '♟ ' + c.strategist];
  return `<div class="card cr" data-c="${esc(c.key)}" data-k="${c.kind}">
    <div class="thumb" style="background-image:url('${esc(c.thumb || '')}')">${rank ? `<span class="rank">#${rank}</span>` : ''}
      <div class="badges">${inWeek(c.launched, w || S.week) ? '<span class="pill gold">NEW</span>' : ''}<span class="pill ${role[1]}" title="${esc(role[2])}">${role[0]}</span></div></div>
    <div class="body"><div class="id">${esc(c.id || '')} ${c.product ? '· ' + esc(c.product) : ''}</div>
      <div class="ttl" title="${esc(c.title)}">${esc(c.title)}</div>
      <div class="who">${who.filter(Boolean).map(esc).join(' · ') || '<span class="muted">name missing people</span>'}</div>
      ${roas3(c.r)}
      <div class="foot"><span>Spend <b class="num">${money(c.sp)}</b></span><span class="mkts">${[...c.markets].map(m => FLAGS[m]).join('')}</span></div>
    </div></div>`;
}

/* ---------------- pages ---------------- */
function pHQ() {
  const k = storeKpis(S.week), pw = prevWeek(S.week), p = pw ? storeKpis(pw) : null;
  const R = {fc:k.fcRoas, ta:k.taRoas, pl:k.metaR.pl}, P = p ? {fc:p.fcRoas, ta:p.taRoas, pl:p.metaR.pl} : {};
  const kp = (lbl, val, d, lead) => `<div class="card kpi ${lead ? 'lead' : ''}"><div class="lbl">${lbl}</div><div class="val num">${val}</div><div class="delta">${d}</div></div>`;
  const cs = concepts(adsFor(S.week)), mk = minK();
  const vids = cs.filter(c => c.kind === 'VID' && c.sp >= mk).sort((a, b) => b.r[S.model] - a.r[S.model]);
  const stats = cs.filter(c => c.kind === 'IMG' && c.sp >= mk).sort((a, b) => b.r[S.model] - a.r[S.model]);
  const ed = board(S.week, 'editors')[0], de = board(S.week, 'designers')[0], stg = board(S.week, 'strategists')[0];
  const fatigue = fatigueList().slice(0, 1)[0];
  const hl = (ic, t, b, s, attrs) => `<div class="card hl" ${attrs}>${ic}<div style="min-width:0"><div class="t">${t}</div><div class="b">${b}</div><div class="s">${s}</div></div></div>`;
  const img = c => c && c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : '<div class="ic">🎬</div>';
  let h = head('Weekly performance', 'HQ overview');
  h += `<div class="grid kpis">
    ${kp('Revenue', money(k.sales), delta(k.sales, p && p.sales))}
    ${kp('Ad spend', money(k.spend), delta(k.spend, p && p.spend))}
    ${kp('Blended ROAS', x2(k.roas), delta(k.roas, p && p.roas))}
    ${kp('Paid ' + MODELS[S.model] + ' ROAS', x2(S.model === 'pl' ? R.pl : R[S.model]), delta(R[S.model], P[S.model]), true)}
    ${kp('Net profit', money(k.profit), delta(k.profit, p && p.profit))}
    ${kp('Orders', int(k.orders), delta(k.orders, p && p.orders))}
    ${kp('AOV', money(k.aov, 0), delta(k.aov, p && p.aov))}
    ${kp('New-customer CPA', money(k.ncCpa, 0), delta(k.ncCpa, p && p.ncCpa, true))}
  </div>
  <div class="note">Paid ROAS = attributed revenue ÷ spend on every paid channel (Meta, Google, Pinterest, AppLovin...). Platform = what Meta reports for itself. First Click is the scale metric.</div>
  <h2 class="sec">Headlines of the week</h2>
  <div class="grid headlines">
    ${vids[0] ? hl(img(vids[0]), '🏆 Video of the week', esc(vids[0].id + ' ' + vids[0].title), `${MODELS[S.model]} ${x2(vids[0].r[S.model])} on ${money(vids[0].sp)}`, `data-c="${esc(vids[0].key)}" data-k="VID"`) : ''}
    ${stats[0] ? hl(img(stats[0]), '🖼 Static of the week', esc(stats[0].id + ' ' + stats[0].title), `${MODELS[S.model]} ${x2(stats[0].r[S.model])} on ${money(stats[0].sp)}`, `data-c="${esc(stats[0].key)}" data-k="IMG"`) : ''}
    ${ed ? hl(`<div class="ic">✂️</div>`, 'Editor of the week', esc(ed.name), `${int(ed.xp)} XP · ${MODELS[S.model]} ${x2(ed.r[S.model])}`, 'data-go="board" data-b="editors"') : ''}
    ${de ? hl(`<div class="ic">🎨</div>`, 'Designer of the week', esc(de.name), `${int(de.xp)} XP · ${MODELS[S.model]} ${x2(de.r[S.model])}`, 'data-go="board" data-b="designers"') : ''}
    ${stg ? hl(`<div class="ic">♟️</div>`, 'Strategist of the week', esc(stg.name), `${int(stg.xp)} XP · ${MODELS[S.model]} ${x2(stg.r[S.model])}`, 'data-go="board" data-b="strategists"') : ''}
    ${fatigue ? hl(img(fatigue.c), '⚠️ Fatigue watch', esc(fatigue.c.id + ' ' + fatigue.c.title), `${MODELS[S.model]} ${x2(fatigue.prev)} → ${x2(fatigue.c.r[S.model])} week on week`, `data-c="${esc(fatigue.c.key)}" data-k="${fatigue.c.kind}"`) : ''}
  </div>
  <h2 class="sec">8-week trend <small>${S.market === 'ALL' ? 'all markets, USD' : S.market}</small></h2>
  <div class="grid charts">
    <div class="card chart-card"><h3>Revenue</h3><div class="sub">Store sales per week (Triple Whale summary)</div><div class="chart-wrap"><canvas id="chRev"></canvas></div></div>
    <div class="card chart-card"><h3>Ad spend</h3><div class="sub">Blended ad spend per week</div><div class="chart-wrap"><canvas id="chSp"></canvas></div></div>
    <div class="card chart-card"><h3>Meta ROAS under three models</h3>
      <div class="legend"><span><i style="background:var(--c-fc)"></i>First Click</span><span><i style="background:var(--c-ta)"></i>Triple</span><span><i style="background:var(--c-pl);opacity:.8"></i>Platform (dashed)</span></div>
      <div class="chart-wrap"><canvas id="chRoas"></canvas></div></div>
  </div>
  <h2 class="sec">Markets this week</h2>${marketTable()}`;
  afterRender.push(trendCharts);
  return h;
}
function marketTable() {
  const rows = D.stores.map(st => {
    const save = S.market; S.market = st.code;
    const k = storeKpis(S.week), pw = prevWeek(S.week), p = pw ? storeKpis(pw) : null;
    S.market = save;
    return {st, k, p};
  }).filter(r => r.k.sales > 0 || r.k.spend > 50);
  const wd = (c, p) => !p ? '' : `<span class="${c >= p ? 'up' : 'down'}" style="font-size:11px;margin-left:4px">${c >= p ? '▲' : '▼'}${Math.abs((c / p - 1) * 100).toFixed(0)}%</span>`;
  const forceUsd = v => v; // storeKpis already converts to USD unless local mode
  return `<div class="tbl-wrap"><table><thead><tr><th>Market</th><th>Revenue</th><th>Spend</th><th>Blended ROAS</th><th>Paid FC ROAS</th><th>Paid Triple ROAS</th><th>Meta platform</th><th>Net profit</th><th>Orders</th><th>NC CPA</th></tr></thead><tbody>
  ${rows.map(({st, k, p}) => `<tr style="cursor:pointer" data-mk="${st.code}"><td><span class="flag">${FLAGS[st.code]}</span>${st.name}</td>
    <td class="num">${money(forceUsd(k.sales))}${wd(k.sales, p && p.sales)}</td><td class="num">${money(k.spend)}</td><td class="num">${x2(k.roas)}</td>
    <td class="num" style="color:var(--gold)">${x2(k.fcRoas)}${wd(k.fcRoas, p && p.fcRoas)}</td><td class="num">${x2(k.taRoas)}</td><td class="num">${x2(k.metaR.pl)}</td>
    <td class="num ${k.profit < 0 ? 'down' : ''}">${money(k.profit)}</td><td class="num">${int(k.orders)}</td><td class="num">${money(k.ncCpa, 0)}</td></tr>`).join('')}
  </tbody></table></div><div class="note">Click a market to filter the whole hub to it. ${localMode() ? '' : 'Converted to USD with Triple Whale\'s own exchange rates.'}</div>`;
}
function trendCharts() {
  document.querySelectorAll('[data-mk]').forEach(tr => tr.onclick = () => { S.market = tr.dataset.mk; render(); });
  const ws = D.weeks.filter(w => !w.partial).reverse();
  const ks = ws.map(w => storeKpis(w.start));
  const labels = ws.map(w => fmtDate(w.start) + (w.partial ? '*' : ''));
  const base = {responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
    plugins:{legend:{display:false}, tooltip:{backgroundColor:'#1b1b1f', borderColor:'#36363e', borderWidth:1, titleColor:'#f0f0f2', bodyColor:'#c9c9cf', padding:10}},
    scales:{x:{grid:{display:false}, ticks:{color:'#8a8a94', font:{size:11}}}, y:{grid:{color:'#2a2a31'}, border:{display:false}, ticks:{color:'#8a8a94', font:{size:11}}}}};
  const mtick = {...base.scales.y, ticks:{...base.scales.y.ticks, callback:v => money(v)}};
  const bar = (id, data, label) => { if (!$(id)) return; charts[id] = new Chart($(id), {type:'bar', data:{labels, datasets:[{label, data, backgroundColor:ws.map((w, i) => w.start === S.week ? '#c7b48b' : '#b3985f66'), borderRadius:4, maxBarThickness:34}]},
    options:{...base, scales:{...base.scales, y:mtick}, plugins:{...base.plugins, tooltip:{...base.plugins.tooltip, callbacks:{label:c => label + ': ' + money(c.raw, 0)}}}}}); };
  bar('#chRev', ks.map(k => k.sales), 'Revenue');
  bar('#chSp', ks.map(k => k.spend), 'Spend');
  if ($('#chRoas')) charts.roas = new Chart($('#chRoas'), {type:'line', data:{labels, datasets:[
    {label:'First Click', data:ks.map(k => +(k.metaR.fc || 0).toFixed(2)), borderColor:'#b38b33', backgroundColor:'#b38b33', borderWidth:2, pointRadius:4, tension:.25},
    {label:'Triple', data:ks.map(k => +(k.metaR.ta || 0).toFixed(2)), borderColor:'#3a80c4', backgroundColor:'#3a80c4', borderWidth:2, pointRadius:4, tension:.25},
    {label:'Platform', data:ks.map(k => +(k.metaR.pl || 0).toFixed(2)), borderColor:'#cf4640', backgroundColor:'#cf4640', borderWidth:2, borderDash:[5, 4], pointRadius:4, tension:.25}]}, options:base});
}

function pMarkets() {
  let h = head('Every market at a glance', 'Markets');
  const mk = minK();
  h += `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">`;
  for (const st of D.stores) {
    const save = S.market; S.market = st.code;
    const k = storeKpis(S.week), pw = prevWeek(S.week), p = pw ? storeKpis(pw) : null;
    const cs = concepts(adsFor(S.week));
    const bv = cs.filter(c => c.kind === 'VID' && c.sp >= mk).sort((a, b) => b.r[S.model] - a.r[S.model])[0];
    const bs = cs.filter(c => c.kind === 'IMG' && c.sp >= mk).sort((a, b) => b.r[S.model] - a.r[S.model])[0];
    const ed = board(S.week, 'editors')[0];
    const best = (c, lbl) => c ? `<div class="card mk" data-c="${esc(c.key)}" data-k="${c.kind}" style="margin:0"><div class="thumb" style="background-image:url('${esc(c.thumb || '')}')"></div><div class="body"><div class="s">${lbl}</div><div class="ttl">${esc((c.id || '') + ' ' + c.title)}</div><div class="s">${MODELS[S.model]} <b style="color:var(--gold)">${x2(c.r[S.model])}</b> · ${money(c.sp)}</div></div></div>` : `<div class="empty" style="padding:20px">No ${lbl.toLowerCase()} over the min spend</div>`;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div class="wordmark" style="font-size:28px">${FLAGS[st.code]} ${st.code}</div><span class="pill">${st.cur}</span></div>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0">
        <div><div class="muted" style="font-size:11px">REVENUE</div><b class="num">${money(k.sales)}</b><div style="font-size:11px">${delta(k.sales, p && p.sales).replace(/<span class="muted">.*<\/span>/, '')}</div></div>
        <div><div class="muted" style="font-size:11px">PAID FC ROAS</div><b class="num" style="color:var(--gold)">${x2(k.fcRoas)}</b></div>
        <div><div class="muted" style="font-size:11px">SPEND</div><b class="num">${money(k.spend)}</b></div></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${best(bv, 'Best video')}${best(bs, 'Best static')}</div>
      <div class="note">${ed ? `Top editor: <b style="color:var(--text)">${esc(ed.name)}</b> (${int(ed.xp)} XP)` : ''}</div></div>`;
    S.market = save;
  }
  return h + '</div>';
}

function pCreatives(kind) {
  const isV = kind === 'VID';
  let h = head(isV ? 'What is winning on video' : 'What is winning on static', isV ? 'Top videos' : 'Top statics');
  const mk = minK();
  // best per market strip
  if (S.market === 'ALL') {
    h += `<h2 class="sec" style="margin-top:0">Best ${isV ? 'video' : 'static'} per market <small>ranked by ${MODELS[S.model]} ROAS, min ${'$' + S.min} spend</small></h2><div class="grid strip">`;
    for (const st of D.stores) {
      const cs = concepts(adsFor(S.week, true).filter(a => a.s === st.code)).filter(c => c.kind === kind && c.usd >= S.min).sort((a, b) => b.r[S.model] - a.r[S.model]);
      const c = cs[0];
      h += c ? `<div class="card mk" data-c="${esc(c.key)}" data-k="${kind}" data-st="${st.code}"><div class="thumb" style="background-image:url('${esc(c.thumb || '')}')"></div><div class="body"><div class="m">${FLAGS[st.code]} ${st.code}</div><div class="ttl">${esc((c.id || '') + ' ' + c.title)}</div><div class="s">${MODELS[S.model]} <b style="color:var(--gold)">${x2(c.r[S.model])}</b> · ${money(c.sp)}</div></div></div>`
             : `<div class="card mk"><div class="body"><div class="m">${FLAGS[st.code]} ${st.code}</div><div class="s">Nothing over the min spend</div></div></div>`;
    }
    h += '</div>';
  }
  const products = [...new Set(concepts(adsFor(S.week)).filter(c => c.kind === kind).map(c => c.product).filter(Boolean))].sort();
  const people = [...new Set(concepts(adsFor(S.week)).filter(c => c.kind === kind).map(c => isV ? c.editor : c.designer).filter(Boolean))].sort();
  h += `<h2 class="sec">Leaderboard of ${isV ? 'videos' : 'statics'}</h2><div class="toolbar">
    <select id="fSort"><option value="roas">Sort: ${MODELS[S.model]} ROAS</option><option value="rev">Sort: ${MODELS[S.model]} revenue</option><option value="sp">Sort: spend</option><option value="ctr">Sort: CTR</option><option value="new">Sort: newest launch</option></select>
    <select id="fProd"><option value="">All products</option>${products.map(p => `<option>${esc(p)}</option>`).join('')}</select>
    <select id="fWho"><option value="">All ${isV ? 'editors' : 'designers'}</option>${people.map(p => `<option>${esc(p)}</option>`).join('')}</select>
    <select id="fRole"><option value="">All roles</option><option value="acq">Acquirers only</option><option value="close">Closers only</option></select>
    <input type="search" id="fQ" placeholder="Search name, ID, angle..." value="${esc(S.q)}"></div><div id="crList"></div>`;
  afterRender.push(() => {
    const draw = () => {
      const sort = $('#fSort').value, prod = $('#fProd').value, who = $('#fWho').value, role = $('#fRole').value, q = $('#fQ').value.toLowerCase(); S.q = q;
      let cs = concepts(adsFor(S.week)).filter(c => c.kind === kind && c.sp >= mk && (!prod || c.product === prod) && (!who || (isV ? c.editor : c.designer) === who) && (!role || c.role === role));
      if (q) cs = cs.filter(c => (c.key + ' ' + c.title + ' ' + (c.angle || '') + ' ' + (c.format || '') + ' ' + c.ads.map(a => a.n).join(' ')).toLowerCase().includes(q));
      const f = {roas:c => c.r[S.model], rev:c => revOf(c), sp:c => c.sp, ctr:c => c.ctr, new:c => c.launched || ''}[sort];
      cs.sort((a, b) => f(b) > f(a) ? 1 : f(b) < f(a) ? -1 : 0);
      $('#crList').innerHTML = cs.length ? `<div class="grid gallery">${cs.slice(0, 60).map((c, i) => card(c, i + 1)).join('')}</div><div class="note">${cs.length} concepts over $${S.min} spend. Hook variants of one ID are grouped; click a card for every variant and market.</div>`
        : '<div class="empty">Nothing matches. Lower the min spend in the control panel.</div>';
      $('#crList').querySelectorAll('[data-c]').forEach(el => el.onclick = () => openConcept(el.dataset.c, el.dataset.k));
    };
    ['#fSort','#fProd','#fWho','#fRole'].forEach(s => $(s).onchange = draw); $('#fQ').oninput = draw;
    document.querySelectorAll('.strip [data-st]').forEach(el => el.onclick = () => openConcept(el.dataset.c, el.dataset.k, el.dataset.st));
    draw();
  });
  return h;
}

function pBoard() {
  let h = head('Gamified · resets every week', 'Leaderboard');
  const tabs = [['editors','✂️ Editors'],['designers','🎨 Designers'],['strategists','♟️ Strategists']];
  h += `<div class="tabs">${tabs.map(([k, l]) => `<button data-bt="${k}" class="${S.board === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const b = board(S.week, S.board), pw = prevWeek(S.week), pb = pw ? board(pw, S.board) : [];
  const season = seasonXp(S.board);
  if (!b.length) h += '<div class="empty">No credited ads this week. Names must carry the person (see How to read this).</div>';
  else {
    const order = [b[1], b[0], b[2]];
    h += `<div class="podium">${order.map((p, i) => { if (!p) return '<div></div>'; const cls = ['p2','p1','p3'][i], medal = ['🥈','🥇','🥉'][i];
      const lv = level(season[p.name] || 0), st = p.rank === 1 ? streak(S.board, p.name) : 0;
      return `<div class="card pod ${cls}"><div class="medal">${medal}</div><div class="av">${esc(initials(p.name))}</div><div class="nm">${esc(p.name)}</div>
        <div class="xp num">${int(p.xp)} XP</div><div style="margin:6px 0"><span class="lvl">${lv.name}</span>${st > 1 ? ` <span class="pill red">🔥 ${st}-week streak</span>` : ''}${p.mvp ? ' <span class="pill gold">MVP</span>' : ''}</div>
        <div class="st">${money(p.rev)} ${MODELS[S.model]} revenue · ROAS ${x2(p.r[S.model])}</div>
        <div class="thumbs-row" style="justify-content:center;margin-top:10px">${p.concepts.slice(0, 4).map(c => `<img src="${esc(c.thumb || '')}" title="${esc((c.id || '') + ' ' + c.title)}" data-c="${esc(c.key)}" data-k="${c.kind}" style="cursor:pointer">`).join('')}</div></div>`; }).join('')}</div>`;
    h += `<div class="tbl-wrap"><table><thead><tr><th>Rank</th><th class="l">Name</th><th>XP</th><th class="l">Season level</th><th>${MODELS[S.model]} revenue</th><th>Spend</th><th>FC ROAS</th><th>Triple ROAS</th><th>Platform</th><th>Concepts live</th><th>New launches</th><th>Hits</th><th class="l">Best ads</th></tr></thead><tbody>
    ${b.map(p => { const prev = pb.find(x => x.name === p.name); const mv = !prev ? '<span class="mv-new">NEW</span>' : prev.rank > p.rank ? `<span class="mv-up">▲${prev.rank - p.rank}</span>` : prev.rank < p.rank ? `<span class="mv-dn">▼${p.rank - prev.rank}</span>` : '<span class="muted">=</span>';
      const sx = season[p.name] || 0, lv = level(sx), prog = lv.next ? (sx - lv.base) / (lv.next - lv.base) : 1;
      return `<tr><td class="num"><b>#${p.rank}</b> ${mv}</td><td class="l"><span class="mini-av">${esc(initials(p.name))}</span>${esc(p.name)} ${p.mvp ? '<span class="pill gold">MVP</span>' : ''}</td>
      <td class="num" style="color:var(--gold)"><b>${int(p.xp)}</b></td><td class="l"><span class="lvl">${lv.name}</span><div class="xpbar"><i style="width:${(prog * 100).toFixed(0)}%"></i></div></td>
      <td class="num">${money(p.rev)}</td><td class="num">${money(p.sp)}</td><td class="num">${x2(p.r.fc)}</td><td class="num">${x2(p.r.ta)}</td><td class="num">${x2(p.r.pl)}</td>
      <td class="num">${p.concepts.length}</td><td class="num">${p.launches}</td><td class="num">${p.hits}</td>
      <td class="l"><div class="thumbs-row">${p.concepts.slice(0, 5).map(c => `<img src="${esc(c.thumb || '')}" title="${esc((c.id || '') + ' ' + c.title)}" data-c="${esc(c.key)}" data-k="${c.kind}" style="cursor:pointer">`).join('')}</div></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  h += `<h2 class="sec">How XP is scored <small>same rules for everyone, recalculated from Triple Whale every sync</small></h2><div class="grid rules">
    <div class="card rule"><b>1 XP / $100</b>of ${MODELS[S.model]} revenue your ads brought in this week (USD).</div>
    <div class="card rule"><b>+150</b>per <i>hit</i>: a concept with $1,000+ spend that beats the account's ${MODELS[S.model]} ROAS.</div>
    <div class="card rule"><b>+25</b>per new concept launched this week (launch date in the ad name).</div>
    <div class="card rule"><b>+250 MVP</b>if you own the week's #1 concept by ${MODELS[S.model]} revenue.</div>
    <div class="card rule"><b>Levels</b>Season XP over the last 8 weeks: Thrall → Karl (500) → Huscarl (1,500) → Jarl (3,500) → Konungr (7,000).</div>
  </div><div class="note">Andy and Claude are counted as one strategist. Credit comes from the ad name: if your name is not in it, the ad does not count for you.</div>`;
  afterRender.push(() => document.querySelectorAll('[data-bt]').forEach(el => el.onclick = () => { S.board = el.dataset.bt; render(); }));
  return h;
}

function pRookies() {
  let h = head('Launched this week', 'Rookies of the week');
  const cs = concepts(adsFor(S.week)).filter(c => inWeek(c.launched, S.week) || (() => { const pw = prevWeek(S.week); return pw && inWeek(c.launched, pw); })());
  cs.sort((a, b) => b.r[S.model] * Math.min(1, b.usd / 500) - a.r[S.model] * Math.min(1, a.usd / 500));
  h += `<div class="note" style="margin:-8px 0 16px">Concepts whose launch date (in the ad name) falls in this week or the one before, ranked by ${MODELS[S.model]} ROAS weighted by how much spend they have earned so far (full weight at $500). Early reads are noisy: this shows who is getting traction, not who has won.</div>`;
  h += cs.length ? `<div class="grid gallery">${cs.slice(0, 48).map((c, i) => card(c, i + 1)).join('')}</div>` : '<div class="empty">No new launches with spend this week.</div>';
  return h;
}

function pRoad() {
  let h = head('Win bar: $10,000 spend across all markets', 'Road to $10k');
  const all = concepts(D.ads.filter(a => !D.weeks.find(w => w.start === a.w).partial || true));
  // cumulative USD spend over loaded weeks, all markets (win definition is all markets)
  const save = S.cur; S.cur = 'USD';
  const cs = concepts(D.ads).filter(c => c.kind !== 'OTHER').sort((a, b) => b.sp - a.sp).slice(0, 80);
  S.cur = save;
  h += `<div class="note" style="margin:-8px 0 16px">A concept wins when it passes $10,000 of spend across every market (Andy's win definition; scaling only happens when the ad works). Spend shown is the last ${D.weeks.length} weeks in this hub, USD, all markets regardless of the market filter.</div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">Concept</th><th class="l">Type</th><th class="l">People</th><th>Spend (${D.weeks.length} wks)</th><th class="l">Progress</th><th>FC ROAS</th><th>Triple</th><th>Platform</th><th class="l">Markets</th></tr></thead><tbody>
  ${cs.map((c, i) => { const p = Math.min(1, c.sp / WIN_BAR), win = c.sp >= WIN_BAR;
    return `<tr data-c="${esc(c.key)}" data-k="${c.kind}" style="cursor:pointer"><td class="num">${i + 1}</td><td class="l"><b>${esc(c.id || '')}</b> ${esc(c.title)} ${win ? '<span class="pill gold">🏆 WINNER</span>' : ''}</td><td class="l">${c.kind === 'VID' ? 'Video' : 'Static'}</td>
    <td class="l muted">${esc([c.editor || c.designer, c.strategist].filter(Boolean).join(' · '))}</td><td class="num">$${int(c.sp)}</td>
    <td class="l"><div class="prog ${win ? 'win' : ''}"><i style="width:${(p * 100).toFixed(0)}%"></i></div></td><td class="num" style="color:var(--gold)">${x2(c.r.fc)}</td><td class="num">${x2(c.r.ta)}</td><td class="num">${x2(c.r.pl)}</td><td class="l">${[...c.markets].map(m => FLAGS[m]).join('')}</td></tr>`; }).join('')}
  </tbody></table></div>`;
  void all;
  return h;
}

function fatigueList() {
  const pw = prevWeek(S.week); if (!pw) return [];
  const mk = minK();
  const cur = concepts(adsFor(S.week)), prev = new Map(concepts(adsFor(pw)).map(c => [c.key, c]));
  return cur.filter(c => c.sp >= mk && prev.get(c.key) && prev.get(c.key).sp >= mk)
    .map(c => ({c, prev:prev.get(c.key).r[S.model], drop:1 - c.r[S.model] / prev.get(c.key).r[S.model]}))
    .filter(x => x.drop >= 0.3).sort((a, b) => b.c.sp * b.drop - a.c.sp * a.drop);
}

function pInsights() {
  let h = head('Patterns behind the winners', 'Creative insights');
  const dims = [['product','Product'],['angle','Angle'],['format','Format / production type'],['hook_tactic','Hook tactic'],['structure','Script structure'],['funnel','Funnel stage'],['creator','Creator'],['kind','Video vs static']];
  h += `<div class="toolbar"><span class="muted">Break down spend and ROAS by</span><select id="insDim">${dims.map(([k, l]) => `<option value="${k}" ${S.ins === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const cs = concepts(adsFor(S.week));
  const g = new Map();
  for (const c of cs) { const k = S.ins === 'kind' ? (c.kind === 'VID' ? 'Video' : 'Static') : c[S.ins]; if (!k) continue; const o = g.get(k) || {k, sp:0, fc:0, ta:0, pr:0, n:0}; o.sp += c.sp; o.fc += c.fc; o.ta += c.ta; o.pr += c.pr; o.n++; g.set(k, o); }
  const rows = [...g.values()].sort((a, b) => b.sp - a.sp).slice(0, 20);
  const maxSp = Math.max(1, ...rows.map(r => r.sp));
  const bm = benchmark(cs);
  h += `<div class="tbl-wrap"><table><thead><tr><th class="l">${esc(dims.find(d => d[0] === S.ins)[1])}</th><th>Concepts</th><th class="l">Spend</th><th>FC ROAS</th><th>Triple ROAS</th><th>Platform</th><th class="l">vs account (${MODELS[S.model]} ${x2(bm)})</th></tr></thead><tbody>
  ${rows.map(r => { const rr = {fc:r.fc / r.sp, ta:r.ta / r.sp, pl:r.pr / r.sp}[S.model]; const d = bm ? rr / bm - 1 : 0;
    return `<tr><td class="l"><b>${esc(r.k)}</b></td><td class="num">${r.n}</td><td class="l num">${money(r.sp)}<span class="bar" style="width:${(r.sp / maxSp * 120).toFixed(0)}px"></span></td>
      <td class="num" style="color:var(--gold)">${x2(r.fc / r.sp)}</td><td class="num">${x2(r.ta / r.sp)}</td><td class="num">${x2(r.pr / r.sp)}</td>
      <td class="l"><span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}%</span></td></tr>`; }).join('')}
  </tbody></table></div><div class="note">Only ads whose names follow the NK naming convention carry these fields; older names fall out of the angle / hook / structure views.</div>`;

  h += `<h2 class="sec">Acquirer or closer? <small>First Click ROAS vs Platform ROAS, bubble = spend</small></h2>
    <div class="card chart-card"><div class="legend"><span><i style="background:#b38b33"></i>Video</span><span><i style="background:#3a80c4"></i>Static</span><span class="muted">Above the diagonal = starts journeys (scale it). Far below = retargeting asset.</span></div><div class="chart-wrap" style="height:340px"><canvas id="chSc"></canvas></div></div>`;
  const fat = fatigueList();
  h += `<h2 class="sec">Fatigue watch <small>${MODELS[S.model]} ROAS down 30%+ week on week, both weeks over min spend</small></h2>`;
  h += fat.length ? `<div class="tbl-wrap"><table><thead><tr><th class="l">Concept</th><th>Spend</th><th>Last week</th><th>This week</th><th>Change</th></tr></thead><tbody>${fat.slice(0, 15).map(f => `<tr data-c="${esc(f.c.key)}" data-k="${f.c.kind}" style="cursor:pointer"><td class="l"><b>${esc(f.c.id || '')}</b> ${esc(f.c.title)}</td><td class="num">${money(f.c.sp)}</td><td class="num">${x2(f.prev)}</td><td class="num">${x2(f.c.r[S.model])}</td><td class="num down">▼ ${(f.drop * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing fatiguing this week.</div>';
  afterRender.push(() => {
    $('#insDim').onchange = e => { S.ins = e.target.value; render(); };
    const pts = cs.filter(c => c.sp >= minK() && c.r.pl > 0);
    const maxS = Math.max(1, ...pts.map(c => c.sp));
    const ds = k => ({label:k === 'VID' ? 'Video' : 'Static', data:pts.filter(c => c.kind === k).map(c => ({x:+c.r.pl.toFixed(2), y:+c.r.fc.toFixed(2), r:4 + 16 * Math.sqrt(c.sp / maxS), c})),
      backgroundColor:k === 'VID' ? '#b38b3399' : '#3a80c499', borderColor:k === 'VID' ? '#b38b33' : '#3a80c4', borderWidth:1.5});
    const mx = Math.max(2, ...pts.map(c => Math.max(c.r.pl, c.r.fc))) * 1.05;
    charts.sc = new Chart($('#chSc'), {type:'bubble', data:{datasets:[ds('VID'), ds('IMG'), {type:'line', label:'diag', data:[{x:0, y:0}, {x:mx, y:mx}], borderColor:'#36363e', borderDash:[4, 4], pointRadius:0, borderWidth:1}]},
      options:{responsive:true, maintainAspectRatio:false, onClick:(e, els) => { const el = els[0]; if (el) { const c = charts.sc.data.datasets[el.datasetIndex].data[el.index].c; if (c) openConcept(c.key, c.kind); } },
        plugins:{legend:{display:false}, tooltip:{filter:i => i.dataset.label !== 'diag', backgroundColor:'#1b1b1f', borderColor:'#36363e', borderWidth:1, callbacks:{label:i => { const c = i.raw.c; return `${c.id || ''} ${c.title} · FC ${x2(c.r.fc)} · Platform ${x2(c.r.pl)} · ${money(c.sp)}`; }}}},
        scales:{x:{min:0, max:mx, title:{display:true, text:'Platform ROAS', color:'#8a8a94'}, grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}, y:{min:0, max:mx, title:{display:true, text:'First Click ROAS', color:'#8a8a94'}, grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}}}});
  });
  return h;
}

function pChannels() {
  let h = head('Where the money goes', 'Channels');
  const ch = D.channels[S.week] || {}, agg = {};
  for (const st of Object.keys(ch)) { if (!marketOk(st)) continue; for (const [name, r] of Object.entries(ch[st])) {
    const o = agg[name] || (agg[name] = {name, sp:0, fc:0, ta:0, pr:0}); o.sp += conv(r.spend, st); o.fc += conv(r.fc_rev, st); o.ta += conv(r.ta_rev, st); o.pr += conv(r.platform_rev, st); } }
  const rows = Object.values(agg).filter(r => r.sp > 0 || r.fc > 0).sort((a, b) => b.sp - a.sp || b.fc - a.fc);
  const nice = n => ({'facebook-ads':'Meta','google-ads':'Google','pinterest-ads':'Pinterest','applovin':'AppLovin','tiktok-ads':'TikTok','snapchat-ads':'Snapchat','klaviyo':'Klaviyo (email/SMS)','organic_and_social':'Organic & social','Direct':'Direct','Non-attributed':'Non-attributed'}[n] || n);
  h += `<div class="tbl-wrap"><table><thead><tr><th class="l">Channel</th><th>Spend</th><th>First Click revenue</th><th>FC ROAS</th><th>Triple revenue</th><th>Triple ROAS</th><th>Platform-reported</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td class="l"><b>${esc(nice(r.name))}</b></td><td class="num">${r.sp ? money(r.sp) : '<span class="muted">organic</span>'}</td><td class="num">${money(r.fc)}</td><td class="num" style="color:var(--gold)">${r.sp ? x2(r.fc / r.sp) : '–'}</td><td class="num">${money(r.ta)}</td><td class="num">${r.sp ? x2(r.ta / r.sp) : '–'}</td><td class="num">${r.pr ? money(r.pr) : '–'}</td></tr>`).join('')}
  </tbody></table></div><div class="note">Unpaid rows (email, organic, direct) show the revenue each model credits to them, so you can see how much First Click hands to paid ads vs everything else.</div>`;
  return h;
}

function pGuide() {
  return head('For designers, editors and strategists', 'How to read this') + `<div class="guide">
  <h3>Three ROAS numbers, one verdict</h3>
  <p>Every ROAS here is shown under three attribution models. <b style="color:var(--gold)">First Click</b> credits the ad that <i>started</i> the customer's journey: it is the number that decides whether an ad gets scaled. <b>Triple</b> spreads credit across the whole journey. <b>Platform</b> is what Meta reports about itself, which flatters retargeting and short video.</p>
  <ul><li><span class="pill green">Acquirer</span> First Click holds close to Platform: the ad brings in new people. These are the ones to iterate on.</li>
  <li><span class="pill blue">Closer</span> Platform is far above First Click: the ad mostly finishes journeys other ads started. Useful, but not a prospecting winner.</li></ul>
  <h3>Where the numbers come from</h3>
  <p>Everything is pulled automatically from Triple Whale: store revenue, spend, profit and orders from the Summary page, and ad-level spend and revenue from Triple Whale's pixel attribution (lifetime window) for Meta. Money is in USD by default, converted with Triple Whale's own rates; pick one market and switch Currency to Local to see it in that store's currency.</p>
  <h3>How you get credit</h3>
  <p>The hub reads the <b>ad name</b>. Videos are credited to the editor and strategist written in the name, statics to the designer and strategist. A name built with the NK name builder always carries them. If your name is missing or misspelled, the ad does not count for you.</p>
  <h3>Control panel</h3>
  <p>Pick the <b>week</b>, the <b>market</b>, the <b>attribution model</b> that ranks everything, the <b>currency</b>, and the <b>minimum spend</b> an ad needs before it can be ranked (stops a $40 ad with one sale topping the chart). Every view has its own link: use <span class="kbd">Copy link to this view</span> to share exactly what you are looking at.</p>
  <h3>Weeks</h3>
  <p>Weeks run Monday to Sunday. The current week is marked <i>in progress</i>, last week is <i>settling</i> for two days because Meta spend lands late and lifetime attribution keeps adding orders.</p>
  <h3>Hook variants</h3>
  <p>All hooks and cuts of one creative ID (NK624 H1, H2, H3...) are grouped into one card. Open the card to see each variant, each market, the full ad name and a link to the ad in Ads Manager.</p>
  </div>`;
}

/* ---------------- drawer ---------------- */
function openConcept(key, kind, onlyStore) {
  let ads = adsFor(S.week).filter(a => (a.concept_id || a.clean) === key);
  if (onlyStore) ads = adsFor(S.week, true).filter(a => (a.concept_id || a.clean) === key && a.s === onlyStore);
  const c = concepts(ads)[0]; if (!c) return;
  const hist = D.weeks.filter(w => !w.partial).reverse().map(w => { const cc = concepts(adsFor(w.start).filter(a => (a.concept_id || a.clean) === key))[0]; return {w, cc}; });
  const act = (c.thumb || '').match(/act_(\d+)/);
  const variants = c.ads.slice().sort((a, b) => b.sp - a.sp);
  const tags = ['product','format','angle','hook_tactic','structure','funnel','creator'].map(k => c[k] && `<span class="pill">${esc(c[k])}</span>`).filter(Boolean).join(' ');
  $('#drawer').innerHTML = `<button class="close" id="dClose">✕</button><div class="dr-head"><img src="${esc(c.thumb || '')}" alt=""><div style="min-width:0">
    <div class="id muted" style="font-size:12px">${esc(c.id || '')} · ${c.kind === 'VID' ? 'Video' : 'Static'} ${c.launched ? '· launched ' + fmtDate(c.launched) : ''}</div><h3>${esc(c.title)}</h3>
    <div class="muted" style="font-size:12.5px">${esc([c.editor && 'Editor ' + c.editor, c.designer && 'Designer ' + c.designer, c.strategist && 'Strategist ' + c.strategist].filter(Boolean).join(' · '))}</div>
    <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap"><span class="pill ${ROLE[c.role][1]}">${ROLE[c.role][0]}</span> ${tags}</div></div></div>
    <div class="dr-body">${roas3(c.r)}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;font-size:12px">
      <div class="card" style="padding:10px"><div class="muted">Spend</div><b class="num">${money(c.sp)}</b></div>
      <div class="card" style="padding:10px"><div class="muted">${MODELS[S.model]} rev</div><b class="num">${money(revOf(c))}</b></div>
      <div class="card" style="padding:10px"><div class="muted">FC orders</div><b class="num">${int(c.fco)}</b></div>
      <div class="card" style="padding:10px"><div class="muted">CTR</div><b class="num">${pct(c.ctr)}</b></div></div>
    <h2 class="sec" style="font-size:20px">Week by week <small>${MODELS[S.model]} ROAS</small></h2>
    <div class="card chart-card"><div class="chart-wrap" style="height:160px"><canvas id="chDr"></canvas></div></div>
    <h2 class="sec" style="font-size:20px">Variants &amp; markets</h2>
    ${variants.map(a => `<div class="card" style="padding:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${FLAGS[a.s]} ${a.s} ${esc(a.hook || '')}</b>
      <span class="num" style="font-size:12px">Spend ${money(conv(a.sp, a.s))} · FC <b style="color:var(--gold)">${x2(a.fc / a.sp)}</b> · Triple ${x2(a.ta / a.sp)} · Platform ${x2(a.pr / a.sp)}</span></div>
      <div class="name-box">${esc(a.n)}</div><div style="display:flex;gap:6px"><button class="btn ghost sm" data-copy="${esc(a.n)}">Copy name</button>
      ${act && a.id ? `<a class="btn ghost sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act[1]}&selected_ad_ids=${encodeURIComponent(a.id)}">Open in Ads Manager ↗</a>` : ''}</div></div>`).join('')}
    </div>`;
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open');
  $('#dClose').onclick = closeDrawer;
  $('#drawer').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; });
  if (charts.dr) charts.dr.destroy();
  charts.dr = new Chart($('#chDr'), {type:'bar', data:{labels:hist.map(x => fmtDate(x.w.start)), datasets:[{data:hist.map(x => x.cc ? +x.cc.r[S.model].toFixed(2) : null), backgroundColor:hist.map(x => x.w.start === S.week ? '#c7b48b' : '#b3985f66'), borderRadius:4, maxBarThickness:26}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:i => { const cc = hist[i.dataIndex].cc; return cc ? `ROAS ${x2(cc.r[S.model])} · spend ${money(cc.sp)}` : 'not live'; }}}},
      scales:{x:{grid:{display:false}, ticks:{color:'#8a8a94', font:{size:10}}}, y:{grid:{color:'#2a2a31'}, ticks:{color:'#8a8a94'}}}}});
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ---------------- boot ---------------- */
async function start(pw, remember) {
  D = await unlock(pw);
  if (remember) LS('nkhub.pw', pw);
  const firstComplete = D.weeks.find(w => !w.partial) || D.weeks[0];
  S.week = firstComplete.start;
  readHash();
  $('#lock').classList.add('hidden'); $('#app').classList.remove('hidden');
  buildShell(); render();
}
$('#lockForm').onsubmit = async e => {
  e.preventDefault(); $('#lockErr').textContent = 'Unlocking...';
  try { await start($('#pw').value, $('#remember').checked); } catch (err) { $('#lockErr').textContent = err.message; }
};
const saved = LS('nkhub.pw');
if (saved) start(saved, true).catch(() => { LS('nkhub.pw', null); $('#lockErr').textContent = ''; });
})();
