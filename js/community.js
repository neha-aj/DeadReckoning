/* COMMUNITY BOARD: no server, no network.
   Every phone keeps the whole board. When two phones meet (QR stream, sound, or in a native
   build Bluetooth / Wi-Fi Direct), they swap the posts the other is missing. Each phone carries
   everyone's posts onward, so a tip posted at Shivajinagar reaches Palace Road phone-by-phone
   ("store-and-forward" / gossip). Posts are signed by the author's key, so they cannot be forged.

   In this prototype the other survivors around the city are SIMULATED phones (real keys, real
   signatures): walk within Wi-Fi Direct range of one and your boards sync automatically. */
(function () {
  const DR = window.DR, G = DR.geo, A = DR.account;
  const cm = DR.community = {};
  const S = () => DR.state;

  cm.KINDS = {
    supply: { icon: '📦', label: 'Supplies', color: '#3dffa8' },
    danger: { icon: '⚠', label: 'Danger', color: '#ff3b5c' },
    safe:   { icon: '🏠', label: 'Safe spot', color: '#38e8ff' },
    need:   { icon: '🙋', label: 'Need', color: '#ffb020' },
    offer:  { icon: '🤝', label: 'Offer', color: '#b18cff' },
    note:   { icon: '💬', label: 'Note', color: '#7f9db2' },
    alert:  { icon: '🚨', label: 'Alert', color: '#ff3b5c' },
    move:   { icon: '📢', label: 'Broadcast', color: '#ffb020' },
    clear:  { icon: '✅', label: 'All clear', color: '#3dffa8' },
  };
  cm.TLABEL = { horde: '🧟 Horde', walkers: '🧟 Walkers', block: '✖ Road blocked', fire: '🔥 Fire' };
  cm.ALERTS = {
    sos:      { icon: '🆘', label: 'SOS / need help', lvl: 'danger' },
    horde:    { icon: '🧟', label: 'Horde coming', lvl: 'danger' },
    move:     { icon: '🏃', label: 'Move now', lvl: 'danger' },
    hide:     { icon: '🤫', label: 'Hide, stay silent', lvl: 'warn' },
    isolate:  { icon: '☣', label: 'I am isolating', lvl: 'warn' },
    inactive: { icon: '⏱', label: 'Not responding', lvl: 'danger' },
    clear:    { icon: '✅', label: 'All clear', lvl: 'info' },
  };
  cm.STATUS = { ok: ['✅', 'OK'], injured: ['🩹', 'Injured'], exposed: ['☣', 'Exposed · isolating'], help: ['🆘', 'Needs help'] };
  cm.WIFI_RANGE = 250;    // metres: Wi-Fi Direct in the open (Bluetooth ~30-100 m)
  cm.TOGETHER = 200;      // within this distance and heard recently = "together"

  const me = () => A.current;
  const canon = p => [p.id, p.a, p.an, p.pk, Math.round(p.t), p.k, p.sub || '', p.lat ?? '', p.lng ?? '', p.x || '', p.ref || '', p.st || '', p.img ? p.img.length : 0, p.m ? JSON.stringify(p.m) : ''].join('|');

  // ---------- create / ingest ----------
  cm.create = async ({ k, x = '', lat = null, lng = null, img = null, ref = null, sub = null, st = null, scope = null, m = null }) => {
    const s = S();
    const p = { id: DR.uid() + DR.uid().slice(0, 3), a: me().id, an: me().name, pk: me().pub, t: Math.round(s.clock), k, x: x.slice(0, 200), lat, lng, img, ref, sub, st, m, hops: [], scope };
    if (lat != null) { p.lat = +lat.toFixed(5); p.lng = +lng.toFixed(5); }
    p.sig = await A.sign(canon(p));
    p.ok = true; p.mine = true; p.reached = [];
    if (k === 'hb') for (const [id, q] of Object.entries(s.feed)) if (q.k === 'hb' && q.a === me().id) delete s.feed[id];
    s.feed[p.id] = p;
    // anyone in range right now gets it immediately
    for (const n of cm.npcsInRange()) { n.has = n.has || []; n.has.push(p.id); p.reached.push(n.name); }
    DR.emit('feed');
    return p;
  };

  cm.ingest = async (posts, via) => {
    const s = S(); let fresh = 0;
    for (const raw of posts) {
      if (!raw || !raw.id || s.feed[raw.id]) continue;
      if (raw.a === me().id) continue;
      const p = { ...raw, hops: (raw.hops || []).concat(via && raw.an !== via ? [via] : []), mine: false };
      p.ok = await A.verify(p.a, p.pk, canon(p), p.sig);
      if (p.k === 'hb') {
        const older = Object.values(s.feed).find(q => q.k === 'hb' && q.a === p.a);
        if (older && older.t >= p.t) continue;
        if (older) delete s.feed[older.id];
      }
      s.feed[p.id] = p; fresh++;
      cm.heard(p);
      if (p.ok && p.m && p.m.tid) cm.applyThreatPost(p);
      if (p.k === 'alert' && p.ok) {
        const al = cm.ALERTS[p.sub] || cm.ALERTS.sos;
        DR.sentinel.alert(al.lvl, `${al.icon} ${p.an}: ${p.x || al.label}${p.hops.length ? ` (via ${p.hops.join(' → ')})` : ''}`);
      }
    }
    if (fresh) { DR.emit('feed'); DR.emit('places'); }
    return fresh;
  };

  // remember the newest thing we know about each person
  cm.heard = p => {
    const s = S(), c = s.crew[p.a] = s.crew[p.a] || { name: p.an, pub: p.pk, lastHeard: 0, inCrew: false };
    c.name = p.an; c.pub = p.pk;
    if (p.t >= c.lastHeard) {
      c.lastHeard = p.t;
      if (p.lat != null) { c.lat = p.lat; c.lng = p.lng; }
      if (p.st) c.status = p.st;
      if (s.silenceAlerted[p.a]) delete s.silenceAlerted[p.a];
      const partner = A.current && A.current.partner;
      if (partner && p.an === partner && p.lat != null && (!s.friend || p.t > s.friend.ts)) s.friend = { name: p.an, id: p.a, lat: p.lat, lng: p.lng, ts: p.t, plan: s.friend && s.friend.plan };
    }
  };

  cm.posts = (filter = 'all') => Object.values(S().feed)
    .filter(p => p.k !== 'hb' && p.k !== 'conf' && p.k !== 'join' && p.k !== 'confirm' && (filter === 'all' ? p.k !== 'move' : p.k === filter))
    .sort((a, b) => b.t - a.t);
  cm.votes = p => {
    let yes = 0, no = 0, mine = 0;
    for (const v of Object.values(S().feed)) if (v.k === 'conf' && v.ref === p.id) { v.x === '+1' ? yes++ : no++; if (v.a === me().id) mine = v.x === '+1' ? 1 : -1; }
    return { yes, no, mine };
  };
  cm.vote = (p, up) => cm.create({ k: 'conf', ref: p.id, x: up ? '+1' : '-1' });

  // ---------- broadcasts: 'we are going to X at T by this route, join us' ----------
  cm.broadcasts = () => Object.values(S().feed).filter(p => p.k === 'move' && p.m && p.m.when > S().clock - 120).sort((a, b) => a.m.when - b.m.when);
  cm.joins = p => Object.values(S().feed).filter(j => j.k === 'join' && j.ref === p.id);
  cm.broadcast = async m => cm.create({ k: 'move', x: m.note || '', lat: m.flat, lng: m.flng, m });
  cm.join = async (p, n) => cm.create({ k: 'join', ref: p.id, x: `${n} joining`, lat: S().pos[0], lng: S().pos[1] });

  // ---------- threats: anyone can report, re-report ("still there") or clear ----------
  const tLabel = t => cm.TLABEL[t.type] || 'Threat';
  cm.shareThreat = t => cm.create({ k: 'danger', sub: t.type, x: tLabel(t) + ' sighted here', lat: t.lat, lng: t.lng, m: { tid: t.id, type: t.type, r: t.r } });
  cm.confirmThreat = t => {
    const s = S(); t.ts = s.clock; t.confirms = (t.confirms || 0) + 1; t.lastBy = me().name;
    delete s.cleared[t.id];
    DR.emit('threats');
    return cm.create({ k: 'confirm', x: 'Still there: ' + tLabel(t), lat: t.lat, lng: t.lng, m: { tid: t.id, type: t.type, r: t.r } });
  };
  // tid is a field-report id, or "intel:<id>" for a cached intel item (e.g. a road that has been cleared)
  cm.clearThreat = (tid, label, lat, lng) => {
    const s = S(), mark = { by: me().name, t: s.clock };
    if (tid.startsWith('intel:')) s.intelCleared[tid.slice(6)] = mark;
    else { s.cleared[tid] = mark; s.threats = s.threats.filter(t => t.id !== tid); }
    DR.emit('threats'); DR.mapview.drawIntel();
    return cm.create({ k: 'clear', x: 'All clear: ' + label, lat, lng, m: { tid } });
  };
  cm.restoreIntel = id => {   // the cleared road is blocked again
    const s = S(), r = DR.intelRaw().find(x => x.id === id);
    delete s.intelCleared[id]; DR.emit('threats'); DR.mapview.drawIntel();
    return cm.create({ k: 'confirm', x: 'Still there: ' + r.text.slice(0, 60), lat: r.lat, lng: r.lng, m: { tid: 'intel:' + id } });
  };
  // a report, re-report or all-clear arrived from another phone
  cm.applyThreatPost = p => {
    const s = S(), tid = p.m.tid, isIntel = tid.startsWith('intel:');
    if (p.k === 'clear') {
      const ex = s.threats.find(t => t.id === tid);
      if (isIntel) { const id = tid.slice(6), was = s.intelCleared[id]; if (!was || was.t < p.t) s.intelCleared[id] = { by: p.an, t: p.t }; }
      else if (!ex || ex.ts <= p.t) { s.cleared[tid] = { by: p.an, t: p.t }; s.threats = s.threats.filter(t => t.id !== tid); }
      DR.ui.toast('✅ ' + p.an + ': ' + p.x); DR.emit('threats'); DR.mapview.drawIntel(); return;
    }
    if (isIntel) { const id = tid.slice(6); if (s.intelCleared[id] && s.intelCleared[id].t < p.t) { delete s.intelCleared[id]; DR.emit('threats'); DR.mapview.drawIntel(); } return; }
    // danger (first report) or confirm (still there): add or refresh, unless it was cleared AFTER this was written
    if (s.cleared[tid] && s.cleared[tid].t >= p.t) return;
    delete s.cleared[tid];
    const ex = s.threats.find(t => t.id === tid);
    if (ex) { if (p.t > ex.ts) { ex.ts = p.t; ex.lastBy = p.an; } if (p.k === 'confirm') ex.confirms = (ex.confirms || 0) + 1; }
    else if (p.m.type && cm.TLABEL[p.m.type]) s.threats.push({ id: tid, type: p.m.type, lat: p.lat, lng: p.lng, r: p.m.r || 100, vlat: 0, vlng: 0, ts: p.t, src: p.an, confirms: p.k === 'confirm' ? 1 : 0 });
    DR.emit('threats');
  };

  // ---------- heartbeat (status + location, replaces the previous one) ----------
  // location only if you chose to share it (⚙ / CREW); status always
  cm.heartbeat = () => cm.create({ k: 'hb', lat: S().shareLoc ? S().pos[0] : null, lng: S().shareLoc ? S().pos[1] : null, st: S().status, x: 'check-in' });

  // ---------- alerts to the crew ----------
  cm.sendAlert = async (sub, text, scope) => {
    const s = S(), al = cm.ALERTS[sub];
    const p = await cm.create({ k: 'alert', sub, x: text || al.label, lat: s.pos[0], lng: s.pos[1], st: s.status, scope });
    const near = cm.together();
    if (scope === 'near' && navigator.vibrate) navigator.vibrate([300, 100, 300]);
    DR.ui.toast(`🚨 ${al.label}: delivered to ${near.length ? near.map(n => n.name).join(', ') : 'nobody in range yet'}${scope === 'all' ? ' · travels to everyone else on contact' : ''}`);
    s.outbox.push(`alert:${p.id}`);
    return p;
  };
  // who is physically with you right now
  cm.together = () => {
    const s = S(), out = [];
    for (const t of s.team) if (t.id !== s.me && !(s.friend && s.friend.name === t.name)) out.push({ name: t.name, partner: true });
    for (const n of cm.npcsInRange(cm.TOGETHER)) out.push({ name: n.name });
    return out;
  };

  // ---------- multi-frame QR stream (whole board, phone to phone) ----------
  const toB64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  cm.pack = async posts => {
    const json = JSON.stringify(posts.map(({ ok, mine, reached, ...p }) => p));
    if (!window.CompressionStream) return 'J' + btoa(unescape(encodeURIComponent(json)));
    const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'Z' + toB64(buf);
  };
  cm.unpack = async str => {
    if (str[0] === 'J') return JSON.parse(decodeURIComponent(escape(atob(str.slice(1)))));
    const bytes = Uint8Array.from(atob(str.slice(1)), c => c.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  };
  cm.frames = async (withImages = true) => {
    const posts = Object.values(S().feed).filter(p => p.k !== 'hb' || p.a === me().id).map(p => withImages ? p : { ...p, img: null });
    const data = await cm.pack(posts), CH = 700, sid = DR.uid().slice(0, 4), n = Math.ceil(data.length / CH);
    return { count: posts.length, bytes: data.length, frames: [...Array(n)].map((_, i) => `DRX|${sid}|${i}|${n}|${me().name}|${data.slice(i * CH, (i + 1) * CH)}`) };
  };
  // collects frames in any order; resolves once all are in
  cm.collector = () => {
    const got = {}; let total = 0, sid = null, from = '';
    return {
      add(text) {
        const m = /^DRX\|(\w+)\|(\d+)\|(\d+)\|([^|]*)\|(.*)$/s.exec(text);
        if (!m) return null;
        if (sid && m[1] !== sid) return null;
        sid = m[1]; total = +m[3]; from = m[4]; got[+m[2]] = m[5];
        return { have: Object.keys(got).length, total, done: Object.keys(got).length === total, from, data: () => [...Array(total)].map((_, i) => got[i]).join('') };
      },
    };
  };

  // ---------- simulated survivors (other phones around the city) ----------
  const NPC = [
    { key: 'kavya', name: 'Kavya', role: 'Ex-nursing student', lat: 12.9806, lng: 77.5968, status: 'ok', posts: [
      { k: 'supply', x: 'Bowring college store room (behind the main block) still has dressings, gloves and two boxes of antibiotics. Back door, needs a crowbar.', lat: 12.9839, lng: 77.5989, t: -260 },
      { k: 'offer', x: 'I was a nurse-trainee. Hiding near Cubbon Park metro. If someone is bitten or bleeding, post here and I will tell you what to do.', lat: 12.9810, lng: 77.5975, t: -95 },
    ] },
    { key: 'farhan', name: 'Farhan', role: 'Mechanic', lat: 12.9872, lng: 77.6010, status: 'ok', carries: ['kavya'], posts: [
      { k: 'danger', x: 'Russell Market back lanes fill up with them after 5 pm. Go round by Infantry Road.', lat: 12.9862, lng: 77.6066, t: -140 },
      { k: 'offer', x: 'Charged 3 power banks off a car battery. Will trade for water.', lat: 12.9872, lng: 77.6010, t: -70 },
      { k: 'move', x: 'Seven of us in a van to the settlement. Room for two more if you bring 3 L of fuel. Engine is loud: we go once and fast.', lat: 12.9872, lng: 77.6010, t: -45,
        m: { to: 'The Last Beacon · Palace Grounds', tlat: 12.99905, tlng: 77.59205, when: 26 * 60, mode: 'car', route: 'Main roads only · Infantry Rd → Cunningham Rd', n: 7, open: true, meet: 'Infantry Road petrol pump', flat: 12.9832, flng: 77.6015 } },
    ] },
    { key: 'gowda', name: 'Gowda', role: 'Ex-constable, hiding', lat: 12.9772, lng: 77.5862, status: 'injured', carries: ['farhan'], posts: [
      { k: 'supply', x: 'Vidhana Soudha east gate: water cartons from the abandoned relief checkpoint. Took 6, about 20 left.', lat: 12.9797, lng: 77.5912, t: -120 },
      { k: 'alert', sub: 'horde', x: 'Big horde moving north up Kasturba Road toward Queens Road. Avoid after 17:00.', lat: 12.9760, lng: 77.5960, t: -40 },
    ] },
    { key: 'lakshmi', name: 'Lakshmi', role: 'Teacher', lat: 12.9898, lng: 77.5778, status: 'ok', carries: ['gowda'], posts: [
      { k: 'safe', x: 'Seshadripuram school terrace: gate chained, 5 of us, room for two more tonight. Come before dark.', lat: 12.9902, lng: 77.5772, t: -200 },
      { k: 'need', x: 'Need ORS and paracetamol for two children with fever.', lat: 12.9898, lng: 77.5778, t: -60 },
      { k: 'move', x: 'Five of us, two children. Walking slowly, keeping to back roads. Anyone heading the same way can come; meet at the school gate.', lat: 12.9902, lng: 77.5772, t: -30,
        m: { to: 'The Last Beacon · Palace Grounds', tlat: 12.99905, tlng: 77.59205, when: 14 * 60, mode: 'foot', route: 'Safest · Race Course back road', n: 5, open: true, meet: 'Seshadripuram school gate', flat: 12.9902, flng: 77.5772 } },
    ] },
    { key: 'agnes', name: 'Agnes', role: 'Hiding with 3 others', lat: 12.9928, lng: 77.5868, status: 'ok', carries: ['lakshmi', 'gowda'], posts: [
      { k: 'safe', x: 'Four of us hiding in Mount Carmel college. Side gate is chained; knock three times if you are heading to the settlement and need water.', lat: 12.9930, lng: 77.5862, t: -150 },
      { k: 'danger', x: 'Palace Road near the underpass: walkers hiding in stalled buses. Walk on the far side.', lat: 12.9945, lng: 77.5880, t: -50 },
    ] },
    { key: 'ravi', name: 'Ravi', role: 'Auto driver · your crew', lat: 12.9688, lng: 77.5790, status: 'ok', inCrew: true, silentSince: 19 * 1440 + 10 * 60 + 5, posts: [
      { k: 'note', x: 'Going down KR Road to look for my brother. Back at the lodge by noon.', lat: 12.9688, lng: 77.5790, abs: 19 * 1440 + 10 * 60 + 5 },
    ] },
  ];
  cm.npcs = () => S().npcs || [];
  cm.npcsInRange = (r = cm.WIFI_RANGE) => cm.npcs().filter(n => !n.silent && G.dist(S().pos[0], S().pos[1], n.lat, n.lng) <= r);

  // create the simulated survivors once per account: real key pairs, real signed posts
  cm.seed = async () => {
    const s = S();
    if (s.npcs) return;
    const base = s.clock, pool = {};
    const npcs = [];
    for (const d of NPC) {
      const k = await A.newKeys();
      s.keysFor[k.id] = k.privJwk;
      const n = { id: k.id, key: d.key, name: d.name, role: d.role, lat: d.lat, lng: d.lng, status: d.status, has: [], lastSync: null, silent: !!d.silentSince };
      for (const q of d.posts) {
        const p = { id: DR.uid() + DR.uid().slice(0, 3), a: k.id, an: d.name, pk: k.pub, t: q.abs ? DR.T(q.abs) : base + q.t, k: q.k, x: q.x, lat: q.lat, lng: q.lng, img: null, ref: null, sub: q.sub || null, st: d.status, m: q.m ? { ...q.m, when: base + q.m.when } : null, hops: [] };
        p.sig = await A.signWith(k.privJwk, canon(p));
        pool[p.id] = p; n.has.push(p.id);
      }
      n.carries = d.carries || [];
      npcs.push(n);
      if (d.inCrew) {
        // you met Ravi this morning: his note is already on your board, and he is in your crew
        const p = pool[n.has[0]];
        s.feed[p.id] = { ...p, ok: true, hops: [] };
        s.crew[n.id] = { name: n.name, pub: k.pub, lastHeard: DR.T(d.silentSince), lat: d.lat, lng: d.lng, status: 'ok', inCrew: true };
      }
    }
    // gossip already happened between them before you arrived (multi-hop)
    for (const n of npcs) for (const key of n.carries) { const o = npcs.find(x => x.key === key); n.has.push(...o.has.filter(id => !n.has.includes(id))); }
    s.npcPool = pool; s.npcs = npcs;
    DR.save(); DR.emit('feed'); DR.emit('marks');
  };

  // walk into range of another survivor's phone: swap boards both ways
  cm.encounters = async () => {
    const s = S();
    for (const n of cm.npcsInRange()) {
      if (n.lastSync && s.clock - n.lastSync < 20) continue;
      n.lastSync = s.clock;
      const theirs = n.has.map(id => s.npcPool[id]).filter(p => p && !s.feed[p.id]).map(p => ({ ...p, hops: p.a === n.id ? [] : [...(p.hops || [])] }));
      // posts they carry from others arrived via them
      for (const p of theirs) if (p.a !== n.id) p.hops = [n.name];
      const got = await cm.ingest(theirs, null);
      let gave = 0;
      for (const p of Object.values(s.feed)) if (!n.has.includes(p.id)) { n.has.push(p.id); s.npcPool[p.id] = p; if (p.mine) { p.reached = p.reached || []; if (!p.reached.includes(n.name)) p.reached.push(n.name); } gave++; }
      const c = s.crew[n.id] = s.crew[n.id] || { name: n.name, pub: '', lastHeard: 0 };
      Object.assign(c, { lastHeard: s.clock, lat: n.lat, lng: n.lng, status: n.status });
      if (got) DR.ui.toast(`📡 ${n.name} in range: +${got} new posts`);
      DR.emit('feed'); DR.emit('marks');
    }
  };

  // ---------- inactivity watchdog ----------
  // minutes of DAYLIGHT between two times (night silence is normal: people sleep)
  cm.daylight = (t0, t1) => {
    let total = 0;
    for (let d = Math.floor(t0 / 1440); d <= Math.floor(t1 / 1440); d++) {
      const sun = DR.sun(d * 1440), a = Math.max(t0, d * 1440 + sun.rise), b = Math.min(t1, d * 1440 + sun.set);
      if (b > a) total += b - a;
    }
    return total;
  };
  cm.active = () => {
    const s = S();
    s.lastActive = s.clock;
    if (s.checkin && !s.checkin.sent) { s.checkin = null; DR.ui.close(); DR.ui.toast('✓ Check-in recorded'); cm.heartbeat(); }
  };
  cm.watch = () => {
    const s = S(), lim = s.inactiveH * 60, now = s.clock;
    // you
    if (!s.checkin && cm.daylight(s.lastActive, now) >= lim) {
      s.checkin = { since: now };
      DR.ui.checkin();
    } else if (s.checkin && !s.checkin.sent && now - s.checkin.since >= 10) {
      s.checkin.sent = true;
      const h = Math.round(cm.daylight(s.lastActive, now) / 60);
      cm.sendAlert('inactive', `${me().name} has not moved or touched the phone for ${h}h of daylight and did not answer the check-in. Last location attached.`, 'all');
      DR.sentinel.alert('danger', 'No answer to the check-in: your crew and everyone you meet will be alerted.');
      DR.ui.close();
    }
    // your partner, if you are split up
    const partner = s.team.find(t => t.id !== s.me) || { name: s.friend && s.friend.name };
    if (s.friend && cm.daylight(s.friend.ts, now) >= lim && !s.silenceAlerted.partner) {
      s.silenceAlerted.partner = true;
      DR.sentinel.alert('danger', `${partner.name} has been silent for ${s.inactiveH}h of daylight. Last seen ${DR.ago(s.friend.ts)}. Go to the rendezvous.`);
    }
    // crew members you travel with on and off
    for (const [id, c] of Object.entries(s.crew)) {
      if (!c.inCrew || s.silenceAlerted[id]) continue;
      const gap = cm.daylight(c.lastHeard, now);
      if (gap >= lim) {
        s.silenceAlerted[id] = true;
        DR.sentinel.alert('danger', `${c.name} (crew) silent for ${Math.round(gap / 60)}h of daylight. Last seen ${c.lat ? G.fmtDist(G.dist(s.pos[0], s.pos[1], c.lat, c.lng)) + ' away' : ''} ${DR.ago(c.lastHeard)}. Alert sent to everyone you meet.`);
        if (me()) cm.sendAlert('inactive', `${c.name} missing: no contact for ${Math.round(gap / 60)}h of daylight. Last seen near KR Road. If you see him, sync with him or tell us.`, 'all');
      }
    }
    // isolation countdown
    if (s.status === 'exposed' && s.exposedAt && now - s.exposedAt >= 72 * 60 && !s.isoDone) {
      s.isoDone = true;
      DR.sentinel.alert('info', '72 hours in isolation with no symptoms recorded. You can set your status back to OK.');
    }
  };

  // ---------- photos: shrink until it fits a few QR frames ----------
  cm.shrinkImage = file => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let w = 220, q = 0.55, out;
      for (let i = 0; i < 6; i++) {
        const c = document.createElement('canvas'), k = Math.min(1, w / Math.max(img.width, img.height));
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        if (out.length < 9000) break;
        w *= 0.8; q *= 0.85;
      }
      URL.revokeObjectURL(img.src); res(out);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });

  // survivor ID card (scan to add someone to your crew as a verified contact)
  // DRID|id|name|pubkey|blood|lat|lng|time   (location only if you share it)
  cm.idCard = () => { const s = S(), loc = s.shareLoc ? `${s.pos[0].toFixed(5)}|${s.pos[1].toFixed(5)}|${Math.round(s.clock)}` : '||'; return `DRID|${me().id}|${me().name}|${me().pub}|${me().blood || ''}|${loc}`; };
  cm.addFromId = async raw => {
    const [, id, name, pub, blood, la, lo, t] = raw.split('|');
    let fp = null; try { fp = await A.fingerprint(A.unb64(pub)); } catch (e) {}
    if (fp !== id) { DR.ui.toast('This ID card does not match its key. Not added.'); return null; }
    if (A.current && id === A.current.id) { DR.ui.toast('That is your own ID card'); return null; }
    const s = S(), c = s.crew[id] = s.crew[id] || { name, pub, lastHeard: s.clock };
    // scanning a card means you met face to face: they join your crew; their card carries their position
    const lat = la ? +la : s.pos[0], lng = lo ? +lo : s.pos[1];
    Object.assign(c, { name, pub, blood, inCrew: true, scanned: true, lastHeard: s.clock, lat, lng, status: c.status || 'ok' });
    delete s.silenceAlerted[id];
    if (A.current && A.current.partner && name === A.current.partner) s.friend = { name, id, lat, lng, ts: s.clock, plan: null };
    DR.emit('feed'); DR.emit('marks');
    return c;
  };
})();
