/* Shared state, persistence (localStorage, works offline), clock and survival maths.

   LIVE mode (default): the phone's real clock, real sunrise/sunset, GPS or "I'm here" taps,
   supplies change only when you log them.
   DRILL mode: a separate copy of the data for practice and demos: time can be sped up,
   walking is simulated and supplies are consumed automatically. It never touches live data. */
(function () {
  const DR = window.DR = window.DR || {};
  const C = window.DR_CATALOG, M = window.DR_MAP;
  const ME = DR.account && DR.account.current;
  const BASE = 'dead-reckoning-v1:' + (ME ? ME.id : 'guest');
  DR.DRILL = ME ? localStorage.getItem('dr-drill:' + ME.id) === '1' : false;
  const KEY = BASE + (DR.DRILL ? ':drill' : '');   // each account's data is isolated, drill data too
  DR.setDrill = on => { localStorage.setItem('dr-drill:' + ME.id, on ? '1' : '0'); location.reload(); };

  DR.START = { lat: 12.97905, lng: 77.57525, name: 'Hideout · Gandhinagar lodge rooftop' };
  DR.BEACON = { lat: 12.99905, lng: 77.59205, name: 'THE LAST BEACON · Palace Grounds settlement' };
  // per person, per hour while walking (hot city, carrying load)
  DR.RATE = { water: 0.30, kcal: 140, battery: 7 };
  DR.REST = 0.5; // fraction of the burn rate while stopped

  const itemById = {};
  for (const it of C.items) itemById[it.id] = it;
  DR.item = id => itemById[id];

  // ---------- clock: local minutes since 1970 (so % 1440 gives the time of day) ----------
  DR.now = () => (Date.now() - new Date().getTimezoneOffset() * 60000) / 60000;
  const SCENARIO0 = 19 * 1440 + 16 * 60 + 30;   // the moment the built-in intel was written against
  const todayAt = (hh, mm) => Math.floor(DR.now() / 1440) * 1440 + hh * 60 + mm;
  const nextAt = (hh, mm) => { const t = todayAt(hh, mm); return t > DR.now() + 30 ? t : t + 1440; };

  // choices made on the permissions step at registration
  const SETUP = (() => { try { return JSON.parse(localStorage.getItem('dr-setup:' + (ME ? ME.id : '')) || '{}'); } catch (e) { return {}; } })();
  const member = (id, name, role, bodyKg, health, pack) => ({ id, name, role, bodyKg, health, pack, medical: '' });
  const defaults = () => {
    const clock = DR.DRILL ? todayAt(16, 30) : DR.now();
    const drillPacks = DR.DRILL;
    return {
      v: 1,
      clock, epoch: clock - SCENARIO0,
      deadline: DR.DRILL ? todayAt(20, 30) : nextAt(20, 30),   // settlement takes in people on foot until 20:30 each evening (FM broadcast)
      running: DR.DRILL ? false : true, speed: DR.DRILL ? 60 : 1,
      mode: DR.DRILL ? 'sim' : SETUP.gps ? 'gps' : 'manual', pos: [DR.START.lat, DR.START.lng], gps: null,
      travel: 'foot',
      battery: 64, realBattery: false,
      team: [
        member('aarav', ME ? ME.name : 'Aarav', 'Scout', 70, drillPacks ? 82 : 100,
          drillPacks ? [['water1l', 0.35], ['biscuit', 1], ['bat', 1], ['torch', 1], ['bandage', 1], ['jacket', 1], ['lighter', 1]] : []),
        member('mira', ME ? ME.partner : 'Mira', 'Carrier', 56, drillPacks ? 90 : 100,
          drillPacks ? [['water1l', 0.25], ['chikki', 1], ['canned', 2], ['rope', 1], ['raincoat', 1], ['papermap', 1], ['painkiller', 1]] : []),
      ].filter(m => m.id === 'aarav' || !ME || ME.partner),   // registered alone = a group of one; add people in PACK
      packLogged: drillPacks,   // live: supply advice waits until you have logged what you carry
      stash: [], base: null,    // supplies kept at your hideout, not carried
      supplyLog: [],            // {t, who, act, item, q, where}
      needs: [],                // item ids you are looking for
      threats: [], places: {}, userPlaces: [],
      cleared: {}, intelCleared: {},   // threat id / intel id -> {by, t}: reported clear by a survivor
      msgs: [], outbox: [], alerts: [], alertAt: {},
      friend: null, rendezvous: null, route: null,
      useIntel: true, intelExtra: [], intelSync: null,
      silent: false, voice: false, ration: false, stealth: false, shareLoc: SETUP.share !== false, nearbyOn: SETUP.nearby !== false,
      me: 'aarav',
      feed: {}, crew: {}, keysFor: {},
      status: 'ok', exposedAt: null,
      inactiveH: 6, lastActive: clock, checkin: null, silenceAlerted: {},
    };
  };

  DR.load = () => {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(defaults(), s); } catch (e) {}
    return defaults();
  };
  DR.state = DR.load();
  let saveTimer = 0;
  DR.save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(DR.state)); } catch (e) {} }, 300);
  };
  DR.reset = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };

  // tiny event bus
  const subs = {};
  DR.on = (ev, fn) => (subs[ev] = subs[ev] || []).push(fn);
  DR.emit = (ev, data) => { (subs[ev] || []).forEach(fn => fn(data)); if (ev !== 'tick') DR.save(); };
  DR.uid = () => Math.random().toString(36).slice(2, 9);
  DR.T = scenarioMinutes => scenarioMinutes + DR.state.epoch;   // built-in timeline -> this phone's timeline

  // ---------- sun: real sunrise/sunset for Bengaluru on any date (NOAA approximation) ----------
  const sunCache = {};
  DR.sun = t => {
    const day = Math.floor(t / 1440);
    if (sunCache[day]) return sunCache[day];
    const d = new Date(day * 86400000), start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const N = Math.floor((day * 86400000 - start) / 86400000);
    const g = 2 * Math.PI / 365 * (N - 1), lat = 12.97 * Math.PI / 180, lng = 77.59;
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)) * 180 / Math.PI;
    const tz = -new Date(day * 86400000).getTimezoneOffset();
    return (sunCache[day] = { rise: Math.round(720 - 4 * (lng + ha) - eq + tz), set: Math.round(720 - 4 * (lng - ha) - eq + tz) });
  };
  Object.defineProperty(DR, 'SUNSET', { get: () => DR.sun(DR.state.clock).set });
  Object.defineProperty(DR, 'SUNRISE', { get: () => DR.sun(DR.state.clock).rise });

  DR.day = t => Math.floor(t / 1440);
  DR.hhmm = t => { const m = ((Math.floor(t) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  DR.date = t => { const d = new Date(Math.floor(t) * 60000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  DR.stamp = t => (DR.day(t) === DR.day(DR.state.clock) ? 'Today ' : DR.day(t) === DR.day(DR.state.clock) - 1 ? 'Yesterday ' : DR.date(t) + ' ') + DR.hhmm(t);
  DR.isNight = t => { const s = DR.sun(t), m = ((t % 1440) + 1440) % 1440; return m >= s.set || m < s.rise; };
  DR.minsToSunset = t => DR.sun(t).set - (((t % 1440) + 1440) % 1440);
  DR.dur = mins => {
    if (!isFinite(mins)) return '∞';
    mins = Math.max(0, Math.round(mins));
    const d = Math.floor(mins / 1440), h = Math.floor(mins % 1440 / 60), m = mins % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };
  DR.ago = t => { const d = DR.state.clock - t; return d < 1 ? 'just now' : d < 60 ? `${Math.round(d)} min ago` : d < 1440 ? `${Math.floor(d / 60)}h ${Math.round(d % 60)}m ago` : `${Math.floor(d / 1440)}d ago`; };

  // ---------- people & inventory ----------
  DR.person = id => DR.state.team.find(p => p.id === id);
  DR.packKg = p => p.pack.reduce((s, [id, q]) => s + (itemById[id]?.vehicle ? 0 : (itemById[id]?.kg || 0) * q), 0);
  DR.packLimit = p => p.bodyKg * 0.15 + (DR.state.travel === 'cycle' ? 8 : DR.state.travel === 'car' ? 40 : 0);
  const sumRows = (rows, t, who) => {
    for (const [id, q] of rows) {
      const it = itemById[id]; if (!it || q <= 0) continue;
      t.water += (it.water || 0) * q; t.kcal += (it.kcal || 0) * q; t.heal += (it.heal || 0) * q; t.charge += (it.charge || 0) * q;
      t.fuel += (it.fuel || 0) * q;
      if (it.weapon && who) t.weapons.push({ who, name: it.name, reach: it.weapon });
      if (who) t.armor += (it.armor || 0) * Math.min(q, 1);
      t.items[id] = (t.items[id] || 0) + q;
    }
    return t;
  };
  // what the group CARRIES (stash at base counted separately)
  DR.totals = () => {
    const t = { water: 0, kcal: 0, heal: 0, charge: 0, fuel: 0, weapons: [], armor: 0, items: {} };
    for (const p of DR.state.team) sumRows(p.pack, t, p.name);
    return t;
  };
  DR.stashTotals = () => sumRows(DR.state.stash, { water: 0, kcal: 0, heal: 0, charge: 0, fuel: 0, weapons: [], armor: 0, items: {} }, null);
  DR.people = () => DR.state.team.filter(p => p.health > 0).length || 1;
  DR.burn = moving => {
    const f = (moving ? 1 : DR.REST) * DR.people() * (DR.state.ration ? 0.6 : 1);
    return { water: DR.RATE.water * f, kcal: DR.RATE.kcal * f, battery: DR.RATE.battery * (DR.state.lowPower ? 0.55 : 1) };
  };
  // hours each resource lasts while on the move
  DR.survival = () => {
    const t = DR.totals(), b = DR.burn(true);
    const out = { water: t.water / b.water, food: t.kcal / b.kcal + 3, battery: (DR.state.battery + t.charge) / b.battery };
    let lim = 'water';
    for (const k of ['food', 'battery']) if (out[k] < out[lim]) lim = k;
    out.limit = lim; out.hours = out[lim];
    return out;
  };
  // days the whole group can hold out at the base (resting, carried + stash)
  DR.holdout = () => {
    const t = DR.totals(), st = DR.stashTotals(), n = DR.people();
    return { water: (t.water + st.water) / (2.5 * n), food: (t.kcal + st.kcal) / (1800 * n) };
  };

  // travel modes. Foot first: quiet, goes anywhere. Cycle: quiet, 2-3x faster, needs a bicycle each.
  // Car: only for big groups or long trips: loud, needs fuel, residential lanes are jammed with wrecks.
  DR.TRAVEL = {
    foot:  { id: 'foot',  icon: '🚶', label: 'On foot', speed: 4.8 },
    cycle: { id: 'cycle', icon: '🚲', label: 'Bicycle', speed: 12 },
    car:   { id: 'car',   icon: '🚗', label: 'Car',     speed: 22 },
  };
  DR.CAR_MIN_PEOPLE = 6; DR.CAR_MIN_KM = 8; DR.FUEL_PER_KM = 0.1;
  DR.travelCheck = (mode, km) => {
    const s = DR.state, n = s.team.length, t = DR.totals();
    if (mode === 'cycle') {
      const bikes = t.items.bicycle || 0;
      return bikes >= n ? { ok: true } : { ok: false, why: `Needs a bicycle for each person (${Math.floor(bikes)}/${n}). Check apartment parking, sports and cycle shops.` };
    }
    if (mode === 'car') {
      if (n < DR.CAR_MIN_PEOPLE && km < DR.CAR_MIN_KM) return { ok: false, why: `Only worth the noise for ${DR.CAR_MIN_PEOPLE}+ people or trips over ${DR.CAR_MIN_KM} km (this one is ${km.toFixed(1)} km, ${n} people). Engines pull every horde in earshot.` };
      const need = km * DR.FUEL_PER_KM * 1.3;
      if (t.fuel < need) return { ok: false, why: `Needs about ${need.toFixed(1)} L of fuel (you have ${t.fuel.toFixed(1)} L). Pumps have no power: siphon from abandoned vehicles.` };
      return { ok: true };
    }
    return { ok: true };
  };
  // travel pace, km/h
  DR.pace = (mode = DR.state.travel) => {
    const base = DR.TRAVEL[mode].speed;
    let pace = base;
    for (const p of DR.state.team) {
      const over = Math.max(0, DR.packKg(p) - DR.packLimit(p));
      pace = Math.min(pace, base * Math.max(0.45, 1 - 0.05 * over) * (p.health < 40 ? 0.75 : 1));
    }
    if (DR.isNight(DR.state.clock)) pace *= mode === 'foot' ? 0.8 : 0.65;
    if (DR.state.stealth) pace *= 0.85;
    if (DR.state.ration) pace *= 0.95;
    return pace;
  };
  DR.log = (act, item, q, who, where) => {
    const s = DR.state;
    s.supplyLog.unshift({ t: s.clock, act, item, q: +(+q).toFixed(2), who: who || DR.person(s.me).name, where: where || '' });
    s.supplyLog = s.supplyLog.slice(0, 150);
  };
  // consume a stat (water litres / kcal / fuel) across all packs, smallest units first
  DR.consume = (stat, amount, logIt) => {
    for (const p of DR.state.team) for (const row of p.pack) {
      if (amount <= 0) break;
      const it = itemById[row[0]]; if (!it || !it[stat] || row[1] <= 0) continue;
      const have = it[stat] * row[1], use = Math.min(have, amount);
      row[1] = Math.max(0, +(row[1] - use / it[stat]).toFixed(3));
      amount -= use;
      if (logIt) DR.log('used', row[0], use / it[stat], p.name);
    }
    for (const p of DR.state.team) p.pack = p.pack.filter(r => r[1] > 0.001);
    return Math.max(0, amount);
  };
  DR.addItem = (pid, id, q = 1) => {
    const rows = pid === 'stash' ? DR.state.stash : DR.person(pid).pack;
    const row = rows.find(r => r[0] === id);
    if (row) row[1] = +(row[1] + q).toFixed(3); else if (q > 0) rows.push([id, q]);
    const keep = rows.filter(r => r[1] > 0.001);
    if (pid === 'stash') DR.state.stash = keep; else DR.person(pid).pack = keep;
    DR.state.packLogged = true;
  };

  // ---------- places (abandoned shops & buildings where supplies may remain) ----------
  // Nothing is open and nobody works there. Locations come from the pre-outbreak map; stock is
  // what survivors last recorded, starting from pre-blackout crowd reports.
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  DR.places = M.P.map((p, i) => {
    const sub = M.subs[p[1]], lat = p[3] / 1e5, lng = p[4] / 1e5, r = hash(`${i}:${sub}`);
    return { id: `p${i}`, cat: p[0], sub, name: p[2], lat, lng, seed: r };
  });
  DR.placeStatus = pl => {
    const o = DR.state.places[pl.id];
    if (o) return o;
    let heat = 0;
    for (const r of window.DR_INTEL.reports) if (r.kind !== 'safe' && DR.geo.dist(pl.lat, pl.lng, r.lat, r.lng) < r.r * 1.3) heat = Math.max(heat, r.sev);
    // 19 days in: most places were picked over in the first week
    const stock = pl.seed < 0.25 + heat * 0.45 ? 0 : pl.seed < 0.6 + heat * 0.25 ? 1 : pl.seed < 0.88 ? 2 : 3;
    const seen = DR.T(18 * 1440 + 9 * 60 + Math.floor(pl.seed * 780));
    return { stock, seen, by: pl.seed > 0.5 ? 'Pre-blackout crowd map' : 'Cached store listing', danger: heat > 0.5 };
  };
  DR.setPlace = (pl, patch) => {
    DR.state.places[pl.id] = Object.assign({}, DR.placeStatus(pl), patch, { seen: DR.state.clock, by: DR.person(DR.state.me).name });
    DR.emit('places');
  };
  DR.allPlaces = () => DR.places.concat(DR.state.userPlaces);
  // places that probably still hold an item (by what that kind of shop stocked)
  DR.whereToFind = (itemId, from = DR.state.pos, n = 5) => DR.allPlaces()
    .filter(p => (C.loot[p.sub] || []).includes(itemId) && DR.placeStatus(p).stock > 0)
    .map(p => ({ p, d: DR.geo.dist(from[0], from[1], p.lat, p.lng) }))
    .sort((a, b) => a.d - b.d).slice(0, n);

  // ---------- intel (cached before the network died) ----------
  DR.intelRaw = () => window.DR_INTEL.reports.map(r => ({ ...r, t: DR.T(r.t) })).concat(DR.state.intelExtra);
  // what still counts for danger: everything not reported clear by a survivor
  DR.intelAll = () => DR.intelRaw().filter(r => !(DR.state.intelCleared || {})[r.id]);
  DR.intelLastSync = () => DR.state.intelSync || DR.T(window.DR_INTEL.lastSync);
  DR.intelWeight = (r, now) => {
    if (r.kind === 'origin') return r.sev * r.cred;
    const ageH = Math.max(0, (now - r.t) / 60);
    return r.sev * r.cred * Math.pow(0.5, ageH / 24);   // half-life 24h
  };
})();
