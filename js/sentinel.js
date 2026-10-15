/* SENTINEL: a rule-based survival advisor. Reads the whole situation every few seconds and
   speaks like a survival specialist walking beside you. No AI service needed: works offline. */
(function () {
  const DR = window.DR, G = DR.geo, C = window.DR_CATALOG;
  const sn = DR.sentinel = {};
  let list = [], idx = 0;

  const nearest = (lat, lng, pred) => {
    let best = null;
    for (const p of DR.allPlaces()) {
      if (!pred(p)) continue;
      const d = G.dist(lat, lng, p.lat, p.lng);
      if (!best || d < best.d) best = { p, d };
    }
    return best;
  };
  const dirTo = (lat, lng) => G.compass(G.bearing(DR.state.pos[0], DR.state.pos[1], lat, lng));
  const placeName = p => p.name || C.sub[p.sub];

  sn.evaluate = () => {
    const s = DR.state, [la, lo] = s.pos, now = s.clock, out = [];
    const add = (lvl, id, text, tip) => out.push({ lvl, id, text, tip });
    const sv = DR.survival(), t = DR.totals();
    const night = DR.isNight(now), toSunset = Math.round(DR.minsToSunset(now));
    const left = s.deadline - now;

    // threats nearby
    let closest = null;
    for (const h of s.threats) {
      const d = G.dist(la, lo, h.lat, h.lng) - h.r;
      if (!closest || d < closest.d) closest = { h, d };
    }
    if (closest && closest.d < 450 && closest.h.type !== 'block') {
      const dir = dirTo(closest.h.lat, closest.h.lng);
      if (closest.h.type === 'horde') {
        add('danger', 'horde-near', `Horde ${G.fmtDist(Math.max(0, closest.d))} ${dir}.${s.silent ? '' : ' Put the phone on SILENT.'} Walk, don't run. No torch.`, 'They hunt by sound first, movement second.');
      } else add('warn', 'walkers-near', `${closest.h.type === 'fire' ? 'Fire' : 'Walkers'} ${G.fmtDist(Math.max(0, closest.d))} ${dir}. Keep a wall on one side, eyes on corners.`, '');
    }
    const danger = G.danger[G.nearestNode(la, lo)] || 0;
    if (danger > 0.9 && danger < G.BLOCK) add('warn', 'hotzone', 'You are inside a reported hot zone. Move through quickly and quietly, no stopping.', '');

    // time of day
    if (!night && toSunset > 0 && toSunset <= 45) add('warn', 'dusk', `Sunset in ${toSunset} min. After dark you move 20% slower and they see you better than you see them.`, '');
    if (night) add('warn', 'night', 'Night: stay off wide main roads, no white light. Cover the torch with your fingers or red cloth.', '');

    // beacon
    const goingThere = DR.active && s.route.dest.name === DR.BEACON.name && s.route.progress < DR.active.dist - 1;
    if (s.deadline && left <= 0 && left > -720 && goingThere) add('warn', 'beacon-dark', 'The settlement gates have closed for today. Find a strong shelter before dark and go at first light.', '');
    else if (s.deadline && left > 0 && left < 30 && goingThere) add('danger', 'beacon-30', `Gates close in ${Math.round(left)} min. Drop anything heavy that is not water or a weapon, and move.`, '');
    else if (s.deadline && goingThere && now + (DR.active.dist - s.route.progress) / 1000 / DR.pace() * 60 > s.deadline) add('warn', 'late', `At this pace you arrive after the gates close. Lighten the packs, ride if you have bicycles, or plan a shelter for the night.`, '');

    // supplies (only once you have logged what you carry: no nagging about empty packs you never filled in)
    if (!s.packLogged) add('info', 'logpack', 'Log what each of you carries in PACK. Water and food decide which route is safe.', '');
    else if (t.water <= 0.01) add('danger', 'nowater', 'Out of water. Dehydration hits your judgement before your legs. Restock is the top priority.', '');
    else if (sv.water < 1) {
      const w = nearest(la, lo, p => (C.loot[p.sub] || []).includes('water1l') && DR.placeStatus(p).stock > 0);
      add('warn', 'lowwater', `Water lasts ${DR.dur(sv.water * 60)}.${w ? ` Nearest likely water: ${placeName(w.p)}, ${G.fmtDist(w.d)} ${dirTo(w.p.lat, w.p.lng)}.` : ''}`, 'Sip, do not gulp. Do not drink from open drains or lakes without purifying.');
    }
    if (s.packLogged && t.kcal < 300) add('warn', 'food', 'Almost no food left. Eat before you feel weak: shaky hands miss swings.', '');
    if (sv.battery < 1.5 || s.battery < 25) add('warn', 'battery', `Phone battery ${Math.round(s.battery)}%. Turn on Low-power mode in PACK, dim the screen, check the map only at turns.`, '');

    // weapons & armour
    if (s.packLogged && !t.weapons.length) {
      const h = nearest(la, lo, p => (C.loot[p.sub] || []).some(id => DR.item(id)?.weapon) && DR.placeStatus(p).stock > 0);
      add('warn', 'noweapon', `Nobody in the group carries a weapon.${h ? ` ${placeName(h.p)} (${C.sub[h.p.sub]}) is ${G.fmtDist(h.d)} ${dirTo(h.p.lat, h.p.lng)}.` : ''}`, 'Always keep one weapon in hand, not in the bag.');
    } else if (s.packLogged && t.weapons.length < s.team.length) add('info', 'oneweapon', `${t.weapons.length} of ${s.team.length} are armed. The unarmed walk in the middle and carry the light.`, '');
    if (s.packLogged && t.armor < 2) add('info', 'armor', 'Cover your forearms: thick denim or duct tape stops most bites.', '');

    // people
    for (const p of s.team) {
      const kg = DR.packKg(p), lim = DR.packLimit(p);
      if (kg > lim + 1) add('warn', 'heavy-' + p.id, `${p.name}'s pack is ${kg.toFixed(1)} kg, ${(kg - lim).toFixed(1)} kg over. You are slower and louder. Use auto-balance or drop something.`, '');
      if (p.health < 40) add('danger', 'hurt-' + p.id, `${p.name} is badly hurt (${Math.round(p.health)}%). Treat wounds now; blood draws them.`, '');
    }
    // isolation
    if (s.status === 'exposed') {
      const left = 72 * 60 - (now - (s.exposedAt || now));
      add('warn', 'isolating', `Isolating: ${DR.dur(left)} of observation left. Separate cup and bottle, sleep apart, cloth over mouth when close. Report fever at once.`, '');
    }
    if (s.status === 'injured') add('warn', 'injured', 'You are marked injured. Clean and re-dress the wound at every stop: GUIDE has the steps.', '');
    // movement & discipline
    if (DR.active && s.walking && DR.active.exposedPct > 0.5 && !night) add('info', 'exposed', 'Long stretch on open main road ahead. Walk close to walls and parked vehicles, not in the middle.', '');
    if (DR.DRILL && !s.walking && DR.active) add('info', 'rest', 'Stopped. One rests or eats, the others keep watch.', '');
    if (s.friend && s.friend.name !== DR.person(s.me).name) {
      const d = G.dist(la, lo, s.friend.lat, s.friend.lng);
      if (d > 150) add('warn', 'split', `You are split up: ${s.friend.name} is ${G.fmtDist(d)} ${dirTo(s.friend.lat, s.friend.lng)}.${s.rendezvous ? ' Rendezvous is set.' : ' Set a rendezvous now.'}`, '');
    }
    if (!s.rendezvous) add('info', 'rv', 'No rendezvous set. Agree on one now, in case you get separated: CREW → Links → Rendezvous.', '');
    // evergreen field rules
    const rules = [
      'Never enter a building you cannot see the exit of.',
      'Before every corner: stop, listen for five seconds, then look.',
      'Noise is a weapon too: throw the whistle or a bottle away from you to pull them off.',
      'Keep the phone on silent and vibration short. Sound carries far in a dead city.',
      'Refill water every time you can, not when you run out.',
      'Move in the shade along buildings: it hides you and saves water.',
      'If one of you is bitten, tell the other straight away. No secrets.',
      'Mark every place you search. Do not waste time on a store twice.',
    ];
    add('info', 'rule', rules[Math.floor(now / 30) % rules.length], '');

    const order = { danger: 0, warn: 1, info: 2 };
    out.sort((a, b) => order[a.lvl] - order[b.lvl]);
    return out;
  };

  sn.alert = (lvl, text) => {
    const s = DR.state;
    if (s.alerts[0] && s.alerts[0].text === text && s.clock - s.alerts[0].ts < 60) return;   // never the same line twice in a row
    s.alerts.unshift({ id: DR.uid(), lvl, text, ts: s.clock });
    s.alerts = s.alerts.slice(0, 60);
    if (lvl === 'danger' && navigator.vibrate) navigator.vibrate([200, 80, 200]);
    if (lvl === 'danger') DR.comms.say(text);
    DR.emit('alerts');
  };

  sn.update = () => {
    const prevIds = new Set(list.map(x => x.id));
    list = sn.evaluate();
    // Calm by design: only real DANGER interrupts you, and the same danger at most once every 3 hours.
    // Everything else stays in the advisor strip, where you can read it when you want.
    const s = DR.state;
    for (const a of list) {
      if (a.lvl !== 'danger' || prevIds.has(a.id)) continue;
      const key = a.id.replace(/-.*$/, '');
      if (s.alertAt[key] && s.clock - s.alertAt[key] < 180) continue;
      s.alertAt[key] = s.clock; sn.alert('danger', a.text);
    }
    sn.render();
  };
  sn.list = () => list;
  sn.render = () => {
    const el = document.getElementById('sentinel');
    if (!list.length) return;
    const top = list.filter(x => x.lvl === list[0].lvl);
    const a = top[idx % top.length];
    el.className = a.lvl === 'info' ? '' : a.lvl;
    el.querySelector('.msg').textContent = a.text;
    el.querySelector('.count').textContent = list.length > 1 ? `+${list.length - 1}` : '';
  };
  sn.rotate = () => { idx++; sn.render(); };
})();
