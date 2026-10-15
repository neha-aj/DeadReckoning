/* Interface: HUD, five tabs, and every sheet (horde alert, loot, comms, SOS...). */
(function () {
  const DR = window.DR, G = DR.geo, C = window.DR_CATALOG;
  const ui = DR.ui = {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = () => DR.state;
  ui.tab = 'route';
  ui.extra = {};   // crew & guide live in ui-crew.js
  let plans = null, plansDirty = true, supFilter = 'near', draft = '', attachLoc = true, packWho = null, placing = null;

  // ---------- small helpers ----------
  ui.toast = text => {
    const d = document.createElement('div'); d.textContent = text; $('toast').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  };
  ui.modal = (html, cls = '') => {
    const m = $('modal'); m.innerHTML = `<div class="sheet ${cls}">${cls.includes('noclose') ? '' : '<button class="close" data-act="close">✕</button>'}${html}</div>`;
    m.classList.remove('hidden');
    return m.firstChild;
  };
  ui.close = () => { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; DR.comms.stopScan(); DR.comms.sonicStop(); };
  const sw = (on, act) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${on}"></button>`;
  const placeName = p => p.name || C.sub[p.sub] || 'Unnamed place';
  const riskWord = r => r < 0.08 ? ['LOW', 'ok'] : r < 0.3 ? ['MED', 'warn'] : ['HIGH', 'bad'];
  const stockPips = n => `<span class="stock">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const dirFromMe = (lat, lng) => `${G.fmtDist(G.dist(S().pos[0], S().pos[1], lat, lng))} ${G.compass(G.bearing(S().pos[0], S().pos[1], lat, lng))}`;
  const turnIcon = t => /left/i.test(t) ? (/sharp/i.test(t) ? '↰' : '⬅') : /right/i.test(t) ? (/sharp/i.test(t) ? '↱' : '➡') : '⬆';
  ui.invalidatePlans = () => { plansDirty = true; };

  // ---------- HUD ----------
  ui.hud = () => {
    const s = S(), left = s.deadline ? s.deadline - s.clock : null, sv = DR.survival();
    const cb = $('c-beacon'); cb.className = 'chip beacon' + (left != null && left < 30 ? ' crit' : '');
    cb.querySelector('.v').textContent = left == null ? 'NO TIME SET' : left > 0 ? DR.dur(left) : 'CLOSED';
    const cs = $('c-survive'), icon = { water: '💧', food: '🍞', battery: '🔋' }[sv.limit];
    if (!s.packLogged) { cs.className = 'chip warn'; cs.querySelector('.v').textContent = 'LOG PACK'; }
    else { cs.className = 'chip' + (sv.hours < 0.5 ? ' crit' : sv.hours < 1.2 ? ' warn' : ' ok'); cs.querySelector('.v').textContent = `${icon} ${DR.dur(sv.hours * 60)}`; }
    $('c-clock').querySelector('.v').textContent = `${DR.date(s.clock)} ${DR.hhmm(s.clock)} ${DR.isNight(s.clock) ? '☾' : '☀'}`;
    const cbat = $('c-batt'); cbat.className = 'chip opt' + (s.battery < 20 ? ' crit' : s.battery < 35 ? ' warn' : '');
    cbat.querySelector('.v').textContent = `🔋 ${Math.round(s.battery)}%`;
    const net = $('c-net'), online = navigator.onLine;
    net.className = 'chip opt' + (online ? ' ok' : ' crit');
    net.querySelector('.v').textContent = online ? 'ONLINE' : 'NO NET';
    net.querySelector('label').textContent = DR.DRILL ? 'Position · drill' : s.mode === 'gps' ? 'Position · GPS' : 'Position · manual';
    $('b-play').textContent = s.running ? '❚❚' : '▶';
    $('b-play').classList.toggle('on', s.running);
    $('b-speed').value = String(s.speed);
    document.querySelectorAll('.drill-only').forEach(e => e.classList.toggle('hidden', !DR.DRILL));
    const unread = s.alerts.filter(a => !a.read && a.lvl === 'danger').length, n = $('b-alerts').querySelector('.n');
    n.textContent = unread; n.classList.toggle('hidden', !unread);
    document.body.classList.toggle('night', DR.isNight(s.clock));
    // keep the advisor strip just under the HUD, however the HUD wraps
    const sen = $('sentinel');
    if (innerWidth > 860) sen.style.top = Math.round($('hud').getBoundingClientRect().bottom + 8) + 'px'; else sen.style.top = '';
  };

  // ---------- tabs ----------
  ui.show = tab => {
    ui.tab = tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    for (const t of ['route', 'supplies', 'pack', 'crew', 'intel', 'guide']) $('tab-' + t).classList.toggle('hidden', t !== tab);
    ui.render(tab);
  };
  ui.render = (tab = ui.tab) => {
    const f = { route: renderRoute, supplies: renderSupplies, pack: renderPack, intel: renderIntel }[tab] || ui.extra[tab];
    if (f) f();
  };

  // ===== ROUTE =====
  const timeInput = t => t ? DR.hhmm(t) : '';
  function travelPicker(km) {
    const s = S();
    return `<div class="seg" style="grid-template-columns:repeat(3,1fr);margin:10px 0 4px">${Object.values(DR.TRAVEL).map(m => {
      const chk = DR.travelCheck(m.id, km);
      return `<button class="${s.travel === m.id ? 'on' : ''}" data-act="travel" data-k="${m.id}" ${chk.ok || s.travel === m.id ? '' : 'style="opacity:.45"'} title="${esc(chk.why || '')}">${m.icon} ${m.label}</button>`;
    }).join('')}</div>${(() => { const why = Object.values(DR.TRAVEL).map(m => [m, DR.travelCheck(m.id, km)]).filter(([, c]) => !c.ok); return why.length ? `<div class="muted tiny" style="margin:4px 2px 0">${why.map(([m, c]) => `${m.icon} ${esc(c.why)}`).join('<br>')}</div>` : ''; })()}`;
  }
  function positionCard() {
    const s = S();
    if (DR.DRILL) return `<div class="card"><div class="row between"><div><b>🧪 Drill mode</b><div class="muted small">Simulated walking and time. Your live data is untouched.</div></div><button class="btn sm" data-act="drill-off">Back to live</button></div></div>`;
    const g = DR.app.gpsInfo || { state: 'off' }, col = { ok: 'var(--green)', searching: 'var(--amber)', outside: 'var(--amber)', error: '#ff7d93' }[g.state];
    return `<div class="card"><div class="row between"><div><b>📍 Where are you?</b><div class="muted small">${s.mode === 'manual' ? 'Set by hand: tap 📍 I\'m here, then tap the map' : 'Using GPS'}</div>
      ${g.text ? `<div class="small" style="color:${col};margin-top:4px">${g.state === 'ok' ? '🛰 ' : g.state === 'searching' ? '⏳ ' : '⚠ '}${esc(g.text)}</div>` : ''}</div>
      <div class="row"><button class="btn sm ${s.mode === 'gps' ? 'primary' : ''}" data-act="mode-gps">GPS</button><button class="btn sm ${s.mode === 'manual' ? 'primary' : ''}" data-act="setpos">📍 I'm here</button></div></div></div>`;
  }
  function renderRoute() {
    const s = S(), el = $('tab-route');
    if (!DR.active) {
      const crow = G.dist(s.pos[0], s.pos[1], DR.BEACON.lat, DR.BEACON.lng);
      if (plansDirty || !plans) { plans = DR.planAll(); plansDirty = false; DR.mapview.drawAlternatives(plans); }
      const sv = DR.survival();
      el.innerHTML = `
        ${positionCard()}
        <h2>DESTINATION</h2>
        <div class="card">
          <div class="title">The Last Beacon</div>
          <div class="muted small">Fortified survivor settlement · Palace Grounds · ${G.fmtDist(crow)} straight line</div>
          <div class="stats">
            <div class="stat"><label>Gates close</label><input type="time" class="input" id="gate" value="${timeInput(s.deadline)}" style="padding:4px 6px;font:700 15px var(--hud);color:var(--amber)"></div>
            <div class="stat"><label>Sunset today</label><b>${DR.hhmm(DR.SUNSET)}</b></div>
            <div class="stat"><label>Supplies last</label><b class="${s.packLogged && sv.hours < 1 ? 'bad' : ''}">${s.packLogged ? DR.dur(sv.hours * 60) : '—'}</b></div>
          </div>
          <div class="muted tiny">Gate time comes from the settlement's FM broadcast. Clear it if you don't know.</div>
          ${travelPicker(crow / 1000 * 1.3)}
        </div>
        ${!s.packLogged ? '<div class="card" style="border-color:var(--amber)"><b>Log what you carry first</b><div class="muted small">Water and food decide which route is safe. PACK tab → add items, or use the go-bag preset.</div><div class="btns"><button class="btn sm primary" data-act="gotab" data-k="pack">Open PACK</button></div></div>' : ''}
        <h2>CHOOSE A ROUTE <span class="x">${plans.length} options · scored on survival</span></h2>
        ${plans.map((p, i) => planCard(p, i, 'go')).join('') || '<div class="card">No route found. Every way is blocked: get indoors and wait for the horde to move.</div>'}
        <div class="btns"><button class="btn" data-act="shelter">⛨ Nearest shelter</button><button class="btn" data-act="replan">↻ Re-plan</button></div>
        <p class="faint tiny body">Routes are computed on the phone from the bundled street map. Danger comes from cached intel, your reports, survivors' posts and the time of day.</p>`;
      $('gate')?.addEventListener('change', e => {
        const v = e.target.value;
        if (!v) s.deadline = null;
        else { const [h, m] = v.split(':').map(Number); let t = Math.floor(s.clock / 1440) * 1440 + h * 60 + m; if (t < s.clock - 60) t += 1440; s.deadline = t; }
        plansDirty = true; DR.emit('route');
      });
      return;
    }
    const p = DR.active, r = s.route, cur = DR.currentStep();
    const doneM = r.progress, pct = Math.min(100, doneM / p.dist * 100), arrived = doneM >= p.dist - 1;
    const eta = s.clock + (p.dist - doneM) / 1000 / DR.pace() * 60;
    const lateBy = s.deadline ? eta - s.deadline : -Infinity;
    const toBeacon = r.dest.name === DR.BEACON.name;
    if (arrived) {
      el.innerHTML = `<div class="card rec"><div class="title">✓ Arrived: ${esc(r.dest.name)}</div><div class="muted small">${DR.hhmm(s.clock)} · ${DR.TRAVEL[s.travel].label}</div>
        <ol class="gsteps" style="margin-top:12px">${(toBeacon ? ['Stop 100 m out, behind cover. Watch the gate for a minute.', 'Approach from the south road with hands visible. No weapons in hand.', 'Knock three times, say your names and how many you are.', 'Tell them at once about any bites, scratches or fever in your group.']
          : ['Check two exits before you settle.', 'Block the door you came in through.', 'No light visible from outside.', 'One sleeps, one watches: see the watch rota in CREW.', 'Post this place to the community if it is safe.']).map(x => `<li>${x}</li>`).join('')}</ol>
        <div class="btns"><button class="btn primary" data-act="change">Done · plan next move</button>${toBeacon ? '' : '<button class="btn" data-act="post-safe">🏠 Post as safe spot</button>'}</div></div>`;
      return;
    }
    el.innerHTML = `
      ${positionCard()}
      <div class="card rec">
        <div class="row between"><span class="badge amber">${DR.TRAVEL[s.travel].icon} ${DR.PROFILES[p.profile].label}${p.kind === 'hide' ? ' · VIA SHELTER' : ''}</span><span class="badge ${s.walking ? 'green' : 'grey'}">${s.walking ? '● MOVING' : '❚❚ STOPPED'}</span></div>
        ${cur ? `<div class="nav" style="margin-top:12px">
          <div class="arrow">${turnIcon(cur.step.turn)}</div>
          <div><div class="in">${G.fmtDist(Math.max(0, cur.left))}</div><div class="on">${esc(cur.step.turn)} · ${esc(cur.step.label)}</div>
          ${cur.next ? `<div class="muted small">then ${esc(cur.next.turn.toLowerCase())} onto ${esc(cur.next.label)}</div>` : `<div class="muted small">then ${esc(r.dest.name)}</div>`}</div>
        </div>` : ''}
        <div style="margin:14px 0 6px" class="bar amber"><i style="width:${pct}%"></i></div>
        <div class="row between small"><span class="muted">${G.fmtDist(doneM)} done</span><span>${G.fmtDist(p.dist - doneM)} to go · ETA <b>${DR.hhmm(eta)}</b></span></div>
        ${s.deadline && toBeacon ? `<div class="verdict ${lateBy > 0 ? 'bad' : ''}" style="margin-top:10px">${lateBy > 0 ? `⚠ At this pace you arrive ${DR.dur(lateBy)} after the gates close. Shelter for the night instead?` : `✓ ${DR.dur(-lateBy)} to spare before the gates close`}</div>` : ''}
        ${p.via && !r.viaDone ? `<div class="small" style="margin-top:8px">🎒 Restock stop: <b>${esc(placeName(p.via))}</b> <span class="muted">(${C.sub[p.via.sub] || 'community tip'})</span></div>` : ''}
        <div class="btns">
          ${DR.DRILL ? (s.walking ? '<button class="btn danger" data-act="stop">❚❚ STOP</button>' : '<button class="btn go" data-act="walk">▶ WALK</button>')
            : s.mode === 'gps' ? '<span class="muted small" style="align-self:center">Following your GPS</span>' : '<button class="btn go" data-act="reached">✓ Reached this turn</button>'}
          <button class="btn" data-act="change">✕ End route</button>
        </div>
      </div>
      <div class="card">
        <div class="toggle"><div><div class="t">🤫 Stealth movement</div><div class="d">Quieter, slower (−15% speed). Use near hordes.</div></div>${sw(s.stealth, 'stealth')}</div>
        <div class="toggle"><div><div class="t">⛁ Ration mode</div><div class="d">Eat and drink 40% less. You get a little slower.</div></div>${sw(s.ration, 'ration')}</div>
      </div>
      <h2>DIRECTIONS <span class="x">${p.steps.length} steps · ${G.fmtDist(p.dist)}</span></h2>
      <ul class="steps">${p.steps.map(st => {
        const done = st.from + st.dist <= doneM, isCur = cur && st === cur.step;
        return `<li class="${done ? 'done' : ''} ${isCur ? 'cur' : ''}"><span>${turnIcon(st.turn)}</span><span>${esc(st.turn)} · ${esc(st.label)}</span><span class="d">${G.fmtDist(st.dist)}</span></li>`;
      }).join('')}<li><span>◆</span><span style="color:var(--amber)">${esc(r.dest.name)}</span></li></ul>`;
  }
  function planCard(p, i, act) {
    const prof = DR.PROFILES[p.profile], [rw, rc] = riskWord(p.risk);
    const title = p.title || prof.label;
    return `<div class="card click ${p.recommended ? 'rec' : ''} ${p.feasible ? '' : 'bad'}" data-act="pick" data-i="${i}" data-mode="${act}">
      <div class="row"><div class="route-ico">${p.icon || prof.icon}</div><div style="flex:1"><div class="title">${esc(title)}</div>
        <div class="muted small">${p.kind === 'hide' ? `Wait in ${esc(placeName(p.shelter))} (${C.shelter[p.shelter.sub][1].toLowerCase()})` : p.via ? `Stop at ${esc(placeName(p.via))} · ${C.sub[p.via.sub] || ''}` : prof.desc}</div></div>
        ${p.recommended ? '<span class="badge amber">★ BEST</span>' : ''}</div>
      <div class="stats">
        <div class="stat"><label>${DR.TRAVEL[S().travel].icon} Time</label><b>${DR.dur(p.walkMin)}</b></div>
        <div class="stat"><label>Distance</label><b>${G.fmtDist(p.dist)}</b></div>
        <div class="stat"><label>Danger</label><b class="${rc}">${rw}</b></div>
        <div class="stat"><label>Open road</label><b class="${p.exposedPct > 0.5 ? 'warn' : ''}">${Math.round(p.exposedPct * 100)}%</b></div>
        <div class="stat"><label>Water left</label><b class="${p.end.water < 0 ? 'bad' : p.end.water < 0.3 ? 'warn' : 'ok'}">${Math.max(0, p.end.water).toFixed(1)} L</b></div>
        <div class="stat"><label>Arrive</label><b class="${p.deadlineOK ? '' : 'bad'}">${DR.hhmm(p.arrive)}</b></div>
      </div>
      <div class="verdict ${p.feasible ? '' : 'bad'}">${p.feasible ? '✓' : '✕'} ${esc(p.verdict)}</div>
    </div>`;
  }
  ui.selectPlan = p => { if (!DR.active) { DR.mapview.drawAlternatives([p]); } };

  // ===== SUPPLIES =====
  function renderSupplies() {
    const s = S(), el = $('tab-supplies'), need = DR.need(), sv = DR.survival();
    const counts = {}; for (const p of DR.allPlaces()) counts[p.cat] = (counts[p.cat] || 0) + 1;
    let list = DR.allPlaces().filter(p => DR.mapview.cats.has(p.cat));
    if (supFilter === 'route' && DR.active) {
      const pts = DR.active.path.filter((_, i) => i % 3 === 0 && DR.active.cum[i] >= s.route.progress);
      list = list.filter(p => pts.some(i => G.dist(p.lat, p.lng, G.graph.lat[i], G.graph.lng[i]) < 160));
    }
    list = list.map(p => ({ p, d: G.dist(s.pos[0], s.pos[1], p.lat, p.lng) })).sort((a, b) => a.d - b.d).slice(0, 30);
    el.innerHTML = `
      <div class="card ${sv.hours < 1 ? 'bad' : ''}">
        <div class="row between"><div><div class="muted tiny" style="letter-spacing:.16em">RUNS OUT FIRST</div><div class="title">${need.label.toUpperCase()} <span class="muted small">${need.key === sv.limit ? '· lasts ' + DR.dur(sv[sv.limit] * 60) : ''}</span></div></div>
        <button class="btn sm primary" data-act="need">Show nearest</button></div>
      </div>
      <h2>SUPPLY MAP <span class="x">${DR.allPlaces().length.toLocaleString()} places recorded</span></h2>
      <div class="chips">${Object.entries(C.placeCats).map(([k, v]) => `<button class="fchip ${DR.mapview.cats.has(k) ? 'on' : ''}" style="--c:${v.color}" data-act="cat" data-k="${k}">${v.icon} ${v.label} <b>${counts[k] || 0}</b></button>`).join('')}</div>
      <div class="row" style="margin:12px 0 4px"><button class="btn sm ${supFilter === 'near' ? 'primary' : ''}" data-act="sf" data-k="near">Near us</button><button class="btn sm ${supFilter === 'route' ? 'primary' : ''}" data-act="sf" data-k="route" ${DR.active ? '' : 'disabled'}>Along my route</button></div>
      ${list.map(({ p, d }) => placeCard(p, d)).join('') || '<div class="card muted">Nothing here with these filters.</div>'}
      <p class="small" style="margin:8px 2px">Colours on the map: <span style="color:#f472b6">● medical</span> <span style="color:#fbbf24">● food</span> <span style="color:#38bdf8">● water</span> <span style="color:#a3e635">● tools/weapons</span> <span style="color:#c084fc">● clothes</span> <span style="color:#2dd4bf">● power</span> <span style="color:#94a3b8">● shelter</span> · <a href="#" data-act="legend" style="color:var(--cyan)">full legend</a></p>
      <p class="faint tiny body">Store locations are from OpenStreetMap, saved before the network died. Stock and "last recorded" come from pre-blackout crowd maps and from what you and other survivors mark.</p>`;
  }
  function placeCard(p, d, compact) {
    const st = DR.placeStatus(p), cat = C.placeCats[p.cat], loot = (C.loot[p.sub] || []).slice(0, 4);
    const shel = C.shelter[p.sub];
    return `<div class="card" style="border-left:3px solid ${cat.color}">
      <div class="row between"><div style="min-width:0"><div class="title" style="font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat.icon} ${esc(placeName(p))}</div>
        <div class="muted small">${C.sub[p.sub] || p.sub} · ${d != null ? G.fmtDist(d) + ' ' + G.compass(G.bearing(S().pos[0], S().pos[1], p.lat, p.lng)) : ''}</div></div>
        <div style="text-align:right">${stockPips(st.stock)}<div class="tiny muted">${['EMPTY', 'LOW', 'SOME', 'STOCKED'][st.stock]}</div></div></div>
      <div class="tiny muted" style="margin-top:6px">Last recorded ${DR.stamp(st.seen)} (${DR.ago(st.seen)}) · ${esc(st.by)}${st.danger ? ' · <span style="color:var(--red)">in hot zone</span>' : ''}</div>
      ${shel ? `<div class="small" style="margin-top:6px">⛨ Shelter rating <b>${Math.round(shel[0] * 10)}/10</b> <span class="muted">· ${shel[1]}</span></div>` : ''}
      ${loot.length ? `<div class="chips" style="margin-top:8px">${loot.map(id => `<span class="fchip">${C.cats[DR.item(id).cat].icon} ${esc(DR.item(id).name)}</span>`).join('')}</div>` : ''}
      <div class="btns">
        ${p.cat === 'SHEL' ? `<button class="btn sm" data-act="goto" data-id="${p.id}">⛨ Go here</button>` : `<button class="btn sm" data-act="via" data-id="${p.id}">🎒 Stop here</button>`}
        ${loot.length ? `<button class="btn sm" data-act="loot" data-id="${p.id}">Loot</button>` : ''}
        <button class="btn sm" data-act="mark" data-id="${p.id}">Update</button>
      </div></div>`;
  }
  const placeById = id => DR.allPlaces().find(p => p.id === id);
  ui.placePopup = (p, latlng) => {
    L.popup({ maxWidth: 320 }).setLatLng(latlng).setContent(`<div style="margin:-4px -2px">${placeCard(p, G.dist(S().pos[0], S().pos[1], p.lat, p.lng))}</div>`).openOn(DR.mapview.map);
  };

  // ===== PACK (supplies of the whole group) =====
  const GOBAG = [['water1l', 2], ['purify', 1], ['bar', 4], ['chikki', 2], ['firstaid', 1], ['ors', 3], ['painkiller', 1], ['torch', 1], ['lighter', 1], ['powerbank', 1], ['raincoat', 1], ['lathi', 1], ['soap', 1], ['binbags', 2]];
  ui.essentials = () => {
    const s = S(), t = DR.totals(), st = DR.stashTotals(), n = s.team.length;
    return C.essentials.map(([id, label, hint, per]) => {
      const need = per ? (id === 'water1l' ? 2 * n : n) : 1;
      const have = id === 'WEAPON' ? t.weapons.length : id === 'water1l' ? t.water : id === 'raincoat' ? (t.items.raincoat || 0) + (t.items.binbags || 0) : id === 'purify' ? (t.items.purify || 0) + (t.items.bleach || 0)
        : id === 'firstaid' ? (t.items.firstaid || 0) + Math.min(t.items.bandage || 0, t.items.antiseptic || 0) : id === 'lighter' ? (t.items.lighter || 0) + (t.items.matches || 0)
        : id === 'soap' ? (t.items.soap || 0) + (t.items.sanitiser || 0) : id === 'tarp' ? (t.items.tarp || 0) + (t.items.blanket || 0) : (t.items[id] || 0);
      return { id, label, hint, need, have, ok: have >= need, atBase: id !== 'WEAPON' && (st.items[id] || 0) > 0 };
    });
  };
  function itemRows(rows, owner) {
    const groups = {};
    for (const row of rows) { const it = DR.item(row[0]); if (it) (groups[it.cat] = groups[it.cat] || []).push([it, row[1]]); }
    const fmtQ = (it, q) => it.water || it.fuel ? q.toFixed(1) : Number.isInteger(q) ? q : q.toFixed(1);
    return Object.keys(C.cats).filter(k => groups[k]).map(k => `<h2>${C.cats[k].icon} ${C.cats[k].label.toUpperCase()} <span class="x">${groups[k].reduce((a, [it, q]) => a + (it.vehicle ? 0 : it.kg * q), 0).toFixed(1)} kg</span></h2>
      ${groups[k].map(([it, q]) => `<div class="item" style="--c:${C.cats[k].color}"><div class="ic">${C.cats[k].icon}</div>
        <div style="min-width:0"><div class="nm">${esc(it.name)}</div><div class="sub">${it.vehicle ? 'ridden' : (it.kg * q).toFixed(2) + ' kg'}${it.weapon ? ' · weapon' : ''}${it.water ? ` · ${(it.water * q).toFixed(1)} L` : ''}${it.kcal ? ` · ${Math.round(it.kcal * q)} kcal` : ''}${it.note ? ' · ' + esc(it.note) : ''}</div></div>
        <div class="qty"><button data-act="q" data-o="${owner}" data-id="${it.id}" data-d="-1" title="Used / dropped one">−</button><span>${fmtQ(it, q)}</span><button data-act="q" data-o="${owner}" data-id="${it.id}" data-d="1">+</button><button data-act="give" data-o="${owner}" data-id="${it.id}" title="Move to someone else or the stash">⇄</button></div></div>`).join('')}`).join('');
  }
  function renderPack() {
    const s = S(), el = $('tab-pack');
    packWho = packWho && (packWho === 'stash' || DR.person(packWho)) ? packWho : s.me;
    const sv = DR.survival(), t = DR.totals(), st = DR.stashTotals(), ho = DR.holdout(), ess = ui.essentials(), miss = ess.filter(e => !e.ok);
    const p = packWho === 'stash' ? null : DR.person(packWho);
    el.innerHTML = `
      <div class="chips" style="margin-bottom:10px">${s.team.map(x => `<button class="fchip ${x.id === packWho ? 'on' : ''}" data-act="who" data-id="${x.id}">${x.id === s.me ? '👤' : '🧍'} ${esc(x.name)} <b>${DR.packKg(x).toFixed(1)} kg</b></button>`).join('')}
        <button class="fchip ${packWho === 'stash' ? 'on' : ''}" style="--c:#fdba74" data-act="who" data-id="stash">🏠 Stash <b>${s.stash.length}</b></button>
        <button class="fchip" data-act="addperson">＋ Person</button></div>
      <div class="card">
        <div class="row between"><b>GROUP SUPPLIES · ${s.team.length} people</b><span class="muted tiny">carried${s.stash.length ? ' + stash' : ''}</span></div>
        <div class="gauges" style="margin-top:10px">
          ${[['water', '💧', 'Water'], ['food', '🍞', 'Food'], ['battery', '🔋', 'Phone']].map(([k, i, l]) => `<div class="gauge ${s.packLogged && sv.limit === k ? 'lim' : ''} ${s.packLogged && sv[k] < 0.5 ? 'crit' : ''}"><div class="i">${i}</div><b>${s.packLogged ? DR.dur(sv[k] * 60) : '—'}</b><small>${l} on the move</small></div>`).join('')}
        </div>
        <div class="stats" style="grid-template-columns:repeat(4,1fr)">
          <div class="stat"><label>Water</label><b>${(t.water + st.water).toFixed(1)} L</b></div>
          <div class="stat"><label>Food</label><b>${Math.round((t.kcal + st.kcal) / 100) / 10}k kcal</b></div>
          <div class="stat"><label>Hold out</label><b class="${Math.min(ho.water, ho.food) < 1 ? 'warn' : ''}">${Math.min(ho.water, ho.food).toFixed(1)} d</b></div>
          <div class="stat"><label>Armed</label><b class="${t.weapons.length < s.team.length ? 'warn' : 'ok'}">${t.weapons.length}/${s.team.length}</b></div>
        </div>
        <div class="muted tiny">"Hold out" = days the group can stay hidden at rest on everything you have (2.5 L water, 1,800 kcal per person per day).</div>
        ${!s.packLogged ? '<div class="btns"><button class="btn primary" data-act="gobag">Log a typical go-bag for me</button><button class="btn" data-act="additem">＋ Add items</button></div>' : ''}
      </div>
      <details class="card" ${miss.length ? 'open' : ''}><summary class="title" style="cursor:pointer;font-size:16px">${miss.length ? `⚠ ${miss.length} essentials missing` : '✓ All essentials covered'}</summary>
        ${ess.map(e => `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)"><div><span style="color:${e.ok ? 'var(--green)' : 'var(--red)'}">${e.ok ? '✓' : '✕'}</span> ${esc(e.label)} <span class="muted tiny">${e.id === 'water1l' ? e.have.toFixed(1) + '/' + e.need + ' L' : Math.floor(e.have) + '/' + e.need}${e.hint ? ' · ' + esc(e.hint) : ''}${e.atBase ? ' · some at stash' : ''}</span></div>
          ${e.ok ? '' : `<button class="btn sm" data-act="finditem" data-id="${e.id === 'WEAPON' ? 'lathi' : e.id}">Find</button>`}</div>`).join('')}
      </details>
      ${p ? `<div class="card">
        <div class="row between"><div><b>${esc(p.name)}</b> <span class="muted small">${esc(p.role)}${p.medical ? ' · ' + esc(p.medical) : ''}</span></div><button class="btn sm" data-act="editperson" data-id="${p.id}">Edit</button></div>
        <div class="row between small" style="margin-top:8px"><span>Load ${DR.packKg(p).toFixed(1)} / ${DR.packLimit(p).toFixed(1)} kg</span><span class="muted">pace ${DR.pace().toFixed(1)} km/h (group)</span></div>
        <div class="bar ${DR.packKg(p) > DR.packLimit(p) ? 'red' : 'green'}" style="margin:6px 0 10px"><i style="width:${Math.min(100, DR.packKg(p) / DR.packLimit(p) * 100)}%"></i></div>
        <div class="row between small"><span>❤ Health</span><span>${Math.round(p.health)}%</span></div>
        <div class="bar ${p.health < 40 ? 'red' : 'green'}" style="margin-top:6px"><i style="width:${p.health}%"></i></div>
        <div class="btns"><button class="btn sm" data-act="drink">💧 Drank 250 ml</button><button class="btn sm" data-act="eat">🍞 Ate a meal</button><button class="btn sm" data-act="heal">✚ Treat wound</button></div>
      </div>
      <div class="btns"><button class="btn primary" data-act="additem">＋ Add / found item</button><button class="btn" data-act="balance">⇄ Balance loads</button></div>
      ${itemRows(p.pack, p.id) || '<div class="card muted small">Nothing logged for ' + esc(p.name) + '.</div>'}`
      : `<div class="card"><b>🏠 Stash</b><div class="muted small">${s.base ? `At ${esc(s.base.name)} · ${dirFromMe(s.base.lat, s.base.lng)}` : 'Supplies you keep at your hideout instead of carrying.'}</div>
        <div class="btns"><button class="btn sm" data-act="setbase">📍 Stash is here</button><button class="btn sm primary" data-act="additem">＋ Add to stash</button></div></div>
        ${itemRows(s.stash, 'stash') || '<div class="card muted small">Stash is empty.</div>'}`}
      <h2>SUPPLY LOG <span class="x">last ${Math.min(12, s.supplyLog.length)}</span></h2>
      ${s.supplyLog.slice(0, 12).map(l => `<div class="row between small" style="padding:6px 2px;border-bottom:1px dashed var(--line)"><span>${{ added: '＋', used: '−', moved: '⇄', looted: '🎒', dropped: '✕' }[l.act] || '·'} ${esc(DR.item(l.item)?.name || l.item)} × ${l.q} <span class="muted">${esc(l.who)}${l.where ? ' · ' + esc(l.where) : ''}</span></span><span class="muted tiny">${DR.stamp(l.t)}</span></div>`).join('') || '<div class="muted small">Every add, use, loot and hand-over is logged here.</div>'}
      <h2>POWER</h2>
      <div class="card">
        <div class="toggle"><div><div class="t">🔋 Low-power mode</div><div class="d">Dims the screen and slows updates. Battery lasts about 2× longer.</div></div>${sw(s.lowPower, 'lowpower')}</div>
        <div class="toggle"><div><div class="t">⛁ Ration mode</div><div class="d">Eat and drink 40% less.</div></div>${sw(s.ration, 'ration')}</div>
        <div class="muted tiny">${s.realBattery ? 'Battery level read from this phone.' : 'This browser does not report battery: estimated.'} ${DR.DRILL ? '' : 'Supplies change only when you log them.'}</div>
      </div>`;
  }

  // ===== COMMS =====
  ui.renderLink = renderComms;
  function renderComms(el) {
    const s = S(), me = DR.person(s.me);
    const other = s.team.find(x => x.id !== s.me) || { name: 'your crew', role: '' };
    const quick = ['Safe, moving', 'Need water', 'Horde near me', 'Hiding, stay away', 'Meet at rendezvous', 'Found supplies'];
    el.innerHTML = `
      <h2>CHANNELS <span class="x">no cell network needed</span></h2>
      <div class="channels">
        <div class="channel"><span class="st ok">READY</span><b>▣ QR Burst</b><small>Screen → camera. Silent. Full plan sync.</small></div>
        <div class="channel"><span class="st ${navigator.mediaDevices ? 'ok' : 'no'}">${navigator.mediaDevices ? 'READY' : 'NO MIC'}</span><b>〰 Sonic Link</b><small>Data over sound, 3–8 m, works through doors.</small></div>
        <div class="channel"><span class="st ok">READY</span><b>✦ Light Morse</b><small>Screen + torch. Line of sight, far at night.</small></div>
        <div class="channel"><span class="st hw">HARDWARE</span><b>🛰 Satellite</b><small>inReach / phone sat-SOS. Packets queue for it.</small></div>
        <div class="channel"><span class="st hw">HARDWARE</span><b>⌁ LoRa mesh</b><small>Meshtastic radio, ~2–10 km. Queued.</small></div>
        <div class="channel"><span class="st ${navigator.onLine ? 'ok' : 'no'}">${navigator.onLine ? 'UP' : 'DOWN'}</span><b>📶 Cell / Wi-Fi</b><small>${navigator.onLine ? 'Outbox will flush.' : 'Down. Everything here works without it.'}</small></div>
      </div>
      <h2>SEND <span class="x">as ${esc(me.name)}</span></h2>
      <textarea id="draft" rows="2" maxlength="80" placeholder="Short message (80 chars)…">${esc(draft)}</textarea>
      <div class="chips" style="margin:8px 0">${quick.map(q => `<button class="fchip" data-act="quick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="toggle"><div><div class="t">📍 Attach my location</div><div class="d">So ${esc(other.name)} sees you on their map.</div></div>${sw(attachLoc, 'loc')}</div>
      <div class="btns"><button class="btn" data-act="send-qr">▣ QR</button><button class="btn" data-act="send-sound">〰 Sound</button><button class="btn" data-act="send-light">✦ Light</button></div>
      <h2>RECEIVE</h2>
      <div class="btns" style="margin-top:0"><button class="btn primary" data-act="scan">▣ Scan QR</button><button class="btn primary" data-act="listen">〰 Listen</button></div>
      <h2>SQUAD</h2>
      <div class="card">
        <div class="row between"><div><b>${esc(other.name)}</b> <span class="muted small">${other.role}</span><div class="muted small">${s.friend ? `Last known: ${dirFromMe(s.friend.lat, s.friend.lng)} · ${DR.ago(s.friend.ts)}` : 'Together with you (no split reported)'}</div></div>
        ${s.friend ? `<button class="btn sm" data-act="fly" data-lat="${s.friend.lat}" data-lng="${s.friend.lng}">Show</button>` : ''}</div>
        <div class="btns"><button class="btn sm" data-act="share-loc">📍 Share location</button><button class="btn sm" data-act="sync">⇅ Sync full plan</button></div>
      </div>
      <div class="card">
        <div class="row between"><div><b>⚑ Rendezvous</b><div class="muted small">${s.rendezvous ? `${esc(s.rendezvous.name)} · ${dirFromMe(s.rendezvous.lat, s.rendezvous.lng)}${s.rendezvous.until ? ` · wait until ${DR.hhmm(s.rendezvous.until)}, then go on to the settlement` : ''}` : 'Not set. If you get separated, both go here.'}</div></div></div>
        <div class="btns"><button class="btn sm" data-act="rv">${s.rendezvous ? 'Move' : 'Set'} to best shelter</button>${s.rendezvous ? '<button class="btn sm" data-act="rv-clear">Clear</button>' : ''}</div>
      </div>
      <h2>LOG <span class="x">${s.outbox.length ? `${s.outbox.length} queued for satellite / mesh` : 'store & forward'}</span></h2>
      ${s.msgs.slice(-14).reverse().map(m => `<div class="msg ${m.dir}" style="${m.sos ? 'border-color:var(--red)' : ''}">${m.sos ? '🆘 ' : ''}${esc(m.text)}<div class="meta">${m.dir === 'in' ? '⬇ ' + esc(m.from) : '⬆ you'} · ${esc(m.ch)} · ${DR.hhmm(m.ts)}${m.loc ? ' · 📍' : ''}</div></div>`).join('') || '<div class="muted small">No messages yet.</div>'}`;
  }

  // ===== INTEL =====
  ui.zones = () => {
    const now = S().clock;
    const pts = DR.intelAll().filter(r => r.kind !== 'safe').map(r => ({ r, w: DR.intelWeight(r, now) }))
      .concat(S().threats.filter(t => t.type !== 'block').map(t => ({ r: { lat: t.lat, lng: t.lng, t: t.ts, field: true }, w: t.type === 'horde' ? 1.2 : 0.5 })));
    const names = [['K.R. Market', 12.9645, 77.5770], ['Majestic / KSR', 12.9770, 77.5720], ['Victoria Hospital', 12.9636, 77.5737], ['Chinnaswamy Stadium', 12.9794, 77.5988],
      ['Shivajinagar', 12.9840, 77.6040], ['Russell Market', 12.9862, 77.6066], ['Malleswaram', 12.9940, 77.5710], ['Gandhinagar', 12.9795, 77.5805], ['Seshadripuram', 12.9880, 77.5780],
      ['Commercial Street', 12.9850, 77.6050], ['Race Course', 12.9900, 77.5810], ['Cubbon Park', 12.9765, 77.5935], ['Vidhana Soudha', 12.9797, 77.5907], ['M.G. Road', 12.9750, 77.6070], ['Palace Grounds', 13.0000, 77.5900]];
    const zones = {};
    for (const { r, w } of pts) {
      let best = names[0], bd = Infinity;
      for (const n of names) { const d = G.dist(r.lat, r.lng, n[1], n[2]); if (d < bd) { bd = d; best = n; } }
      const z = zones[best[0]] = zones[best[0]] || { name: best[0], lat: best[1], lng: best[2], score: 0, n: 0, last: 0, field: 0 };
      z.score += w; z.n++; z.last = Math.max(z.last, r.t); if (r.field) z.field++;
    }
    return Object.values(zones).sort((a, b) => b.score - a.score);
  };
  function renderIntel() {
    const s = S(), el = $('tab-intel'), I = window.DR_INTEL;
    const zones = ui.zones(), max = zones[0]?.score || 1;
    const feed = DR.intelRaw().slice().sort((a, b) => b.t - a.t);
    const lastSync = s.intelSync || I.lastSync;
    el.innerHTML = `
      <div class="card">
        <div class="row between"><div><div class="muted tiny" style="letter-spacing:.16em">LAST ONLINE INTEL</div><div class="title">Cached ${DR.stamp(lastSync)}</div><div class="muted small">${DR.ago(lastSync)} · ${feed.length} reports · news, social, police radio, official</div></div>
        <button class="btn sm primary" data-act="intel-sync">⇅ Sync</button></div>
        <div class="toggle" style="margin-top:6px"><div><div class="t">Use intel in routing</div><div class="d">Recent reports weigh more; outbreak origins never fade.</div></div>${sw(s.useIntel, 'intel')}</div>
      </div>
      <h2>MOST AFFECTED ZONES <span class="x">routes avoid these</span></h2>
      ${zones.slice(0, 8).map((z, i) => `<div class="zone" data-act="fly" data-lat="${z.lat}" data-lng="${z.lng}"><span class="rk">${String(i + 1).padStart(2, '0')}</span>
        <div><div class="nm">${esc(z.name)}</div><div class="sub">${z.n} report${z.n > 1 ? 's' : ''}${z.field ? ` · ${z.field} from the field` : ''} · latest ${DR.ago(z.last)}</div></div>
        <div class="bar red"><i style="width:${Math.max(6, z.score / max * 100)}%"></i></div></div>`).join('')}
      <h2>FEED <span class="x">tap to locate</span></h2>
      ${feed.map(r => { const cl = s.intelCleared[r.id]; return `<div class="card click" data-act="fly" data-lat="${r.lat}" data-lng="${r.lng}" style="border-left:3px solid ${cl ? 'var(--green)' : r.kind === 'safe' ? 'var(--green)' : r.kind === 'block' ? 'var(--amber)' : 'var(--red)'};${cl ? 'opacity:.7' : ''}">
        <div class="row between"><div class="row"><span class="src">${esc(r.src)}</span><span class="muted tiny">${esc(r.who)}</span></div><span class="badge ${r.kind === 'safe' ? 'green' : r.kind === 'block' ? 'amber' : 'red'}">${r.kind === 'origin' ? 'ORIGIN' : r.kind.toUpperCase()}</span></div>
        <div class="body" style="margin:6px 0">${esc(r.text)}</div>
        <div class="muted tiny">${DR.stamp(r.t)} · ${DR.ago(r.t)} · credibility ${Math.round(r.cred * 100)}% · ${dirFromMe(r.lat, r.lng)}</div>
        ${cl ? `<div class="row between" style="margin-top:6px"><span class="badge green">✓ CLEARED by ${esc(cl.by)} · ${DR.ago(cl.t)}</span><button class="btn sm" data-act="intel-restore" data-id="${r.id}">⚠ Still there</button></div>` : r.kind === 'report' || r.kind === 'block' ? `<div class="btns"><button class="btn sm" data-act="intel-clear" data-id="${r.id}">✅ It's clear now</button></div>` : ''}</div>`; }).join('')}
      <h2>FIELD REPORTS <span class="x">${s.threats.length}</span></h2>
      ${s.threats.map(t => `<div class="card"><div class="row between"><b>${{ horde: '🧟 Horde', walkers: '🧟 Walkers', block: '✖ Road blocked', fire: '🔥 Fire' }[t.type]}</b><span class="muted tiny">seen ${DR.ago(t.ts)} · by ${esc(t.lastBy || t.src || 'you')}${t.confirms ? ' · ' + t.confirms + '× confirmed' : ''}</span></div><div class="muted small">${dirFromMe(t.lat, t.lng)}</div>
        <div class="btns"><button class="btn sm" data-act="t-clear" data-id="${t.id}">✅ It's clear now</button><button class="btn sm" data-act="t-confirm" data-id="${t.id}">⚠ Still there</button><button class="btn sm" data-act="fly" data-lat="${t.lat}" data-lng="${t.lng}">Show</button></div></div>`).join('') || '<div class="muted small">None right now. Use ⚠ REPORT or right-click the map.</div>'}
      ${Object.keys(s.cleared).length ? `<h2>RECENTLY CLEARED</h2>${Object.entries(s.cleared).sort((a, b) => b[1].t - a[1].t).slice(0, 5).map(([, c]) => `<div class="small muted" style="padding:4px 2px">✅ cleared by ${esc(c.by)} · ${DR.ago(c.t)}</div>`).join('')}` : ''}
      <p class="faint tiny body">Prototype note: the cached feed is simulated (real places, fictional reports). While any connection exists, Sync pulls the newest feed; after that, everything runs from cache.</p>`;
  }

  // ---------- sheets ----------
  ui.hordeAlert = (block, opts) => {
    const s = S();
    s.walking = false;
    ui._opts = opts;
    document.body.insertAdjacentHTML('beforeend', '<div class="flash"></div>');
    setTimeout(() => document.querySelector('.flash')?.remove(), 2800);
    if (navigator.vibrate && !s.silent) navigator.vibrate([300, 100, 300, 100, 300]);
    DR.mapview.drawAlternatives(opts);
    DR.mapview.fitPlans(opts.concat(DR.active ? [DR.active] : []));
    ui.modal(`
      <h3>⚠ HORDE BLOCKING YOUR ROUTE</h3>
      <div class="muted">${G.fmtDist(block.meters)} ahead. Walking stopped. Supplies now: <b>${DR.totals().water.toFixed(1)} L water</b>, ${Math.round(DR.totals().kcal)} kcal, ${Math.round(s.battery)}% battery. ${s.deadline ? `Gates close in <b>${DR.dur(s.deadline - s.clock)}</b>.` : ''}</div>
      <h2>RE-PLANNED WITH WHAT YOU HAVE LEFT</h2>
      ${opts.map((p, i) => planCard(p, i, 'horde')).join('') || '<div class="card">No safe way through. Get indoors and stay silent.</div>'}
      <div class="muted tiny">Tap an option to take it. The horde keeps drifting; SENTINEL will warn you if it moves onto the new route.</div>`, 'alert wide');
    DR.sentinel.alert('danger', `Horde blocking the route ${G.fmtDist(block.meters)} ahead. Choose a new plan.`);
  };

  ui.reportAt = latlng => {
    const at = latlng ? [latlng.lat, latlng.lng] : null;
    ui._reportAt = at;
    ui.modal(`<h3>⚠ REPORT</h3><div class="muted">${at ? 'At the point you tapped' : 'What did you see?'}. It changes every route immediately and syncs to your partner.</div>
      <div class="grid3" style="margin-top:14px">
        ${[['horde', '🧟', 'Horde', '20+ infected'], ['walkers', '🚶', 'Walkers', 'a few infected'], ['block', '✖', 'Blocked road', 'debris, vehicles'], ['fire', '🔥', 'Fire', 'smoke, heat'],
          ['safehouse', '🏠', 'Safe house', 'secure place'], ['cache', '📦', 'Supplies', 'found a stash']].map(([k, e, b, sm]) => `<button class="tile" data-act="rep" data-k="${k}"><div class="e">${e}</div><b>${b}</b><small>${sm}</small></button>`).join('')}
      </div>
      ${at ? '' : '<div class="toggle" style="margin-top:10px"><div><div class="t">Place it</div><div class="d">Where you are now, or tap a spot on the map.</div></div><div class="row"><button class="btn sm primary" data-act="rep-here">Here</button><button class="btn sm" data-act="rep-map">On map</button></div></div>'}`);
    ui._repWhere = at ? 'given' : 'here';
  };
  const addReport = (k, lat, lng) => {
    const s = S();
    if (k === 'safehouse' || k === 'cache') {
      s.userPlaces.push({ id: 'u' + DR.uid(), cat: k === 'safehouse' ? 'SHEL' : 'FOOD', sub: k === 'safehouse' ? 'shelter' : 'general', name: k === 'safehouse' ? 'Safe house (field report)' : 'Supply stash (field report)', lat, lng, seed: 0.9, user: true });
      DR.emit('places'); DR.emit('marks');
    } else {
      const ang = Math.random() * Math.PI * 2, v = k === 'horde' ? 4 + Math.random() * 4 : 1.5;
      const t = { id: DR.uid(), type: k, lat, lng, r: { horde: 140, walkers: 70, block: 35, fire: 90 }[k], vlat: DR.DRILL ? Math.cos(ang) * v / 111320 : 0, vlng: DR.DRILL ? Math.sin(ang) * v / 108500 : 0, ts: s.clock, src: DR.person(s.me).name };
      s.threats.push(t);
      DR.emit('threats');
      DR.community.shareThreat(t);   // travels to everyone you sync with
    }
    ui.toast('Reported. Routes updated, and it spreads to everyone you meet.');
  };
  ui.mapClick = latlng => {
    if (placing === '__pos') {
      placing = null; $('placing').classList.add('hidden'); $('placing').textContent = 'Tap the map to place it';
      if (!G.inCoverage(latlng.lat, latlng.lng)) { ui.toast('That is outside the downloaded map'); return; }
      DR.app.setPos(latlng.lat, latlng.lng, 'manual'); ui.toast('Position set'); return;
    }
    if (placing) { const k = placing; placing = null; $('placing').classList.add('hidden'); addReport(k, latlng.lat, latlng.lng); }
  };
  ui.threatMenu = t => {
    if (!t) return;
    const label = DR.community.TLABEL[t.type] || t.type;
    ui.modal(`<h3>${esc(label.toUpperCase())}</h3>
      <div class="muted">Reported by <b>${esc(t.src || 'you')}</b> · last seen ${DR.ago(t.ts)}${t.lastBy && t.lastBy !== t.src ? ' by ' + esc(t.lastBy) : ''} · ${dirFromMe(t.lat, t.lng)}${t.confirms ? ` · confirmed ${t.confirms}×` : ''}</div>
      <div class="muted small" style="margin-top:8px">Are you looking at it now? Your answer updates every route and travels to everyone your phone syncs with. ${DR.DRILL ? '' : 'Reports nobody confirms expire on their own after ' + (t.type === 'block' ? '48' : '12') + ' h.'}</div>
      <div class="grid2" style="margin-top:12px">
        <button class="tile" data-act="t-clear" data-id="${t.id}" style="border-color:var(--green)"><div class="e">✅</div><b>It's clear now</b><small>Gone, moved on or road cleared. Removes it for everyone.</small></button>
        <button class="tile" data-act="t-confirm" data-id="${t.id}" style="border-color:var(--red)"><div class="e">⚠</div><b>Still there</b><small>Re-report: refreshes the time so others keep avoiding it.</small></button>
      </div>
      <div class="btns"><button class="btn sm" data-act="fly" data-lat="${t.lat}" data-lng="${t.lng}">Show on map</button><button class="btn sm" data-act="close">Close</button></div>`);
  };

  ui.addItem = () => {
    const pid = packWho || S().me, who = pid === 'stash' ? 'THE STASH' : DR.person(pid).name.toUpperCase() + "'S PACK";
    ui.modal(`<h3>＋ ADD TO ${esc(who)}</h3><div class="muted small">Log what you really have. 🔍 shows where to find it.</div>
      <input class="input" id="isearch" placeholder="Search items…" style="margin:10px 0">
      <div id="ilist">${Object.entries(C.cats).map(([k, c]) => `<h2>${c.icon} ${c.label.toUpperCase()}</h2>${C.items.filter(i => i.cat === k).map(i => `<div class="item" data-name="${esc(i.name.toLowerCase())}" style="--c:${c.color}"><div class="ic">${c.icon}</div><div><div class="nm">${esc(i.name)}</div><div class="sub">${i.vehicle ? 'ridden' : i.kg + ' kg'}${i.note ? ' · ' + esc(i.note) : ''}</div></div><div class="qty"><button data-act="where" data-id="${i.id}" title="Where to find">🔍</button><button data-act="add" data-id="${i.id}">＋</button></div></div>`).join('')}`).join('')}</div>`, 'wide');
    $('isearch').addEventListener('input', e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#ilist .item').forEach(r => r.classList.toggle('hidden', !r.dataset.name.includes(q))); });
  };

  ui.loot = p => {
    const st = DR.placeStatus(p), loot = C.loot[p.sub] || [];
    const s = S();
    ui._loot = p;
    ui.modal(`<h3>🎒 LOOT · ${esc(placeName(p))}</h3>
      <div class="muted">${C.sub[p.sub]} · last recorded ${['empty', 'low', 'some stock', 'stocked'][st.stock]} (${DR.ago(st.seen)}). Enter what you actually found.</div>
      <div style="margin:12px 0">${loot.map((id, i) => { const it = DR.item(id); return `<label class="item" style="--c:${C.cats[it.cat].color};cursor:pointer"><div class="ic">${C.cats[it.cat].icon}</div><div><div class="nm">${esc(it.name)}</div><div class="sub">${it.kg} kg each</div></div><div class="qty"><input type="number" min="0" max="9" value="${i < Math.max(1, st.stock) ? (it.water ? 2 : 1) : 0}" data-loot="${id}" class="input" style="width:64px;padding:6px"></div></label>`; }).join('')}</div>
      <div class="row between"><span class="muted small">Into whose pack?</span><div class="row wrap">${s.team.map(x => `<button class="btn sm ${x.id === (ui._lootTo || s.me) ? 'primary' : ''}" data-act="loot-to" data-id="${x.id}">${esc(x.name)} · ${DR.packKg(x).toFixed(1)} kg</button>`).join('')}<button class="btn sm ${ui._lootTo === 'stash' ? 'primary' : ''}" data-act="loot-to" data-id="stash">🏠 Stash</button></div></div>
      <div class="btns"><button class="btn primary" data-act="loot-ok">Take it</button><button class="btn" data-act="loot-empty">Nothing here (mark empty)</button></div>`);
  };

  ui.qrShow = (text, title, sub) => {
    ui.modal(`<h3>▣ ${esc(title)}</h3><div class="muted">${esc(sub)}</div><canvas class="qr" id="qrc"></canvas><div class="faint tiny" style="text-align:center;word-break:break-all">${esc(text.length > 120 ? text.slice(0, 120) + '…' : text)}</div>`);
    DR.comms.drawQR($('qrc'), text);
  };
  // friendly camera errors (permission blocked, no camera, insecure address)
  ui.cameraError = e => {
    const n = e && e.name;
    if (!window.isSecureContext) return 'The camera needs the https:// address (see README).';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera blocked. Tap the lock icon next to the address, then Permissions, Camera, Allow. Then try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera found on this device.';
    if (n === 'NotReadableError') return 'The camera is busy in another app. Close it and try again.';
    return 'Camera not available: ' + (e && e.message || 'unknown error');
  };
  ui.qrScan = async () => {
    ui.modal(`<h3>▣ SCAN</h3><div class="muted">Point the camera at your partner's QR.</div><video class="scan" id="qv" playsinline muted style="margin-top:12px"></video>`);
    try { await DR.comms.startScan($('qv'), txt => { ui.close(); DR.comms.receive(txt, 'QR'); }); }
    catch (e) { ui.close(); ui.toast(ui.cameraError(e)); }
  };
  ui.sonicSend = async text => {
    const secs = DR.comms.sonicDuration(text);
    ui.modal(`<h3>〰 TRANSMITTING</h3><div class="muted">Hold the phones close (or speak through a door). ${secs.toFixed(1)} s</div><div class="bar" style="margin:18px 0"><i id="sp" style="width:0"></i></div><div class="tiny faint">${esc(text)}</div>`);
    const t0 = performance.now(), iv = setInterval(() => { const e = $('sp'); if (e) e.style.width = Math.min(100, (performance.now() - t0) / 10 / secs) + '%'; }, 50);
    await DR.comms.sonicSend(text);
    clearInterval(iv); ui.close(); ui.toast('〰 Sent over sound');
  };
  ui.sonicListen = async () => {
    ui.modal(`<h3>〰 LISTENING</h3><div class="muted">Waiting for a Sonic Link transmission…</div><div class="wave" id="wv">${'<i></i>'.repeat(19)}</div><div class="muted small" id="lst">Microphone on.</div>`);
    try {
      await DR.comms.sonicListen(txt => {
        if (!txt) { const e = $('lst'); if (e) e.textContent = 'Heard a transmission but it was garbled. Ask them to resend, closer.'; return; }
        ui.close(); DR.comms.receive(txt, 'Sound');
      }, (mags, tone) => {
        const bars = document.querySelectorAll('#wv i');
        bars.forEach((b, i) => { b.style.height = Math.max(4, Math.min(50, (mags[i] + 100) * 0.9)) + 'px'; b.style.background = i === tone ? '#ffb020' : ''; });
      });
    } catch (e) { ui.toast('Microphone not available: ' + e.message); }
  };
  ui.strobe = text => {
    const d = document.createElement('div'); d.id = 'strobe';
    d.innerHTML = `<div class="info">MORSE · ${esc(text.toUpperCase())}<br><span style="font-size:12px">${esc(DR.comms.morse(text))}</span><br><br>TAP TO STOP</div>`;
    document.body.appendChild(d);
    d.addEventListener('click', () => { DR.comms.stopStrobe(); d.remove(); });
    DR.comms.strobe(text, d, true);
  };
  ui.sos = () => {
    ui.modal(`<h3 style="color:var(--red)">🆘 SOS</h3><div class="muted">Pick how loud. Noise brings help <b>and</b> the dead.</div>
      <div class="grid2" style="margin-top:14px">
        <button class="tile" data-act="sos-silent"><div class="e">✦</div><b>Silent SOS</b><small>Morse light + QR beacon + queued for satellite. Safe near hordes.</small></button>
        <button class="tile" data-act="sos-loud" style="border-color:var(--red)"><div class="e">📢</div><b>Loud SOS</b><small>Siren + sound packet. Use only when help is close and you can hold a door.</small></button>
      </div>`);
  };
  ui.alerts = () => {
    S().alerts.forEach(a => a.read = true);
    ui.modal(`<h3>🔔 ALERTS</h3>${S().alerts.map(a => `<div class="card" style="border-left:3px solid ${a.lvl === 'danger' ? 'var(--red)' : a.lvl === 'warn' ? 'var(--amber)' : 'var(--cyan)'}"><div class="body">${esc(a.text)}</div><div class="muted tiny">${DR.stamp(a.ts)}</div></div>`).join('') || '<div class="muted">No alerts.</div>'}
      <h2>SENTINEL · RIGHT NOW</h2>${DR.sentinel.list().map(a => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)">${a.lvl === 'danger' ? '🔴' : a.lvl === 'warn' ? '🟠' : '🔵'} ${esc(a.text)}${a.tip ? `<div class="muted tiny">${esc(a.tip)}</div>` : ''}</div>`).join('')}
      <div class="toggle" style="margin-top:10px"><div><div class="t">🔊 Speak warnings</div><div class="d">Uses the phone's offline voice. Off in silent mode.</div></div>${sw(S().voice, 'voice')}</div>
      <div class="toggle"><div><div class="t">🤫 Silent mode</div><div class="d">No sound, no vibration.</div></div>${sw(S().silent, 'silent')}</div>`);
    DR.emit('alerts');
  };
  ui.intro = () => {
    ui.modal(`<div class="hero"><div class="big-logo"></div><h1>DEAD RECKONING</h1>
      <p>${DR.DRILL ? '<b style="color:var(--amber)">DRILL MODE</b>: practise with simulated time and walking. Your live data is untouched.' : 'Offline survival navigator for people moving through Bengaluru on foot. No network needed: the map, 1,900+ supply places, the field manual and the community board all live on this phone.'}</p>
      <div class="how"><div><b>1</b>PACK: log what each of you carries. Water and food decide the safe route.</div><div><b>2</b>ROUTE: set where you are (GPS or tap the map). Pick a route scored on survival.</div><div><b>3</b>REPORT hordes and blocked roads. Routes change at once.</div><div><b>4</b>CREW: share posts, location and alerts phone-to-phone, no towers.</div></div>
      <button class="btn primary full" data-act="close">START</button></div>`, 'noclose');
  };
  ui.settings = () => {
    const s = S();
    ui.modal(`<h3>⚙ SETTINGS</h3>
      <div class="toggle"><div><div class="t">🔊 Speak danger warnings</div><div class="d">Offline voice. Off in silent mode.</div></div>${sw(s.voice, 'voice')}</div>
      <div class="toggle"><div><div class="t">🤫 Silent mode</div><div class="d">No sound. Vibration only for danger.</div></div>${sw(s.silent, 'silent')}</div>
      <div class="toggle"><div><div class="t">🔋 Low-power mode</div><div class="d">Dimmer, fewer updates.</div></div>${sw(s.lowPower, 'lowpower')}</div>
      <div class="toggle"><div><div class="t">📍 Share my location</div><div class="d">Other survivors in range (and everyone your check-ins reach) see you on their map. Off = they only see that you are alive.</div></div>${sw(s.shareLoc, 'shareloc')}</div>
      <div class="toggle"><div><div class="t">🧪 Drill mode</div><div class="d">Practice with simulated time, walking and hordes. Uses a separate copy of your data.</div></div><button class="btn sm ${DR.DRILL ? 'primary' : ''}" data-act="${DR.DRILL ? 'drill-off' : 'drill-on'}">${DR.DRILL ? 'On · turn off' : 'Turn on'}</button></div>
      ${DR.DRILL ? '<div class="btns"><button class="btn danger sm" data-act="reset">Restart the drill from the beginning</button></div>' : ''}
      <div class="btns"><button class="btn" data-act="perm-open">📍 📶 Location and nearby permissions</button></div>
      <h2>SURVIVORS ON THIS PHONE</h2><div class="muted small">Each survivor has their own PIN, ID and data.</div>
      <div class="btns"><button class="btn" data-act="switch-user">👤 Switch / register a new survivor</button></div>`);
  };
  ui.endScreen = () => {};
  ui.legend = () => {
    const dot = (c, fill, label, note) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span style="flex:none;width:16px;height:16px;border-radius:50%;border:2px solid ${c};background:${fill ? c + '99' : 'transparent'}"></span><div><b>${label}</b>${note ? `<div class="muted tiny">${note}</div>` : ''}</div></div>`;
    ui.modal(`<h3>MAP LEGEND</h3>
      <h2>SMALL CIRCLES = SUPPLY PLACES (abandoned)</h2>
      ${Object.entries(C.placeCats).map(([k, v]) => dot(v.color, true, `${v.icon} ${v.label}`, { MED: 'pharmacies, hospitals, clinics', FOOD: 'supermarkets, vegetable shops, bakeries, markets', WATER: 'drinking-water points, water shops', TOOL: 'hardware & sports shops: tools and weapons', GEAR: 'clothes & shoe shops (hidden by default)', POWER: 'electronics, mobile shops, petrol pumps (hidden by default)', SHEL: 'police/fire stations, schools, metro, temples (hidden by default)' }[k])).join('')}
      <div class="muted tiny" style="margin:6px 0 10px">Filled = supplies last recorded there. Faint/hollow = recorded empty. Turn categories on/off in SUPPLY.</div>
      <h2>PEOPLE</h2>
      ${dot('#38e8ff', true, 'You (with radar ring)', '')}${dot('#b18cff', true, 'Your partner, or other survivors in hiding', 'violet dotted ring = their radio range')}${dot('#3dffa8', true, 'Survivors sharing location', 'registered users on other phones, crew, people you met')}${dot('#ff3b5c', true, 'Crew member gone silent', '')}
      <h2>DANGER</h2>
      ${dot('#ff3b5c', true, 'Red glow = danger zone from cached intel', 'darker red = outbreak origin')}${dot('#ff3b5c', false, '🧟 Red solid circle = horde (impassable core)', 'dashed outer ring = risky')}${dot('#3dffa8', false, 'Green dashed = reported safe area', '')}
      <h2>ROUTE & PLACES</h2>
      ${dot('#ffb020', true, 'Amber line = your route; ◆ amber = the settlement (beacon)', 'dashed lines = other route options')}${dot('#38e8ff', false, 'Cyan dashed box = edge of the downloaded map', '')}`);
  };

  // ---------- actions (event delegation) ----------
  const switches = { stealth: 'stealth', ration: 'ration', lowpower: 'lowPower', voice: 'voice', silent: 'silent', intel: 'useIntel', shareloc: 'shareLoc' };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, s = S();
    if (switches[a]) {
      s[switches[a]] = !s[switches[a]];
      if (a === 'intel') { DR.emit('threats'); DR.mapview.drawIntel(); }
      if (a === 'lowpower') document.body.style.filter = s.lowPower ? 'brightness(.75)' : '';
      DR.emit('pack'); b.classList.toggle('on', s[switches[a]]); ui.hud(); return;
    }
    switch (a) {
      case 'close': ui.close(); break;
      case 'pick': {
        const list = b.dataset.mode === 'horde' ? ui._opts : plans, p = list[+b.dataset.i];
        DR.activate(p); ui.close(); DR.mapview.drawAlternatives([]); ui.show('route');
        ui.toast(`Route set: ${p.title || DR.PROFILES[p.profile].label}`);
        if (b.dataset.mode === 'horde') { s.walking = true; s.running = true; }
        break;
      }
      case 'replan': plansDirty = true; renderRoute(); DR.mapview.fitPlans(plans); break;
      case 'walk': s.walking = true; s.running = true; DR.emit('route'); break;
      case 'reached': {   // manual dead reckoning: you confirm each turn, the app moves you there
        const cur = DR.currentStep(); if (!cur) break;
        s.route.progress = Math.min(DR.active.dist, cur.step.from + cur.step.dist);
        const p = DR.posOnRoute(DR.active, s.route.progress); s.pos = [p.lat, p.lng]; DR.community.active();
        const va = DR.app.viaAt();
        if (va != null && !s.route.viaDone && s.route.progress >= va - 5) { s.route.viaDone = true; ui.loot(DR.active.via); }
        DR.emit('route'); break;
      }
      case 'setpos': s.mode = 'manual'; DR.app.gps(false); placing = '__pos'; $('placing').textContent = 'Tap the map where you are'; $('placing').classList.remove('hidden'); break;
      case 'travel': {
        const k = b.dataset.k, km = (DR.active ? DR.active.dist : G.dist(s.pos[0], s.pos[1], DR.BEACON.lat, DR.BEACON.lng) * 1.3) / 1000, chk = DR.travelCheck(k, km);
        if (!chk.ok) { ui.toast(chk.why); break; }
        s.travel = k; plansDirty = true; DR.emit('pack'); DR.emit('route'); ui.toast(`${DR.TRAVEL[k].icon} ${DR.TRAVEL[k].label}`); break;
      }
      case 'gotab': ui.show(b.dataset.k); break;
      case 'post-safe': {
        const d = s.route.dest; await DR.community.create({ k: 'safe', x: `Safe for now: ${d.name}. Two exits, door blockable.`, lat: d.lat, lng: d.lng });
        ui.toast('Posted to the community board'); break;
      }
      case 'settings': ui.settings(); break;
      case 'legend': e.preventDefault(); ui.legend(); break;
      case 'perm-open': ui.permissions(DR.account.current, false); break;
      case 'drill-on': DR.setDrill(true); break;
      case 'drill-off': DR.setDrill(false); break;
      case 'stop': s.walking = false; DR.emit('route'); break;
      case 'change': s.route = null; DR.active = null; s.walking = false; plansDirty = true; DR.emit('route'); break;
      case 'mode-gps': s.mode = 'gps'; DR.app.gps(true); DR.emit('route'); break;
      case 'shelter': case 'goto': {
        const p = a === 'goto' ? placeById(b.dataset.id) : DR.bestShelter(s.pos[0], s.pos[1])?.p;
        if (!p) { ui.toast('No safe shelter nearby'); break; }
        const r = DR.plan('safe', s.pos, { lat: p.lat, lng: p.lng, name: placeName(p) });
        if (r) { DR.activate(r); DR.mapview.map.closePopup(); ui.show('route'); ui.toast(`Heading to ${placeName(p)}`); }
        break;
      }
      case 'need': { const n = DR.need(); DR.mapview.cats = new Set(n.cats); supFilter = 'near'; DR.mapview.drawPlaces(); renderSupplies(); break; }
      case 'cat': { const k = b.dataset.k, c = DR.mapview.cats; c.has(k) ? c.delete(k) : c.add(k); DR.mapview.drawPlaces(); renderSupplies(); break; }
      case 'sf': supFilter = b.dataset.k; renderSupplies(); break;
      case 'via': {
        const p = placeById(b.dataset.id), r = DR.plan('supply', s.pos, DR.BEACON, p);
        if (r) { DR.activate(r); DR.mapview.map.closePopup(); ui.show('route'); ui.toast(`Stop added: ${placeName(p)}`); } else ui.toast('Cannot reach it safely');
        break;
      }
      case 'loot': DR.mapview.map.closePopup(); ui._lootTo = null; ui.loot(placeById(b.dataset.id)); break;
      case 'loot-to': ui._lootTo = b.dataset.id; ui.loot(ui._loot); break;
      case 'loot-ok': {
        const to = ui._lootTo || s.me; let n = 0;
        document.querySelectorAll('[data-loot]').forEach(inp => { const q = +inp.value; if (q > 0) { DR.addItem(to, inp.dataset.loot, q); n += q; } });
        const st = DR.placeStatus(ui._loot);
        DR.setPlace(ui._loot, { stock: Math.max(0, st.stock - 1) });
        document.querySelectorAll('[data-loot]').forEach(inp => { if (+inp.value > 0) DR.log('looted', inp.dataset.loot, +inp.value, to === 'stash' ? 'Stash' : DR.person(to).name, placeName(ui._loot)); });
        ui.close(); ui.toast(`+${n} items to ${to === 'stash' ? 'the stash' : DR.person(to).name}`);
        if (DR.active && s.route.progress < DR.active.dist - 1) s.walking = true;   // back on the road
        DR.emit('pack'); break;
      }
      case 'loot-empty': DR.setPlace(ui._loot, { stock: 0 }); ui.close(); ui.toast('Marked empty. Shared on next sync.'); break;
      case 'mark': {
        const p = placeById(b.dataset.id); ui._loot = p;
        ui.modal(`<h3>UPDATE · ${esc(placeName(p))}</h3><div class="muted">What did you see? Saved with time and your name, synced to your partner.</div>
          <div class="grid2" style="margin-top:12px">${[[3, '✓ Stocked'], [2, 'Some left'], [1, 'Almost empty'], [0, '✕ Empty / looted']].map(([v, l]) => `<button class="tile" data-act="mark-set" data-v="${v}"><b>${l}</b></button>`).join('')}
          <button class="tile" data-act="mark-danger" style="grid-column:span 2;border-color:var(--red)"><b>⚠ Infected inside</b><small>Adds walkers here</small></button></div>`);
        break;
      }
      case 'mark-set': DR.setPlace(ui._loot, { stock: +b.dataset.v }); ui.close(); ui.toast('Status recorded'); break;
      case 'mark-danger': DR.setPlace(ui._loot, { danger: true }); addReport('walkers', ui._loot.lat, ui._loot.lng); ui.close(); break;
      case 'who': packWho = b.dataset.id; renderPack(); break;
      case 'q': {
        const o = b.dataset.o, d = +b.dataset.d, it = DR.item(b.dataset.id);
        const rows = o === 'stash' ? s.stash : DR.person(o).pack, row = rows.find(r => r[0] === it.id);
        const q = d < 0 ? -Math.min(1, row ? row[1] : 0) : 1;
        DR.addItem(o, it.id, q); DR.log(q < 0 ? 'used' : 'added', it.id, Math.abs(q), o === 'stash' ? 'Stash' : DR.person(o).name);
        DR.emit('pack'); break;
      }
      case 'give': {
        const o = b.dataset.o, id = b.dataset.id;
        ui.modal(`<h3>⇄ MOVE ${esc(DR.item(id).name.toUpperCase())}</h3><div class="muted">From ${o === 'stash' ? 'the stash' : esc(DR.person(o).name)} to:</div>
          <div class="btns">${s.team.filter(x => x.id !== o).map(x => `<button class="btn" data-act="give-to" data-o="${o}" data-to="${x.id}" data-id="${id}">${esc(x.name)} · ${DR.packKg(x).toFixed(1)} kg</button>`).join('')}
          ${o !== 'stash' ? `<button class="btn" data-act="give-to" data-o="${o}" data-to="stash" data-id="${id}">🏠 Stash</button>` : ''}</div>`);
        break;
      }
      case 'give-to': {
        const { o, to, id } = b.dataset, rows = o === 'stash' ? s.stash : DR.person(o).pack, row = rows.find(r => r[0] === id);
        const q = Math.min(DR.item(id).water ? row[1] : 1, row[1]);
        DR.addItem(o, id, -q); DR.addItem(to, id, q);
        DR.log('moved', id, q, o === 'stash' ? 'Stash' : DR.person(o).name, '→ ' + (to === 'stash' ? 'Stash' : DR.person(to).name));
        ui.close(); DR.emit('pack'); break;
      }
      case 'additem': ui.addItem(); break;
      case 'add': {
        const to = packWho || s.me, id = b.dataset.id;
        DR.addItem(to, id, 1); DR.log('added', id, 1, to === 'stash' ? 'Stash' : DR.person(to).name);
        DR.emit('pack'); ui.toast(`+ ${DR.item(id).name}`); break;
      }
      case 'gobag': for (const [id, q] of GOBAG) { DR.addItem(s.me, id, q); } DR.log('added', 'firstaid', 1, DR.person(s.me).name, 'go-bag preset'); DR.emit('pack'); ui.toast('Go-bag logged. Adjust it to what you really have.'); break;
      case 'finditem': case 'where': {
        const id = b.dataset.id, list = DR.whereToFind(id);
        ui.modal(`<h3>🔍 WHERE TO FIND · ${esc(DR.item(id).name.toUpperCase())}</h3><div class="muted">Abandoned places of a kind that stocked it, with supplies last recorded. Nearest first.</div>
          ${list.map(({ p, d }) => `<div class="card"><div class="row between"><div><b>${esc(placeName(p))}</b><div class="muted small">${C.sub[p.sub] || ''} · ${G.fmtDist(d)} ${G.compass(G.bearing(s.pos[0], s.pos[1], p.lat, p.lng))} · ${['empty', 'low', 'some', 'stocked'][DR.placeStatus(p).stock]}</div></div>
            <div class="row"><button class="btn sm" data-act="fly" data-lat="${p.lat}" data-lng="${p.lng}">Show</button><button class="btn sm primary" data-act="via" data-id="${p.id}">Stop here</button></div></div></div>`).join('') || '<div class="card muted">No recorded place nearby. Try homes, offices and parked vehicles.</div>'}`);
        break;
      }
      case 'addperson': case 'editperson': {
        const p = a === 'editperson' ? DR.person(b.dataset.id) : null;
        ui.modal(`<h3>${p ? 'EDIT' : 'ADD'} PERSON</h3>
          <div class="grid2" style="margin-top:10px"><label class="small">Name<input class="input" id="pp-name" maxlength="24" value="${esc(p ? p.name : '')}"></label>
          <label class="small">Role<select class="input" id="pp-role">${['Scout', 'Carrier', 'Medic', 'Lookout', 'Navigator', 'Child', 'Elder'].map(r => `<option ${p && p.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label class="small">Body weight (kg)<input class="input" id="pp-kg" type="number" min="15" max="150" value="${p ? p.bodyKg : 60}"></label>
          <label class="small">Health %<input class="input" id="pp-hp" type="number" min="0" max="100" value="${p ? Math.round(p.health) : 100}"></label></div>
          <label class="small" style="display:block;margin-top:10px">Medical notes<input class="input" id="pp-med" maxlength="80" value="${esc(p ? p.medical || '' : '')}" placeholder="allergies, conditions, medicines"></label>
          <div class="btns"><button class="btn primary" data-act="saveperson" data-id="${p ? p.id : ''}">Save</button>${p && p.id !== s.me ? `<button class="btn danger" data-act="removeperson" data-id="${p.id}">Remove from group</button>` : ''}</div>`);
        break;
      }
      case 'saveperson': {
        const name = $('pp-name').value.trim(); if (!name) { ui.toast('Enter a name'); break; }
        const vals = { name, role: $('pp-role').value, bodyKg: +$('pp-kg').value || 60, health: Math.max(0, Math.min(100, +$('pp-hp').value)), medical: $('pp-med').value.trim() };
        if (b.dataset.id) Object.assign(DR.person(b.dataset.id), vals);
        else { const np = { id: 'p' + DR.uid(), pack: [], ...vals }; s.team.push(np); packWho = np.id; }
        ui.close(); DR.emit('pack'); break;
      }
      case 'removeperson': {
        const p = DR.person(b.dataset.id);
        for (const [id, q] of p.pack) DR.addItem(s.me, id, q);
        s.team = s.team.filter(x => x !== p); packWho = s.me;
        ui.close(); ui.toast(`${p.name} removed; their items moved to you`); DR.emit('pack'); break;
      }
      case 'setbase': s.base = { lat: s.pos[0], lng: s.pos[1], name: DR.active?.dest?.name || 'Hideout' }; DR.emit('marks'); DR.emit('pack'); ui.toast('Stash location saved'); break;
      case 'balance': {
        let moved = 0;
        const ratio = x => DR.packKg(x) / DR.packLimit(x);
        for (let k = 0; k < 30; k++) {
          const sorted = s.team.slice().sort((x, y) => ratio(y) - ratio(x)), hi = sorted[0], lo = sorted[sorted.length - 1];
          if (hi === lo) break;
          const gap = ratio(hi) - ratio(lo);
          const cand = hi.pack.filter(r => !DR.item(r[0]).weapon && !DR.item(r[0]).vehicle && r[1] >= 1).map(r => [r, DR.item(r[0]).kg])
            .filter(([, kg]) => kg / DR.packLimit(hi) + kg / DR.packLimit(lo) < gap + 0.001)
            .sort((x, y) => y[1] - x[1])[0];
          if (!cand) break;
          DR.addItem(hi.id, cand[0][0], -1); DR.addItem(lo.id, cand[0][0], 1); DR.log('moved', cand[0][0], 1, hi.name, '→ ' + lo.name); moved++;
        }
        DR.emit('pack'); ui.toast(moved ? `Moved ${moved} item${moved > 1 ? 's' : ''} to even out the loads` : 'Loads are already balanced');
        break;
      }
      case 'drink': { const who = DR.person(packWho === 'stash' ? s.me : packWho || s.me), left = DR.consume('water', 0.25, true); ui.toast(left > 0 ? 'No water logged!' : `${who.name} drank 250 ml`); DR.emit('pack'); break; }
      case 'eat': { const left = DR.consume('kcal', 500, true); ui.toast(left >= 500 ? 'No food logged!' : 'Meal logged (~500 kcal)'); DR.emit('pack'); break; }
      case 'heal': {
        const p = DR.person(packWho === 'stash' ? s.me : packWho || s.me);
        const row = s.team.flatMap(x => x.pack.map(r => [x, r])).filter(([, r]) => DR.item(r[0]).heal && r[1] >= 1).sort((x, y) => DR.item(x[1][0]).heal - DR.item(y[1][0]).heal)[0];
        if (!row) { ui.toast('No medical supplies logged. PACK → Find.'); break; }
        DR.addItem(row[0].id, row[1][0], -1); p.health = Math.min(100, p.health + DR.item(row[1][0]).heal);
        DR.log('used', row[1][0], 1, row[0].name, 'on ' + p.name);
        ui.toast(`Used ${DR.item(row[1][0]).name} on ${p.name}`); DR.emit('pack'); break;
      }
      case 'reset': DR.reset(); break;
      case 'quick': draft = b.dataset.t; ui.render(); break;
      case 'loc': attachLoc = !attachLoc; b.classList.toggle('on', attachLoc); break;
      case 'send-qr': case 'send-sound': case 'send-light': {
        draft = ($('draft')?.value || draft).trim();
        if (!draft) { ui.toast('Type a message first'); break; }
        const pkt = DR.comms.packet('M', draft, attachLoc);
        if (a === 'send-qr') { ui.qrShow(pkt, 'MESSAGE', 'Let the other phone scan this.'); DR.comms.logOut('QR', draft); }
        if (a === 'send-sound') { DR.comms.logOut('Sound', draft); ui.sonicSend(DR.comms.packet('M', draft.slice(0, 40), attachLoc)); }
        if (a === 'send-light') { DR.comms.logOut('Light', draft); ui.strobe(draft.slice(0, 24)); }
        s.outbox.push(pkt); draft = ''; DR.emit('comms'); break;
      }
      case 'scan': ui.qrScan(); break;
      case 'listen': ui.sonicListen(); break;
      case 'share-loc': ui.qrShow(DR.comms.packet('L', ''), 'MY LOCATION', 'Your partner scans this to see you on their map.'); DR.comms.logOut('QR', 'Shared location'); break;
      case 'sync': ui.qrShow(DR.comms.planPacket(), 'FULL PLAN SYNC', 'Threats, store updates and rendezvous. Scan to merge.'); DR.comms.logOut('QR', 'Full plan sync'); break;
      case 'rv': {
        const b2 = DR.bestShelter(s.pos[0], s.pos[1], 1500);
        if (!b2) { ui.toast('No good shelter nearby'); break; }
        s.rendezvous = { lat: b2.p.lat, lng: b2.p.lng, name: placeName(b2.p), by: DR.person(s.me).name, until: s.clock + 45 };
        DR.emit('marks'); DR.emit('comms'); ui.toast(`Rendezvous: ${placeName(b2.p)}. Sync it to your partner.`); break;
      }
      case 'rv-clear': s.rendezvous = null; DR.emit('marks'); DR.emit('comms'); break;
      case 'fly': DR.mapview.fly(+b.dataset.lat, +b.dataset.lng); break;
      case 'threat': ui.threatMenu(s.threats.find(t => t.id === b.dataset.id)); break;
      case 't-clear': {
        const t = s.threats.find(x => x.id === b.dataset.id); if (!t) { ui.close(); break; }
        await DR.community.clearThreat(t.id, DR.community.TLABEL[t.type] || 'threat', t.lat, t.lng);
        ui.close(); ui.toast('✅ Marked clear. Routes reopened; this spreads to everyone you meet.'); break;
      }
      case 't-confirm': {
        const t = s.threats.find(x => x.id === b.dataset.id); if (!t) { ui.close(); break; }
        await DR.community.confirmThreat(t); ui.close(); ui.toast('⚠ Re-reported: still there'); break;
      }
      case 'intel-clear': {
        const r = DR.intelRaw().find(x => x.id === b.dataset.id);
        await DR.community.clearThreat('intel:' + r.id, r.kind === 'block' ? 'road reopened near ' + (r.text.split('.')[0] || '').slice(0, 50) : (r.text.split('.')[0] || '').slice(0, 60), r.lat, r.lng);
        ui.toast('✅ Marked clear. Routes reopened.'); ui.render(); break;
      }
      case 'intel-restore': await DR.community.restoreIntel(b.dataset.id); ui.toast('⚠ Re-reported: still dangerous'); ui.render(); break;
      case 'rep': {
        const k = b.dataset.k;
        if (ui._repWhere === 'given' && ui._reportAt) { addReport(k, ...ui._reportAt); ui.close(); }
        else if (ui._repWhere === 'map') { placing = k; ui.close(); $('placing').classList.remove('hidden'); }
        else { addReport(k, s.pos[0], s.pos[1]); ui.close(); }
        break;
      }
      case 'rep-here': ui._repWhere = 'here'; b.classList.add('primary'); b.nextElementSibling.classList.remove('primary'); break;
      case 'rep-map': ui._repWhere = 'map'; b.classList.add('primary'); b.previousElementSibling.classList.remove('primary'); break;
      case 'sos-silent': {
        ui.close(); const pkt = DR.comms.packet('S', 'SOS');
        s.outbox.push(pkt); DR.comms.logOut('Light+QR', 'SOS', true);
        ui.strobe('SOS'); DR.sentinel.alert('warn', 'Silent SOS active. Morse light flashing; packet queued for satellite and mesh.');
        break;
      }
      case 'sos-loud': {
        ui.close(); const pkt = DR.comms.packet('S', 'SOS');
        s.outbox.push(pkt); DR.comms.logOut('Sound', 'SOS', true);
        DR.comms.siren(true);
        ui.modal(`<h3 style="color:var(--red)">📢 LOUD SOS ACTIVE</h3><div class="muted">Siren on. Infected within ~300 m will come.</div><div class="btns"><button class="btn danger" data-act="siren-off">Stop siren</button><button class="btn" data-act="siren-packet">Send SOS packet by sound</button></div>`, 'alert noclose');
        break;
      }
      case 'siren-off': DR.comms.siren(false); ui.close(); break;
      case 'siren-packet': DR.comms.siren(false); ui.sonicSend(DR.comms.packet('S', 'SOS')); break;
      case 'intel-sync': {
        if (!navigator.onLine) { ui.toast('No network. Using intel cached ' + DR.ago(window.DR_INTEL.lastSync)); break; }
        try {
          const r = await fetch('intel-feed.json?ts=' + Date.now(), { cache: 'no-store' });
          const j = await r.json();
          const have = new Set(DR.intelAll().map(x => x.id));
          const fresh = (j.reports || []).filter(x => !have.has(x.id)).map(x => ({ ...x, t: x.t < 1e6 ? DR.T(x.t) : x.t }));
          s.intelExtra.push(...fresh); s.intelSync = s.clock;
          ui.toast(`Synced: ${fresh.length} new report${fresh.length === 1 ? '' : 's'}`);
          DR.emit('threats'); DR.mapview.drawIntel();
        } catch (err) { ui.toast('Sync source unreachable, keeping cache'); }
        break;
      }
    }
  });
  document.getElementById('draft-listener') || document.addEventListener('input', e => { if (e.target.id === 'draft') draft = e.target.value; });
})();
