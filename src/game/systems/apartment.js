// OWNER: systems engineer. (user r14d / r19) Peter Parker's apartment — a safehouse in a Hell's Kitchen walk-up.
//  City side: the building gets a warm lit 2nd-floor window (curtain silhouettes), a street door with a stoop under it and
//  a "Peter's place" pin. Perched / hanging near the window, [F] "Climb in"; at the street door, [F] "Go inside".
//  Inside (world/apartmentroom.js): the whole flat is walkable — bedroom, hallway, living room, kitchen, bathroom, closet,
//  the stairwell and the lobby. The set lives far outside the map (ROOM_ORIGIN); its own collision (world.interior) answers
//  every world query inside its footprint, so the normal traversal / chase camera run unchanged, in civilian mode
//  (systems/civilian.js: Peter in civvies, no webs). [F] opens / closes doors, the bedroom window leaves as Spider-Man
//  (suit on), the lobby door leaves to the street as Peter. On entry the real city is photographed from the window spot
//  and shown outside the street windows. Three point lights follow him from room to room.
// Debug: __sys.apartment.enter() / .enterFromStreet() / .exit() / .state() / .goto()
import * as THREE from 'three';
import { buildApartment, buildStreetEntrance } from '../../world/apartmentroom.js';

const ROOM_ORIGIN = new THREE.Vector3(-9000, 600, -9000);
const ANCHOR = new THREE.Vector3(-430, 0, -95); // Hell's Kitchen (worlddata 'hk')
const WIN_H = 5.0;                               // window centre above the street: the flat is on the 2nd floor

export function createApartment(sys) {
  const { ctx, ui } = sys;
  const scene = ctx.scene, P = ctx.player, cam = ctx.camera, civ = () => sys.civ;
  let set = null, inside = false, entry = null, sign = null, street = null, panel = null, busy = false, poiShown = -1;
  const lights = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const toWorld = (v, out = new THREE.Vector3()) => out.copy(v).add(ROOM_ORIGIN);

  // ---------------------------------------------------------------- the building in the city
  function findEntry() {
    const boxes = ctx.world.buildings || [];
    let best = null, bd = 1e9;
    for (const b of boxes) {
      const mn = b.min, mx = b.max, h = mx[1] - Math.max(0, mn[1]);
      if (mn[1] > 1 || h < 14 || h > 60 || mx[0] - mn[0] < 10) continue; // a ground-standing walk-up, not a tower's upper tier
      const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, d = Math.hypot(cx - ANCHOR.x, cz - ANCHOR.z);
      if (d > 260 || d >= bd) continue;
      // a street-facing side: open air for 10 m in front of the +x / -x face at window height
      for (const sx of [1, -1]) {
        const x = sx > 0 ? mx[0] + 0.06 : mn[0] - 0.06;
        const n = new THREE.Vector3(sx, 0, 0);
        const g = ctx.world.groundHeight(x + sx * 1.5, cz, 2.5); // street level (not a lower wing's roof)
        if (!(g > -0.5 && g < 3)) continue;
        const y = g + WIN_H;
        const hit = ctx.world.raycast(new THREE.Vector3(x + sx * 0.4, y, cz), n, 10);
        const low = ctx.world.raycast(new THREE.Vector3(x + sx * 0.4, g + 1.2, cz), n, 4); // the stoop / door needs a clear sidewalk
        // (rays starting inside a neighbour's solid report nothing: a walk-up flush against a tower looked "open") —
        // the sidewalk, the bike spot and the air at the window must all be outside every solid
        const solid = (dx, yy) => !!ctx.world.collision?.inside?.(x + sx * dx, yy, cz) || !!ctx.world.collision?.inside?.(x + sx * dx, yy, cz + 2.6);
        if (solid(0.6, g + 1.2) || solid(1.6, g + 1.2) || solid(3.2, g + 1.2) || solid(6, g + 1.2) || solid(1.0, y) || solid(6, y)) continue;
        if (hit || low) continue;
        // a real street, not an alley / courtyard: 14 m clear straight out at head height, and a rideable lane both
        // ways along the block (the bike) at ~1 m from where it will park
        const V = (a, b2, c) => new THREE.Vector3(a, b2, c);
        if (ctx.world.raycast(V(x + sx * 0.6, g + 1.2, cz), n, 14)) continue;
        const kerb = kerbOut(x, cz, sx, g), lane = V(x + sx * (kerb + 1.3), g + 0.9, cz);
        if (ctx.world.raycast(lane, V(0, 0, 1), 22) || ctx.world.raycast(lane, V(0, 0, -1), 22)) continue;
        best = { pos: new THREE.Vector3(x, y, cz), normal: n, top: mx[1], ground: g, kerb }; bd = d; break;
      }
    }
    return best;
  }
  // distance from the facade to the kerb (where the sidewalk drops to the road), searched 2..9 m out; 3 m if none
  function kerbOut(x, z, sx, g) {
    const side = ctx.world.groundHeight(x + sx * 1.2, z, g + 1);
    for (let d = 2; d <= 9; d += 0.25) { const h = ctx.world.groundHeight(x + sx * d, z, g + 1); if (h < side - 0.06) return d; }
    return 3;
  }
  function makeSign(e) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#ffcf8a'); gr.addColorStop(1, '#ff9a4a'); g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
    g.fillStyle = 'rgba(40,25,15,0.55)'; g.fillRect(0, 0, 26, 160); g.fillRect(102, 0, 26, 160); // curtains
    g.fillStyle = 'rgba(30,20,10,0.45)'; g.fillRect(60, 40, 3, 120); g.fillRect(0, 76, 128, 4); // sash bars
    g.fillStyle = 'rgba(20,12,6,0.6)'; g.beginPath(); g.ellipse(84, 112, 14, 30, 0, 0, 6.28); g.fill(); // a figure at the desk
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.4, 1.2), toneMapped: false }));
    m.position.copy(e.pos).addScaledVector(e.normal, 0.03); m.lookAt(_a.copy(m.position).add(e.normal)); m.name = 'aptWindow';
    scene.add(m); return m;
  }
  function makeStreetDoor(e) {
    const S = buildStreetEntrance();
    S.group.position.set(e.pos.x, e.ground, e.pos.z); S.group.lookAt(_a.copy(S.group.position).add(e.normal));
    scene.add(S.group);
    const out = e.normal.clone(), tan = new THREE.Vector3(-out.z, 0, out.x);
    // the bike's home: on the street side of the sidewalk, a little up the block, parked along the kerb
    const bp = new THREE.Vector3(e.pos.x, 0, e.pos.z).addScaledVector(out, (e.kerb ?? 3) + 0.9).addScaledVector(tan, 2.6); // in the road, by the kerb
    bp.y = ctx.world.groundHeight(bp.x, bp.z, e.ground + 2);
    return { group: S.group, use: new THREE.Vector3(e.pos.x, e.ground + 1.2, e.pos.z).addScaledVector(out, 0.9),
      outside: new THREE.Vector3(e.pos.x, e.ground, e.pos.z).addScaledVector(out, 1.6), yawOut: Math.atan2(out.x, out.z),
      bike: { pos: bp, yaw: Math.atan2(tan.x, tan.z) } };
  }

  // ---------------------------------------------------------------- the interior set
  function ensureSet() {
    if (set) return set;
    set = buildApartment(ROOM_ORIGIN);
    set.group.visible = false; scene.add(set.group);
    for (let i = 0; i < 3; i++) { const L = new THREE.PointLight(0xffd6a0, 0, 7.5, 1.7); L.castShadow = false; scene.add(L); lights.push(L); }
    // world queries inside the set's footprint are answered by its own solids (traversal collider: collide.js)
    const W = ctx.world; W.interior = set.col;
    const rc = W.raycast.bind(W), gh = W.groundHeight.bind(W);
    W.raycast = (o, d, max = 1000) => set.col.covers(o.x, o.z) ? set.col.raycast(o, d, max) : rc(o, d, max);
    W.groundHeight = (x, z, y) => set.col.covers(x, z) ? set.col.groundHeight(x, z, y) : gh(x, z, y);
    return set;
  }
  function captureView() {
    if (!entry || !set) return;
    const pipe = ctx.pipeline; const save = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    cam.position.copy(entry.pos).addScaledVector(entry.normal, 0.5); cam.position.y += 0.3;
    cam.lookAt(_a.copy(cam.position).addScaledVector(entry.normal, 10).add(_b.set(0, -1.2, 0))); cam.fov = 70; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const vis = P.object.visible, sv = set.group.visible; P.object.visible = false; set.group.visible = false; if (sign) sign.visible = false;
    try { for (let i = 0; i < 3; i++) pipe.render(0.016); } catch (e) { /* keep going */ }
    const src = ctx.renderer.domElement, c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    set.window.mat.map?.dispose(); set.window.mat.map = tex; set.window.mat.needsUpdate = true;
    cam.position.copy(save.p); cam.quaternion.copy(save.q); cam.fov = save.fov; cam.updateProjectionMatrix();
    P.object.visible = vis; set.group.visible = sv; if (sign) sign.visible = true;
  }
  function showPanel(title, text, keys = null) {
    if (!panel) {
      panel = document.createElement('div');
      Object.assign(panel.style, { position: 'fixed', left: '36px', bottom: '40px', maxWidth: '440px', padding: '16px 20px', borderRadius: '10px', zIndex: 40,
        background: 'linear-gradient(180deg, rgba(14,16,22,.82), rgba(14,16,22,.7))', color: '#e9e6df', font: '400 15px/1.45 system-ui, sans-serif', pointerEvents: 'none', borderLeft: '3px solid #c0392b', transition: 'opacity .3s' });
      document.body.appendChild(panel);
    }
    panel.innerHTML = `<div style="font:700 12px system-ui;letter-spacing:.22em;color:#e74c3c;margin-bottom:6px">${title.toUpperCase()}</div><div>${text}</div>`
      + (keys ? `<div style="margin-top:10px;font:600 11px system-ui;letter-spacing:.08em;color:#9aa0a6">${keys}</div>` : '');
    panel.style.display = 'block'; panel.style.opacity = '1';
    clearTimeout(panel._t); panel._t = setTimeout(() => { if (panel) panel.style.opacity = '0'; }, 6500);
  }
  const hidePanel = () => { if (panel) { panel.style.display = 'none'; clearTimeout(panel._t); } };

  // ---------------------------------------------------------------- in / out
  function goInside(spot, yaw) {
    ensureSet(); captureView();
    set.group.visible = true; inside = true; poiShown = -1;
    for (const d of set.doors) { d.open = false; d.a = 0; d.pivot.rotation.y = 0; if (d.ci >= 0) set.col.setOn(d.ci, true); }
    P.teleport(toWorld(spot), yaw);
    if (P.cam) { P.cam.distScale = 0.62; P.cam.heightBias = 0.22; P.cam.minColl = 0.25; } // indoors: closer, a little higher, may come right up to walls
    civ()?.lock('Suit up at the bedroom window');
  }
  function leaveSet() {
    inside = false; set.group.visible = false; for (const L of lights) L.intensity = 0; hidePanel();
    civ()?.lock(null);
    if (P.cam) { P.cam.distScale = civ()?.on ? 0.78 : 1; P.cam.heightBias = 0; P.cam.minColl = undefined; }
  }
  // through the bedroom window (Spider-Man climbs in; a second later the suit comes off)
  function enter() {
    if (inside || busy || !entry) return;
    busy = true;
    goInside(set ? set.spots.window : buildSpots().window, Math.PI);
    sys.audio?.sfx?.thwip?.(0.3);
    showPanel("Peter's Apartment", 'Home. Small, loud radiator, a view of the whole block — and nobody knows who climbs in through this window.', 'WASD walk · F doors / interact · window: suit up & leave · lobby door: go out as Peter');
    setTimeout(() => { busy = false; if (inside && !civ()?.on) civ()?.set(true); }, 1100);
  }
  // through the street door (as Peter; Spider-Man takes the suit off in the doorway)
  function enterFromStreet() {
    if (inside || busy || !entry) return;
    busy = true;
    civ().fade(() => {
      if (!civ().on) civ().set(true, { instant: true });
      goInside(buildSpots().lobby, Math.PI);
      busy = false;
      showPanel('418 West 47th', 'The lobby: brass mailboxes, a notice board nobody reads, two flights up to 2B.', 'WASD walk · F doors · stairs up to the apartment');
    });
  }
  // out of the bedroom window as Spider-Man
  function exitWindow() {
    if (!inside || busy) return;
    busy = true;
    civ().fade(() => {
      if (civ().on) civ().set(false, { instant: true });
      leaveSet();
      const out = entry.pos.clone().addScaledVector(entry.normal, 1.2); out.y += 0.2;
      P.teleport(out, Math.atan2(entry.normal.x, entry.normal.z)); // he drops off the sill into the air
      busy = false;
    });
  }
  // out of the lobby door, onto the street as Peter
  function exitStreet() {
    if (!inside || busy) return;
    busy = true;
    const d = set.doors.find(x => x.id === 'street'); if (d) d.open = true;
    sys.audio?.sfx?.select?.();
    setTimeout(() => civ().fade(() => {
      leaveSet(); if (d) { d.open = false; d.a = 0; d.pivot.rotation.y = 0; }
      P.teleport(street.outside.clone().setY(street.outside.y + 0.05), street.yawOut);
      busy = false;
    }), 350);
  }
  // the spots in world space (the set may not be built yet)
  function buildSpots() { return ensureSet().spots; }

  // ---------------------------------------------------------------- doors / lights / captions
  function updateDoors(dt) {
    for (const d of set.doors) {
      const want = d.open ? d.openA : 0;
      if (Math.abs(d.a - want) > 1e-3) {
        d.a += Math.sign(want - d.a) * Math.min(Math.abs(want - d.a), dt * 3.2);
        d.pivot.rotation.y = d.a;
      }
      if (d.ci >= 0) set.col.setOn(d.ci, Math.abs(d.a) < 0.3);
    }
  }
  function roomAt(p) {
    const l = _a.copy(p).sub(ROOM_ORIGIN);
    for (const r of set.rooms) if (l.x >= r.min[0] && l.x <= r.max[0] && l.z >= r.min[2] && l.z <= r.max[2] && l.y >= r.min[1] - 1.2 && l.y <= r.max[1]) return r;
    return null;
  }
  function updateLights() {
    const p = P.position, here = roomAt(p);
    const ranked = set.rooms.map(r => ({ r, d: r === here ? -1 : _b.set(...r.light).add(ROOM_ORIGIN).distanceToSquared(p) })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < lights.length; i++) {
      const r = ranked[i]?.r; const L = lights[i];
      if (!r) { L.intensity = 0; continue; }
      L.position.set(...r.light).add(ROOM_ORIGIN); L.intensity = i === 0 ? 5.0 : 3.2;
    }
  }
  function updateCaptions() {
    const lp = _a.copy(P.position).sub(ROOM_ORIGIN);
    let near = -1, nd = 1e9;
    set.pois.forEach((q, i) => { const d = Math.hypot(lp.x - q.pos.x, lp.z - q.pos.z); if (d < q.r && Math.abs(lp.y - 0.95 - q.pos.y) < 2 && d < nd) { nd = d; near = i; } });
    if (near >= 0 && near !== poiShown) { poiShown = near; const q = set.pois[near]; showPanel(q.name, q.text); }
    else if (near < 0 && poiShown >= 0 && nd > 3) poiShown = -1;
  }

  const api = {
    update(dt) {
      if (!entry && ctx.world.buildings) {
        entry = findEntry();
        if (entry) { sign = makeSign(entry); street = makeStreetDoor(entry); sys.events?.emit?.('apartment:ready', { bike: street.bike }); }
      }
      if (!inside || !set) return;
      updateDoors(dt); updateLights(); updateCaptions();
      // safety: never lose him out of the set
      if (P.position.y < ROOM_ORIGIN.y + set.lobbyY - 6) P.teleport(toWorld(set.spots.window), Math.PI);
    },
    interact(p) {
      if (busy) return null;
      if (inside && set) {
        const lp = _a.copy(p).sub(ROOM_ORIGIN);
        // the bedroom window: suit up and go out
        if (lp.distanceTo(set.spots.windowUse) < 1.4) return { id: 'aptWin', pos: toWorld(set.spots.windowUse).clone(), label: civ()?.on ? 'Suit Up' : 'Leave', sub: 'Out the window as Spider-Man', priority: 9, action: exitWindow };
        if (lp.distanceTo(set.spots.streetUse) < 1.5) return { id: 'aptStreet', pos: toWorld(set.spots.streetUse).clone(), label: 'Go Outside', sub: 'Onto West 47th Street', priority: 9, action: exitStreet };
        let best = null, bd = 1.5;
        for (const d of set.doors) {
          if (d.id === 'street') continue;
          const dd = Math.hypot(lp.x - d.centre.x, lp.z - d.centre.z);
          if (dd < bd && Math.abs(lp.y - d.y0 - 0.95) < 1.4) { bd = dd; best = d; }
        }
        if (best) return { id: 'door:' + best.id, pos: toWorld(best.centre).clone(), label: best.open ? 'Close' : 'Open', sub: best.name, priority: 8,
          action: () => { best.open = !best.open; sys.audio?.sfx?.select?.(); } };
        return null;
      }
      if (!entry) return null;
      if (street && P.state?.mode === 'ground' && p.distanceTo(street.use) < 2.2) return { id: 'aptDoor', pos: street.use, label: 'Go Inside', sub: "Peter's building — 418", priority: 7, action: enterFromStreet };
      if (p.distanceTo(entry.pos) < 7.5 && P.state?.mode !== 'ground') return { id: 'apt', pos: entry.pos, label: "Peter's Apartment", sub: 'Climb in', priority: 6, action: enter };
      return null;
    },
    pins(p, out) {
      if (inside || !entry) return;
      const d = Math.hypot(entry.pos.x - p.x, entry.pos.z - p.z);
      if (d < 900 && d > 10) out.push({ kind: 'label', pos: entry.pos.clone().setY(entry.pos.y + 2.5), label: "Peter's place", edge: false });
    },
    get inside() { return inside; },
    get entry() { return entry; },
    get street() { return street; },
    get set() { return set; },
    enter() { if (!entry) { entry = findEntry(); if (entry && !sign) { sign = makeSign(entry); street = makeStreetDoor(entry); } } enter(); },
    enterFromStreet() { if (!entry) api.enter(); else enterFromStreet(); },
    exit: () => exitWindow(), exitStreet,
    state: () => ({ inside, busy, entry: entry && entry.pos.toArray().map(v => +v.toFixed(1)), civ: !!civ()?.on, room: inside && set ? roomAt(P.position)?.name || null : null,
      doors: set ? set.doors.map(d => `${d.id}:${d.open ? 'open' : 'shut'}`).join(' ') : '' }),
    goto() { if (!entry) return; const p = entry.pos.clone().addScaledVector(entry.normal, 2.5); P.teleport(p, Math.atan2(-entry.normal.x, -entry.normal.z)); },
    gotoStreet() { if (!street) return; P.teleport(street.outside.clone(), street.yawOut + Math.PI); },
  };
  return api;
}
