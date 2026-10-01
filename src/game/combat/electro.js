// OWNER: combat engineer. Electro (Max Dillon): the living-electricity look on a thug-rig enemy.
// dressElectro(enemy) -> ElectroLook (the Enemy owns it: look.update / look.dispose / look.bolt / look.flash).
// (user r13c) production pass:
//  - body: a shader patch on his (cloned) materials — crawling vein network of current in bind-pose body space (two
//    octaves of ridged noise flowing upward), pulse waves, a hot Fresnel rim; all scale with `charge` (wind-ups, storm,
//    surge) and rage (low health). Dark translucent-looking skin under it.
//  - aura: constant small arcs jumping across his body and between his hands, sparks shedding off, a breathing corona
//    sprite; the light on the street comes from ONE shared PointLight created at combat init (c.electroLight) so his
//    arrival never changes the scene's light count (that recompiles every lit material = a hitch).
//  - bolts: c.lightning (lightning.js) thick branching ribbons with re-strikes, not 1 px lines.
//  - levitation: look.lift (m) and look.armsW (arms flung out / up, palms forward) are springs the Enemy applies
//    (hover height in update, the arm pose in late()); the boss module drives them for the storm / surge wind-ups.
import * as THREE from 'three';
import { clamp, rnd } from './util.js';
import { addShaderPatch } from '../../render/materials.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(180,230,255,.55)'); gr.addColorStop(1, 'rgba(40,160,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
}
let GLOW = null;

// shared uniforms for every Electro material (one boss at a time)
const U = { uET: { value: 0 }, uECharge: { value: 0 }, uERage: { value: 0 }, uEFlash: { value: 0 } };
function patchBody(m) {
  addShaderPatch(m, 'electroBody', sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uET, uECharge, uERage, uEFlash; varying vec3 vEP;
float eH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float eN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eH(i), eH(i + vec3(1,0,0)), f.x), mix(eH(i + vec3(0,1,0)), eH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(eH(i + vec3(0,0,1)), eH(i + vec3(1,0,1)), f.x), mix(eH(i + vec3(0,1,1)), eH(i + vec3(1,1,1)), f.x), f.y), f.z) * 2.0 - 1.0; }
float eVein(vec3 p, float w) { float n = eN(p) * 0.65 + eN(p * 2.07 + 3.1) * 0.35; return 1.0 - smoothstep(0.0, w, abs(n)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float ch = clamp(uECharge, 0.0, 1.5), rg = uERage;
  vec3 p = vEP * 3.2 + vec3(0.0, -uET * (0.55 + 0.6 * ch), 0.0);
  float v1 = eVein(p, 0.075), v2 = eVein(p * 2.4 + vec3(5.0, -uET * 1.3, 2.0), 0.06) * 0.6;
  // pulses running up the body (the current surging)
  float pulse = 0.55 + 0.45 * sin(uET * (7.0 + 6.0 * ch) - vEP.y * 9.0);
  float fl = 0.85 + 0.15 * sin(uET * 61.0) * sin(uET * 23.0);
  vec3 vein = vec3(0.1, 0.55, 1.5) * (v1 * pulse + v2) * (0.9 + 1.8 * ch + 0.6 * rg) * fl;
  // hot Fresnel rim
  float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  vec3 rimC = vec3(0.12, 0.5, 1.3) * rim * (0.6 + 1.4 * ch + 0.5 * rg);
  totalEmissiveRadiance += vein + rimC + vec3(0.4, 1.0, 2.0) * uEFlash * 0.5;
}`);
  });
  m.needsUpdate = true;
}

export class ElectroLook {
  constructor(enemy) {
    this.e = enemy; this.c = enemy.c; this.scene = enemy.c.ctx.scene;
    this.t = 0; this.flashT = 0; this.arcT = 0; this.handT = 0; this.charge = 0; this.chargeWant = 0;
    this.lift = 0; this.liftV = 0; this.liftWant = 0; this.armsW = 0; this.armsWant = 0;
    this.root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      m.color.setRGB(0.03, 0.045, 0.075);
      m.emissive.setRGB(0.004, 0.02, 0.05); // near-black skin: the veins / rim carry the light (night exposure is ~4.5x)
      m.emissiveIntensity = 1.0;
      m.roughness = 0.28; m.metalness = 0.65;
      patchBody(m);
    });
    GLOW ??= glowTex();
    const sprMat = new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(0.7, 2.1, 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
    this.corona = new THREE.Sprite(sprMat); this.corona.scale.setScalar(1.35); this.corona.renderOrder = 21;
    this.corona.name = 'cmb-electro-corona'; this.scene.add(this.corona);
    this.sprMat = sprMat;
    this.light = this.c.electroLight || null; // shared (combat init)
  }
  get root() { return this.e.root; }
  bone(n) { return this.e.bones[n]; }
  hand(S, out) { const b = this.bone('hand' + S); return b ? b.getWorldPosition(out) : this.e.chest(out); }
  bolt(from, to) {
    const L = this.c.lightning;
    if (L) L.strike(from, to, { width: 0.13, life: 0.32, branches: 4, jag: 0.14, intensity: 1.3 });
    this.flashT = 1;
  }
  flash() { this.flashT = 1; }
  update(dt) {
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt * 3.2);
    const e = this.e, L = this.c.lightning, alive = e.alive;
    const chest = e.chest(_a).clone();
    const rage = alive && e.hp < e.maxHp * 0.5 ? 1 : 0;
    // charge: wind-ups / storm / boss surge (chargeWant set by the boss) -> veins, rim, corona, arcs all ramp
    const winding = alive && (e.state === 'aim' || e.state === 'storm');
    this.charge += ((Math.max(winding ? 1 : 0, this.chargeWant)) - this.charge) * (1 - Math.exp(-6 * dt));
    // levitation + arms (springs; the Enemy reads lift / armsW)
    const lw = alive ? Math.max(this.liftWant, e.state === 'storm' ? 0.9 : 0) : 0;
    this.liftV += ((lw - this.lift) * 30 - this.liftV * 9) * dt; this.lift = Math.max(0, this.lift + this.liftV * dt);
    const aw = alive ? Math.max(this.armsWant, e.state === 'storm' ? 1 : 0) : 0;
    this.armsW += (aw - this.armsW) * (1 - Math.exp(-7 * dt));
    U.uET.value = this.t; U.uECharge.value = alive ? this.charge : 0; U.uERage.value = rage; U.uEFlash.value = this.flashT;
    const pulse = 0.72 + 0.28 * Math.sin(this.t * 11) + this.flashT * 0.9;
    const k = (1 + 0.8 * this.charge + 0.35 * rage) * (alive ? 1 : 0.15);
    // street light: modest — wet asphalt / road paint mirror it hard, a strong point light reads as glowing stripes
    if (this.light) { this.light.position.copy(chest); this.light.intensity = (1.6 + this.flashT * 3.5 + 2 * this.charge) * k * (0.85 + 0.15 * Math.random()); this.light.distance = 12 + 5 * this.charge; }
    this.corona.position.copy(chest).setY(chest.y + 0.15);
    // corona: a halo behind the silhouette, never a dome over him (the veins / rim carry the read)
    this.corona.scale.setScalar((0.8 + pulse * 0.15) * (1 + 0.25 * this.charge));
    this.sprMat.opacity = alive ? 0.1 + pulse * 0.06 + 0.1 * this.charge : 0.04;
    this.corona.position.y -= 0.05;
    if (!alive || !L) return;
    // body aura: small arcs jumping across his silhouette
    this.arcT -= dt;
    if (this.arcT <= 0) {
      this.arcT = rnd(0.04, 0.13) / (1 + this.charge + 0.5 * rage);
      const p0 = chest.clone().add(_b.set(rnd(-0.35, 0.35), rnd(-0.75, 0.55), rnd(-0.3, 0.3)));
      const p1 = p0.clone().add(_b.set(rnd(-0.5, 0.5), rnd(-0.4, 0.6), rnd(-0.5, 0.5)).multiplyScalar(1 + this.charge));
      L.arc(p0, p1, { width: 0.018 + 0.02 * this.charge, life: rnd(0.06, 0.14), intensity: 0.8 + 0.6 * this.charge });
    }
    // charging: current crawling between the hands and down to the street
    if (this.charge > 0.3) {
      this.handT -= dt;
      if (this.handT <= 0) {
        this.handT = rnd(0.05, 0.11);
        const hl = this.hand('L', new THREE.Vector3()), hr = this.hand('R', new THREE.Vector3());
        if (Math.random() < 0.55) L.arc(hl, hr, { width: 0.04, life: 0.1, intensity: 1.2, jag: 0.3 });
        else { const h = Math.random() < 0.5 ? hl : hr; const g = h.clone(); g.y = e.ground() + 0.02; g.x += rnd(-1.2, 1.2); g.z += rnd(-1.2, 1.2); L.arc(h, g, { width: 0.05, life: 0.12, intensity: 1.3 }); }
      }
    }
    // sparks shedding off the body
    if (Math.random() < dt * (14 + 30 * this.charge)) {
      this.c.fx.add.emit({
        pos: chest.clone().add(_b.set(rnd(-0.35, 0.35), rnd(-0.6, 0.7), rnd(-0.35, 0.35))),
        vel: new THREE.Vector3(rnd(-1.5, 1.5), rnd(0.4, 3), rnd(-1.5, 1.5)),
        life: rnd(0.12, 0.3), size: rnd(0.04, 0.09), size1: 0.01, color: [1.2, 4.5, 8], tile: 0, drag: 4,
      });
    }
  }
  // arms flung out / up with the palms forward (levitating channel pose), applied after the clip in Enemy.late()
  applyArms(w) {
    if (w < 0.005) return;
    const e = this.e, yaw = e.yaw, fwd = _a.set(Math.sin(yaw), 0, Math.cos(yaw)), left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (const [S, sx] of [['L', 1], ['R', -1]]) {
      const ua = this.bone('upperArm' + S), fa = this.bone('forearm' + S), h = this.bone('hand' + S);
      if (!ua || !fa || !h) continue;
      const dU = left.clone().multiplyScalar(sx * 0.82).addScaledVector(fwd, 0.18).add(new THREE.Vector3(0, 0.42, 0)).normalize();
      const dF = left.clone().multiplyScalar(sx * 0.7).addScaledVector(fwd, 0.25).add(new THREE.Vector3(0, 0.62, 0)).normalize();
      aimWorld(ua, fa, dU, w); aimWorld(fa, h, dF, w);
    }
  }
  dispose() {
    this.scene.remove(this.corona); this.sprMat.dispose();
    if (this.light) this.light.intensity = 0;
  }
}
// rotate bone b (about its head) so that b -> child points along world dir d (weighted), keeping the parent chain
function aimWorld(b, child, d, w) {
  b.updateWorldMatrix(true, true);
  const p0 = b.getWorldPosition(new THREE.Vector3()), p1 = child.getWorldPosition(new THREE.Vector3());
  const cur = p1.sub(p0).normalize();
  _q.setFromUnitVectors(cur, d); if (w < 1) _q.slerp(new THREE.Quaternion(), 1 - w);
  const wq = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q);
  const pq = b.parent ? b.parent.getWorldQuaternion(_q2) : _q2.identity();
  b.quaternion.copy(pq.invert().multiply(wq));
  b.updateWorldMatrix(false, true);
}

export function dressElectro(enemy) { return new ElectroLook(enemy); }
