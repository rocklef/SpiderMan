// OWNER: systems engineer. (user r19) Peter's motorbike (world/motorbike.js), parked on the kerb outside his building.
// As Peter (civilian mode) [F] near it gets on; while riding the player is frozen and this module owns the bike + rider:
//   W throttle · S brake / reverse · A / D steer · Space rear brake · mouse looks around · [F] get off (parks on the stand)
// Arcade physics: speed along the heading, bicycle-model yaw rate from the steering angle, lean from the turn rate, the
// body follows the ground under both wheels (pitch), walls and steep steps stop it with a bounce. The rider pose is built
// on the hidden Spider-Man skeleton (animator.riderPose) and copied onto Peter by systems/civilian.js. A small synth
// engine note follows the revs; the camera is a chase cam with a speed-dependent pull-back and FOV.
// Debug: __sys.bike.state() / .mount() / .dismount() / .bringHere()
import * as THREE from 'three';
import { buildMotorbike } from '../../world/motorbike.js';

const VMAX = 27, ACC = 8.5, BRAKE = 15, REV = 3.2, G = 9.81;

export function createMotorbike(sys) {
  const { ctx, ui } = sys;
  const P = ctx.player, cam = ctx.camera, scene = ctx.scene;
  const civ = () => sys.civ;
  let bike = null, home = null, riding = false, busy = false;
  const S = { pos: new THREE.Vector3(), yaw: 0, speed: 0, steer: 0, lean: 0, pitch: 0, vy: 0, air: false, spin: 0, stand: 1, brake: 0,
    camYaw: 0, camPitch: 0.18, look: { yaw: 0, pitch: 0 }, camPos: new THREE.Vector3(), camInit: false, fov: 62, bump: 0 };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const fwd = (out = _v) => out.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));

  function ensureBike() {
    if (bike) return bike;
    bike = buildMotorbike(); scene.add(bike.group);
    return bike;
  }
  function park(pos, yaw) {
    ensureBike(); S.pos.copy(pos); S.yaw = yaw; S.speed = 0; S.steer = 0; S.lean = 0.16; S.stand = 1; S.vy = 0; S.air = false;
    pose(0);
  }
  sys.events.on('apartment:ready', e => { home = { pos: e.bike.pos.clone(), yaw: e.bike.yaw }; park(home.pos, home.yaw); });

  // ---- place the meshes from the state
  function pose(dt) {
    const b = bike;
    b.group.position.copy(S.pos);
    _e.set(0, S.yaw, 0, 'YXZ'); b.group.quaternion.setFromEuler(_e);
    b.body.rotation.set(-S.pitch, 0, -S.lean, 'YXZ');                 // lean: + = to his left (roll about +Z)
    b.steer.rotation.y = S.steer;
    S.spin += S.speed * dt / b.WR; b.wheels.front.rotation.x = S.spin; b.wheels.rear.rotation.x = S.spin;
    b.stand.rotation.x = 0; b.stand.rotation.z = -1.2 * (1 - S.stand) + 0.35 * S.stand; b.stand.visible = S.stand > 0.02;
    b.mats.tail.emissiveIntensity = 0.9 + 2.6 * S.brake;
  }
  // ---- ground under a point (wheel contact), the bike frame follows both wheels
  const groundAt = (x, z, y) => ctx.world.groundHeight(x, z, y + 0.7);

  // ---- engine note (two detuned saws through a low-pass), revs from the speed + throttle
  let eng = null;
  function engine(on, rev = 0, thr = 0) {
    const ac = sys.audio?.context; if (!ac) return;
    if (!eng && on) {
      try {
        const g = ac.createGain(); g.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square';
        o1.connect(lp); o2.connect(lp); o3.connect(lp); lp.connect(g); g.connect(ac.destination); o1.start(); o2.start(); o3.start();
        eng = { g, lp, o1, o2, o3 };
      } catch (e) { eng = null; return; }
    }
    if (!eng) return;
    const st = sys.save?.state?.settings || {}, vol = (st.masterVolume ?? 0.8) * (st.sfxVolume ?? 0.9);
    const t = ac.currentTime, hz = 38 + rev * 95;
    eng.o1.frequency.setTargetAtTime(hz, t, 0.06); eng.o2.frequency.setTargetAtTime(hz * 1.012, t, 0.06); eng.o3.frequency.setTargetAtTime(hz * 0.5, t, 0.06);
    eng.lp.frequency.setTargetAtTime(500 + rev * 1400 + thr * 600, t, 0.08);
    eng.g.gain.setTargetAtTime(on ? (0.035 + 0.05 * rev + 0.03 * thr) * vol : 0, t, on ? 0.08 : 0.25);
  }

  // ---- get on / off
  function mount() {
    if (riding || busy || !bike || !civ()?.on) return;
    busy = true;
    civ().fade(() => {
      riding = true; busy = false; S.stand = 0; S.lean = 0; S.camInit = false; S.look.yaw = 0; S.look.pitch = 0;
      P.frozen = true; civ().retargetFrozen = true; civ().lock('Get off the bike first');
      ui.toast({ title: "Peter's Bike", text: 'W throttle · S brake · A/D steer · Space rear brake · F get off', icon: 'xp', tone: 'cyan' });
    });
  }
  function dismount() {
    if (!riding || busy) return;
    busy = true;
    const side = _v2.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw)); // his left
    const spot = S.pos.clone().addScaledVector(side, 0.85); spot.y = groundAt(spot.x, spot.z, S.pos.y) + 0.02;
    riding = false; S.speed = 0; S.stand = 1; S.lean = 0.16; engine(false);
    civ().retargetFrozen = false; civ().lock(null);
    P.teleport(spot, S.yaw);
    pose(0);
    setTimeout(() => { busy = false; }, 300);
  }

  // ---- ride
  function ride(dt) {
    const I = ctx.input.poll(dt);
    const thr = Math.max(0, I.move.y), brk = Math.max(0, -I.move.y), hand = I.jump ? 1 : 0;
    // speed
    if (thr > 0.05) S.speed += ACC * thr * (1 - Math.max(0, S.speed) / VMAX) * dt * (S.speed < 0 ? 3 : 1);
    if (brk > 0.05) { if (S.speed > 0.4) S.speed = Math.max(0, S.speed - BRAKE * brk * dt); else S.speed = Math.max(-REV, S.speed - 2.4 * brk * dt); }
    if (hand) S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), 9 * dt);
    if (thr < 0.05 && brk < 0.05) S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), (0.6 + 0.012 * S.speed * S.speed) * dt); // engine braking + drag
    S.brake = Math.max(brk > 0.05 && S.speed > 0.3 ? 1 : 0, hand);
    // steering: lock shrinks with speed; bicycle model
    const maxSteer = THREE.MathUtils.lerp(0.55, 0.07, Math.min(1, Math.abs(S.speed) / 22));
    const want = -I.move.x * maxSteer;
    S.steer += (want - S.steer) * (1 - Math.exp(-7 * dt));
    const yawRate = S.speed * Math.tan(S.steer) / bike.WB;
    if (!S.air) S.yaw += yawRate * dt;
    // lean into the turn (centripetal), low speed: a little counter-weight lean only
    const leanWant = THREE.MathUtils.clamp(Math.atan((S.speed * yawRate) / G), -0.75, 0.75);
    S.lean += (leanWant - S.lean) * (1 - Math.exp(-5 * dt));
    // move + collide (a ray at fairing height ahead; steep steps count as walls)
    const f = fwd(), step = S.speed * dt, dir = Math.sign(step) || 1;
    if (Math.abs(step) > 1e-5) {
      const o = _v2.copy(S.pos).setY(S.pos.y + 0.55).addScaledVector(f, dir * 0.7);
      const hit = ctx.world.raycast(o, _v.copy(f).multiplyScalar(dir), Math.abs(step) + 0.45);
      const nx = S.pos.x + f.x * step, nz = S.pos.z + f.z * step, g1 = groundAt(nx + f.x * dir * 0.75, nz + f.z * dir * 0.75, S.pos.y);
      if ((hit && Math.abs(hit.normal.y) < 0.55) || g1 > S.pos.y + 0.38) {
        const sev = Math.min(1, Math.abs(S.speed) / 14); S.speed *= -0.22; S.bump = sev;
        P.cam?.shake?.(0.15 + 0.4 * sev); if (sev > 0.3) sys.audio?.sfx?.slam?.();
        if (hit) { S.yaw += Math.sign((hit.normal.x * f.z - hit.normal.z * f.x) || 1) * 0.05 * sev; }
      } else { S.pos.x = nx; S.pos.z = nz; }
    }
    // traffic + parked cars (C3 world.collideDynamic): push out of the car body, bounce off it
    if (ctx.world.collideDynamic) for (const off of [0.62, -0.55]) {
      let r = null; try { r = ctx.world.collideDynamic(_v.copy(S.pos).addScaledVector(fwd(_v2), off), 0.42, 1.3); } catch (e) { r = null; }
      const push = r?.push; if (!push || push.lengthSq() < 1e-6) continue;
      S.pos.x += push.x; S.pos.z += push.z;
      const into = -(push.x * Math.sin(S.yaw) + push.z * Math.cos(S.yaw)) / Math.max(1e-6, Math.hypot(push.x, push.z)) * Math.sign(off);
      if (into > 0.3 && Math.abs(S.speed) > 1.5) { const sev = Math.min(1, Math.abs(S.speed) / 14); S.speed *= -0.25; P.cam?.shake?.(0.2 + 0.4 * sev); if (sev > 0.3) sys.audio?.sfx?.slam?.(); }
      break;
    }
    // ground: both wheel contacts -> height + pitch; short drops become a fall
    const fr = _v2.copy(S.pos).addScaledVector(f, bike.WB / 2), gF = groundAt(fr.x, fr.z, S.pos.y);
    const re = _v.copy(S.pos).addScaledVector(f, -bike.WB / 2), gR = groundAt(re.x, re.z, S.pos.y);
    const gMid = Math.max(gF, gR, groundAt(S.pos.x, S.pos.z, S.pos.y));
    if (S.pos.y > gMid + 0.05) { S.air = true; S.vy -= G * dt; S.pos.y = Math.max(gMid, S.pos.y + S.vy * dt); }
    if (S.pos.y <= gMid + 0.05) {
      if (S.air && S.vy < -5) { P.cam?.shake?.(0.25); sys.audio?.sfx?.land?.(0.6); }
      S.air = false; S.vy = 0; S.pos.y += (gMid - S.pos.y) * Math.min(1, dt * 25);
    }
    const pitchWant = Number.isFinite(gF) && Number.isFinite(gR) ? Math.atan2(gF - gR, bike.WB) : 0;
    S.pitch += (pitchWant - S.pitch) * (1 - Math.exp(-10 * dt));
    if (S.pos.y < -2) { dismount(); return; } // into the river: off he gets
    pose(dt);
    rider(dt, I);
    camera(dt, I);
    engine(true, Math.min(1, Math.abs(S.speed) / VMAX), thr);
  }
  // ---- the rider: Spider-Man's (hidden) skeleton posed on the bike; Peter copies it
  function rider(dt) {
    const b = bike, R = b.rider, k = Math.min(1, Math.abs(S.speed) / 18);
    // player root = the bike's ground point, oriented with the bike body (yaw, pitch, lean)
    P.object.position.copy(S.pos);
    _e.set(-S.pitch, S.yaw, -S.lean, 'YXZ'); P.object.quaternion.setFromEuler(_e); P.object.updateMatrixWorld(true);
    P.rig.object.position.set(0, 0, 0); P.rig.object.quaternion.identity();
    // grips turn with the bars (rotate about the rake axis, approximated by Y for the small steering angles)
    const gL = R.gripL.clone().sub(_v.set(0, 1.0, 0.5)).applyAxisAngle(_v2.set(0, 1, 0), S.steer).add(_v.set(0, 1.0, 0.5));
    const gR = R.gripR.clone().sub(_v.set(0, 1.0, 0.5)).applyAxisAngle(_v2.set(0, 1, 0), S.steer).add(_v.set(0, 1.0, 0.5));
    const tuck = 0.05 * k;
    try {
      P.rig.animator?.riderPose?.(dt, { hips: R.hips.clone().add(_v.set(0, -tuck, 0.04 * k)), gripL: gL, gripR: gR, pegL: R.pegL, pegR: R.pegR, crouch: k, steer: S.steer, look: S.steer * 1.2 + S.look.yaw * 0.5 });
    } catch (e) { /* placeholder rig */ }
    // keep the traversal / systems view of him on the bike (interaction prompts, minimap, pins)
    P.state.pos.set(S.pos.x, S.pos.y + 0.95, S.pos.z); P.state.vel.copy(fwd(_v)).multiplyScalar(S.speed); P.state.facing = S.yaw;
  }
  // ---- chase camera
  function camera(dt, I) {
    if (Math.abs(I.look.dx) + Math.abs(I.look.dy) > 0.3) { S.look.yaw -= I.look.dx * 0.003; S.look.pitch = THREE.MathUtils.clamp(S.look.pitch + I.look.dy * 0.003, -0.35, 0.6); S.lookT = 0; }
    else { S.lookT = (S.lookT || 0) + dt; if (S.lookT > 1.2 && Math.abs(S.speed) > 2) { S.look.yaw *= Math.exp(-2 * dt); S.look.pitch *= Math.exp(-2 * dt); } }
    const v = Math.abs(S.speed), yaw = S.yaw + S.look.yaw + (S.speed < -0.5 ? 0 : 0), pitch = 0.2 + S.look.pitch;
    const dist = 3.9 + v * 0.06, h = 1.3;
    const target = _v.copy(S.pos).setY(S.pos.y + h);
    const want = _v2.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist).add(target);
    // keep the lens out of walls
    const d = want.clone().sub(target), L = d.length(); d.divideScalar(L);
    const hit = ctx.world.raycast(target, d, L + 0.3); if (hit) want.copy(target).addScaledVector(d, Math.max(0.6, hit.distance - 0.3));
    if (!S.camInit) { S.camPos.copy(want); S.camInit = true; }
    S.camPos.lerp(want, 1 - Math.exp(-9 * dt));
    cam.position.copy(S.camPos); cam.lookAt(target.x + Math.sin(S.yaw) * 2, target.y - 0.1, target.z + Math.cos(S.yaw) * 2);
    cam.rotateZ(-S.lean * 0.18); // a little of the lean in the horizon
    S.fov += (62 + v * 0.75 - S.fov) * (1 - Math.exp(-4 * dt)); cam.fov = S.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  const api = {
    update(dt) {
      if (!bike) return;
      if (riding) ride(dt);
      else if (S.stand < 1 && !busy) { S.stand = Math.min(1, S.stand + dt * 3); pose(dt); }
    },
    interact(p) {
      if (busy || !bike) return null;
      if (riding) return { id: 'bikeOff', pos: S.pos.clone().setY(S.pos.y + 1.2), label: 'Get Off', sub: "Peter's bike", priority: 10, action: dismount };
      if (sys.apartment?.inside) return null;
      if (P.state?.mode !== 'ground' || p.distanceTo(_v.copy(S.pos).setY(S.pos.y + 0.95)) > 2.3) return null;
      if (!civ()?.on) return { id: 'bikeSuit', pos: S.pos.clone().setY(S.pos.y + 1.2), label: 'Suit Off to Ride', sub: 'Press G first', priority: 5, action: () => ui.toast({ title: "Peter's Bike", text: 'Spider-Man swings. Peter rides — press G to suit off.', icon: 'xp', tone: 'cyan' }) };
      return { id: 'bikeOn', pos: S.pos.clone().setY(S.pos.y + 1.2), label: 'Ride', sub: "Peter's bike", priority: 7, action: mount };
    },
    pins(p, out) {
      if (!bike || riding || sys.apartment?.inside) return;
      const d = Math.hypot(S.pos.x - p.x, S.pos.z - p.z);
      if (d < 400 && d > 6 && civ()?.on) out.push({ kind: 'label', pos: S.pos.clone().setY(S.pos.y + 1.6), label: "Peter's bike", edge: false });
    },
    get riding() { return riding; },
    mount, dismount,
    bringHere() { const f = _v.set(Math.sin(P.state.facing), 0, Math.cos(P.state.facing)); const p = P.position.clone().addScaledVector(f, 2.2); p.y = groundAt(p.x, p.z, P.position.y); park(p, P.state.facing + Math.PI / 2); },
    state: () => ({ riding, busy, speed: +S.speed.toFixed(2), yaw: +S.yaw.toFixed(2), lean: +S.lean.toFixed(2), steer: +S.steer.toFixed(2), air: S.air, pos: S.pos.toArray().map(v => +v.toFixed(1)), home: home && home.pos.toArray().map(v => +v.toFixed(1)) }),
  };
  return api;
}
