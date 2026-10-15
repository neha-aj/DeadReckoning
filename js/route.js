/* Route planning: three survival profiles, cost-of-survival per route, directions,
   and the HORDE reroute (the event constraint). */
(function () {
  const DR = window.DR, G = DR.geo, C = window.DR_CATALOG;

  DR.PROFILES = {
    fast:   { id: 'fast',   label: 'FASTEST',  icon: '⚡', exposure: [1, 1, 1, 1],         k: 0.35, desc: 'Shortest walk. Uses main roads, ignores most risk.' },
    safe:   { id: 'safe',   label: 'SAFEST',   icon: '🛡', exposure: [1.7, 1.4, 1.12, 1], k: 6,    desc: 'Least exposure: avoids hot zones and wide open roads.' },
    supply: { id: 'supply', label: 'RESUPPLY', icon: '🎒', exposure: [1.6, 1.35, 1.1, 1], k: 5,    desc: 'Safe route that stops where you can refill what runs out first.' },
  };
  const profileFor = id => {
    const p = DR.PROFILES[id];
    const night = DR.isNight(DR.state.clock) ? 1.4 : 1;
    const mode = DR.state.travel;
    // car: engine noise pulls hordes in (danger weighs more) and residential lanes are jammed with wrecks
    if (mode === 'car') return { exposure: [p.exposure[0], p.exposure[1], p.exposure[2] * 1.2, 8], k: p.k * night * 1.6 + 0.5 };
    // cycle: quiet and quick, so less time spent in each danger zone
    if (mode === 'cycle') return { exposure: p.exposure, k: p.k * night * 0.75 };
    return { exposure: p.exposure, k: p.k * night };
  };

  DR.refreshDanger = () => G.buildDanger(DR.state.threats, DR.intelAll(), DR.state.useIntel, DR.state.clock);

  // what to restock first, and which place categories can refill it
  DR.need = () => {
    const s = DR.survival(), t = DR.totals();
    if (s.limit === 'water') return { key: 'water', label: 'water', cats: ['WATER', 'FOOD'], loot: 'water1l' };
    if (s.limit === 'food') return { key: 'food', label: 'food', cats: ['FOOD'], loot: null };
    if (s.limit === 'battery') return { key: 'battery', label: 'power', cats: ['POWER'], loot: 'powerbank' };
    if (!t.weapons.length) return { key: 'weapon', label: 'a weapon', cats: ['TOOL'], loot: null };
    return { key: 'med', label: 'medicine', cats: ['MED'], loot: null };
  };
  const placeGives = (pl, need) => {
    const loot = C.loot[pl.sub] || [];
    if (need.key === 'water') return loot.includes('water1l');
    if (need.key === 'food') return loot.some(id => DR.item(id)?.kcal);
    if (need.key === 'battery') return loot.includes('powerbank');
    if (need.key === 'weapon') return loot.some(id => DR.item(id)?.weapon);
    return loot.some(id => DR.item(id)?.heal);
  };
  // expected gain from a stop, scaled by how stocked the place was last recorded
  const stopGain = (pl, need) => {
    const st = DR.placeStatus(pl).stock;
    const g = { water: 0, kcal: 0, charge: 0 };
    if (!st) return g;
    if (need.key === 'water') g.water = 1.5 * st;
    if (need.key === 'food' || need.key === 'water') g.kcal = (C.loot[pl.sub] || []).some(id => DR.item(id)?.kcal) ? 500 * st : 0;
    if (need.key === 'battery') g.charge = 40 * st;
    return g;
  };

  // ---------- one route ----------
  DR.plan = (profileId, from, dest, via) => {
    const prof = profileFor(profileId);
    const s = G.nearestNode(from[0], from[1]);
    let path;
    if (via) {
      const v = G.nearestNode(via.lat, via.lng);
      const a = G.astar(s, v, prof), b = a && G.astar(v, G.nearestNode(dest.lat, dest.lng), prof);
      if (!a || !b) return null;
      path = a.concat(b.slice(1));
    } else {
      path = G.astar(s, G.nearestNode(dest.lat, dest.lng), prof);
    }
    if (!path) return null;
    return DR.describe(profileId, path, dest, via);
  };

  DR.describe = (profileId, path, dest, via, extra = {}) => {
    const g = G.graph, d = G.danger;
    let dist = 0, exposed = 0, risk = 0, hot = 0, blockedAt = -1;
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      const e = G.edgeBetween(path[i - 1], path[i]);
      const L = e >= 0 ? g.len[e] : G.dist(g.lat[path[i - 1]], g.lng[path[i - 1]], g.lat[path[i]], g.lng[path[i]]);
      dist += L; cum.push(dist);
      if (e >= 0 && g.cls[e] <= 1) exposed += L;
      const dv = Math.min(d[path[i]], 3);
      risk += dv * L;
      if (dv > 0.8) hot += L;
      if (d[path[i]] >= G.BLOCK && blockedAt < 0 && i > 3) blockedAt = cum[i];
    }
    const pace = DR.pace() * (profileId === 'fast' ? 1 : 0.95);
    const fuelNeed = DR.state.travel === 'car' ? dist / 1000 * DR.FUEL_PER_KM : 0;
    const walkMin = dist / 1000 / pace * 60 + (via ? 12 : 0) + (extra.waitMin || 0);
    const now = DR.state.clock, arrive = now + walkMin;
    const t = DR.totals(), b = DR.burn(true), br = DR.burn(false);
    const moveH = (walkMin - (extra.waitMin || 0)) / 60, restH = (extra.waitMin || 0) / 60;
    const gain = via ? stopGain(via, DR.need()) : { water: 0, kcal: 0, charge: 0 };
    const end = {
      water: t.water + gain.water - b.water * moveH - br.water * restH,
      kcal: t.kcal + gain.kcal - b.kcal * moveH - br.kcal * restH,
      battery: DR.state.battery + t.charge + gain.charge - b.battery * (moveH + restH),
    };
    const riskAvg = dist ? risk / dist : 0;
    const deadlineOK = !DR.state.deadline || dest.name !== DR.BEACON.name || arrive <= DR.state.deadline;
    const waterOK = end.water >= 0, foodOK = end.kcal >= -b.kcal * 3, batteryOK = end.battery > 0;
    const fuelOK = t.fuel >= fuelNeed;
    const feasible = deadlineOK && waterOK && foodOK && batteryOK && fuelOK && blockedAt < 0;
    const score = walkMin + riskAvg * 140 + hot / 25 + (feasible ? 0 : 900) + (deadlineOK ? 0 : 900);
    let verdict;
    if (blockedAt >= 0) verdict = `Blocked ${G.fmtDist(blockedAt)} ahead`;
    else if (!deadlineOK) verdict = `Arrives ${DR.dur(arrive - DR.state.deadline)} after the settlement gates close`;
    else if (!waterOK) verdict = `Water runs out ${DR.dur(-end.water / b.water * 60)} before arrival`;
    else if (!foodOK) verdict = 'Too weak from hunger to finish';
    else if (!batteryOK) verdict = 'Phone dies on the way';
    else if (!fuelOK) verdict = `Needs ${fuelNeed.toFixed(1)} L fuel, you have ${t.fuel.toFixed(1)} L`;
    else verdict = DR.state.deadline && dest.name === DR.BEACON.name ? `Arrive ${DR.hhmm(arrive)} · ${DR.dur(DR.state.deadline - arrive)} before the gates close` : `Arrive ${DR.hhmm(arrive)}`;
    return {
      profile: profileId, path, cum, dest, via: via || null, dist, walkMin, arrive, exposedPct: dist ? exposed / dist : 0,
      risk: riskAvg, hot, end, gain, fuelNeed, deadlineOK, waterOK, foodOK, batteryOK, feasible, score, verdict, blockedAt,
      steps: DR.steps(path), ...extra,
    };
  };

  // choose the best stop for what runs out first, then route through it
  DR.planSupply = (from, dest) => {
    const need = DR.need();
    const direct = G.dist(from[0], from[1], dest.lat, dest.lng);
    const cands = DR.allPlaces()
      .filter(p => need.cats.includes(p.cat) && placeGives(p, need) && DR.placeStatus(p).stock > 0 && G.danger[G.nearestNode(p.lat, p.lng)] < 1.2)
      .map(p => ({ p, detour: G.dist(from[0], from[1], p.lat, p.lng) + G.dist(p.lat, p.lng, dest.lat, dest.lng) - direct - DR.placeStatus(p).stock * 120 }))
      .sort((a, b) => a.detour - b.detour).slice(0, 5);
    let best = null;
    for (const { p } of cands) {
      const r = DR.plan('supply', from, dest, p);
      if (r && (!best || r.score < best.score)) best = r;
    }
    if (best) best.need = need;
    return best;
  };

  DR.planAll = (from = DR.state.pos, dest = DR.BEACON) => {
    DR.refreshDanger();
    const out = [DR.plan('fast', from, dest), DR.plan('safe', from, dest), DR.planSupply(from, dest)].filter(Boolean);
    const ok = out.filter(r => r.feasible);
    const best = (ok.length ? ok : out).slice().sort((a, b) => a.score - b.score)[0];
    if (best) best.recommended = true;
    return out;
  };

  // ---------- directions ----------
  DR.steps = path => {
    const g = G.graph, steps = [];
    let cur = null, d0 = 0;
    for (let i = 1; i < path.length; i++) {
      const e = G.edgeBetween(path[i - 1], path[i]);
      const name = e >= 0 ? (G.wayName(g.way[e]) || '') : '';
      const L = e >= 0 ? g.len[e] : 0;
      if (!cur || (name !== cur.name && (name || L > 60))) {
        const brg = G.bearing(g.lat[path[i - 1]], g.lng[path[i - 1]], g.lat[path[i]], g.lng[path[i]]);
        let turn = 'Head ' + G.compass(brg);
        if (cur) {
          const delta = ((brg - cur.endBrg + 540) % 360) - 180;
          turn = Math.abs(delta) < 30 ? 'Continue' : delta < 0 ? (delta < -120 ? 'Sharp left' : 'Turn left') : (delta > 120 ? 'Sharp right' : 'Turn right');
        }
        cur = { name, turn, from: d0, dist: 0, idx: i - 1, endBrg: brg };
        steps.push(cur);
      }
      cur.dist += L; d0 += L;
      cur.endBrg = G.bearing(g.lat[path[i - 1]], g.lng[path[i - 1]], g.lat[path[i]], g.lng[path[i]]);
    }
    // fold tiny unnamed fragments into the previous step
    return steps.filter((s, i) => i === 0 || s.name || s.dist > 60).map(s => ({ ...s, label: s.name || 'side lane' }));
  };

  // ---------- active route & movement ----------
  DR.activate = plan => {
    DR.state.route = { profile: plan.profile, dest: plan.dest, via: plan.via, path: plan.path, progress: 0, viaDone: false, set: DR.state.clock };
    DR.active = plan;
    DR.emit('route');
  };
  DR.rehydrate = () => {
    const r = DR.state.route;
    if (!r) { DR.active = null; return; }
    DR.refreshDanger();
    DR.active = DR.describe(r.profile, r.path, r.dest, r.via);
  };
  DR.posOnRoute = (plan, meters) => {
    const g = G.graph, { path, cum } = plan;
    if (path.length < 2) return { lat: g.lat[path[0]], lng: g.lng[path[0]], idx: 1 };
    let i = 1;
    while (i < cum.length - 1 && cum[i] < meters) i++;
    const a = path[i - 1], b = path[i], seg = cum[i] - cum[i - 1] || 1, f = Math.min(1, Math.max(0, (meters - cum[i - 1]) / seg));
    return { lat: g.lat[a] + (g.lat[b] - g.lat[a]) * f, lng: g.lng[a] + (g.lng[b] - g.lng[a]) * f, idx: i };
  };
  DR.currentStep = () => {
    const p = DR.active; if (!p) return null;
    const m = DR.state.route.progress;
    let i = 0;
    while (i < p.steps.length - 1 && p.steps[i + 1].from <= m) i++;
    const s = p.steps[i], next = p.steps[i + 1];
    return { step: s, left: s.from + s.dist - m, next, remaining: p.dist - m };
  };

  // first impassable point on what is left of the active route
  DR.blockAhead = () => {
    const p = DR.active; if (!p) return null;
    const m = DR.state.route.progress, d = G.danger, g = G.graph;
    for (let i = 1; i < p.path.length; i++) {
      if (p.cum[i] < m + 15) continue;
      if (d[p.path[i]] >= G.BLOCK) return { meters: p.cum[i] - m, lat: g.lat[p.path[i]], lng: g.lng[p.path[i]] };
    }
    return null;
  };

  // ---------- HORDE: options when the route is cut ----------
  DR.hordeOptions = () => {
    const from = DR.state.pos, dest = DR.BEACON;
    DR.refreshDanger();
    const opts = [];
    const detour = DR.plan('safe', from, dest);
    if (detour) opts.push(Object.assign(detour, { kind: 'detour', title: 'Detour around it', icon: '↪' }));
    const sup = DR.planSupply(from, dest);
    if (sup) opts.push(Object.assign(sup, { kind: 'supply', title: `Detour + restock ${sup.need.label}`, icon: '🎒' }));
    // hide in the best nearby shelter and let the horde drift past
    const shel = DR.allPlaces()
      .filter(p => p.cat === 'SHEL' && C.shelter[p.sub])
      .map(p => ({ p, d: G.dist(from[0], from[1], p.lat, p.lng) }))
      .filter(x => x.d < 900 && G.danger[G.nearestNode(x.p.lat, x.p.lng)] < 1)
      .sort((a, b) => (a.d / 400 - C.shelter[a.p.sub][0]) - (b.d / 400 - C.shelter[b.p.sub][0]))[0];
    if (shel) {
      const h = DR.state.threats.filter(t => t.type === 'horde').slice(-1)[0];
      const speed = h ? Math.hypot(h.vlat * 111320, h.vlng * 108500) : 4;
      const wait = Math.round(Math.min(90, Math.max(25, ((h ? h.r : 150) * 2.2) / Math.max(speed, 1))));
      const toShel = DR.plan('safe', from, { lat: shel.p.lat, lng: shel.p.lng, name: shel.p.name });
      if (toShel) {
        // after waiting, assume the original corridor clears: route from shelter ignoring that horde
        const saved = DR.state.threats;
        DR.state.threats = saved.filter(t => t !== h);
        DR.refreshDanger();
        const after = DR.plan('safe', [shel.p.lat, shel.p.lng], dest);
        const plan = after && DR.describe('safe', toShel.path.concat(after.path.slice(1)), dest, null, { waitMin: wait });
        DR.state.threats = saved;
        DR.refreshDanger();
        if (plan) {
          Object.assign(plan, { kind: 'hide', title: `Hide ${wait} min, let it pass`, icon: '⛨', shelter: shel.p, wait });
          opts.push(plan);
        }
      }
    }
    const ok = opts.filter(o => o.feasible);
    const best = (ok.length ? ok : opts).slice().sort((a, b) => a.score - b.score)[0];
    if (best) best.recommended = true;
    return opts;
  };

  // nearest strong shelter (used for rendezvous and "find shelter")
  DR.bestShelter = (lat, lng, maxD = 1200) => DR.allPlaces()
    .filter(p => p.cat === 'SHEL' && C.shelter[p.sub])
    .map(p => ({ p, d: G.dist(lat, lng, p.lat, p.lng), s: C.shelter[p.sub][0] }))
    .filter(x => x.d < maxD && G.danger[G.nearestNode(x.p.lat, x.p.lng)] < 0.9)
    .sort((a, b) => (a.d / 500 - a.s) - (b.d / 500 - b.s))[0];
})();
