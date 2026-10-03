// OWNER: city agent. (user r19) Peter's motorbike: a procedural middleweight sport bike (no real make / logos), deep blue
// with red accents. Local frame: origin on the ground midway between the tyre contact patches, +Z = forward, +Y = up.
//   buildMotorbike() -> { group, body (leans / pitches), steer (front end, turns about the rake axis), wheels {front, rear}
//   (spin about X), stand (kickstand), mats {head, tail}, rider {hips, gripL, gripR, pegL, pegR} (rider joint targets) }
import * as THREE from 'three';

const WB = 1.42, WR = 0.31; // wheelbase, wheel radius

export function buildMotorbike() {
  const group = new THREE.Group(); group.name = 'peterBike';
  const body = new THREE.Group(); group.add(body);
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1, ...o });
  const paint = M({ color: 0x14306b, roughness: 0.25, metalness: 0.35 }), red = M({ color: 0xb3161e, roughness: 0.3, metalness: 0.3 });
  const black = M({ color: 0x141416, roughness: 0.55 }), rubber = M({ color: 0x111111, roughness: 0.9 }), alu = M({ color: 0xb9bdc2, roughness: 0.3, metalness: 0.9 });
  const chrome = M({ color: 0xdfe3e8, roughness: 0.12, metalness: 1 }), engine = M({ color: 0x2b2d31, roughness: 0.5, metalness: 0.6 });
  const add = (geo, mat, x, y, z, parent = body, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  // a box oriented from point a to point b (frame tubes, swingarm)
  const beam = (a, b, w, h, mat, parent = body) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, L), mat); m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); m.castShadow = true; parent.add(m); return m;
  };

  // ---- wheels (tyre torus + rim disc + 5 spokes + brake disc), spinning about X
  function wheel(width, disc) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(WR - width * 0.42, width * 0.42, 14, 40), rubber); tyre.rotation.y = Math.PI / 2; tyre.scale.set(1, 1, 1.0); tyre.castShadow = true; w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(WR - width * 0.78, WR - width * 0.78, width * 0.5, 32, 1, true), black); rim.rotation.z = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width * 0.9, 16), alu); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, WR - width * 0.8, 0.035), black); const a = k / 5 * Math.PI * 2; sp.position.set(0, Math.cos(a) * (WR - width * 0.8) / 2, Math.sin(a) * (WR - width * 0.8) / 2); sp.rotation.x = -a; w.add(sp); }
    if (disc) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.006, 28), chrome); d.rotation.z = Math.PI / 2; d.position.x = s * width * 0.32; w.add(d); }
    return w;
  }
  const rear = wheel(0.19, false); rear.position.set(0, WR, -WB / 2); body.add(rear);
  // ---- front end: steering group pivoting about the rake axis through the steering head
  const head = new THREE.Vector3(0, 1.0, 0.5), rake = 0.42; // steering head position, rake angle (rad from vertical)
  const steerPivot = new THREE.Group(); steerPivot.position.copy(head); steerPivot.rotation.x = -rake; body.add(steerPivot);
  const steer = new THREE.Group(); steerPivot.add(steer);                  // rotates about its local Y (= the rake axis)
  // the front axle in steer space: down the rake axis, offset forward a little (fork offset)
  const axleL = new THREE.Vector3(0, WR, WB / 2).sub(head).applyAxisAngle(new THREE.Vector3(1, 0, 0), rake);
  const front = wheel(0.13, true); front.position.copy(axleL); steer.add(front);
  for (const s of [-1, 1]) { // fork legs (upper chrome stanchion, lower slider)
    const top = new THREE.Vector3(s * 0.1, 0.05, 0), bot = axleL.clone().add(new THREE.Vector3(s * 0.1, 0, 0));
    beam(top, top.clone().lerp(bot, 0.55), 0.045, 0.045, chrome, steer); beam(top.clone().lerp(bot, 0.5), bot, 0.06, 0.06, black, steer);
  }
  add(new THREE.BoxGeometry(0.28, 0.05, 0.12), alu, 0, 0.06, 0, steer); add(new THREE.BoxGeometry(0.28, 0.04, 0.1), alu, 0, -0.12, 0, steer); // triple clamps
  for (const s of [-1, 1]) { // clip-on bars + grips + levers + mirrors
    const bar = add(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10), black, s * 0.2, 0.03, -0.02, steer, 0, 0, Math.PI / 2 + s * 0.15);
    const grip = add(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 12), rubber, s * 0.33, 0.01, -0.04, steer, 0, 0, Math.PI / 2 + s * 0.15);
    add(new THREE.BoxGeometry(0.15, 0.012, 0.02), alu, s * 0.3, 0.03, 0.04, steer, 0, s * 0.3, 0);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), black, s * 0.22, 0.13, 0.02, steer, 0.3, 0, s * -0.4);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.02), black, s * 0.28, 0.21, 0.02, steer);
    void bar; void grip;
  }
  const fender = add(new THREE.TorusGeometry(WR + 0.03, 0.06, 6, 20, Math.PI * 0.55), paint, 0, 0, 0, steer); fender.position.copy(axleL); fender.rotation.set(Math.PI * 0.62, Math.PI / 2, 0); fender.scale.set(1, 1, 1.8);
  // ---- frame, swingarm, engine, exhaust
  const pivot = new THREE.Vector3(0, 0.42, -0.15);
  for (const s of [-1, 1]) {
    beam(new THREE.Vector3(s * 0.12, 0.98, 0.45), new THREE.Vector3(s * 0.16, 0.62, -0.12), 0.05, 0.12, alu);   // twin spar
    beam(new THREE.Vector3(s * 0.16, 0.62, -0.12), pivot.clone().setX(s * 0.16), 0.05, 0.1, alu);
    beam(pivot.clone().setX(s * 0.14), new THREE.Vector3(s * 0.11, WR, -WB / 2), 0.045, 0.09, alu);            // swingarm
    beam(new THREE.Vector3(s * 0.08, 0.86, -0.15), new THREE.Vector3(s * 0.07, 0.88, -0.62), 0.03, 0.03, black); // subframe
  }
  add(new THREE.BoxGeometry(0.34, 0.36, 0.46), engine, 0, 0.42, 0.12);
  add(new THREE.BoxGeometry(0.4, 0.14, 0.3), engine, 0, 0.32, 0.2);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.3, 0.02, 0.02), alu, 0, 0.5 + k * 0.045, 0.36); // cylinder fins
  { const p0 = new THREE.Vector3(0.1, 0.32, 0.32), p1 = new THREE.Vector3(0.14, 0.26, -0.05), p2 = new THREE.Vector3(0.16, 0.44, -0.5), p3 = new THREE.Vector3(0.17, 0.62, -0.78);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    add(new THREE.TubeGeometry(curve, 20, 0.035, 10, false), chrome, 0, 0, 0);
    const can = add(new THREE.CylinderGeometry(0.075, 0.065, 0.36, 16), M({ color: 0x3a3d42, roughness: 0.25, metalness: 0.9 }), 0.17, 0.6, -0.72); can.rotation.x = Math.PI / 2 - 0.45; }
  { const ch = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.12, WR, -WB / 2), new THREE.Vector3(-0.12, 0.42, 0.02), new THREE.Vector3(-0.12, 0.28, 0.0), new THREE.Vector3(-0.12, 0.2, -WB / 2)], true);
    add(new THREE.TubeGeometry(ch, 40, 0.008, 5, true), M({ color: 0x5a4a3a, metalness: 0.7, roughness: 0.5 }), 0, 0, 0); }
  // ---- bodywork: tank, seat, tail, nose fairing, belly pan, windscreen, number plate
  { const tg = new THREE.SphereGeometry(0.24, 24, 16); tg.scale(0.95, 0.62, 1.25); add(tg, paint, 0, 0.96, 0.14);
    const stripe = new THREE.SphereGeometry(0.242, 24, 16, Math.PI * 0.46, Math.PI * 0.08); stripe.scale(0.95, 0.62, 1.25); add(stripe, red, 0, 0.96, 0.14);
    const seat = new THREE.BoxGeometry(0.28, 0.08, 0.5, 4, 1, 6); const sp = seat.attributes.position; for (let i = 0; i < sp.count; i++) if (sp.getY(i) > 0) sp.setY(i, sp.getY(i) + 0.02 * Math.cos(sp.getX(i) * 8)); seat.computeVertexNormals();
    add(seat, M({ color: 0x1b1b1d, roughness: 0.8 }), 0, 0.86, -0.3);
    const tail = new THREE.BoxGeometry(0.24, 0.16, 0.42, 2, 2, 4); const tp = tail.attributes.position; for (let i = 0; i < tp.count; i++) { const z = tp.getZ(i); tp.setX(i, tp.getX(i) * (1 - Math.max(0, -z) * 1.2)); tp.setY(i, tp.getY(i) + Math.max(0, -z) * 0.25); } tail.computeVertexNormals();
    add(tail, paint, 0, 0.88, -0.66);
    const nose = new THREE.SphereGeometry(0.26, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62); nose.scale(1, 0.85, 1.35); add(nose, paint, 0, 0.95, 0.66, body, -Math.PI / 2 - 0.35);
    for (const s of [-1, 1]) { // rounded side fairings (half ellipsoids) with a red flash
      const side = new THREE.SphereGeometry(0.3, 20, 12, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI); side.scale(0.22, 0.62, 1.15);
      add(side, paint, s * 0.1, 0.62, 0.36);
      const fl = new THREE.SphereGeometry(0.302, 20, 4, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI, Math.PI * 0.42, Math.PI * 0.07); fl.scale(0.22, 0.62, 1.15);
      add(fl, red, s * 0.1, 0.62, 0.36);
    }
    add(new THREE.BoxGeometry(0.36, 0.12, 0.5), black, 0, 0.2, 0.2); // belly pan
    const ws = add(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshPhysicalMaterial({ color: 0x9fb4c6, roughness: 0.05, transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 1.16, 0.62); ws.rotation.x = -0.95;
    const plate = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f1efe8'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#1e3d6b'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 116); g.fillStyle = '#1e3d6b'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('NEW YORK', 128, 36); g.fillStyle = '#111'; g.font = 'bold 56px Arial'; g.fillText('PKR 418', 128, 100); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const pl = add(new THREE.PlaneGeometry(0.2, 0.1), M({ map: plate, roughness: 0.6 }), 0, 0.72, -0.9); pl.rotation.y = Math.PI; pl.rotation.x = 0.3; }
  // ---- lights + pegs + kickstand
  const headM = M({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 2.2, roughness: 0.1 });
  add(new THREE.SphereGeometry(0.065, 16, 10), headM, -0.07, 0.97, 0.88).scale.set(1, 0.6, 0.4); add(new THREE.SphereGeometry(0.065, 16, 10), headM, 0.07, 0.97, 0.88).scale.set(1, 0.6, 0.4);
  const tailM = M({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.9, roughness: 0.2 });
  add(new THREE.BoxGeometry(0.14, 0.04, 0.02), tailM, 0, 0.98, -0.87);
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), alu, s * 0.21, 0.36, -0.3, body, 0, 0, Math.PI / 2); add(new THREE.BoxGeometry(0.08, 0.03, 0.12), alu, s * 0.17, 0.42, -0.25); }
  const stand = new THREE.Group(); stand.position.set(0.16, 0.32, -0.08); body.add(stand); // left side (+X)
  { const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), black); sm.position.y = -0.18; stand.add(sm); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.06), black); foot.position.y = -0.36; stand.add(foot); }

  // rider joint targets (bike local): pelvis over the seat, wrists at the grips, ankles on the pegs
  const rider = {
    hips: new THREE.Vector3(0, 0.97, -0.24),
    gripL: new THREE.Vector3(0.31, 1.0, 0.38), gripR: new THREE.Vector3(-0.31, 1.0, 0.38),
    pegL: new THREE.Vector3(0.2, 0.43, -0.34), pegR: new THREE.Vector3(-0.2, 0.43, -0.34),
  };
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, body, steer, steerPivot, wheels: { front, rear }, stand, mats: { head: headM, tail: tailM }, rider, WB, WR };
}
