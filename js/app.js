/* Boot, the clock, movement, GPS / manual position, partner radio link, battery and offline install.
   LIVE: real time, your position from GPS or "I'm here" taps, supplies change only when logged.
   DRILL: simulated time and walking, automatic consumption, practice hordes. */
(function () {
  const DR = window.DR, G = DR.geo, ui = DR.ui, mv = DR.mapview;
  const app = DR.app = {};
  const s = () => DR.state;
  // browsers refuse vibration before the first tap; skip it quietly instead of logging errors
  if (navigator.vibrate) { const vib = navigator.vibrate.bind(navigator); navigator.vibrate = p => (navigator.userActivation && !navigator.userActivation.hasBeenActive) ? false : vib(p); }
  let alertOpen = false, lastDraw = 0, lastSlow = 0, driftAcc = 0, threatsDirty = false;

  app.viaAt = () => {
    const p = DR.active; if (!p || !p.via) return null;
    const v = G.nearestNode(p.via.lat, p.via.lng), i = p.path.indexOf(v);
    return i >= 0 ? p.cum[i] : null;
  };

  // ---------- reactions to state changes ----------
  const checkBlock = () => {
    if (!DR.active || alertOpen || s().route.progress >= DR.active.dist - 1) return;
    const block = DR.blockAhead();
    if (!block) return;
    alertOpen = true;
    const opts = DR.hordeOptions();
    ui.hordeAlert(block, opts);
    const obs = new MutationObserver(() => { if (document.getElementById('modal').classList.contains('hidden')) { alertOpen = false; obs.disconnect(); DR.mapview.drawAlternatives([]); } });
    obs.observe(document.getElementById('modal'), { attributes: true });
  };
  // keep optimising: when the picture changes, quietly switch to a clearly better version of the same route
  const reoptimise = () => {
    if (!DR.active || alertOpen || DR.active.kind === 'hide') return;
    const r = s().route;
    if (r.progress >= DR.active.dist - 30) return;
    const fresh = r.via && !r.viaDone ? DR.plan(r.profile, s().pos, r.dest, r.via) : DR.plan(r.profile === 'supply' ? 'safe' : r.profile, s().pos, r.dest);
    if (!fresh) return;
    const cur = DR.describe(r.profile, DR.active.path.slice(DR.posOnRoute(DR.active, r.progress).idx - 1), r.dest, r.viaDone ? null : r.via);
    if (fresh.score < cur.score * 0.9 && fresh.blockedAt < 0) {
      DR.activate(Object.assign(fresh, { profile: r.profile }));
      ui.toast(`↻ Safer way found with the new information (${DR.dur(fresh.walkMin)} to go)`);
    }
  };
  DR.on('threats', () => {
    DR.refreshDanger(); mv.drawThreats(); mv.drawIntel(); ui.invalidatePlans();
    if (DR.active) { DR.rehydrateKeep(); checkBlock(); reoptimise(); }
    if (ui.tab === 'route' || ui.tab === 'intel') ui.render();
  });
  DR.rehydrateKeep = () => { const r = s().route; DR.active = DR.describe(r.profile, r.path, r.dest, r.via, DR.active?.kind === 'hide' ? { waitMin: 0 } : {}); };
  DR.on('route', () => { mv.drawRoute(); ui.render(); ui.hud(); if (DR.active) checkBlock(); });
  DR.on('places', () => { mv.drawPlaces(); mv.drawMarks(); if (ui.tab === 'supplies') ui.render(); });
  DR.on('pack', () => { ui.invalidatePlans(); if (DR.active) DR.rehydrateKeep(); ui.render(); ui.hud(); DR.sentinel.update(); });
  DR.on('comms', () => { if (ui.tab === 'crew') ui.render(); });
  DR.on('marks', () => { mv.drawMarks(); ui.drawCommunity(); });
  DR.on('feed', () => { ui.drawCommunity(); if (ui.tab === 'crew') ui.render(); });
  DR.on('alerts', () => ui.hud());

  // one place that moves "you": GPS fixes, map taps and the drill all go through here
  app.setPos = (la, lo, how) => {
    const st = s();
    st.pos = [la, lo];
    if (how !== 'sim') st.lastActive = st.clock;
    if (DR.active && how !== 'sim') {
      let best = 0, bd = Infinity;
      DR.active.path.forEach((n, i) => { const d = G.dist(la, lo, G.graph.lat[n], G.graph.lng[n]); if (d < bd) { bd = d; best = i; } });
      if (bd > 80) { const r = DR.plan(st.route.profile === 'supply' ? 'safe' : st.route.profile, st.pos, st.route.dest); if (r) { DR.activate(r); ui.toast('Off the route: re-planned from here'); } }
      else st.route.progress = Math.max(st.route.progress, DR.active.cum[best]);
    } else ui.invalidatePlans();
    mv.moveMe(); DR.emit('route'); DR.emit('marks');
  };

  // ---------- the clock ----------
  let last = performance.now();
  const tick = () => {
    const now = performance.now(), dtReal = Math.min(5, (now - last) / 1000); last = now;
    const st = s();
    if (!DR.DRILL) {
      // LIVE: the phone's own clock. Nothing is consumed behind your back.
      st.clock = DR.now();
      // sightings go stale: hordes move on, roads get cleared
      const stale = st.threats.filter(t => st.clock - t.ts > (t.type === 'block' ? 2880 : 720));
      if (stale.length) { st.threats = st.threats.filter(t => !stale.includes(t)); DR.emit('threats'); }
      if (!st.realBattery) st.battery = Math.max(1, st.battery - DR.burn(false).battery * dtReal / 3600);
    } else {
      // DRILL: time flows at the chosen speed; it freezes while you read a decision sheet (not the check-in alarm)
      const deciding = alertOpen || (!document.getElementById('modal').classList.contains('hidden') && !document.querySelector('#modal .checkin'));
      if (st.running && !deciding) {
        const dt = dtReal * st.speed / 60;
        st.clock += dt;
        for (const t of st.threats) if (t.vlat) { t.lat += t.vlat * dt; t.lng += t.vlng * dt; }
        driftAcc += dt;
        if (driftAcc >= 2 && st.threats.some(t => t.vlat)) { driftAcc = 0; DR.refreshDanger(); threatsDirty = true; if (DR.active) { DR.rehydrateKeep(); checkBlock(); } }
        const moving = !!(st.walking && DR.active);
        const b = DR.burn(moving);
        const dryW = DR.consume('water', b.water * dt / 60), dryF = DR.consume('kcal', b.kcal * dt / 60);
        if (DR.state.travel === 'car' && moving) DR.consume('fuel', DR.pace() * DR.FUEL_PER_KM * dt / 60);
        for (const p of st.team) { if (dryW > 0) p.health -= 6 * dt / 60; if (dryF > 0) p.health -= 2 * dt / 60; p.health = Math.max(0, p.health); }
        if (!st.realBattery) {
          st.battery -= b.battery * dt / 60;
          if (st.battery < 15) for (const p of st.team) { const row = p.pack.find(r => r[0] === 'powerbank' && r[1] >= 1); if (row) { row[1] -= 1; st.battery += 60; ui.toast(`🔋 Plugged in ${p.name}'s power bank`); break; } }
          st.battery = Math.max(0, Math.min(100, st.battery));
        }
        if (moving) {
          st.lastActive = st.clock;
          st.route.progress = Math.min(DR.active.dist, st.route.progress + DR.pace() * 1000 / 60 * dt);
          const p = DR.posOnRoute(DR.active, st.route.progress); st.pos = [p.lat, p.lng];
          const d = G.danger[G.nearestNode(st.pos[0], st.pos[1])];
          if (d > 1 && d < G.BLOCK) { const armor = DR.totals().armor; for (const q of st.team) q.health = Math.max(0, q.health - (d - 1) * 4 * dt / 60 / (1 + armor * 0.25)); }
          const va = app.viaAt();
          if (va != null && !st.route.viaDone && st.route.progress >= va) { st.route.viaDone = true; st.walking = false; ui.toast('🎒 Restock stop reached'); ui.loot(DR.active.via); }
          if (st.route.progress >= DR.active.dist - 1) { st.walking = false; DR.emit('route'); }
        }
      }
    }
    if (now - lastDraw > 250) { lastDraw = now; mv.moveMe(); ui.hud(); }
    if (now - lastSlow > (st.lowPower ? 3000 : 1000)) {
      lastSlow = now;
      if (DR.active) mv.drawRoute();
      if (threatsDirty) { threatsDirty = false; mv.drawThreats(); }
      if ((ui.tab === 'route' && st.walking) || (DR.DRILL && st.running && ui.tab === 'pack')) ui.render();
      DR.save();
      DR.sentinel.update();
      if (DR.community.npcs().length) { DR.community.encounters(); DR.community.watch(); }
      if (st.clock - (st.lastHb || 0) >= 60) { st.lastHb = st.clock; DR.community.heartbeat(); }
      app.radio.hello();
      mv.drawMarks();
    }
  };

  // ---------- GPS: satellites, no internet required ----------
  // app.gpsInfo is shown in ROUTE → "Where are you?" so the user always knows what the GPS is doing
  let watch = null, retried = false;
  app.gpsInfo = { state: 'off', text: '' };
  const gpsSay = (state, text) => { app.gpsInfo = { state, text }; if (ui.tab === 'route') ui.render(); };
  const fallbackManual = () => { s().mode = 'manual'; DR.save(); if (ui.tab === 'route') ui.render(); };
  app.gps = on => {
    if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
    if (!on) { gpsSay('off', ''); return; }
    if (!window.isSecureContext) { gpsSay('error', 'Location is blocked on plain http. Open the https:// address (see README) or set your position with 📍.'); fallbackManual(); return; }
    if (!navigator.geolocation) { gpsSay('error', 'This device has no location service. Set your position with 📍.'); fallbackManual(); return; }
    retried = false;
    gpsSay('searching', 'Looking for satellites… Go outdoors or near a window. The first fix can take 1–2 minutes and needs no internet on phones.');
    const ok = pos => {
      const { latitude: la, longitude: lo, accuracy } = pos.coords, st = s();
      st.gps = { acc: accuracy, t: st.clock, lat: la, lng: lo };
      if (!G.inCoverage(la, lo)) {
        const km = G.dist(la, lo, 12.9825, 77.59) / 1000;
        gpsSay('outside', `GPS works (±${Math.round(accuracy)} m), but you are ${km < 10 ? km.toFixed(1) : Math.round(km)} km from the downloaded map of central Bengaluru. Set your position on the map with 📍 to plan here.`);
        return;
      }
      gpsSay('ok', `GPS fix ±${Math.round(accuracy)} m${accuracy > 500 ? ' (rough: laptops guess from Wi-Fi; phones use real satellites)' : ''}`);
      app.setPos(la, lo, 'gps');
    };
    const fail = err => {
      if (err.code === 1) { gpsSay('error', 'Location permission is blocked. Tap the lock icon next to the address → Permissions → Location → Allow, then press GPS again. Or set your position with 📍.'); fallbackManual(); return; }
      if (!retried) { retried = true; gpsSay('searching', 'No satellite fix yet, trying a rougher fix…'); navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, maximumAge: 300000, timeout: 30000 }); return; }
      gpsSay('error', err.code === 3 ? 'No fix after waiting. Laptops have no GPS chip and need internet to guess location. On a phone, step outside. Meanwhile set your position with 📍.'
        : 'Location unavailable on this device right now. Set your position with 📍.');
    };
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, maximumAge: 30000, timeout: 45000 });
    watch = navigator.geolocation.watchPosition(ok, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 120000 });
  };

  // ---------- partner radio link ----------
  // Two phones in range swap position, plan and posts. On Android this is Bluetooth / Wi-Fi Direct.
  // In the browser it runs over a BroadcastChannel, so two windows on one computer behave like two
  // phones: open one as Aarav and one as Mira and move them apart with 📍 to see the range limit.
  app.RADIO_RANGE = 200;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('dr-radio') : null;
  let lastBoard = 0;
  app.radio = {
    hello: () => {
      if (!bc || !DR.account.current) return;
      const st = s(), a = DR.account.current, p = DR.active;
      const plan = p && st.route.progress < p.dist - 1 ? { pts: p.path.filter((_, i) => i % 6 === 0 || i === p.path.length - 1).map(i => [+G.graph.lat[i].toFixed(5), +G.graph.lng[i].toFixed(5)]), prog: st.route.progress, kmh: st.walking || !DR.DRILL ? DR.pace() : 0, dest: st.route.dest.name } : null;
      const crew = Object.entries(st.crew).filter(([, c]) => c.inCrew).map(([id]) => id);
      const msg = { t: 'hello', drill: DR.DRILL, id: a.id, name: a.name, partner: a.partner, pub: a.pub, blood: a.blood, pos: st.pos, hide: !st.shareLoc, status: st.status, plan: st.shareLoc ? plan : null, crew };
      if (Date.now() - lastBoard > 15000) { lastBoard = Date.now(); msg.posts = Object.values(st.feed).filter(q => q.k !== 'conf' || q.mine).slice(-80).map(({ ok, mine, reached, ...q }) => q); }
      bc.postMessage(msg);
    },
  };
  if (bc) bc.onmessage = async ev => {
    const m = ev.data, st = s(), me = DR.account.current;
    if (!me || !m || m.t !== 'hello' || m.id === me.id || m.drill !== DR.DRILL) return;
    const d = G.dist(st.pos[0], st.pos[1], m.pos[0], m.pos[1]);
    if (d > app.RADIO_RANGE) return;   // out of radio range: you hear nothing, like real life
    const isPartner = m.name === me.partner || m.partner === me.name;
    const scannedMe = (m.crew || []).includes(me.id) && st.crew[m.id] && st.crew[m.id].scanned;
    const c = st.crew[m.id] = st.crew[m.id] || { name: m.name, lastHeard: 0 };
    Object.assign(c, { name: m.name, pub: m.pub || c.pub, blood: m.blood, lastHeard: st.clock, status: m.status, inCrew: c.inCrew || isPartner || scannedMe, live: true, dist: Math.round(d), wantsMe: (m.crew || []).includes(me.id) });
    // say it once: a new face in range, and once when they ask to team up
    if (!c.firstSeen) { c.firstSeen = st.clock; ui.toast(`📡 Survivor nearby: ${m.name} (${Math.round(d)} m). CREW → Crew to team up`); if (ui.tab === 'crew') ui.render(); }
    if (c.wantsMe && !c.inCrew && !c.askNoted) { c.askNoted = true; ui.toast(`🤝 ${m.name} wants to team up with you. CREW → Crew`); if (ui.tab === 'crew') ui.render(); }
    if (!m.hide) Object.assign(c, { lat: m.pos[0], lng: m.pos[1] });
    if (isPartner && !m.hide) st.friend = { name: m.name, id: m.id, lat: m.pos[0], lng: m.pos[1], ts: st.clock, plan: m.plan, live: true, dist: d };
    if (m.posts) { const n = await DR.community.ingest(m.posts, m.name); if (n) ui.toast(`📡 ${m.name} in radio range: +${n} posts`); }
  };

  // where your partner probably is now: last fix, then walked along their shared plan (dead reckoning)
  DR.friendEstimate = () => {
    const f = s().friend; if (!f) return null;
    const age = Math.max(0, s().clock - f.ts);
    if (age < 1.5) return { lat: f.lat, lng: f.lng, r: 15, age, live: true };
    if (!f.plan || !f.plan.kmh) return { lat: f.lat, lng: f.lng, r: Math.min(2000, 30 + age * 45), age, live: false };
    let go = f.plan.kmh * 1000 / 60 * age, pts = f.plan.pts, i = 0;
    // start from the point nearest to the last fix
    let bi = 0, bd = Infinity; pts.forEach((q, k) => { const dd = G.dist(f.lat, f.lng, q[0], q[1]); if (dd < bd) { bd = dd; bi = k; } }); i = bi;
    let lat = f.lat, lng = f.lng;
    while (go > 0 && i < pts.length - 1) {
      const seg = G.dist(lat, lng, pts[i + 1][0], pts[i + 1][1]);
      if (seg <= go) { go -= seg; i++; lat = pts[i][0]; lng = pts[i][1]; }
      else { const k = go / seg; lat += (pts[i + 1][0] - lat) * k; lng += (pts[i + 1][1] - lng) * k; go = 0; }
    }
    return { lat, lng, r: Math.min(1500, 25 + age * 20), age, live: false, along: f.plan.dest };
  };

  // ---------- boot ----------
  app.boot = () => {
    const st = s();
    if (!DR.DRILL) { st.clock = DR.now(); st.running = true; st.speed = 1; }
    mv.init();
    DR.refreshDanger();
    if (st.route) DR.rehydrate();
    mv.drawRoute();
    ui.show('route');
    ui.hud();
    DR.sentinel.update();
    setInterval(DR.sentinel.rotate, 12000);
    if (DR.active) mv.fitPlans([DR.active]);

    document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ui.show(b.dataset.tab); });
    document.getElementById('b-play').onclick = () => { st.running = !st.running; ui.hud(); DR.save(); };
    document.getElementById('b-speed').onchange = e => { st.speed = +e.target.value; DR.save(); };
    document.getElementById('b-alerts').onclick = () => ui.alerts();
    document.getElementById('b-settings').onclick = () => ui.settings();
    document.getElementById('sentinel').onclick = () => ui.alerts();
    document.getElementById('fab-report').onclick = () => ui.reportAt(null);
    document.getElementById('fab-sos').onclick = () => ui.sos();
    document.getElementById('fab-chaos').onclick = () => app.spawnHorde();
    document.getElementById('m-me').onclick = () => mv.fly(st.pos[0], st.pos[1]);
    document.getElementById('m-pos').onclick = () => document.querySelector('[data-act=setpos]') ? document.querySelector('[data-act=setpos]').click() : (ui.show('route'), document.querySelector('[data-act=setpos]')?.click());
    document.getElementById('m-fit').onclick = () => DR.active ? mv.fitPlans([DR.active]) : mv.map.setView([12.986, 77.585], 15);
    document.getElementById('m-places').onclick = e => { const on = e.currentTarget.classList.toggle('on'); mv.setVisible('places', on); };
    document.getElementById('m-intel').onclick = e => { const on = e.currentTarget.classList.toggle('on'); mv.setVisible('intel', on); };
    document.getElementById('m-legend').onclick = () => ui.legend();
    document.getElementById('m-scan').onclick = () => ui.scanPeople();
    document.getElementById('handle').onclick = () => document.getElementById('panel').classList.toggle('max');
    addEventListener('online', () => { ui.hud(); ui.render(); });
    addEventListener('offline', () => { ui.hud(); ui.render(); ui.toast('📵 Network lost. Everything keeps working.'); });

    if (navigator.getBattery) navigator.getBattery().then(b => {
      const upd = () => { st.realBattery = true; st.battery = b.level * 100; ui.hud(); };
      upd(); b.addEventListener('levelchange', upd);
    }).catch(() => {});
    if (st.mode === 'gps' && !DR.DRILL) app.gps(true);
    else if (!DR.DRILL && navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') { st.mode = 'gps'; app.gps(true); } }).catch(() => {});
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    document.getElementById('whoami').textContent = `${DR.account.current.name} · ${DR.account.current.id}${DR.DRILL ? ' · DRILL' : ''}`;
    document.body.classList.toggle('drill', DR.DRILL);
    let lastPoke = 0;
    const poke = () => { if (Date.now() - lastPoke > 1500) { lastPoke = Date.now(); DR.community.active(); } };
    addEventListener('pointerdown', poke, true); addEventListener('keydown', poke, true);
    DR.community.seed().then(() => ui.drawCommunity());
    if (!st.introSeen) { st.introSeen = true; ui.intro(); DR.save(); }
    setInterval(tick, 200);  // a timer, not requestAnimationFrame: keeps counting with the screen off or the app in the background
  };

  // DRILL only: a practice horde stumbles onto your route ahead (or near you)
  app.spawnHorde = () => {
    if (!DR.DRILL) return;
    const st = s();
    let lat, lng;
    if (DR.active && st.route.progress < DR.active.dist - 400) {
      const ahead = Math.min(DR.active.dist - 200, st.route.progress + Math.max(350, (DR.active.dist - st.route.progress) * 0.35));
      const p = DR.posOnRoute(DR.active, ahead); lat = p.lat; lng = p.lng;
    } else {
      [lat, lng] = G.offset(st.pos[0], st.pos[1], (Math.random() - 0.5) * 800, (Math.random() - 0.5) * 800);
    }
    const ang = Math.random() * Math.PI * 2, v = 3;
    st.threats.push({ id: DR.uid(), type: 'horde', lat, lng, r: 130, vlat: Math.cos(ang) * v / 111320, vlng: Math.sin(ang) * v / 108500, ts: st.clock, src: 'Drill' });
    DR.emit('threats');
    if (!DR.active) { ui.toast('🧟 Drill horde nearby'); mv.fly(lat, lng, 15.5); }
  };

  // no identity yet: log in / register first (everything stays on this phone)
  if (DR.account.current) DR.app.boot(); else DR.ui.auth();
})();
