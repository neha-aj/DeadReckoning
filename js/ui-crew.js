/* CREW tab (community board, crew safety, alerts, links), GUIDE tab, login/register, check-in alarm. */
(function () {
  const DR = window.DR, G = DR.geo, ui = DR.ui, cm = DR.community, A = DR.account, GD = window.DR_GUIDE;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = () => DR.state;
  const sw = (on, act) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}"></button>`;
  const dirFromMe = (lat, lng) => `${G.fmtDist(G.dist(S().pos[0], S().pos[1], lat, lng))} ${G.compass(G.bearing(S().pos[0], S().pos[1], lat, lng))}`;
  let view = 'board', kind = 'supply', filter = 'all', postLoc = true, postImg = null, postText = '';
  let alertSub = 'horde', guideOpen = null, guideQ = '', authMode = null, authPick = null;

  // ================= CREW =================
  ui.extra.crew = () => {
    const el = $('tab-crew'), s = S();
    const silent = Object.values(s.crew).filter(c => c.inCrew && cm.daylight(c.lastHeard, s.clock) >= s.inactiveH * 60).length;
    el.innerHTML = `
      <div class="seg four">${[['board', '📋 Board'], ['moves', `📢 Moves${cm.broadcasts().length ? ` <b class="dotn2" style="background:var(--amber);color:#1a0f00">${cm.broadcasts().length}</b>` : ''}`], ['crew', `👥 Crew${silent ? ` <b class="dotn2">${silent}</b>` : ''}`], ['link', '📡 Links']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="cview" data-k="${k}">${l}</button>`).join('')}</div>
      <div id="crew-body"></div>`;
    const body = $('crew-body');
    if (view === 'board') board(body);
    else if (view === 'moves') moves(body);
    else if (view === 'crew') crew(body);
    else { body.innerHTML = linkIntro(); const d = document.createElement('div'); body.appendChild(d); ui.renderLink(d); }
  };

  function board(el) {
    const s = S(), posts = cm.posts(filter), authors = new Set(cm.posts().map(p => p.a));
    el.innerHTML = `
      <div class="card">
        <div class="chips">${Object.entries(cm.KINDS).filter(([k]) => k !== 'alert').map(([k, v]) => `<button class="fchip ${kind === k ? 'on' : ''}" style="--c:${v.color}" data-act="kind" data-k="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
        <textarea id="ptext" rows="2" maxlength="200" style="margin-top:10px" placeholder="${{ supply: 'What did you find, where exactly, how much is left?', danger: 'What danger, where, which way is it moving?', safe: 'Where, how many people, how to get in?', need: 'What do you need? What can you trade?', offer: 'What can you give or do for others?', note: 'Anything others should know' }[kind]}">${esc(postText)}</textarea>
        ${postImg ? `<div class="row" style="margin-top:8px"><img src="${postImg}" style="height:60px;border-radius:8px;border:1px solid var(--line)"><button class="btn sm" data-act="img-clear">Remove photo</button><span class="muted tiny">${(postImg.length / 1024).toFixed(1)} KB</span></div>` : ''}
        <div class="row between" style="margin-top:8px">
          <div class="row"><span class="small">📍 Pin my location</span>${sw(postLoc, 'ploc')}</div>
          <label class="btn sm" style="cursor:pointer">📷 Photo<input type="file" accept="image/*" capture="environment" id="pimg" hidden></label>
        </div>
        <button class="btn primary full" style="margin-top:10px" data-act="post">Post to community · signed as ${esc(A.current.name)}</button>
      </div>
      <div class="row between" style="margin:14px 2px 8px"><b class="small" style="letter-spacing:.14em">COMMUNITY BOARD</b><span class="muted tiny">${cm.posts().length} posts · ${authors.size} survivors · on this phone</span></div>
      <div class="chips" style="margin-bottom:10px">${[['all', 'All', '#38e8ff'], ...Object.entries(cm.KINDS).map(([k, v]) => [k, v.icon + ' ' + v.label, v.color])].map(([k, l, c]) => `<button class="fchip ${filter === k ? 'on' : ''}" style="--c:${c}" data-act="pfilter" data-k="${k}">${l}</button>`).join('')}</div>
      ${posts.map(postCard).join('') || '<div class="card muted small">No posts yet. Post what you find; it travels to everyone you meet. Walk near other survivors (violet dots on the map) to sync their boards.</div>'}`;
    $('pimg')?.addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { postImg = await cm.shrinkImage(f); } catch (err) { ui.toast('Could not read photo'); } ui.render(); });
    $('ptext')?.addEventListener('input', e => { postText = e.target.value; });
  }
  function postCard(p) {
    const K = cm.KINDS[p.k] || cm.KINDS.note, v = cm.votes(p), s = S();
    const sub = p.k === 'alert' ? (cm.ALERTS[p.sub] || {}) : null;
    return `<div class="card" style="border-left:3px solid ${K.color}">
      <div class="row between"><div class="row" style="min-width:0"><span class="badge" style="color:${K.color};border-color:${K.color}55;background:${K.color}18">${sub ? sub.icon + ' ' + sub.label : K.icon + ' ' + K.label}</span>
        <b class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.an)}</b>${p.ok ? '<span class="badge green" title="Signature verified">✓ VERIFIED</span>' : '<span class="badge red" title="Signature does not match">⚠ UNVERIFIED</span>'}</div>
        <span class="muted tiny" style="white-space:nowrap">${DR.ago(p.t)}</span></div>
      <div class="body" style="margin:8px 0">${esc(p.x)}</div>
      ${p.m && p.m.tid && p.k === 'danger' && (s.cleared[p.m.tid] || (p.m.tid.startsWith('intel:') && s.intelCleared[p.m.tid.slice(6)])) ? `<div style="margin-bottom:6px"><span class="badge green">✓ CLEARED by ${esc((s.cleared[p.m.tid] || {}).by || '')} · ${DR.ago((s.cleared[p.m.tid] || {}).t || s.clock)}</span></div>` : ''}
      ${p.img ? `<img src="${p.img}" style="max-width:100%;max-height:180px;border-radius:10px;border:1px solid var(--line);margin-bottom:6px">` : ''}
      <div class="muted tiny">${p.lat != null ? '📍 ' + dirFromMe(p.lat, p.lng) + ' · ' : ''}${p.mine ? `you · reached ${p.reached && p.reached.length ? esc(p.reached.join(', ')) : 'nobody yet (travels when you meet someone)'}` : p.hops && p.hops.length ? `relayed via ${esc(p.hops.join(' → '))}` : 'received directly'}</div>
      <div class="btns">
        ${p.k !== 'alert' ? `<button class="btn sm ${v.mine === 1 ? 'primary' : ''}" data-act="vote" data-id="${p.id}" data-v="1">✓ Still true ${v.yes || ''}</button><button class="btn sm ${v.mine === -1 ? 'danger' : ''}" data-act="vote" data-id="${p.id}" data-v="0">✕ Gone ${v.no || ''}</button>` : ''}
        ${p.lat != null ? `<button class="btn sm" data-act="fly" data-lat="${p.lat}" data-lng="${p.lng}">Show</button>` : ''}
        ${p.lat != null && (p.k === 'supply' || p.k === 'safe') ? `<button class="btn sm" data-act="post-go" data-id="${p.id}">Go</button>` : ''}
      </div></div>`;
  }

  function moves(el) {
    const s = S(), list = cm.broadcasts(), dest = DR.active ? s.route.dest : { name: DR.BEACON.name, lat: DR.BEACON.lat, lng: DR.BEACON.lng };
    const defWhen = DR.hhmm(Math.ceil((s.clock + 60) / 15) * 15);
    el.innerHTML = `
      <div class="card">
        <b>📢 Announce a move</b>
        <div class="muted small">Tell everyone you meet where you are going, when and how, so others heading the same way can join. It spreads phone to phone like every post.</div>
        <div class="grid2" style="margin-top:10px">
          <label class="small">Going to<select class="input" id="mv-to"><option value="beacon">The Last Beacon (settlement)</option>${DR.active && dest.name !== DR.BEACON.name ? `<option value="route" selected>${esc(dest.name)}</option>` : ''}${s.rendezvous ? `<option value="rv">Rendezvous: ${esc(s.rendezvous.name)}</option>` : ''}</select></label>
          <label class="small">Leaving at<div class="row"><input class="input" type="time" id="mv-time" value="${defWhen}"><select class="input" id="mv-day" style="width:auto"><option value="0">today</option><option value="1">tomorrow</option></select></div></label>
          <label class="small">Meeting point<select class="input" id="mv-meet"><option value="here">Where I am now</option>${s.rendezvous ? '<option value="rv">The rendezvous</option>' : ''}${s.base ? '<option value="base">Our stash / hideout</option>' : ''}</select></label>
          <label class="small">Travelling<select class="input" id="mv-mode">${Object.values(DR.TRAVEL).map(m => `<option value="${m.id}" ${s.travel === m.id ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}</select></label>
        </div>
        <label class="small" style="display:block;margin-top:10px">Note (route, what to bring, rules)<input class="input" id="mv-note" maxlength="160" placeholder="e.g. Back roads only, bring 2 L water each, no one with fever"></label>
        <div class="row between" style="margin-top:8px"><span class="small">Others can join</span>${sw(true, 'mv-open')}</div>
        <button class="btn primary full" style="margin-top:10px" data-act="mv-post">Broadcast · ${s.team.length} of us${DR.active ? ' · ' + esc(DR.PROFILES[s.route.profile].label.toLowerCase()) + ' route' : ''}</button>
      </div>
      <h2>WHO IS GOING WHERE <span class="x">${list.length} upcoming</span></h2>
      ${list.map(p => {
        const m = p.m, joins = cm.joins(p), joined = joins.some(j => j.a === A.current.id), mode = DR.TRAVEL[m.mode] || DR.TRAVEL.foot;
        const mine = p.a === A.current.id, inMin = m.when - s.clock;
        return `<div class="card" style="border-left:3px solid var(--amber)">
          <div class="row between"><div><b>${esc(p.an)}</b> ${p.ok ? '<span class="badge green">✓</span>' : '<span class="badge red">⚠ UNVERIFIED</span>'} <span class="muted small">${m.n} people${joins.length ? ` + ${joins.length} joining` : ''}</span></div>
            <span class="badge ${inMin < 0 ? 'grey' : 'amber'}">${inMin < 0 ? 'LEFT ' + DR.ago(m.when).toUpperCase() : 'IN ' + DR.dur(inMin).toUpperCase()}</span></div>
          <div class="title" style="font-size:16px;margin-top:6px">${mode.icon} → ${esc(m.to)}</div>
          <div class="small">Leaves ${DR.stamp(m.when)} from <b>${esc(m.meet || 'their position')}</b> · ${G.fmtDist(G.dist(s.pos[0], s.pos[1], m.flat, m.flng))} from you</div>
          ${m.route ? `<div class="muted small">Route: ${esc(m.route)}</div>` : ''}
          ${p.x ? `<div class="body" style="margin-top:6px">${esc(p.x)}</div>` : ''}
          <div class="muted tiny" style="margin-top:4px">${p.hops && p.hops.length ? 'relayed via ' + esc(p.hops.join(' → ')) : mine ? 'your broadcast · reached ' + ((p.reached || []).join(', ') || 'nobody yet') : 'received directly'}</div>
          <div class="btns">
            ${!mine && m.open && inMin > -30 ? (joined ? '<span class="badge green" style="align-self:center">✓ YOU ARE JOINING</span>' : `<button class="btn sm primary" data-act="mv-join" data-id="${p.id}">Join · meet them there</button>`) : ''}
            <button class="btn sm" data-act="fly" data-lat="${m.flat}" data-lng="${m.flng}">Meeting point</button>
          </div></div>`;
      }).join('') || '<div class="card muted small">No moves announced yet. Broadcasts from other survivors arrive when you come into range of anyone carrying them.</div>'}`;
  }

  function crew(el) {
    const s = S(), me = A.current, st = cm.STATUS[s.status];
    const partner = s.team.find(t => t.id !== s.me) || (s.friend ? { name: s.friend.name, role: 'Partner' } : null);
    const inactMin = cm.daylight(s.lastActive, s.clock);
    const near = cm.together();
    const people = Object.entries(s.crew).map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.inCrew - a.inCrew) || b.lastHeard - a.lastHeard);
    const received = cm.posts('alert').filter(p => !p.mine).slice(0, 6);
    el.innerHTML = `
      <div class="card">
        <div class="row between"><div><div class="title">${esc(me.name)} <span class="muted small">${me.blood ? '· 🩸 ' + esc(me.blood) : ''}</span></div><div class="muted small" style="font-family:var(--hud);letter-spacing:.1em">${me.id}</div></div>
        <div class="row"><button class="btn sm" data-act="idcard">🪪 ID card</button><button class="btn sm" data-act="logout">Log out</button></div></div>
        <div class="muted tiny" style="margin:10px 0 6px;letter-spacing:.14em">MY STATUS · shared with everyone you sync with</div>
        <div class="chips">${Object.entries(cm.STATUS).map(([k, [i, l]]) => `<button class="fchip ${s.status === k ? 'on' : ''}" style="--c:${k === 'ok' ? '#3dffa8' : k === 'exposed' ? '#b18cff' : k === 'help' ? '#ff3b5c' : '#ffb020'}" data-act="status" data-k="${k}">${i} ${l}</button>`).join('')}</div>
        ${s.status === 'exposed' ? `<div class="verdict" style="margin-top:10px;background:rgba(177,140,255,.12);color:#cbb3ff">☣ Isolation · ${DR.dur(72 * 60 - (s.clock - s.exposedAt))} of 72 h observation left. <a href="#" data-act="guide-go" data-id="isolation" style="color:inherit">How to isolate</a></div>` : ''}
        ${me.medical ? `<div class="small muted" style="margin-top:8px">Medical: ${esc(me.medical)}</div>` : ''}
      </div>

      <h2>📡 NEARBY NOW <span class="x">radio range ~200 m</span></h2>
      ${(() => {
        const near = Object.entries(s.crew).map(([id, c]) => ({ id, ...c })).filter(c => c.live && s.clock - c.lastHeard < 2);
        for (const n of cm.npcsInRange()) if (!near.some(x => x.id === n.id)) near.push({ id: n.id, ...(s.crew[n.id] || {}), name: n.name, dist: Math.round(G.dist(s.pos[0], s.pos[1], n.lat, n.lng)), status: n.status, role: n.role });
        if (!near.length) return '<div class="card muted small">Nobody in radio range right now. Phones within ~200 m find each other automatically, with no pairing and no internet. People further away reach you through posts and check-ins passed phone to phone.</div>';
        return near.map(c => {
          const st = cm.STATUS[c.status] || cm.STATUS.ok, mutual = c.inCrew && c.wantsMe;
          return `<div class="card" style="border-left:3px solid #3dffa8"><div class="row between"><div><b>${esc(c.name)}</b> <span class="small">${st[0]} ${st[1]}</span>
            <div class="muted small">${c.dist != null ? c.dist + ' m away' : 'in range'}${c.role ? ' · ' + esc(c.role) : ''}${c.blood ? ' · 🩸 ' + esc(c.blood) : ''}</div>
            ${c.wantsMe && !c.inCrew ? '<div class="small" style="color:var(--amber)">🤝 Wants to team up with you</div>' : ''}</div>
            <div style="text-align:right">${mutual ? '<span class="badge green">🤝 TEAMED UP</span>' : c.inCrew ? '<span class="badge amber">ASKED · WAITING</span>' : `<button class="btn sm ${c.wantsMe ? 'go' : 'primary'}" data-act="crew-add" data-id="${c.id}">${c.wantsMe ? '✓ Accept' : '🤝 Team up'}</button>`}</div></div></div>`;
        }).join('');
      })()}

      <h2>⏱ SAFETY CHECK-IN</h2>
      <div class="card">
        <div class="row between"><div><b>Inactive alarm</b><div class="muted small">If you don't move or touch the phone for this long in daylight, it asks if you're OK. No answer in 10 min, and your crew is alerted.</div></div></div>
        <div class="row" style="margin:10px 0">${[6, 7, 8].map(h => `<button class="btn sm ${s.inactiveH === h ? 'primary' : ''}" data-act="inact" data-h="${h}">${h} h</button>`).join('')}<span class="muted small" style="margin-left:auto">idle ${DR.dur(inactMin)} of daylight</span></div>
        <div class="bar ${inactMin > s.inactiveH * 45 ? 'red' : 'green'}"><i style="width:${Math.min(100, inactMin / (s.inactiveH * 60) * 100)}%"></i></div>
        <div class="btns"><button class="btn go" data-act="im-ok">✓ I'm OK · check in</button><button class="btn sm" data-act="test-checkin">Test the alarm</button></div>
      </div>

      <h2>🚨 SEND ALERT</h2>
      <div class="card">
        <div class="grid3">${Object.entries(cm.ALERTS).filter(([k]) => k !== 'inactive').map(([k, a]) => `<button class="tile ${alertSub === k ? 'sel' : ''}" style="${alertSub === k ? 'border-color:var(--amber);background:rgba(255,176,32,.1)' : ''}" data-act="asub" data-k="${k}"><div class="e" style="font-size:20px">${a.icon}</div><small>${a.label}</small></button>`).join('')}</div>
        <div class="btns">
          <button class="btn primary" data-act="alert-send" data-scope="near">To people with me (${near.length})</button>
          <button class="btn danger" data-act="alert-send" data-scope="all">To everyone</button>
        </div>
        <div class="muted tiny" style="margin-top:8px">People with you get it now (vibration + sound packet). Everyone else gets it the moment any phone carrying it meets theirs.</div>
      </div>

      ${received.length ? `<h2>📥 ALERTS FROM OTHERS</h2>${received.map(postCard).join('')}` : ''}

      <h2>👥 CREW <span class="x">${near.length} with you · ${people.filter(p => p.inCrew).length} crew · ${people.length} met</span></h2>
      <div class="card">
        ${!partner ? '<div class="muted small">Travelling alone. Add people in PACK, or scan a 🪪 ID card to add someone to your crew.</div>' : (() => {
          const est = DR.friendEstimate(), apart = est && G.dist(s.pos[0], s.pos[1], est.lat, est.lng) > 60;
          return `<div class="row between"><div><b>${esc(partner.name)}</b> <span class="muted small">${partner.role} · travel partner</span>
            <div class="muted small">${!est ? 'No position shared yet. When your phones are within ~200 m they swap positions automatically; further away, scan their QR or listen for their sound packet.'
              : est.live ? `Live (in radio range) · ${dirFromMe(est.lat, est.lng)}`
              : `Last fix ${DR.ago(s.friend.ts)} · now probably ${dirFromMe(est.lat, est.lng)} (±${Math.round(est.r)} m)${est.along ? ', heading to ' + esc(est.along) : ''}`}</div></div>
            <div style="text-align:right"><span class="badge ${!est ? 'grey' : apart ? 'amber' : 'green'}">${!est ? 'UNKNOWN' : apart ? 'APART' : 'TOGETHER'}</span>${est ? `<div class="btns" style="margin-top:6px"><button class="btn sm" data-act="fly" data-lat="${est.lat}" data-lng="${est.lng}">Show</button></div>` : ''}</div></div>`;
        })()}
      </div>
      ${people.map(c => {
        const gap = cm.daylight(c.lastHeard, s.clock), silentNow = c.inCrew && gap >= s.inactiveH * 60;
        const together = c.lat != null && G.dist(s.pos[0], s.pos[1], c.lat, c.lng) < cm.TOGETHER && s.clock - c.lastHeard < 30;
        const stt = cm.STATUS[c.status] || cm.STATUS.ok;
        return `<div class="card" style="${silentNow ? 'border-color:var(--red);box-shadow:0 0 18px rgba(255,59,92,.2)' : ''}">
          <div class="row between"><div style="min-width:0"><b>${esc(c.name)}</b> ${c.inCrew ? '<span class="badge grey">CREW</span>' : ''} <span class="small">${stt[0]} ${stt[1]}</span>
            <div class="muted small">Last heard ${DR.ago(c.lastHeard)}${c.lat != null ? ' · ' + dirFromMe(c.lat, c.lng) : ''}</div>
            ${silentNow ? `<div class="small" style="color:#ff7d93">⚠ Silent for ${DR.dur(gap)} of daylight</div>` : ''}</div>
          <div style="text-align:right"><span class="badge ${together ? 'green' : 'grey'}">${together ? 'WITH YOU' : 'AWAY'}</span>
          <div class="btns" style="margin-top:6px">${c.lat != null ? `<button class="btn sm" data-act="fly" data-lat="${c.lat}" data-lng="${c.lng}">Show</button>` : ''}${silentNow ? `<button class="btn sm danger" data-act="find" data-id="${c.id}">Go find</button>` : ''}${c.inCrew ? `<button class="btn sm" data-act="crew-remove" data-id="${c.id}">Leave</button>` : `<button class="btn sm" data-act="crew-add" data-id="${c.id}">🤝 Team up</button>`}</div></div></div></div>`;
      }).join('')}
      <div class="btns"><button class="btn primary" data-act="scan-id">▣ Scan an ID card</button><button class="btn" data-act="idcard">🪪 Show my card</button><button class="btn" data-act="hb">💓 Broadcast check-in</button></div>`;
  }

  function linkIntro() {
    return `
      <details class="card" open>
        <summary class="title" style="cursor:pointer;font-size:16px">How this works with no network</summary>
        <div class="body small" style="margin-top:8px">
          <p><b>Your phone is the network.</b> Every phone keeps the whole community board. When two phones meet, they swap the posts the other has not seen, then carry them onward. A tip posted in Shivajinagar reaches Palace Road one phone at a time. It is slower than the internet, but it does not need any towers.</p>
          <p><b>Not satellite.</b> Phones cannot send to satellites (GPS only <i>receives</i> position). The app uses what every phone already has:</p>
          <p>📶 <b>Radio link</b> (Bluetooth / Wi-Fi Direct, ~30–200 m): automatic. Phones in range swap positions, plans and the whole board without anyone touching them. In this web prototype it runs between browser windows (open one as Aarav, one as ${esc(A.current.partner)}); the Android build would use Bluetooth.<br>
          ▣ <b>QR stream</b> (~1 m): the whole board, photos included, in a few seconds of camera time.<br>
          〰 <b>Sound</b> (3–8 m, through a door): short alerts and locations.<br>
          ✦ <b>Light</b> (line of sight, far at night): SOS and a few words in Morse.</p>
          <p><b>How people find each other:</b> a post or broadcast reaches strangers through every phone it passes. Meeting face to face, you scan each other's 🪪 ID card QR, and that person joins your crew as a verified contact.</p>
          <p><b>How a community forms:</b> nobody "creates" it. Everyone you sync with becomes part of the same board. The board grows and spreads as survivors meet, and a crew is the people you chose to add.</p>
          <p><b>Trust:</b> every post is signed with the author's private key. Any phone can check the ✓ offline, so nobody can post as someone else.</p>
          <p><b>Longer range</b> needs extra hardware: a LoRa radio (Meshtastic, 2–10 km) or a satellite messenger. Packets wait in the outbox for them.</p>
        </div>
      </details>
      <h2>⇅ SYNC THE WHOLE BOARD</h2>
      <div class="btns" style="margin-top:0"><button class="btn primary" data-act="stream-show">▣ Show my board</button><button class="btn primary" data-act="stream-scan">▣ Receive a board</button></div>
      <div class="muted tiny" style="margin:6px 2px 4px">Multi-frame QR: hold the camera on the other screen until the bar fills. Photos included.</div>`;
  }

  // ================= GUIDE =================
  ui.extra.guide = () => {
    const el = $('tab-guide');
    if (guideOpen) {
      const e = GD.emergency.find(x => x.id === guideOpen), sct = GD.sections.find(x => x.id === guideOpen);
      el.innerHTML = `<button class="btn sm" data-act="guide-back">← Field manual</button>
        ${e ? `<h2 style="margin-top:14px">${e.icon} ${esc(e.title.toUpperCase())}</h2>
          <ol class="gsteps">${e.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          ${e.avoid ? `<div class="card bad"><b style="color:#ff7d93">DO NOT</b>${e.avoid.map(x => `<div class="small" style="margin-top:6px">✕ ${esc(x)}</div>`).join('')}</div>` : ''}
          ${['bite', 'contam'].includes(e.id) ? '<button class="btn full" data-act="status" data-k="exposed">☣ Mark me EXPOSED and start isolation</button>' : ''}`
        : `<h2 style="margin-top:14px">${sct.icon} ${esc(sct.title.toUpperCase())} <span class="x">${esc(sct.group)}</span></h2>
          ${sct.items.map(([h, t]) => `<div class="card"><b>${esc(h)}</b><div class="body" style="margin-top:4px">${esc(t)}</div></div>`).join('')}`}
        <p class="faint tiny body">${esc(GD.disclaimer)}</p>`;
      return;
    }
    const q = guideQ.toLowerCase();
    const match = o => !q || JSON.stringify(o).toLowerCase().includes(q);
    const groups = {};
    for (const sct of GD.sections.filter(match)) (groups[sct.group] = groups[sct.group] || []).push(sct);
    el.innerHTML = `
      <input class="input" id="gq" placeholder="Search: bleeding, water, battery, fever…" value="${esc(guideQ)}">
      <h2>🆘 HELP NOW <span class="x">works offline</span></h2>
      <div class="grid3">${GD.emergency.filter(match).map(e => `<button class="tile" style="${e.urgent ? 'border-color:rgba(255,59,92,.5)' : ''}" data-act="guide-go" data-id="${e.id}"><div class="e">${e.icon}</div><b style="font-size:13px">${esc(e.title)}</b></button>`).join('') || '<div class="muted small">No match.</div>'}</div>
      ${Object.entries(groups).map(([g, list]) => `<h2>${esc(g.toUpperCase())}</h2>${list.map(sct => `<div class="card click" data-act="guide-go" data-id="${sct.id}"><div class="row between"><b>${sct.icon} ${esc(sct.title)}</b><span class="muted small">${sct.items.length} tips ›</span></div>
        <div class="muted small" style="margin-top:4px">${esc(sct.items.map(i => i[0]).join(' · '))}</div></div>`).join('')}`).join('')}
      <p class="faint tiny body">${esc(GD.disclaimer)}</p>`;
    const inp = $('gq');
    inp.addEventListener('input', e => { guideQ = e.target.value; const pos = e.target.selectionStart; ui.render(); const n = $('gq'); n.focus(); n.setSelectionRange(pos, pos); });
  };

  // ================= AUTH =================
  ui.auth = () => {
    const list = A.list();
    authMode = authMode || (list.length ? 'pick' : 'new');
    const m = $('modal');
    m.classList.remove('hidden');
    const blood = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    m.innerHTML = `<div class="sheet"><div class="hero"><div class="big-logo"></div><h1>DEAD RECKONING</h1>
      <p style="margin-bottom:6px">Offline survivor identity. No server, no network: your ID is a key made on this phone.</p></div>
      ${!A.crypto ? '<div class="card bad small">This page is not in a secure context, so identities cannot be created. Open it over https or http://localhost.</div>' : ''}
      ${authMode === 'pick' ? `
        <h2>WHO IS USING THIS PHONE?</h2>
        ${list.map(a => `<div class="card click ${authPick === a.id ? 'sel' : ''}" data-act="auth-pick" data-id="${a.id}"><div class="row between"><div><b>${esc(a.name)}</b><div class="muted tiny" style="font-family:var(--hud)">${a.id}</div></div><span class="muted small">${a.partner ? 'travels with ' + esc(a.partner) : 'travelling alone'}</span></div>
          ${authPick === a.id ? `<div class="row" style="margin-top:10px"><input class="input" id="pin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" autocomplete="off"><button class="btn primary" data-act="auth-login">Unlock</button></div><div id="aerr" class="small" style="color:#ff7d93;margin-top:6px"></div>` : ''}</div>`).join('')}
        <button class="btn full" data-act="auth-new">＋ New survivor</button>` : `
        <h2>REGISTER A SURVIVOR</h2>
        <div class="grid2">
          <label class="small">Your name<input class="input" id="r-name" maxlength="24"></label>
          <label class="small">Travelling with (optional)<input class="input" id="r-partner" maxlength="24" placeholder="Partner's name, or leave empty"></label>
          <label class="small">Blood group<select class="input" id="r-blood">${blood.map(b => `<option>${b}</option>`).join('')}</select></label>
          <label class="small">Emergency contact<input class="input" id="r-contact" maxlength="60" placeholder="Name / where to find"></label>
        </div>
        <label class="small" style="display:block;margin-top:10px">Medical notes (allergies, conditions, medicines)<input class="input" id="r-med" maxlength="120"></label>
        <div class="grid2" style="margin-top:10px">
          <label class="small">PIN (4–6 digits)<input class="input" id="r-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
          <label class="small">Repeat PIN<input class="input" id="r-pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
        </div>
        <div id="aerr" class="small" style="color:#ff7d93;margin-top:8px"></div>
        <button class="btn primary full" style="margin-top:12px" data-act="auth-register">Create my survivor ID</button>
        <div class="row between" style="margin-top:10px">${list.length ? '<button class="btn sm" data-act="auth-back">← Existing survivors</button>' : '<span></span>'}<button class="btn sm" data-act="auth-demo">Fill demo: Aarav &amp; Mira</button></div>
        <p class="faint tiny body">Your blood group and medical notes travel inside your ID card, so a stranger who finds you hurt can help. The PIN encrypts your private key on this phone; nobody else on this phone can post as you.</p>`}
      </div>`;
    setTimeout(() => ($('pin') || $('r-name'))?.focus(), 50);
  };

  // ================= SCAN PEOPLE: ID card handshake =================
  // A scan only reads one way, so after you scan someone your phone shows YOUR card for them to scan back.
  // One scan each: both are in each other's crew and see each other's location.
  ui.showMyCard = (afterScanOf) => {
    ui.modal(`<h3>🪪 ${afterScanOf ? 'NOW LET ' + esc(afterScanOf.name.toUpperCase()) + ' SCAN YOU' : 'MY SURVIVOR ID'}</h3>
      <div class="muted">${afterScanOf ? `✓ ${esc(afterScanOf.name)} is in your crew and on your map. Hold this up so their phone adds you back and sees where you are.` : `${esc(A.current.name)} · ${A.current.id}${A.current.blood ? ' · blood ' + esc(A.current.blood) : ''}. Others scan this to add you to their crew and see your location.`}</div>
      <canvas class="qr" id="idqr"></canvas>
      <div class="muted tiny" style="text-align:center">${S().shareLoc ? 'Includes your current location.' : 'Location sharing is off (Settings), so the card has no location.'}</div>
      <div class="btns">${afterScanOf ? '<button class="btn go" data-act="close">✓ Done, they scanned it</button>' : '<button class="btn primary" data-act="scan-id">▣ Scan their card</button>'}</div>`);
    DR.comms.drawQR($('idqr'), cm.idCard());
  };
  ui.scanPeople = async () => {
    ui.modal(`<h3>▣ SCAN</h3><div class="muted">Point the camera at another survivor's 🪪 ID card, a board, or a message QR.</div>
      <video class="scan" id="pv" playsinline muted style="margin-top:12px"></video>
      <div class="btns"><button class="btn" data-act="idcard">🪪 Show my card instead</button></div>`);
    try {
      await DR.comms.startScan($('pv'), text => {
        if (text.startsWith('DRX|')) { ui.close(); ui.streamScan(); return false; }
        ui.close();
        if (text.startsWith('DRID|')) ui.onIdScanned(text); else DR.comms.receive(text, 'QR');
        return false;
      });
    } catch (e) { ui.close(); ui.toast(ui.cameraError(e)); }
  };
  ui.onIdScanned = async text => {
    const c = await cm.addFromId(text);
    if (!c) return;
    ui.toast(`✓ ${c.name} added to your crew${c.lat != null ? ' · on your map' : ''}`);
    if (c.lat != null) DR.mapview.fly(c.lat, c.lng, 17);
    ui.showMyCard(c);   // scan-back: they need your card to see you
  };

  // ================= PERMISSIONS (asked right after registering; also in Settings) =================
  let perm = { gps: null, share: true, nearby: null, cam: null };
  ui.permissions = (acc, firstTime) => {
    try { perm = Object.assign({ gps: null, share: true, nearby: null }, JSON.parse(localStorage.getItem('dr-setup:' + acc.id) || '{}')); } catch (e) {}
    const st = v => v === true ? '<span class="badge green">✓ ALLOWED</span>' : v === false ? '<span class="badge red">✕ BLOCKED</span>' : '';
    const m = $('modal'); m.classList.remove('hidden');
    m.innerHTML = `<div class="sheet">${firstTime ? '' : '<button class="close" data-act="close">✕</button>'}
      <h3>${firstTime ? '✓ ID CREATED · ' + esc(acc.id) : 'PERMISSIONS'}</h3>
      <div class="muted">Three permissions make this app work. Nothing is sent to any server; there is none.</div>
      <div class="card" style="margin-top:12px"><div><b>📍 Location (GPS)</b> ${st(perm.gps)}
        <div class="muted small">Shows where you are and moves you along the route. Phones use satellites, which work with no internet.</div></div>
        <div class="btns"><button class="btn primary" data-act="perm-loc">Allow location</button></div><div class="small" id="perm-loc-msg"></div>
        <div class="row between" style="margin-top:10px"><span class="small">Let nearby survivors see where I am</span>${sw(perm.share !== false, 'perm-share')}</div></div>
      <div class="card"><div><b>📶 Bluetooth / nearby devices</b> ${st(perm.nearby)}
        <div class="muted small">Finds survivors within ~200 m and swaps positions, posts and alerts with their phones automatically. Keep Bluetooth on.</div></div>
        <div class="btns"><button class="btn primary" data-act="perm-bt">Allow nearby devices</button></div><div class="small" id="perm-bt-msg"></div></div>
      <div class="card"><div><b>📷 Camera</b> ${st(perm.cam)}
        <div class="muted small">Scans other survivors' ID cards and boards (QR codes). Nothing is recorded or stored.</div></div>
        <div class="btns"><button class="btn primary" data-act="perm-cam">Allow camera</button></div><div class="small" id="perm-cam-msg"></div></div>
      <button class="btn go full" style="margin-top:6px" data-act="perm-done">${firstTime ? 'Continue' : 'Save'}</button>
      <p class="faint tiny body">You can change these any time in Settings.</p></div>`;
    ui._permAcc = acc; ui._permFirst = firstTime;
  };
  const savePerm = () => localStorage.setItem('dr-setup:' + ui._permAcc.id, JSON.stringify(perm));

  // ================= CHECK-IN ALARM =================
  let beepTimer = 0;
  ui.checkin = () => {
    const s = S();
    ui.modal(`<div class="hero"><div class="big-logo" style="border-color:var(--red);box-shadow:0 0 40px rgba(255,59,92,.5)"></div>
      <h1 style="font-size:24px">ARE YOU OK?</h1>
      <p>No movement or touch for <b>${s.inactiveH} hours</b> of daylight.<br>If you don't answer within <b style="color:var(--red)">10 minutes</b>, your crew and everyone you meet will be alerted with your last location.</p>
      <button class="btn go full" style="min-height:64px;font-size:18px" data-act="im-ok">✓ I'M OK</button>
      <button class="btn danger full" style="margin-top:10px" data-act="need-help">🆘 I need help</button></div>`, 'alert noclose checkin');
    // wake the person: vibrate always, short beeps unless silent mode
    clearInterval(beepTimer);
    let n = 0;
    beepTimer = setInterval(() => {
      if (!S().checkin || S().checkin.sent || ++n > 12) { clearInterval(beepTimer); return; }
      if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
      if (!S().silent) try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 1200; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25); setTimeout(() => ac.close(), 400); } catch (e) {}
    }, 2500);
  };

  ui.streamShow = async () => {
    const { frames, count, bytes } = await cm.frames(true);
    ui.modal(`<h3>▣ MY BOARD</h3><div class="muted">${count} posts · ${(bytes / 1024).toFixed(1)} KB compressed · ${frames.length} frame${frames.length > 1 ? 's' : ''}. Keep this screen in front of their camera.</div>
      <canvas class="qr" id="sqr"></canvas><div class="bar"><i id="sbar" style="width:0"></i></div><div class="muted tiny" id="sfr" style="text-align:center;margin-top:6px"></div>`);
    let i = 0;
    const tick = () => {
      const c = $('sqr'); if (!c) return;
      DR.comms.drawQR(c, frames[i % frames.length]);
      $('sfr').textContent = `frame ${i % frames.length + 1} / ${frames.length}`;
      $('sbar').style.width = ((i % frames.length + 1) / frames.length * 100) + '%';
      i++; setTimeout(tick, frames.length > 1 ? 420 : 2000);
    };
    tick();
  };
  ui.streamScan = async () => {
    ui.modal(`<h3>▣ RECEIVE A BOARD</h3><div class="muted">Point the camera at their "My board" QR. Frames can arrive in any order.</div>
      <video class="scan" id="sv" playsinline muted style="margin-top:12px"></video><div class="bar" style="margin-top:10px"><i id="rbar" style="width:0"></i></div><div class="muted small" id="rtx" style="margin-top:6px">Waiting…</div>`);
    const col = cm.collector();
    try {
      await DR.comms.startScan($('sv'), text => {
        if (!text.startsWith('DRX|')) { if (text.startsWith('DR')) { ui.close(); DR.comms.receive(text, 'QR'); return false; } return true; }
        const r = col.add(text); if (!r) return true;
        $('rbar').style.width = (r.have / r.total * 100) + '%';
        $('rtx').textContent = `${r.have} / ${r.total} frames from ${r.from}`;
        if (!r.done) return true;
        cm.unpack(r.data()).then(async posts => {
          const n = await cm.ingest(posts, r.from);
          ui.close(); ui.toast(`⇅ Board synced from ${r.from}: +${n} new posts`);
        }).catch(() => ui.toast('Board damaged, try again'));
        return false;
      });
    } catch (e) { ui.close(); ui.toast(ui.cameraError(e)); }
  };

  // ================= map: community layer =================
  let layer = null;
  ui.drawCommunity = () => {
    const map = DR.mapview.map; if (!map) return;
    if (!layer) layer = L.layerGroup().addTo(map);
    layer.clearLayers();
    for (const p of cm.posts()) {
      if (p.lat == null || p.k === 'note') continue;
      const K = cm.KINDS[p.k];
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: `<div class="mk-icon" style="border-color:${K.color};width:24px;height:24px;font-size:13px">${p.k === 'alert' ? (cm.ALERTS[p.sub] || {}).icon || '🚨' : K.icon}</div>` }) })
        .bindTooltip(`${K.label.toUpperCase()} · ${esc(p.an)} · ${DR.ago(p.t)}<br>${esc(p.x)}`).on('click', () => { view = 'board'; ui.show('crew'); }).addTo(layer);
    }
    for (const n of cm.npcs()) {
      if (n.silent) continue;
      const synced = !!n.lastSync;
      L.circle([n.lat, n.lng], { radius: cm.WIFI_RANGE, color: '#b18cff', weight: 1, dashArray: '2 6', fillOpacity: synced ? 0.02 : 0.05, interactive: false }).addTo(layer);
      L.marker([n.lat, n.lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        html: `<div class="mk-friend"><div class="dot" style="width:14px;height:14px;${synced ? '' : 'opacity:.65'}"></div><div class="mk-tag" style="left:18px;color:#cbb3ff">${esc(n.name.toUpperCase())}${synced ? ' ✓' : ''}</div></div>` }) })
        .bindTooltip(`${esc(n.name)} · ${esc(n.role)}<br>${synced ? 'Synced ' + DR.ago(n.lastSync) : 'Walk within ' + cm.WIFI_RANGE + ' m to sync boards'}`).addTo(layer);
    }
    // every other survivor who shares a location with you (registered users on other phones, crew, people met)
    const npcIds = new Set(cm.npcs().map(n => n.id));
    for (const [id, c] of Object.entries(S().crew)) {
      if (npcIds.has(id) || c.lat == null || (S().friend && S().friend.id === id)) continue;
      const age = S().clock - c.lastHeard; if (age > 2880) continue;
      const live = c.live && age < 2, st = cm.STATUS[c.status] || cm.STATUS.ok;
      L.marker([c.lat, c.lng], { zIndexOffset: 800, icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        html: `<div class="mk-friend"><div class="dot" style="background:#3dffa8;box-shadow:0 0 12px #3dffa8;${live ? '' : 'opacity:.6'}"></div><div class="mk-tag" style="left:18px;color:#9dffd0">${esc(c.name.toUpperCase())} ${st[0]} · ${live ? 'LIVE' : DR.ago(c.lastHeard).toUpperCase()}</div></div>` }) })
        .bindTooltip(`${esc(c.name)}${c.inCrew ? ' (crew)' : ''} · ${st[1]} · ${live ? 'in radio range now' : 'last position ' + DR.ago(c.lastHeard)}`).addTo(layer);
    }
    for (const [, c] of Object.entries(S().crew)) if (c.inCrew && c.lat != null && cm.npcs().find(n => n.name === c.name && n.silent))
      L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div class="mk-friend"><div class="dot" style="background:#ff3b5c;box-shadow:0 0 12px #ff3b5c"></div><div class="mk-tag" style="left:18px;color:#ff7d93">${esc(c.name.toUpperCase())} · LAST SEEN ${DR.ago(c.lastHeard).toUpperCase()}</div></div>` }) }).addTo(layer);
  };

  // ================= actions =================
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, s = S();
    const err = msg => { const x = $('aerr'); if (x) x.textContent = msg; };
    try {
      switch (a) {
        case 'cview': view = b.dataset.k; ui.render(); break;
        case 'mv-open': b.classList.toggle('on'); break;
        case 'mv-post': {
          const to = $('mv-to').value, meet = $('mv-meet').value, [hh, mm] = ($('mv-time').value || '00:00').split(':').map(Number);
          let when = Math.floor(s.clock / 1440) * 1440 + (+$('mv-day').value) * 1440 + hh * 60 + mm;
          if (when < s.clock - 5 && $('mv-day').value === '0') { ui.toast('That time has passed: pick tomorrow or a later time'); break; }
          const tgt = to === 'route' ? s.route.dest : to === 'rv' ? s.rendezvous : DR.BEACON;
          const mp = meet === 'rv' ? s.rendezvous : meet === 'base' ? s.base : { lat: s.pos[0], lng: s.pos[1], name: 'Where ' + A.current.name + ' is now' };
          const open = document.querySelector('[data-act=mv-open]').classList.contains('on');
          await cm.broadcast({ to: tgt.name, tlat: tgt.lat, tlng: tgt.lng, when, mode: $('mv-mode').value, route: DR.active ? DR.PROFILES[s.route.profile].label + ' route' : '', n: s.team.length, open, meet: mp.name, flat: mp.lat, flng: mp.lng, note: $('mv-note').value.trim() });
          ui.toast('📢 Broadcast posted. It travels to everyone you meet.'); ui.render(); break;
        }
        case 'mv-join': {
          const p = s.feed[b.dataset.id], m = p.m;
          await cm.join(p, s.team.length);
          s.rendezvous = { lat: m.flat, lng: m.flng, name: m.meet || p.an + "'s group", by: p.an, until: m.when };
          const r = DR.plan('safe', s.pos, { lat: m.flat, lng: m.flng, name: 'Meet ' + p.an + ': ' + (m.meet || 'meeting point') });
          if (r) DR.activate(r);
          DR.emit('marks');
          ui.toast(`Joining ${p.an}: be at ${m.meet || 'the meeting point'} by ${DR.hhmm(m.when)}. Route set.`); ui.render(); break;
        }
        case 'kind': kind = b.dataset.k; postText = $('ptext')?.value || postText; ui.render(); break;
        case 'pfilter': filter = b.dataset.k; ui.render(); break;
        case 'ploc': postLoc = !postLoc; b.classList.toggle('on', postLoc); break;
        case 'img-clear': postImg = null; ui.render(); break;
        case 'post': {
          const x = ($('ptext')?.value || '').trim();
          if (!x) { ui.toast('Write something first'); break; }
          await cm.create({ k: kind, x, lat: postLoc ? s.pos[0] : null, lng: postLoc ? s.pos[1] : null, img: postImg });
          postText = ''; postImg = null; ui.render(); ui.toast('Posted. It spreads to everyone you meet.'); break;
        }
        case 'vote': { const p = s.feed[b.dataset.id]; await cm.vote(p, b.dataset.v === '1'); ui.render(); break; }
        case 'post-go': {
          const p = s.feed[b.dataset.id], r = DR.plan('supply', s.pos, DR.BEACON, { lat: p.lat, lng: p.lng, name: p.x.slice(0, 30), sub: 'general', cat: 'FOOD', id: 'post' + p.id });
          if (r) { DR.activate(r); ui.show('route'); ui.toast('Stop added from community post'); } break;
        }
        case 'status': {
          const k = b.dataset.k;
          s.status = k; if (k === 'exposed') { s.exposedAt = s.clock; s.isoDone = false; }
          await cm.heartbeat();
          if (k === 'exposed') await cm.sendAlert('isolate', `${A.current.name} is isolating after exposure. Keep 2 m away, do not share water.`, 'all');
          if (k === 'help') await cm.sendAlert('sos', `${A.current.name} needs help.`, 'all');
          guideOpen = null; ui.render(); break;
        }
        case 'idcard': ui.showMyCard(); break;
        case 'scan-id': ui.scanPeople(); break;
        case 'logout': case 'switch-user': A.logout(); break;
        case 'inact': s.inactiveH = +b.dataset.h; ui.render(); DR.save(); break;
        case 'im-ok': clearInterval(beepTimer); s.checkin = null; cm.active(); ui.close(); await cm.heartbeat(); ui.toast('✓ Checked in. Your crew sees you are OK.'); ui.render(); break;
        case 'need-help': clearInterval(beepTimer); s.checkin = null; cm.active(); ui.close(); s.status = 'help'; await cm.sendAlert('sos', `${A.current.name} needs help.`, 'all'); ui.sos(); break;
        case 'test-checkin': s.lastActive = s.clock - s.inactiveH * 60 - 1; ui.toast('Simulating hours of inactivity…'); break;
        case 'asub': alertSub = b.dataset.k; ui.render(); break;
        case 'alert-send': {
          const scope = b.dataset.scope;
          await cm.sendAlert(alertSub, null, scope);
          if (scope === 'near' && cm.together().length) ui.sonicSend(DR.comms.packet('S', cm.ALERTS[alertSub].label.slice(0, 30)));
          ui.render(); break;
        }
        case 'perm-loc': {
          const msg = $('perm-loc-msg');
          if (!window.isSecureContext || !navigator.geolocation) { msg.innerHTML = '<span style="color:#ff7d93">Location needs the https:// address. Set your position by hand with the pin button meanwhile.</span>'; perm.gps = false; savePerm(); break; }
          msg.innerHTML = '<span style="color:var(--amber)">Answer the browser prompt: tap <b>Allow</b>…</span>';
          navigator.geolocation.getCurrentPosition(p => {
            perm.gps = true; savePerm();
            const inside = G.inCoverage(p.coords.latitude, p.coords.longitude);
            msg.innerHTML = '<span style="color:var(--green)">✓ Allowed. Fix ±' + Math.round(p.coords.accuracy) + ' m' + (inside ? '' : ' (outside the Bengaluru map: set your position by hand for planning)') + '.</span>';
            b.textContent = '✓ Location allowed'; b.classList.remove('primary');
          }, er => {
            if (er.code === 1) { perm.gps = false; savePerm(); msg.innerHTML = '<span style="color:#ff7d93">Blocked. Tap the lock icon by the address, then Permissions, Location, Allow. Then try again.</span>'; }
            else { perm.gps = true; savePerm(); msg.innerHTML = '<span style="color:var(--amber)">Allowed, but no fix yet (indoors, or a laptop). It keeps trying in the background.</span>'; }
          }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
          break;
        }
        case 'perm-cam': {
          const msg = $('perm-cam-msg');
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.innerHTML = '<span style="color:#ff7d93">' + ui.cameraError({}) + '</span>'; perm.cam = false; savePerm(); break; }
          msg.innerHTML = '<span style="color:var(--amber)">Answer the browser prompt: tap <b>Allow</b>…</span>';
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            stream.getTracks().forEach(t => t.stop());
            perm.cam = true; savePerm();
            msg.innerHTML = '<span style="color:var(--green)">✓ Camera allowed. Tap ▣ on the map to scan.</span>';
            b.textContent = '✓ Camera allowed'; b.classList.remove('primary');
          } catch (e) { perm.cam = false; savePerm(); msg.innerHTML = '<span style="color:#ff7d93">' + ui.cameraError(e) + '</span>'; }
          break;
        }
        case 'perm-share': perm.share = !(perm.share !== false); b.classList.toggle('on', perm.share); savePerm(); break;
        case 'perm-bt': {
          const msg = $('perm-bt-msg');
          let avail = null;
          try { if (navigator.bluetooth && navigator.bluetooth.getAvailability) avail = await navigator.bluetooth.getAvailability(); } catch (x) {}
          perm.nearby = true; savePerm();
          msg.innerHTML = avail === false
            ? '<span style="color:var(--amber)">Allowed, but Bluetooth looks off on this device. Turn it on in quick settings.</span>'
            : '<span style="color:var(--green)">✓ Allowed. Survivors within ~200 m will appear under CREW, Nearby now.</span><div class="muted tiny">In this web version the link runs through the browser; the Android build uses Bluetooth and Wi-Fi Direct.</div>';
          b.textContent = '✓ Nearby allowed'; b.classList.remove('primary');
          break;
        }
        case 'perm-done': {
          savePerm();
          if (ui._permFirst) { location.reload(); break; }
          DR.state.shareLoc = perm.share !== false; DR.state.nearbyOn = perm.nearby !== false;
          if (perm.gps) { DR.state.mode = 'gps'; DR.app.gps(true); }
          DR.save(); ui.close(); ui.render(); break;
        }
        case 'crew-add': {
          const c = s.crew[b.dataset.id] = s.crew[b.dataset.id] || { name: (cm.npcs().find(n => n.id === b.dataset.id) || {}).name || 'Survivor', lastHeard: s.clock };
          c.inCrew = true; s.silenceAlerted[b.dataset.id] = false;
          ui.toast(c.wantsMe ? `🤝 You and ${c.name} are now a crew` : `🤝 Asked ${c.name} to team up. It becomes mutual when they accept on their phone.`); ui.render(); DR.save(); break;
        }
        case 'crew-remove': { const c = s.crew[b.dataset.id]; if (c) c.inCrew = false; ui.render(); DR.save(); break; }
        case 'hb': await cm.heartbeat(); ui.toast('💓 Check-in broadcast: status + location'); break;
        case 'find': {
          const c = s.crew[b.dataset.id], r = DR.plan('safe', s.pos, { lat: c.lat, lng: c.lng, name: `Last seen: ${c.name}` });
          if (r) { DR.activate(r); ui.show('route'); ui.toast(`Route to ${c.name}'s last known position`); } break;
        }
        case 'stream-show': ui.streamShow(); break;
        case 'stream-scan': ui.streamScan(); break;
        case 'guide-go': e.preventDefault(); guideOpen = b.dataset.id; if (ui.tab !== 'guide') ui.show('guide'); else ui.render(); $('tab-guide').scrollTop = 0; break;
        case 'guide-back': guideOpen = null; ui.render(); break;
        // ---- auth ----
        case 'auth-pick': authPick = b.dataset.id; ui.auth(); break;
        case 'auth-new': authMode = 'new'; ui.auth(); break;
        case 'auth-back': authMode = 'pick'; ui.auth(); break;
        case 'auth-demo': $('r-name').value = 'Aarav'; $('r-partner').value = 'Mira'; $('r-blood').value = 'O+'; $('r-contact').value = 'Mira (partner)'; $('r-med').value = 'Allergic to penicillin'; $('r-pin').value = $('r-pin2').value = '1919'; break;
        case 'auth-register': {
          if ($('r-pin').value !== $('r-pin2').value) { err('PINs do not match.'); break; }
          b.disabled = true; b.textContent = 'Generating your key pair…';
          try {
            const acc = await A.register({ name: $('r-name').value, partner: $('r-partner').value, blood: $('r-blood').value, contact: $('r-contact').value, medical: $('r-med').value, pin: $('r-pin').value });
            ui.permissions(acc, true);
          } catch (x) { err(x.message); b.disabled = false; b.textContent = 'Create my survivor ID'; }
          break;
        }
        case 'auth-login': {
          b.disabled = true;
          try { await A.login(authPick, $('pin').value); location.reload(); } catch (x) { err(x.message); b.disabled = false; }
          break;
        }
      }
    } catch (x) { console.error(x); ui.toast('Error: ' + x.message); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pin') document.querySelector('[data-act=auth-login]')?.click(); });
})();
