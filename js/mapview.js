/* The map: drawn entirely from the bundled OSM data. No tile server, no network. */
(function () {
  const DR = window.DR, M = window.DR_MAP, G = DR.geo, C = window.DR_CATALOG;
  const mv = DR.mapview = {};
  let map, canvas, svg;
  const L_ = {};

  mv.init = () => {
    const b = M.bbox;
    map = mv.map = L.map('map', {
      zoomControl: false, attributionControl: true, preferCanvas: true,
      minZoom: 13, maxZoom: 19, zoomSnap: 0.25,
      maxBounds: [[b[0] - 0.01, b[1] - 0.015], [b[2] + 0.01, b[3] + 0.015]],
    }).setView([12.986, 77.585], 15);
    map.attributionControl.setPrefix('').addAttribution('Map data © OpenStreetMap contributors · bundled offline');
    canvas = L.canvas({ padding: 0.4 });
    svg = L.svg({ padding: 0.4 });

    // land use
    const fills = { G: ['#0c2a1c', '#14492f'], S: ['#13202e', '#1f3a52'], B: ['#08223a', '#0f4a77'], M: ['#251015', '#4a1d27'] };
    const areaLayer = L.layerGroup().addTo(map);
    for (const a of M.A) {
      const pts = []; for (let i = 2; i < a.length; i += 2) pts.push([a[i] / 1e5, a[i + 1] / 1e5]);
      const [f, s] = fills[a[0]];
      L.polygon(pts, { renderer: canvas, color: s, weight: 1, fillColor: f, fillOpacity: 0.85, interactive: false }).addTo(areaLayer);
    }
    // roads, by class: wide glow pass then crisp pass
    const byCls = [[], [], [], []];
    for (const w of M.W) {
      const pts = []; for (let i = 2; i < w.length; i++) pts.push([M.N[2 * w[i]] / 1e5, M.N[2 * w[i] + 1] / 1e5]);
      byCls[w[0]].push(pts);
    }
    const styles = [
      [{ color: '#38e8ff', weight: 9, opacity: 0.09 }, { color: '#4fd8f0', weight: 2.6, opacity: 0.9 }],
      [{ color: '#38e8ff', weight: 7, opacity: 0.06 }, { color: '#3bb4cc', weight: 2, opacity: 0.85 }],
      [null, { color: '#2a8296', weight: 1.4, opacity: 0.8 }],
      [null, { color: '#1c5866', weight: 1, opacity: 0.75 }],
    ];
    for (let c = 3; c >= 0; c--) for (const st of styles[c]) if (st) L.polyline(byCls[c], { ...st, renderer: canvas, interactive: false, lineCap: 'round' }).addTo(map);
    // coverage of the downloaded map
    L.rectangle([[b[0], b[1]], [b[2], b[3]]], { renderer: canvas, color: '#38e8ff', weight: 1, dashArray: '6 8', fill: false, opacity: 0.4, interactive: false }).addTo(map);

    // labels for orientation
    const labels = [['CUBBON PARK', 12.9765, 77.5935], ['PALACE GROUNDS', 13.0035, 77.5885], ['MAJESTIC', 12.9768, 77.5705], ['SHIVAJINAGAR', 12.9865, 77.6045],
      ['MALLESWARAM', 13.0005, 77.5705], ['SESHADRIPURAM', 12.9905, 77.5765], ['K.R. MARKET', 12.9632, 77.5785], ['VIDHANA SOUDHA', 12.9805, 77.5895], ['RACE COURSE', 12.9862, 77.5835], ['M.G. ROAD', 12.9745, 77.6075]];
    for (const [t, la, lo] of labels) L.marker([la, lo], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="mk-label">${t}</div>`, iconSize: [0, 0] }) }).addTo(map);

    L_.intel = L.layerGroup().addTo(map);
    L_.places = L.layerGroup().addTo(map);
    L_.alts = L.layerGroup().addTo(map);
    L_.route = L.layerGroup().addTo(map);
    L_.threats = L.layerGroup().addTo(map);
    L_.marks = L.layerGroup().addTo(map);

    // beacon & start
    L.marker([DR.BEACON.lat, DR.BEACON.lng], { zIndexOffset: 900, icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      html: '<div class="mk-beacon"><div class="beam"></div><div class="pulse"></div><div class="pulse b"></div><div class="core"></div><div class="mk-tag" style="left:34px;top:6px;color:#ffb020">THE LAST BEACON</div></div>' }) })
      .bindTooltip('Evacuation point · Palace Grounds').addTo(map);
    mv.me = L.marker(DR.state.pos, { zIndexOffset: 1000, interactive: false, icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      html: '<div class="mk-me"><div class="sweep"></div><div class="ring"></div><div class="dot"></div><div class="mk-tag" id="me-tag"></div></div>' }) }).addTo(map);

    map.on('click', e => DR.ui.mapClick(e.latlng));
    map.on('contextmenu', e => DR.ui.reportAt(e.latlng));
    mv.drawIntel(); mv.drawPlaces(); mv.drawThreats(); mv.drawMarks();
  };

  mv.setVisible = (name, on) => { const l = L_[name]; if (on) l.addTo(map); else l.remove(); };

  mv.drawIntel = () => {
    L_.intel.clearLayers();
    if (!DR.state.useIntel) return;
    for (const r of DR.intelAll()) {
      const w = DR.intelWeight(r, DR.state.clock);
      if (r.kind === 'safe') {
        L.circle([r.lat, r.lng], { renderer: canvas, radius: r.r, color: '#3dffa8', weight: 1.2, dashArray: '4 6', fillColor: '#3dffa8', fillOpacity: 0.06 })
          .bindTooltip(`SAFE · ${r.text}`, { sticky: true, className: '' }).addTo(L_.intel);
      } else if (r.kind === 'block') {
        L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#ff3b5c;color:#ff3b5c">✖</div>' }) })
          .bindTooltip(`ROAD BLOCKED · ${r.text}`).addTo(L_.intel);
      } else {
        for (const [k, op] of [[1.5, 0.05], [1, 0.1], [0.55, 0.14]])
          L.circle([r.lat, r.lng], { renderer: canvas, radius: r.r * k, stroke: false, fillColor: r.kind === 'origin' ? '#ff2050' : '#ff5a3b', fillOpacity: op * Math.min(1, w * 1.5 + 0.2), interactive: false }).addTo(L_.intel);
        L.circle([r.lat, r.lng], { renderer: canvas, radius: r.r, color: '#ff3b5c', weight: 1, opacity: 0.35, dashArray: '2 6', fill: true, fillOpacity: 0 })
          .bindTooltip(`${r.kind === 'origin' ? 'OUTBREAK ORIGIN' : 'INTEL'} · ${r.text}`, { sticky: true }).addTo(L_.intel);
      }
    }
  };

  mv.cats = new Set(['MED', 'FOOD', 'WATER', 'TOOL']);   // the rest are one tap away in SUPPLY
  mv.drawPlaces = () => {
    L_.places.clearLayers();
    for (const p of DR.allPlaces()) {
      if (!mv.cats.has(p.cat)) continue;
      const st = DR.placeStatus(p), col = C.placeCats[p.cat].color;
      L.circleMarker([p.lat, p.lng], { renderer: canvas, radius: p.user ? 7 : 4.5, color: col, weight: st.stock ? 1.5 : 1, opacity: st.stock ? 0.95 : 0.4,
        fillColor: col, fillOpacity: st.stock ? 0.55 : 0.08 })
        .on('click', e => { L.DomEvent.stopPropagation(e); DR.ui.placePopup(p, e.latlng); }).addTo(L_.places);
    }
  };

  mv.drawThreats = () => {
    L_.threats.clearLayers();
    for (const t of DR.state.threats) {
      if (t.type === 'horde') {
        L.circle([t.lat, t.lng], { renderer: svg, radius: t.r * 2.5, color: '#ff3b5c', weight: 1, dashArray: '3 7', fillColor: '#ff3b5c', fillOpacity: 0.07, interactive: false }).addTo(L_.threats);
        L.circle([t.lat, t.lng], { renderer: svg, radius: t.r, color: '#ff3b5c', weight: 2, fillColor: '#ff1744', fillOpacity: 0.3, interactive: false }).addTo(L_.threats);
        L.marker([t.lat, t.lng], { icon: L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="mk-horde">🧟</div>' }) })
          .bindTooltip(`HORDE · seen ${DR.ago(t.ts)} by ${t.lastBy || t.src || 'you'} · tap: clear / still there`).on('click', () => DR.ui.threatMenu(t)).addTo(L_.threats);
      } else {
        const ic = { walkers: ['🧟', '#ff8a3b'], block: ['✖', '#ff3b5c'], fire: ['🔥', '#ff8a3b'] }[t.type];
        if (t.type !== 'block') L.circle([t.lat, t.lng], { renderer: svg, radius: t.r * 2, stroke: false, fillColor: ic[1], fillOpacity: 0.12, interactive: false }).addTo(L_.threats);
        L.marker([t.lat, t.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="mk-icon" style="border-color:${ic[1]}">${ic[0]}</div>` }) })
          .bindTooltip(`${t.type.toUpperCase()} · ${DR.ago(t.ts)} · tap: clear / still there`).on('click', () => DR.ui.threatMenu(t)).addTo(L_.threats);
      }
    }
  };

  mv.drawMarks = () => {
    L_.marks.clearLayers();
    const s = DR.state;
    // partner: live when in radio range; otherwise last fix + dead-reckoned estimate with an uncertainty circle
    const est = DR.friendEstimate && DR.friendEstimate();
    if (s.friend && est) {
      if (!est.live) {
        L.circle([est.lat, est.lng], { radius: est.r, color: '#b18cff', weight: 1, dashArray: '4 6', fillColor: '#b18cff', fillOpacity: 0.07, interactive: false }).addTo(L_.marks);
        L.polyline([[s.friend.lat, s.friend.lng], [est.lat, est.lng]], { color: '#b18cff', weight: 2, dashArray: '2 6', interactive: false }).addTo(L_.marks);
        L.marker([s.friend.lat, s.friend.lng], { icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div class="mk-friend"><div class="dot" style="width:10px;height:10px;opacity:.5"></div></div>' }) })
          .bindTooltip(`${s.friend.name}: last fix ${DR.ago(s.friend.ts)}`).addTo(L_.marks);
      }
      L.marker([est.lat, est.lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        html: `<div class="mk-friend"><div class="dot"></div><div class="mk-tag" style="left:20px">${s.friend.name.toUpperCase()} · ${est.live ? 'LIVE' : 'EST. · ±' + Math.round(est.r) + ' M'}</div></div>` }) })
        .bindTooltip(est.live ? `${s.friend.name} · live, in radio range` : `${s.friend.name} · estimated from last fix ${DR.ago(s.friend.ts)}${est.along ? ' heading to ' + est.along : ''}`).addTo(L_.marks);
    }
    if (s.base) L.marker([s.base.lat, s.base.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#fdba74">🏠</div>' }) }).bindTooltip('Your stash').addTo(L_.marks);
    if (s.rendezvous) L.marker([s.rendezvous.lat, s.rendezvous.lng], { icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [4, 22],
      html: `<div class="mk-flag">⚑</div><div class="mk-tag" style="color:#b18cff">RENDEZVOUS ${s.rendezvous.by ? '· ' + s.rendezvous.by : ''}</div>` }) }).addTo(L_.marks);
    for (const p of s.userPlaces) if (p.cat === 'SHEL') L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#3dffa8">🏠</div>' }) })
      .bindTooltip(`Safe house · ${p.name}`).addTo(L_.marks);
  };

  const line = path => path.map(i => [G.graph.lat[i], G.graph.lng[i]]);
  mv.drawAlternatives = plans => {
    L_.alts.clearLayers();
    for (const p of plans || []) {
      const col = p.recommended ? '#ffb020' : p.profile === 'fast' ? '#38e8ff' : p.profile === 'safe' ? '#3dffa8' : '#b18cff';
      L.polyline(line(p.path), { renderer: svg, color: col, weight: 4, opacity: 0.55, dashArray: p.recommended ? null : '6 8' })
        .on('click', () => DR.ui.selectPlan(p)).addTo(L_.alts);
      if (p.via) L.marker([p.via.lat, p.via.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#b18cff">🎒</div>' }) }).addTo(L_.alts);
      if (p.shelter) L.marker([p.shelter.lat, p.shelter.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#3dffa8">⛨</div>' }) }).addTo(L_.alts);
    }
  };
  mv.drawRoute = () => {
    L_.route.clearLayers();
    const p = DR.active; if (!p) return;
    const pts = line(p.path);
    const done = DR.posOnRoute(p, DR.state.route.progress);
    const ahead = [[done.lat, done.lng], ...pts.slice(done.idx)];
    L.polyline(pts.slice(0, done.idx).concat([[done.lat, done.lng]]), { renderer: svg, color: '#7f9db2', weight: 3, opacity: 0.35, interactive: false }).addTo(L_.route);
    L.polyline(ahead, { renderer: svg, color: '#ffb020', weight: 12, opacity: 0.16, interactive: false }).addTo(L_.route);
    L.polyline(ahead, { renderer: svg, color: '#ffb020', weight: 4, opacity: 0.95, interactive: false }).addTo(L_.route);
    L.polyline(ahead, { renderer: svg, color: '#fff3d6', weight: 2, opacity: 0.9, className: 'route-flow', interactive: false }).addTo(L_.route);
    if (p.via && !DR.state.route.viaDone) L.marker([p.via.lat, p.via.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="mk-icon" style="border-color:#ffb020">🎒</div>' }) })
      .bindTooltip(`Restock stop · ${p.via.name || C.sub[p.via.sub]}`).addTo(L_.route);
  };
  // label = your group's names (whoever is logged in on this phone + people in PACK)
  mv.moveMe = () => {
    mv.me.setLatLng(DR.state.pos);
    const t = DR.state.team.map(p => p.name), label = (t.length > 3 ? `${t[0]} +${t.length - 1}` : t.join(' + ')).toUpperCase();
    const el = document.getElementById('me-tag'); if (el && el.textContent !== label) el.textContent = label;
  };
  mv.fly = (lat, lng, z = 16.5) => map.flyTo([lat, lng], z, { duration: 0.8 });
  mv.fitPlans = plans => {
    const pts = [];
    for (const p of plans) for (const i of p.path) pts.push([G.graph.lat[i], G.graph.lng[i]]);
    if (pts.length) map.fitBounds(pts, { padding: [70, 70] });
  };
})();
