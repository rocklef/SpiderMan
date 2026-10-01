// OWNER: traversal engineer. High-speed traversal FX (user r13 "high octane web swinging").
//  - wind streaks: a pool of air particles fixed in the world around / ahead of Spider-Man; each is drawn as a short
//    motion-blurred streak along his velocity (shutter ~1/30 s), so at swing / dive speeds the air visibly rips past.
//    Fades in from ~16 m/s, never on foot / walls.
//  - speed lines: a screen-space canvas overlay of thin radial lines at the frame edges past ~34 m/s (anime / PS5
//    "hyper speed" read), breathing with speed; pointer-events none, composited with `screen`.
// createSpeedFx(scene) -> { update(dt, pos, vel, mode, camera), dispose() }. ?speedfx=0 disables both.
import * as THREE from 'three';

const N = 220, SHUTTER = 1 / 28, RADIUS = 9, AHEAD = 26;
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createSpeedFx(scene) {
  const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('speedfx') === '0';
  const P = new Float32Array(N * 3), pos = new Float32Array(N * 6), col = new Float32Array(N * 6), life = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false; lines.renderOrder = 30; lines.name = 'SpeedStreaks'; lines.visible = false;
  scene.add(lines);
  let seeded = false, k = 0;
  const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3();

  function spawn(i, center, dir, initial) {
    // a disc of points across the travel direction, ahead of him (initially spread along the whole tube)
    _r.set(-dir.z, 0, dir.x); if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0); _r.normalize();
    _u.crossVectors(dir, _r).normalize();
    const a = Math.random() * Math.PI * 2, rr = 1.6 + Math.sqrt(Math.random()) * RADIUS;
    const along = initial ? (Math.random() * 1.4 - 0.4) * AHEAD : AHEAD * (0.7 + Math.random() * 0.5);
    _c.copy(center).addScaledVector(dir, along).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr * 0.75);
    P[i * 3] = _c.x; P[i * 3 + 1] = _c.y; P[i * 3 + 2] = _c.z; life[i] = 0;
  }

  // ---------------------------------------------------------------- screen speed lines
  let cvs = null, cx = null, lineK = 0, t = 0, lastUpd = 0;
  const SL = Array.from({ length: 64 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), w: 0.6 + Math.random() * 1.4, s: 0.5 + Math.random(), ph: Math.random() * 10 }));
  function ensureCanvas() {
    if (cvs || typeof document === 'undefined') return;
    cvs = document.createElement('canvas'); cvs.id = 'speedlines';
    Object.assign(cvs.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4, mixBlendMode: 'screen', opacity: 0 });
    document.body.appendChild(cvs); cx = cvs.getContext('2d');
    // paused / menus / photo mode stop calling update(): never leave the lines frozen over the screen
    setInterval(() => { if (performance.now() - lastUpd > 250 && cvs.style.opacity !== '0') cvs.style.opacity = '0'; }, 200);
  }
  function drawLines(dt) {
    ensureCanvas(); if (!cvs) return;
    cvs.style.opacity = lineK.toFixed(3);
    if (lineK < 0.01) return;
    const W = Math.round(innerWidth / 2), H = Math.round(innerHeight / 2); // half-res: soft lines, cheap
    if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
    cx.clearRect(0, 0, W, H);
    const mx = W / 2, my = H / 2, R = Math.hypot(mx, my);
    t += dt;
    cx.lineCap = 'round';
    for (const L of SL) {
      // each line flickers in and out (different phases), lives in the outer ring of the frame
      const f = 0.5 + 0.5 * Math.sin(t * 9 * L.s + L.ph); if (f < 0.35) continue;
      if (Math.sin(t * 2.3 * L.s + L.ph * 3) > 0.6) { L.a = Math.random() * Math.PI * 2; L.r = Math.random(); }
      const r0 = R * (0.62 + 0.22 * L.r), r1 = r0 + R * (0.12 + 0.2 * L.s) * (0.6 + 0.4 * lineK);
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      const gr = cx.createLinearGradient(mx + ca * r0, my + sa * r0, mx + ca * r1, my + sa * r1);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(235,242,255,${(0.55 * f).toFixed(3)})`);
      cx.strokeStyle = gr; cx.lineWidth = L.w;
      cx.beginPath(); cx.moveTo(mx + ca * r0, my + sa * r0); cx.lineTo(mx + ca * r1, my + sa * r1); cx.stroke();
    }
  }

  return {
    update(dt, center, vel, mode, camera) {
      if (off) return;
      lastUpd = performance.now();
      const sp = vel.length();
      const flying = mode === 'swing' || mode === 'air' || mode === 'zip';
      const want = flying ? smooth(sp, 16, 40) : 0;
      k += (want - k) * (1 - Math.exp(-(want > k ? 5 : 3) * dt));
      lineK += ((flying ? smooth(sp, 34, 52) : 0) * 0.85 - lineK) * (1 - Math.exp(-4 * dt));
      drawLines(dt);
      lines.visible = k > 0.01;
      if (!lines.visible) { seeded = false; return; }
      _d.copy(vel); if (sp > 1e-3) _d.divideScalar(sp); else _d.set(0, 0, 1);
      if (!seeded) { for (let i = 0; i < N; i++) spawn(i, center, _d, true); seeded = true; }
      const camPos = camera.position;
      const cr = 0.95 * k, cg = 0.98 * k, cb = 1.0 * k;
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        _c.set(P[i3], P[i3 + 1], P[i3 + 2]);
        // recycle once passed behind the camera or drifted out of the tube
        const rel = _r.copy(_c).sub(center), along = rel.dot(_d), lat = rel.addScaledVector(_d, -along).length();
        if (along < -10 || lat > RADIUS * 1.6 || _c.distanceToSquared(camPos) < 0.8) { spawn(i, center, _d, false); _c.set(P[i3], P[i3 + 1], P[i3 + 2]); }
        life[i] += dt;
        const fade = Math.min(1, life[i] * 4); // new streaks fade in (no pop at the far end of the tube)
        const L = Math.min(sp * SHUTTER, 2.4);
        const o = i * 6;
        pos[o] = _c.x; pos[o + 1] = _c.y; pos[o + 2] = _c.z;
        pos[o + 3] = _c.x + _d.x * L; pos[o + 4] = _c.y + _d.y * L; pos[o + 5] = _c.z + _d.z * L;
        // tail end black (additive -> invisible), head end lit: a tapered streak
        col[o] = 0; col[o + 1] = 0; col[o + 2] = 0;
        col[o + 3] = cr * fade; col[o + 4] = cg * fade; col[o + 5] = cb * fade;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(lines); g.dispose(); mat.dispose(); cvs?.remove(); },
  };
}
