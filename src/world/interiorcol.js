// OWNER: city agent. (user r19) Collision for an interior set (Peter's apartment, stairwell and lobby), which is built
// far outside the map. Solids are axis-aligned boxes and stair ramps in WORLD space (the builder adds the set's origin),
// each with an `on` flag so doors can open and close. It answers the same queries the city collision does, so traversal,
// the chase camera and the animator work unchanged inside:
//   collider   near(x, z, r, fn) / shape(i) / top(i, x, z) / inside(p)   (capsule push-out, player/traversal/collide.js)
//   raycast(origin, dir, max) -> { point, normal, distance, kind } | null
//   groundHeight(x, z, y?)    highest standable top <= y + 0.5; without y, ceilings (overhang) are ignored
//   covers(x, z)              (x, z) is inside the set's footprint: world queries there are answered here, not by the city
import * as THREE from 'three';

const BOX = 0, RAMP = 2;

export class InteriorCol {
  constructor() {
    this.s = [];             // { type, x0, y0, z0, x1, y1, z1, axis, yA, yB, on, over, kind }
    this.cell = 1.5; this.grid = new Map();
    this.min = new THREE.Vector3(Infinity, Infinity, Infinity); this.max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    this.sh = { type: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, cx: 0, cz: 0, rad: 0 };
    this.stamp = []; this.frame = 1;
  }
  // box(x0..x1, y0..y1, z0..z1) in world space. o.over: an overhang (ceiling slab, shelf) - ignored by groundHeight(x, z)
  // without y; o.kind: surface kind reported to raycasts
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    return this._add({ type: BOX, x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      on: o.on ?? true, over: !!o.over, kind: o.kind || 'wall' });
  }
  // stair ramp: footprint x0..x1 / z0..z1, solid from yBase up to a plane rising along `axis` (0 = x, 2 = z) from yA at the
  // min side to yB at the max side
  ramp(x0, z0, x1, z1, axis, yA, yB, yBase) {
    return this._add({ type: RAMP, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
      y0: yBase, y1: Math.max(yA, yB), axis, yA, yB, on: true, over: false, kind: 'stairs' });
  }
  _add(p) {
    const i = this.s.length; this.s.push(p); this.stamp.push(0);
    this.min.min(new THREE.Vector3(p.x0, p.y0, p.z0)); this.max.max(new THREE.Vector3(p.x1, p.y1, p.z1));
    const c = this.cell;
    for (let gx = Math.floor(p.x0 / c); gx <= Math.floor(p.x1 / c); gx++) for (let gz = Math.floor(p.z0 / c); gz <= Math.floor(p.z1 / c); gz++) {
      const k = gx * 73856093 ^ gz * 19349663; let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(i);
    }
    return i;
  }
  setOn(i, on) { if (this.s[i]) this.s[i].on = on; }
  covers(x, z, m = 1.5) { return x > this.min.x - m && x < this.max.x + m && z > this.min.z - m && z < this.max.z + m; }
  // top of solid i at (x, z)
  top(i, x, z) {
    const p = this.s[i]; if (p.type !== RAMP) return p.y1;
    const u0 = p.axis === 0 ? p.x0 : p.z0, u1 = p.axis === 0 ? p.x1 : p.z1, u = p.axis === 0 ? x : z;
    const t = Math.min(1, Math.max(0, (u - u0) / Math.max(1e-6, u1 - u0)));
    return p.yA + (p.yB - p.yA) * t;
  }
  _each(x0, z0, x1, z1, fn) {
    const c = this.cell, fr = ++this.frame;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) {
      const l = this.grid.get(gx * 73856093 ^ gz * 19349663); if (!l) continue;
      for (const i of l) {
        if (this.stamp[i] === fr) continue; this.stamp[i] = fr;
        const p = this.s[i]; if (!p.on || p.x1 < x0 || p.x0 > x1 || p.z1 < z0 || p.z0 > z1) continue;
        fn(i, p);
      }
    }
  }
  // ---- traversal collider interface (collide.js pushOutCapsule)
  near(x, z, r, fn) { this._each(x - r, z - r, x + r, z + r, i => fn(i)); }
  shape(i) {
    const p = this.s[i], sh = this.sh;
    sh.type = p.type; sh.x0 = p.x0; sh.y0 = p.y0; sh.z0 = p.z0; sh.x1 = p.x1; sh.y1 = p.y1; sh.z1 = p.z1;
    return sh;
  }
  inside(p) {
    let hit = false;
    this._each(p.x, p.z, p.x, p.z, (i, s) => { if (!hit && p.y > s.y0 + 0.05 && p.y < this.top(i, p.x, p.z) - 0.05) hit = true; });
    return hit;
  }
  // ---- world queries
  groundHeight(x, z, y) {
    let best = -Infinity;
    this._each(x, z, x, z, (i, s) => {
      if (y === undefined && s.over) return;
      const t = this.top(i, x, z);
      if (y !== undefined && t > y + 0.5) return;
      if (t > best) best = t;
    });
    return best;
  }
  raycast(origin, dir, max = 1000) {
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const ex = ox + dx * max, ez = oz + dz * max;
    let best = null, bt = max;
    const n = [0, 0, 0];
    this._each(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (i, s) => {
      // slab test against the AABB (+ the sloped top plane for ramps)
      let t0 = 0, t1 = bt, ax = -1, sg = 0;
      const lo = [s.x0, s.y0, s.z0], hi = [s.x1, s.y1, s.z1], o = [ox, oy, oz], d = [dx, dy, dz];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return; continue; }
        let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a], sa = -1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; sa = 1; }
        if (ta > t0) { t0 = ta; ax = a; sg = sa; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) return;
      }
      let nx = 0, ny = 0, nz = 0;
      if (ax >= 0) { n[0] = n[1] = n[2] = 0; n[ax] = sg; nx = n[0]; ny = n[1]; nz = n[2]; }
      if (s.type === RAMP) { // clip by the plane y <= yA + k (u - u0): f(t) = top(t) - y(t) >= 0 inside
        const u0 = s.axis === 0 ? s.x0 : s.z0, L = Math.max(1e-6, (s.axis === 0 ? s.x1 : s.z1) - u0), k = (s.yB - s.yA) / L;
        const ou = s.axis === 0 ? ox : oz, du = s.axis === 0 ? dx : dz;
        const f0 = s.yA + k * (ou - u0) - oy, fd = k * du - dy; // f(t) = f0 + fd t
        if (Math.abs(fd) < 1e-9) { if (f0 < 0) return; }
        else {
          const tp = -f0 / fd;
          if (fd > 0) { if (tp > t0) { t0 = tp; const nl = Math.hypot(k, 1); nx = s.axis === 0 ? -k / nl : 0; nz = s.axis === 2 ? -k / nl : 0; ny = 1 / nl; } }
          else if (tp < t1) t1 = tp;
          if (t0 > t1) return;
        }
      }
      if (ax < 0 && t0 === 0) return; // origin inside: ignore (never trap the camera / probes)
      if (t0 < bt) { bt = t0; best = { t: t0, nx, ny, nz, kind: s.kind }; }
    });
    if (!best) return null;
    return { point: new THREE.Vector3(ox + dx * best.t, oy + dy * best.t, oz + dz * best.t), normal: new THREE.Vector3(best.nx, best.ny, best.nz), distance: best.t, kind: best.kind };
  }
}
