// OWNER: city agent. (user r14c) Aviation obstruction lights — the red beacons that blink on every tall NYC roof at night
// (FAA L-864 medium-intensity red: 20-40 flashes / min, roughly synchronised per building) and the white strobes on the
// supertalls (L-865). One THREE.Points cloud: a soft sprite that keeps a minimum pixel size so the skyline twinkles even
// from across the island, additive + HDR so the bloom pass gives it the halo. Dim but visible by day.
//   createSkyLights(scene, world) -> { update(dt) }   (positions from world.buildings boxes taller than MIN_H)
import * as THREE from 'three';
import { nightK } from '../render/daynight.js';

const MIN_H = 120, STROBE_H = 280, CELL = 22;

export function createSkyLights(scene, world) {
  const boxes = world.buildings || [];
  const seen = new Map(), P = [], C = [], PH = [], K = [];
  for (const b of boxes) {
    const mn = Array.isArray(b.min) ? b.min : [b.min.x, b.min.y, b.min.z], mx = Array.isArray(b.max) ? b.max : [b.max.x, b.max.y, b.max.z];
    const top = mx[1]; if (top < MIN_H) continue;
    // one light group per tall roof (the highest box in a ~22 m cell wins), corners of its top
    const key = Math.round((mn[0] + mx[0]) / 2 / CELL) + ',' + Math.round((mn[2] + mx[2]) / 2 / CELL);
    const prev = seen.get(key); if (prev && prev.top >= top) continue;
    seen.set(key, { top, mn, mx });
  }
  let gi = 0;
  for (const { top, mn, mx } of seen.values()) {
    const ph = Math.random(), strobe = top > STROBE_H;
    const corners = [[mn[0] + 0.4, mn[2] + 0.4], [mx[0] - 0.4, mx[2] - 0.4], [mn[0] + 0.4, mx[2] - 0.4], [mx[0] - 0.4, mn[2] + 0.4]];
    const n = (mx[0] - mn[0]) * (mx[2] - mn[2]) > 500 ? 4 : 2;
    for (let i = 0; i < n; i++) { P.push(corners[i][0], top + 1.2, corners[i][1]); C.push(1, 0.08, 0.04); PH.push(ph); K.push(0); }
    if (strobe) { P.push((mn[0] + mx[0]) / 2, top + 3, (mn[2] + mx[2]) / 2); C.push(1, 1, 1); PH.push(ph); K.push(1); }
    gi++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(PH, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uNight: nightK, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aPh; attribute float aKind; uniform float uT, uNight, uPx;
      varying vec3 vCol; varying float vI;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        // red: ~30 flashes / min, a soft 0.6 s pulse; white strobe: a short 0.12 s flash every 1.5 s
        float t = uT + aPh * 2.0;
        float red = smoothstep(0.0, 0.12, fract(t / 2.0)) * (1.0 - smoothstep(0.25, 0.6, fract(t / 2.0)));
        float strobe = step(fract(t / 1.5), 0.08);
        float on = aKind > 0.5 ? strobe : red;
        vI = on * mix(0.25, 1.0, uNight);
        vCol = aCol;
        gl_PointSize = clamp(1400.0 / d, 2.2, 26.0) * uPx * (aKind > 0.5 ? 1.4 : 1.0);
        if (vI < 0.01) gl_PointSize = 0.0;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vI;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
        float core = exp(-r2 * 14.0), halo = exp(-r2 * 3.0) * 0.35;
        gl_FragColor = vec4(vCol * (core * 9.0 + halo * 2.5) * vI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(g, mat); pts.name = 'skyLights'; pts.frustumCulled = false; pts.renderOrder = 6;
  scene.add(pts);
  console.info('[skylights]', gi, 'roofs,', P.length / 3, 'lights');
  return {
    update(dt) { mat.uniforms.uT.value += dt; mat.uniforms.uPx.value = Math.min(devicePixelRatio || 1, 1.5); },
    count: P.length / 3,
  };
}
