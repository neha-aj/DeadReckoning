/* Geometry, the offline road graph, the danger field and A* routing. */
(function () {
  const DR = window.DR = window.DR || {};
  const M = window.DR_MAP;
  const R = 6371000, RAD = Math.PI / 180;

  const geo = DR.geo = {};
  geo.dist = (a1, o1, a2, o2) => {
    const dA = (a2 - a1) * RAD, dO = (o2 - o1) * RAD;
    const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * RAD) * Math.cos(a2 * RAD) * Math.sin(dO / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  geo.bearing = (a1, o1, a2, o2) => {
    const y = Math.sin((o2 - o1) * RAD) * Math.cos(a2 * RAD);
    const x = Math.cos(a1 * RAD) * Math.sin(a2 * RAD) - Math.sin(a1 * RAD) * Math.cos(a2 * RAD) * Math.cos((o2 - o1) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  };
  geo.compass = deg => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  geo.fmtDist = m => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  // metres -> degrees near Bengaluru (good enough for small offsets)
  geo.offset = (lat, lng, dn, de) => [lat + dn / 111320, lng + de / (111320 * Math.cos(lat * RAD))];

  // ---------- graph ----------
  const n = M.N.length / 2;
  const lat = new Float64Array(n), lng = new Float64Array(n);
  for (let i = 0; i < n; i++) { lat[i] = M.N[2 * i] / 1e5; lng[i] = M.N[2 * i + 1] / 1e5; }
  const deg = new Uint16Array(n);
  for (const w of M.W) for (let i = 3; i < w.length; i++) { deg[w[i - 1]]++; deg[w[i]]++; }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const m = start[n];
  const to = new Uint32Array(m), len = new Float32Array(m), cls = new Uint8Array(m), way = new Uint16Array(m);
  const fill = start.slice(0, n);
  M.W.forEach((w, wi) => {
    for (let i = 3; i < w.length; i++) {
      const a = w[i - 1], b = w[i], d = geo.dist(lat[a], lng[a], lat[b], lng[b]);
      for (const [u, v] of [[a, b], [b, a]]) { const e = fill[u]++; to[e] = v; len[e] = d; cls[e] = w[0]; way[e] = wi; }
    }
  });
  // node -> best road class touching it (for exposure) and spatial grid for snapping
  const nodeCls = new Uint8Array(n).fill(9);
  for (let u = 0; u < n; u++) for (let e = start[u]; e < start[u + 1]; e++) nodeCls[u] = Math.min(nodeCls[u], cls[e]);
  const CELL = 0.002, grid = new Map();
  const key = (a, o) => `${Math.floor(a / CELL)}:${Math.floor(o / CELL)}`;
  for (let i = 0; i < n; i++) { const k = key(lat[i], lng[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }

  geo.graph = { n, lat, lng, start, to, len, cls, way, nodeCls };
  geo.wayName = wi => M.NM[M.W[wi][1]] || '';
  geo.nearestNode = (a, o) => {
    let best = -1, bd = Infinity;
    for (let r = 0; r < 6 && best < 0; r++) {
      const ca = Math.floor(a / CELL), co = Math.floor(o / CELL);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        for (const p of grid.get(`${ca + i}:${co + j}`) || []) {
          const d = geo.dist(a, o, lat[p], lng[p]);
          if (d < bd) { bd = d; best = p; }
        }
      }
    }
    return best;
  };
  geo.nodesWithin = (a, o, radius, fn) => {
    const cr = Math.ceil(radius / 200) + 1, ca = Math.floor(a / CELL), co = Math.floor(o / CELL);
    for (let i = -cr; i <= cr; i++) for (let j = -cr; j <= cr; j++) {
      for (const p of grid.get(`${ca + i}:${co + j}`) || []) {
        const d = geo.dist(a, o, lat[p], lng[p]);
        if (d <= radius) fn(p, d);
      }
    }
  };
  geo.inCoverage = (a, o) => a >= M.bbox[0] && a <= M.bbox[2] && o >= M.bbox[1] && o <= M.bbox[3];

  // ---------- danger field ----------
  // danger[u]: 0 = clear, ~1 = very dangerous, >= BLOCK = impassable (horde core / blocked road)
  const BLOCK = 50;
  geo.BLOCK = BLOCK;
  geo.danger = new Float32Array(n);
  geo.buildDanger = (threats, intel, useIntel, now) => {
    const d = geo.danger;
    d.fill(0);
    if (useIntel) {
      for (const r of intel) {
        const w = DR.intelWeight(r, now);
        if (r.kind === 'block') { geo.nodesWithin(r.lat, r.lng, r.r, p => { d[p] = BLOCK; }); continue; }
        geo.nodesWithin(r.lat, r.lng, r.r * 1.6, (p, dist) => {
          const f = dist <= r.r ? 1 : 1 - (dist - r.r) / (r.r * 0.6);
          d[p] += (r.kind === 'safe' ? -0.6 : 1) * w * f;
        });
      }
    }
    for (const t of threats) {
      if (t.type === 'block') { geo.nodesWithin(t.lat, t.lng, t.r, p => { d[p] = BLOCK; }); continue; }
      const sev = { horde: 1.4, walkers: 0.6, fire: 0.9 }[t.type];
      if (!sev) continue;
      const core = t.type === 'horde' ? t.r : 0;
      geo.nodesWithin(t.lat, t.lng, t.r * 2.5, (p, dist) => {
        if (dist <= core) { d[p] = BLOCK; return; }
        d[p] += sev * (1 - dist / (t.r * 2.5));
      });
    }
    for (let i = 0; i < n; i++) if (d[i] < 0) d[i] = 0; else if (d[i] > 3 && d[i] < BLOCK) d[i] = 3;
  };

  // ---------- A* ----------
  // profile: { exposure: [c0,c1,c2,c3], k: danger weight }
  geo.astar = (s, t, profile) => {
    if (s < 0 || t < 0) return null;
    const d = geo.danger;
    if (d[t] >= BLOCK) return null;
    const g = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], hf = [];
    const push = (v, f) => {
      heap.push(v); hf.push(f);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], lv = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = lv; hf[0] = lf;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let s2 = i;
          if (l < heap.length && hf[l] < hf[s2]) s2 = l;
          if (r < heap.length && hf[r] < hf[s2]) s2 = r;
          if (s2 === i) break;
          [heap[s2], heap[i]] = [heap[i], heap[s2]]; [hf[s2], hf[i]] = [hf[i], hf[s2]]; i = s2;
        }
      }
      return top;
    };
    const minF = Math.min(...profile.exposure);
    const h = v => geo.dist(lat[v], lng[v], lat[t], lng[t]) * minF;
    g[s] = 0; push(s, h(s));
    // allow walking out of a danger core you are already standing in
    const startBlocked = d[s] >= BLOCK;
    while (heap.length) {
      const u = pop();
      if (closed[u]) continue;
      if (u === t) break;
      closed[u] = 1;
      for (let e = start[u]; e < start[u + 1]; e++) {
        const v = to[e];
        if (closed[v]) continue;
        const dv = d[v];
        if (dv >= BLOCK && !(startBlocked && g[u] < 400)) continue;
        const du = Math.min(d[u], 3);
        const c = len[e] * profile.exposure[cls[e]] * (1 + profile.k * (du + Math.min(dv, 3)) / 2);
        const ng = g[u] + c;
        if (ng < g[v]) { g[v] = ng; prev[v] = u; push(v, ng + h(v)); }
      }
    }
    if (prev[t] < 0 && s !== t) return null;
    const path = [];
    for (let v = t; v >= 0; v = prev[v]) path.push(v);
    return path.reverse();
  };

  geo.edgeBetween = (u, v) => { for (let e = start[u]; e < start[u + 1]; e++) if (to[e] === v) return e; return -1; };
})();
