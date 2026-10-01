// OWNER: combat engineer. (user r13c) Production lightning for Electro: replaces the 1 px LineBasicMaterial bolts.
//
//  strike(from, to, opts)  a branching bolt: midpoint-displaced main channel + forked branches, drawn as camera-facing
//                          ribbons (one draw per bolt: all strips in one geometry). The fragment shader gives every
//                          ribbon a white-hot core and a wide blue halo (HDR values -> the bloom pass does the glow).
//                          The channel RE-STRIKES (new jitter) a few times over its life and flickers, then afterglows.
//  arc(a, b, opts)         a short thin arc (body aura, sparks between hands)
//  ring(pos, r, opts)      a ground shockwave ring that expands and fades
//  scorch(pos, r)          a dark burn decal with glowing embers that cools over ~10 s
//  telegraph(pos, r, dur)  a warning circle on the ground that tightens until the strike
//  surge(pos, opts)        an expanding wall of ground lightning (the boss's grid surge): returns a handle {r, alive}
// All world space; update(dt, camera) once per frame. Pools: no per-strike allocation after warm-up.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3();
const CORE = new THREE.Color(5.5, 8.5, 14), HALO = new THREE.Color(0.35, 1.6, 4.2);

// ---------------------------------------------------------------- ribbon bolt
const boltMat = () => new THREE.ShaderMaterial({
  uniforms: { uCore: { value: CORE.clone() }, uHalo: { value: HALO.clone() }, uI: { value: 1 } },
  vertexShader: /* glsl */`
    attribute vec2 aUv; attribute float aW; varying vec2 vUv; varying float vW;
    void main() { vUv = aUv; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCore, uHalo; uniform float uI; varying vec2 vUv; varying float vW;
    void main() {
      float d = abs(vUv.y * 2.0 - 1.0);
      float core = exp(-d * d * 60.0), halo = exp(-d * d * 3.5) * 0.55;
      float taper = smoothstep(0.0, 0.06, vUv.x) * (1.0 - 0.55 * smoothstep(0.7, 1.0, vUv.x));
      vec3 c = (uCore * core * vW + uHalo * halo) * taper * uI;
      gl_FragColor = vec4(c, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
});

function channel(from, to, depth, jag, out) { // midpoint displacement, returns array of Vector3 (reuses `out`)
  out.length = 0; out.push(from.clone(), to.clone());
  let off = from.distanceTo(to) * jag;
  for (let k = 0; k < depth; k++) {
    for (let i = out.length - 1; i > 0; i--) {
      const p = out[i - 1], q = out[i];
      _d.subVectors(q, p); const L = _d.length(); _d.divideScalar(L || 1);
      _s.set(0, 1, 0); if (Math.abs(_d.y) > 0.9) _s.set(1, 0, 0);
      _t.crossVectors(_d, _s).normalize(); _s.crossVectors(_t, _d);
      const m = p.clone().add(q).multiplyScalar(0.5).addScaledVector(_t, rnd(-off, off)).addScaledVector(_s, rnd(-off, off));
      out.splice(i, 0, m);
    }
    off *= 0.52;
  }
  return out;
}

class Bolt {
  constructor(scene) {
    this.max = 420; // vertices
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3); this.uv = new Float32Array(this.max * 2); this.w = new Float32Array(this.max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aW', new THREE.BufferAttribute(this.w, 1).setUsage(THREE.DynamicDrawUsage));
    this.idx = new Uint16Array(this.max * 3); g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g; this.mat = boltMat();
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 23; this.mesh.visible = false;
    this.mesh.name = 'electro-bolt'; scene.add(this.mesh);
    this.strips = []; this.life = 0; this.t = 0; this.paths = [];
  }
  fire(from, to, o) {
    this.from = from.clone(); this.to = to.clone(); this.o = o;
    this.life = o.life; this.t = 0; this.nextRe = 0; this.mesh.visible = true;
    this.mat.uniforms.uCore.value.copy(o.core || CORE); this.mat.uniforms.uHalo.value.copy(o.halo || HALO);
    this.restrike();
  }
  restrike() {
    const o = this.o, L = this.from.distanceTo(this.to);
    const depth = L > 12 ? 6 : L > 3 ? 5 : 4;
    const main = channel(this.from, this.to, depth, o.jag, this.paths[0] || (this.paths[0] = []));
    this.strips.length = 0; this.strips.push({ pts: main, w: o.width, k: 1 });
    for (let b = 0; b < o.branches; b++) {
      const i0 = Math.floor(rnd(0.15, 0.75) * (main.length - 1)), p = main[i0];
      _d.subVectors(this.to, this.from).normalize();
      const dir = _a.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().lerp(_d, 0.45).normalize();
      const end = _b.copy(p).addScaledVector(dir, L * rnd(0.12, 0.32));
      const pts = channel(p, end, Math.max(3, depth - 2), o.jag * 1.2, this.paths[b + 1] || (this.paths[b + 1] = []));
      this.strips.push({ pts, w: o.width * rnd(0.35, 0.55), k: 0.7 });
    }
  }
  build(camPos) {
    let v = 0, n = 0;
    for (const S of this.strips) {
      const P = S.pts, N = P.length; if (v + N * 2 > this.max) break;
      const base = v;
      for (let i = 0; i < N; i++) {
        const p = P[i], q = P[Math.min(N - 1, i + 1)], r = P[Math.max(0, i - 1)];
        _t.subVectors(q, r).normalize();
        _c.subVectors(camPos, p).normalize();
        _s.crossVectors(_t, _c); const sl = _s.length(); if (sl < 1e-4) _s.set(0, 1, 0); else _s.divideScalar(sl);
        const w = S.w * (1 - 0.5 * (i / (N - 1))); // thinner toward the tip
        for (const sd of [-1, 1]) {
          this.pos[v * 3] = p.x + _s.x * w * sd; this.pos[v * 3 + 1] = p.y + _s.y * w * sd; this.pos[v * 3 + 2] = p.z + _s.z * w * sd;
          this.uv[v * 2] = i / (N - 1); this.uv[v * 2 + 1] = sd < 0 ? 0 : 1; this.w[v] = S.k; v++;
        }
        if (i < N - 1) { const a = base + i * 2; this.idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], n); n += 6; }
      }
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aUv', 'aW']) this.geo.attributes[k].needsUpdate = true;
    this.geo.index.needsUpdate = true;
  }
  update(dt, camPos) {
    if (!this.mesh.visible) return false;
    this.t += dt; const o = this.o;
    if (this.t >= this.life) { this.mesh.visible = false; return false; }
    // re-strikes: a new channel every ~45 ms during the first 60 % of the life (the flicker of a real discharge)
    if (this.t < this.life * 0.6 && this.t >= this.nextRe) { this.nextRe = this.t + rnd(0.03, 0.06); if (this.t > 0) this.restrike(); }
    const u = this.t / this.life;
    const flick = u < 0.6 ? 0.75 + 0.5 * Math.random() : 1;
    this.mat.uniforms.uI.value = o.intensity * flick * (u < 0.6 ? 1 : Math.pow(1 - (u - 0.6) / 0.4, 2));
    this.build(camPos);
    return true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- ground decals (ring / scorch / telegraph / surge)
const ringMat = () => new THREE.ShaderMaterial({
  uniforms: { uR: { value: 0.5 }, uW: { value: 0.25 }, uI: { value: 1 }, uCol: { value: new THREE.Color(0.6, 2.3, 5.2) }, uT: { value: 0 }, uKind: { value: 0 } },
  // vP: plane coords (the geometry is pre-rotated flat, so position.xz); vD: view distance (rings fade near the lens —
  // a ground ring sweeping under the camera at grazing angles would otherwise flood the frame through the bloom)
  vertexShader: `varying vec2 vP; varying float vD; void main() { vP = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`
    uniform float uR, uW, uI, uT, uKind; uniform vec3 uCol; varying vec2 vP; varying float vD;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      float r = length(vP), a = atan(vP.y, vP.x);
      float band = exp(-pow((r - uR) / max(uW, 1e-3), 2.0));
      // crackle: angular noise breaks the ring into jagged filaments
      float cr = 0.55 + 0.45 * sin(a * 23.0 + uT * 31.0) * sin(a * 7.0 - uT * 13.0 + r * 3.0);
      vec3 c = uCol * band * cr;
      if (uKind > 0.5) c += uCol * 0.05 * smoothstep(uR, 0.0, r) * (0.6 + 0.4 * sin(uT * 18.0)); // telegraph: faint filled disc
      gl_FragColor = vec4(c * uI * smoothstep(1.5, 9.0, vD), 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, fog: false,
});
function scorchTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(8,8,10,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2; let x = 64, y = 64; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.cos(a + rnd(-0.6, 0.6)) * 9; y += Math.sin(a + rnd(-0.6, 0.6)) * 9; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createLightning(scene) {
  const bolts = [], live = [], decals = [];
  let sTex = null;
  const getBolt = () => bolts.pop() || new Bolt(scene);
  const plane = (size) => { const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); return g; };

  const api = {
    strike(from, to, { width = 0.09, life = 0.28, branches = 3, jag = 0.16, intensity = 1, core, halo } = {}) {
      const b = getBolt(); b.fire(from, to, { width, life, branches, jag, intensity, core, halo }); live.push(b); return b;
    },
    arc(a, b, { width = 0.025, life = 0.12, jag = 0.22, intensity = 0.8 } = {}) { return api.strike(a, b, { width, life, branches: 0, jag, intensity }); },
    ring(pos, radius = 4, { life = 0.45, width = 0.22, intensity = 0.9, color } = {}) {
      const m = new THREE.Mesh(plane(radius * 2.4), ringMat()); m.position.copy(pos).setY(pos.y + 0.06); m.renderOrder = 22; m.frustumCulled = false;
      if (color) m.material.uniforms.uCol.value.copy(color);
      scene.add(m); decals.push({ m, kind: 'ring', t: 0, life, radius, width, intensity }); return m;
    },
    scorch(pos, radius = 2.2) {
      sTex ??= scorchTex();
      const mat = new THREE.MeshBasicMaterial({ map: sTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: 0xffffff });
      const m = new THREE.Mesh(plane(radius * 2), mat); m.position.copy(pos).setY(pos.y + 0.04); m.rotation.y = Math.random() * 6.28; m.renderOrder = 2;
      scene.add(m); decals.push({ m, kind: 'scorch', t: 0, life: 10 });
      // embers: a faint inner glow that cools
      const e = new THREE.Mesh(plane(radius * 1.4), ringMat()); e.position.copy(m.position).setY(m.position.y + 0.01); e.material.uniforms.uR.value = 0; e.material.uniforms.uW.value = radius * 0.35;
      e.material.uniforms.uCol.value.set(2.2, 1.0, 0.35); scene.add(e); decals.push({ m: e, kind: 'ember', t: 0, life: 3 });
    },
    telegraph(pos, radius = 2.6, dur = 0.6) {
      const m = new THREE.Mesh(plane(radius * 2.6), ringMat()); m.position.copy(pos).setY(pos.y + 0.07); m.renderOrder = 22; m.frustumCulled = false;
      m.material.uniforms.uKind.value = 1; scene.add(m); decals.push({ m, kind: 'tele', t: 0, life: dur, radius }); return m;
    },
    surge(pos, { speed = 13, max = 20, life, width = 0.6 } = {}) {
      const m = new THREE.Mesh(plane(max * 2.2), ringMat()); m.position.copy(pos).setY(pos.y + 0.08); m.renderOrder = 22; m.frustumCulled = false;
      scene.add(m); const h = { m, kind: 'surge', t: 0, life: life ?? max / speed, speed, max, width, r: 0, alive: true, center: pos.clone(), arcT: 0 };
      decals.push(h); return h;
    },
    update(dt, camera) {
      const cp = camera.position;
      for (let i = live.length - 1; i >= 0; i--) if (!live[i].update(dt, cp)) { bolts.push(live[i]); live.splice(i, 1); }
      for (let i = decals.length - 1; i >= 0; i--) {
        const D = decals[i]; D.t += dt; const u = Math.min(1, D.t / D.life), U = D.m.material.uniforms;
        if (U) U.uT.value = D.t;
        if (D.kind === 'ring') { U.uR.value = D.radius * (0.15 + 0.85 * (1 - Math.pow(1 - u, 3))); U.uW.value = D.width * (1 - 0.5 * u); U.uI.value = D.intensity * (1 - u); }
        else if (D.kind === 'tele') { U.uR.value = D.radius * (1 - 0.75 * u); U.uW.value = 0.08; U.uI.value = 0.35 + 0.65 * u + 0.25 * Math.sin(D.t * 40); }
        else if (D.kind === 'ember') { U.uI.value = 0.9 * (1 - u) * (0.8 + 0.2 * Math.random()); }
        else if (D.kind === 'scorch') { D.m.material.opacity = 1 - Math.max(0, (u - 0.6) / 0.4); }
        else if (D.kind === 'surge') {
          D.r = Math.min(D.max, D.t * D.speed); U.uR.value = D.r; U.uW.value = D.width; U.uI.value = 1.4 * (1 - Math.pow(u, 3));
          // jagged arcs dancing along the wave front
          D.arcT -= dt;
          if (D.arcT <= 0 && u < 0.95) {
            D.arcT = 0.03;
            for (let k = 0; k < 3; k++) {
              const a0 = Math.random() * Math.PI * 2, a1 = a0 + rnd(0.05, 0.16);
              _a.set(D.center.x + Math.cos(a0) * D.r, D.center.y + 0.1, D.center.z + Math.sin(a0) * D.r);
              _b.set(D.center.x + Math.cos(a1) * D.r, D.center.y + rnd(0.4, 1.4), D.center.z + Math.sin(a1) * D.r);
              api.arc(_a.clone(), _b.clone(), { width: 0.04, life: 0.1, intensity: 1.1 });
            }
          }
        }
        if (D.t >= D.life) { D.m.parent?.remove(D.m); D.m.geometry.dispose(); D.m.material.dispose(); decals.splice(i, 1); if (D.kind === 'surge') D.alive = false; }
      }
    },
    clear() { for (const b of live) { b.mesh.visible = false; bolts.push(b); } live.length = 0; for (const D of decals) { D.m.parent?.remove(D.m); D.m.geometry.dispose(); D.m.material.dispose(); if (D.kind === 'surge') D.alive = false; } decals.length = 0; },
    dispose() { api.clear(); for (const b of bolts) b.dispose(); bolts.length = 0; },
  };
  return api;
}
