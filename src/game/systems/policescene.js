// OWNER: systems engineer. (user r13b) NYPD at the scene: when a street crime goes live (crime:zone active; not the car
// chase, which brings its own cruisers) two patrol cars pull up on the nearest road a few seconds later, parked at an
// angle with their light bars strobing red / blue (emissive + bloom, no dynamic lights = no shader recompiles). They stay
// while the crime is active and ~25 s after it clears, then leave. Up to 2 scenes at once (4 cars).
import * as THREE from 'three';
import { on } from './events.js';
import { avenues } from '../../world/layout.js';
import { roadGraph } from './route.js';
import { loadVehicleModels } from '../../world/vehicles.js';
import { createPartMaterial } from '../../world/partmat.js';

const MAX = 4, ARRIVE = 5, LINGER = 25;
const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

export function createPoliceScenes(sys) {
  const { ctx } = sys;
  const scenes = new Map(); // crime id -> {pos, active, t, offT, slots:[k,k], heading, spots:[...]}
  let V = null, loading = null, t = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3();

  async function load() {
    if (V || loading) return loading;
    loading = (async () => {
      const models = await loadVehicleModels(ctx.renderer);
      if (!models?.geos?.sedan) return null;
      const geo = models.geos.sedan.clone();
      const mat = createPartMaterial({ name: 'nypd', instTint: true, instState: false, map: models.atlas });
      const im = new THREE.InstancedMesh(geo, mat, MAX); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      const tint = new Float32Array(MAX * 3); for (let i = 0; i < MAX; i++) tint.set([0.93, 0.94, 0.96], i * 3); // NYPD white
      geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      const bars = [];
      for (let i = 0; i < MAX; i++) {
        const bar = new THREE.Group();
        const lr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0 }));
        const lb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x1840ff, emissiveIntensity: 0 }));
        // NYPD side stripe (dark blue band, both sides)
        const st = new THREE.MeshStandardMaterial({ color: 0x0b2a6b, roughness: 0.5 });
        const len = box.max.x - box.min.x, wid = box.max.z - box.min.z, cx = (box.max.x + box.min.x) / 2;
        for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(len * 0.62, 0.09, 0.02), st); b.position.set(cx, box.max.y * 0.47, s * (wid / 2 + 0.012)); bar.add(b); }
        lr.position.set(cx, box.max.y + 0.06, 0.32); lb.position.set(cx, box.max.y + 0.06, -0.32); bar.add(lr, lb);
        const root = new THREE.Group(); root.add(bar); root.visible = false; ctx.scene.add(root);
        bars.push({ root, lr, lb });
      }
      im.count = MAX; im.visible = false; ctx.scene.add(im);
      V = { im, bars, len: box.max.x - box.min.x };
      return V;
    })().catch(e => { console.warn('[police] vehicles unavailable', e); return null; });
    return loading;
  }

  // nearest road axis to the crime: along the closest avenue or the closest street
  function roadSpot(p) {
    const g = roadGraph(); if (!g?.zs) return null;
    let ax = avenues[0]; for (const x of avenues) if (Math.abs(x - p.x) < Math.abs(ax - p.x)) ax = x;
    let sz = g.zs[0]; for (const z of g.zs) if (Math.abs(z - p.z) < Math.abs(sz - p.z)) sz = z;
    if (Math.abs(ax - p.x) <= Math.abs(sz - p.z)) return { x: ax, z: p.z, heading: Math.PI / 2, side: Math.sign(p.x - ax) || 1, axis: 'av' };
    return { x: p.x, z: sz, heading: 0, side: Math.sign(p.z - sz) || 1, axis: 'st' };
  }
  function freeSlots(n) { const used = new Set([...scenes.values()].flatMap(s => s.slots)); const out = []; for (let i = 0; i < MAX && out.length < n; i++) if (!used.has(i)) out.push(i); return out.length === n ? out : null; }

  on('crime:zone', z => {
    if (!z || z.type === 'carChase' || z.moving) return;
    const S = scenes.get(z.id);
    if (z.active) {
      if (S) { S.active = true; S.offT = 0; return; }
      const slots = freeSlots(2); if (!slots) return;
      const r = roadSpot(z.pos); if (!r) return;
      load();
      // two cars nose-to-tail on the crime side of the road, angled in toward the kerb like they pulled over fast
      const fwd = r.axis === 'av' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const lat = r.axis === 'av' ? new THREE.Vector3(r.side, 0, 0) : new THREE.Vector3(0, 0, r.side);
      const base = new THREE.Vector3(r.x, 0, r.z).addScaledVector(lat, 5.5);
      const spots = [-6.5, 6.5].map((o, i) => ({ p: base.clone().addScaledVector(fwd, o + (i ? 1.2 : -1.2)), yaw: Math.atan2(fwd.z, fwd.x) + (i ? -0.42 : 0.35) * r.side }));
      scenes.set(z.id, { pos: z.pos.clone(), active: true, t: 0, offT: 0, slots, spots });
    } else if (S) { S.active = false; }
  });

  return {
    update(dt) {
      t += dt;
      if (!V) { if (scenes.size) load(); return; }
      let any = false;
      for (const [id, S] of scenes) {
        S.t += dt; if (!S.active) S.offT += dt;
        if (!S.active && S.offT > LINGER) { for (const k of S.slots) V.bars[k].root.visible = false; scenes.delete(id); continue; }
        const shown = S.t > ARRIVE;
        S.slots.forEach((k, i) => {
          const sp = S.spots[i], b = V.bars[k];
          if (!shown) { m.makeScale(0, 0, 0); V.im.setMatrixAt(k, m); b.root.visible = false; return; }
          any = true;
          q.setFromAxisAngle(Y, -sp.yaw); P.set(sp.p.x, ctx.world.groundHeight(sp.p.x, sp.p.z), sp.p.z);
          m.compose(P, q, ONE); V.im.setMatrixAt(k, m);
          b.root.visible = true; b.root.position.copy(P); b.root.quaternion.copy(q);
          const ph = (t * 3.4 + k * 0.29) % 1, burst = Math.sin(t * 31 + k) > 0; // double-flash strobe pattern
          b.lr.material.emissiveIntensity = ph < 0.5 && burst ? 50 : 0; b.lb.material.emissiveIntensity = ph >= 0.5 && burst ? 60 : 0;
        });
      }
      for (let k = 0; k < MAX; k++) if (![...scenes.values()].some(S => S.slots.includes(k) && S.t > ARRIVE)) { m.makeScale(0, 0, 0); V.im.setMatrixAt(k, m); V.bars[k].root.visible = false; }
      V.im.visible = any; V.im.instanceMatrix.needsUpdate = true;
    },
    debug: () => [...scenes.entries()].map(([id, S]) => `${id}:${S.active ? 'on' : 'off'}:${S.t.toFixed(1)}`),
    spots: () => [...scenes.values()].flatMap(S => S.spots.map(sp => [+sp.p.x.toFixed(1), +sp.p.z.toFixed(1)])),
  };
}
