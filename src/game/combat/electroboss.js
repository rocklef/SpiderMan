// OWNER: combat engineer. (user r13b) ELECTRO — the Times Square boss encounter (The Amazing Spider-Man 2 set piece).
//
//  Beacon: while the encounter is available a pillar of blue lightning (combat lightning.js) stands over the Times-Square plaza (visible from
//  across Midtown); within ~170 m a banner announces him, entering ~55 m of the plaza starts the fight.
//  Night: the city switches to the Night preset for the fight (the player's own preset comes back after it).
//  Phases (by Electro's health, enemy.js 'electro' does the fighting; this module stages the city around him):
//    1  CHARGED   (100 .. 62 %)  he feeds on the square — every few seconds an arc rips from a billboard into his body and
//                                the screens sag; idle flicker.
//    2  SURGE     ( 62 .. 28 %)  POWER SURGE banner, screens strobe, arcs to the street lamps / sky, two thugs run in once.
//    3  OVERLOAD  ( 28 ..  0 %)  OVERLOAD banner: the square blacks out (screens off, short bright bursts when he fires),
//                                thunder-like camera pulses.
//  Defeat: the screens surge back on over ~2 s ("POWER RESTORED"), slow-mo + banner from combat, the preset is restored.
//  Leaving the area (> 120 m, combat releases the fight) or losing resets the encounter (20 s); 10 min after a win;
//  available 45 s into a session.
// Debug: __cmb.electro.start() (teleports to the square and starts), .state(), .reset(), .force('surge' | 'barrage'), .power(k)
import * as THREE from 'three';
import { screenK } from '../../render/daynight.js';
import { ambShared } from '../../render/surface.js';

const CENTER = new THREE.Vector3(0, 0, -200);   // Times-Square plaza (world/timessq.js: 6th Av x = 0, rows -240 / -160)
const ANNOUNCE_R = 170, START_R = 55, COOLDOWN = 600, GRACE = 45; // s: re-arm after a win / after the session starts
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function createElectroBoss(c, ctx) {
  const scene = ctx.scene, P = ctx.player;
  const S = { state: 'idle', phase: 0, t: 0, cd: GRACE, announced: false, boss: null, base: null, drainT: 3, arcT: 1, pulseT: 4, addsDone: false, restoreT: 0, prevTod: null };

  // ---------------------------------------------------------------- beacon (pillar of lightning over the square)
  const beacon = new THREE.Group(); beacon.name = 'electroBeacon';
  // glow: an additive sprite, NOT a light (a permanent PointLight costs every lit material in the city a loop iteration)
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(150,225,255,.5)'); gr.addColorStop(1, 'rgba(30,150,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t; })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.2, 3.6, 7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Sprite(glowMat); glow.renderOrder = 21; glow.visible = false; beacon.add(glow);
  const setGlow = (k, size) => { glow.visible = k > 0.01; glowMat.opacity = Math.min(1, k); glow.scale.setScalar(size); };
  scene.add(beacon);

  // ---------------------------------------------------------------- the square's power (screens)
  // screenK is written by lighting only while a preset blends; we modulate around the value captured once the night
  // preset has settled and give it back afterwards
  // ...and the Times-Square meshes (their own emissive materials): screens, signs, neon, marquee bulbs, light spill
  const POWER = /^(ts(Screens|Signs|Neon|Lights|Spill|Halo|Ticker|Vinyl)|timesSquareScreens|billboard-ads)/;
  let powered = null; // [{m, kind, v}] original intensities
  function collectPower() {
    if (powered) return powered; powered = [];
    scene.traverse(o => {
      if (!o.isMesh || !POWER.test(o.name)) return;
      for (const m of [].concat(o.material)) {
        if (!m || powered.some(x => x.m === m)) continue;
        if (m.emissiveIntensity != null && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) powered.push({ m, kind: 'e', v: m.emissiveIntensity });
        else if (m.color) powered.push({ m, kind: 'c', v: m.color.clone(), o: m.opacity });
      }
    });
    return powered;
  }
  // the lighting (night scan) also writes these intensities: anything we didn't write ourselves becomes the new base
  function applyPower(k) {
    for (const x of collectPower()) {
      if (x.kind === 'e') {
        if (x.w != null && Math.abs(x.m.emissiveIntensity - x.w) > 1e-6) x.v = x.m.emissiveIntensity;
        x.m.emissiveIntensity = x.w = x.v * k;
      } else { x.m.color.copy(x.v).multiplyScalar(Math.min(k, 1.6)); }
    }
  }
  // lighting rewrites screenK only while a preset blends: any value we didn't write ourselves is its new base
  // (same for the Times-Square coloured light spill on every surface around the square: ambShared.city.w)
  let lastWrite = null, tsBase = null, tsWrite = null;
  function setPower(k) {
    k = Math.max(0, k);
    if (S.base == null || (lastWrite != null && Math.abs(screenK.value - lastWrite) > 1e-6)) S.base = screenK.value;
    screenK.value = lastWrite = S.base * k; applyPower(k);
    const cw = ambShared.city;
    if (tsBase == null || (tsWrite != null && Math.abs(cw.w - tsWrite) > 1e-6)) tsBase = cw.w;
    cw.w = tsWrite = tsBase * Math.min(k, 1.8);
  }
  function screenPoint(from) { // a point on a billboard facade around the square (raycast toward the plaza sides)
    for (let k = 0; k < 6; k++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      _d.set(side, rnd(0.15, 0.7), rnd(-0.8, 0.8)).normalize();
      const h = ctx.world.raycast(_b.copy(from).setY(from.y + 1.4), _d, 90);
      if (h && h.distance > 8) return h.point.clone();
    }
    return null;
  }

  const pp0 = () => P.position;
  function dist2D(p) { return Math.hypot(p.x - CENTER.x, p.z - CENTER.z); }
  const banner = t => c.hud?.banner?.(t);
  const msg = t => c.hud?.message?.(t) ?? banner(t);

  async function start() {
    if (S.state === 'fight' || S.state === 'starting') return;
    S.state = 'starting'; S.t = 0; S.phase = 1; S.addsDone = false; S.landed = false; S.surgeK = null; S.surge = S.surge2 = null; S.base = null; S.drainT = 4; S.arcT = 1.5; S.pulseT = 4;
    // night for the set piece (the lighting refuses when a preset is pinned by ?tod / playtest: fine)
    S.prevTod = ctx.lighting?.timeOfDay ?? null;
    try { ctx.lighting?.setTimeMode?.('night'); } catch {}
    S.boss = await c.bossFight({ center: CENTER, type: 'electro', dist: 10 });
    if (!S.boss) { S.state = 'idle'; return; }
    S.state = 'fight'; banner('ELECTRO');
    // (user r13c) boss build: tougher than the street Electro, and he arrives out of the sky
    { const e = S.boss; e.maxHp = e.hp = 620; if (e.look) { e.look.lift = 9; e.look.liftV = 0; e.look.armsWant = 1; e.look.chargeWant = 1.2; }
      S.entranceT = 1.6; S.surgeT = 6; S.barrageT = 3; S.surge = null; }
    { const cam = P.cam; if (cam && S.boss) { cam.yaw = Math.atan2(S.boss.pos.x - pp0().x, S.boss.pos.z - pp0().z); cam.pitch = 0.08; cam.lastLook = 0; } } // reveal
    try { window.__audio?.duck?.(0.4, 1.2); window.__audio?.sfx?.thwip?.(0.01); } catch {}
  }
  function finish(won) {
    S.state = won ? 'won' : 'idle'; S.restoreT = won ? 7 : 0.5; S.cd = won ? COOLDOWN : 20; S.announced = false; S.boss = null;
    if (won) { setTimeout(() => banner('POWER RESTORED'), 1600); }
  }
  function restoreCity() {
    if (S.base != null) screenK.value = S.base; S.base = null; lastWrite = null;
    if (tsBase != null) ambShared.city.w = tsBase; tsBase = tsWrite = null;
    if (powered) { applyPower(1); for (const x of powered) x.w = null; }
    try { window.__sys?.applySettings?.(); } catch {} // the player's own time-of-day preset
  }

  // ---------------------------------------------------------------- (user r13c) boss moves
  const feetAbove = () => { const pp = P.position; return pp.y - 0.95 - ctx.world.groundHeight(pp.x, pp.z, pp.y); };
  function bossMoves(dt, e, phase, chest) {
    const L = c.lightning, look = e.look; if (!L || !look) return;
    // entrance: drops out of the sky in a strike, lands, the street flashes
    if (S.entranceT > 0) {
      S.entranceT -= dt;
      if (S.entranceT <= 1.1 && !S.landed) { look.liftWant = 0; }
      if (S.entranceT <= 0.5 && !S.landed) {
        S.landed = true; const g = e.pos.clone(); g.y = e.ground();
        L.strike(g.clone().setY(g.y + 45), g, { width: 0.4, life: 0.5, branches: 6, intensity: 1.6 }); L.ring(g, 7, { life: 0.6, width: 0.3, intensity: 1.2 }); L.scorch(g, 2.4);
        P.cam?.shake?.(0.5); look.flash(); look.armsWant = 0; look.chargeWant = 0; try { window.__audio?.sfx?.slam?.(); } catch {}
      }
      return;
    }
    // GRID SURGE (phase 2+): levitates, arms out, charges ~1.1 s, slams -> an expanding ring of ground lightning. Jump it.
    S.surgeT -= dt;
    if (!S.surgeK && phase >= 2 && S.surgeT <= 0 && e.alive && ['hold', 'approach'].includes(e.state)) {
      S.surgeK = { t: 0 }; e.set('hold'); e.cd = 3; e.stormCd = Math.max(e.stormCd, 2.5);
      look.liftWant = 2.2; look.armsWant = 1; look.chargeWant = 1.4; banner(phase === 3 ? 'OVERLOAD SURGE' : 'SURGE — JUMP!');
    }
    if (S.surgeK) {
      const K = S.surgeK; K.t += dt;
      if (!e.alive) { S.surgeK = null; look.liftWant = 0; look.armsWant = 0; look.chargeWant = 0; }
      else if (K.t > 1.15 && !K.fired) {
        K.fired = true; look.liftWant = 0; look.armsWant = 0; look.chargeWant = 0.4;
        const g = e.pos.clone(); g.y = e.ground();
        S.surge = L.surge(g, { speed: phase === 3 ? 15 : 12.5, max: 24, width: 0.7 }); S.surge.hit = false;
        L.ring(g, 4, { life: 0.4, width: 0.3, intensity: 1.3 }); L.scorch(g, 2.6); P.cam?.shake?.(0.45); look.flash();
        if (phase === 3) setTimeout(() => { if (S.state === 'fight' && e.alive) { S.surge2 = L.surge(g, { speed: 10, max: 24, width: 0.7 }); S.surge2.hit = false; } }, 650);
      } else if (K.t > 1.6) { S.surgeK = null; look.chargeWant = 0; S.surgeT = phase === 3 ? 7 : 9.5; }
    }
    for (const H of [S.surge, S.surge2]) { // the wave front hurts when he's on the ground as it passes
      if (!H || !H.alive || H.hit) continue;
      const pp = P.position, d = Math.hypot(pp.x - H.center.x, pp.z - H.center.z);
      if (Math.abs(d - H.r) < 0.8 && feetAbove() < 0.7) { H.hit = true; c.zapPlayer?.(phase === 3 ? 22 : 17, e, H.center); }
    }
    // SKY BARRAGE (phase 3): three warning circles around him -> strikes out of the sky
    if (phase === 3) {
      S.barrageT -= dt;
      if (S.barrageT <= 0 && e.alive) {
        S.barrageT = rnd(2.8, 3.8);
        const pp = P.position, gy = ctx.world.groundHeight(pp.x, pp.z, pp.y);
        const marks = [new THREE.Vector3(pp.x, gy, pp.z)];
        for (let i = 0; i < 2; i++) { const a = Math.random() * 6.283, r = rnd(2.8, 5); marks.push(new THREE.Vector3(pp.x + Math.cos(a) * r, gy, pp.z + Math.sin(a) * r)); }
        for (const m of marks) { m.y = ctx.world.groundHeight(m.x, m.z, gy + 2); L.telegraph(m, 2.4, 0.7); }
        setTimeout(() => {
          if (S.state !== 'fight') return;
          for (const m of marks) {
            L.strike(m.clone().add(new THREE.Vector3(rnd(-5, 5), 40, rnd(-5, 5))), m.clone().setY(m.y + 0.1), { width: 0.3, life: 0.45, branches: 5, intensity: 1.7 });
            L.ring(m, 4.5, { life: 0.5, width: 0.3, intensity: 1.1 }); L.scorch(m, 1.6);
            const q = P.position; if (Math.hypot(q.x - m.x, q.z - m.z) < 2.4 && feetAbove() < 2) c.zapPlayer?.(15, e, m);
          }
          P.cam?.shake?.(0.4);
        }, 700);
      }
    }
  }

  const sys = {
    update(dt) {
      const realDt = ctx.realDt ?? dt;
      S.t += realDt; S.cd = Math.max(0, S.cd - realDt);
      const pp = P.position, d = dist2D(pp);
      const available = S.state === 'idle' && S.cd <= 0;
      // beacon: a crackling column over the square while available (fades with distance so it never clutters close up)
      { const vis = available && d > 60;
        setGlow(vis ? 0.5 + 0.3 * Math.random() : 0, 60);
        glow.position.set(CENTER.x, 120, CENTER.z);
        if (vis && Math.random() < realDt * 5) c.lightning.strike(_a.set(CENTER.x + rnd(-6, 6), 230, CENTER.z + rnd(-6, 6)).clone(), _b.set(CENTER.x + rnd(-10, 10), 20, CENTER.z + rnd(-10, 10)).clone(), { width: 1.1, life: 0.35, branches: 4, jag: 0.1, intensity: 1.4 }); }
      if (available && !c.fight) {
        if (d < ANNOUNCE_R && !S.announced) { S.announced = true; banner('ELECTRO — TIMES SQUARE'); }
        if (d > ANNOUNCE_R + 40) S.announced = false;
        if (d < START_R && (P.mode === 'ground' || P.anim?.mode === 'ground' || P.mode === 'perch' || pp.y - ctx.world.groundHeight(pp.x, pp.z) < 6)) start();
      }
      if (S.state === 'won' || (S.state === 'idle' && S.restoreT > 0)) {
        // victory: power comes back on over ~2 s, then the player's preset
        S.restoreT -= realDt;
        if (S.state === 'won') setPower(smooth((7 - S.restoreT - 0.8) / 2) * (1 + 0.6 * Math.random() * (S.restoreT > 4.5 ? 1 : 0)));
        if (S.restoreT <= 0) { restoreCity(); S.state = 'idle'; }
        return;
      }
      if (S.state !== 'fight') return;
      const e = S.boss;
      // fight over? (combat clears c.fight on a win / release; the player going down also ends it)
      if (!c.fight) { finish(!!e && !e.alive); return; }
      if (!e) return;
      const hpK = e.alive ? e.hp / e.maxHp : 0;
      const phase = hpK > 0.62 ? 1 : hpK > 0.28 ? 2 : 3;
      if (phase !== S.phase) {
        S.phase = phase;
        if (phase === 2) { banner('POWER SURGE'); P.cam?.shake?.(0.35); if (!S.addsDone) { S.addsDone = true; c.reinforce?.(['melee', 'melee']); } }
        if (phase === 3) { banner('OVERLOAD'); P.cam?.impact?.(0.5); try { c.slowmo?.(0.6, 0.35, 0.3); } catch {} }
      }
      const chest = e.chest ? e.chest(_a).clone() : e.pos.clone().setY(e.pos.y + 1.3);
      bossMoves(realDt, e, phase, chest);
      // the square's power by phase
      let pw;
      const fl = Math.random();
      if (phase === 1) pw = 0.85 + 0.15 * Math.sin(S.t * 17) * (fl < 0.08 ? 3 : 0.3);
      else if (phase === 2) pw = (Math.sin(S.t * 9) > 0.2 ? 1.25 : 0.35) * (fl < 0.05 ? 0.1 : 1);
      else pw = fl < 0.04 ? 1.6 : 0.04;
      S.drainT -= realDt;
      if (S.drainT <= 0 && e.alive) { // he drinks a billboard: arc from the screen into his chest, the square sags
        S.drainT = phase === 1 ? rnd(3.5, 6) : phase === 2 ? rnd(2, 3.5) : rnd(1.2, 2.2);
        const sp = screenPoint(chest);
        if (sp) { c.lightning.strike(sp, chest, { width: 0.16, life: 0.42, branches: 3, jag: 0.12, intensity: 1.3 }); e.look?.flash?.(); P.cam?.shake?.(0.06); S.sag = 0.6; }
      }
      S.sag = Math.max(0, (S.sag || 0) - realDt * 1.5);
      if (phase >= 2) { // arcs to lamps / up into the night
        S.arcT -= realDt;
        if (S.arcT <= 0 && e.alive) {
          S.arcT = rnd(0.5, 1.4);
          const to = Math.random() < 0.5 ? chest.clone().add(_b.set(rnd(-14, 14), rnd(12, 40), rnd(-14, 14))) : (screenPoint(chest) || chest.clone().add(_b.set(rnd(-8, 8), 18, rnd(-8, 8))));
          c.lightning.strike(chest, to, { width: 0.1, life: 0.3, branches: 2, jag: 0.15, intensity: 1.1 });
        }
      }
      if (phase === 3) { // thunder pulses
        S.pulseT -= realDt;
        if (S.pulseT <= 0) { S.pulseT = rnd(2.5, 4.5); P.cam?.shake?.(0.2); pw = 2.2; }
      }
      setPower(pw * (1 - 0.6 * (S.sag || 0)));
      setGlow(0, 1); // in the fight his own corona / veins / aura carry the glow (the beacon sprite is for the skyline only)
    },
  };
  ctx.systems = ctx.systems || []; ctx.systems.push(sys);
  c.electro = {
    start() { const gy = ctx.world.groundHeight(CENTER.x, CENTER.z + 30); window.__sys?.debug?.tp?.(CENTER.x, CENTER.z + 30, gy + 1.2); S.cd = 0; S.state = 'idle'; return start(); },
    state: () => ({ state: S.state, phase: S.phase, cd: +S.cd.toFixed(1), base: S.base, power: +screenK.value.toFixed(2), meshes: powered ? powered.length : 0, ei: powered ? powered.filter(x => x.kind === 'e').map(x => +x.m.emissiveIntensity.toFixed(2)).join('/') : '', hp: S.boss ? Math.round(S.boss.hp) : null }),
    force(move) { if (move === 'surge') S.surgeT = 0; if (move === 'barrage') S.barrageT = 0; return move; }, // debug
    power(k) { setPower(k); return { screenK: screenK.value, city: ambShared.city.w, meshes: powered?.length }; }, // debug: square power 0..2 (no fight)
    reset() { if (c.fight) c.debug?.end?.(); restoreCity(); S.state = 'idle'; S.cd = 0; S.boss = null; },
  };
  return c.electro;
}
