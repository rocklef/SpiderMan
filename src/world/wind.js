// OWNER: city agent. (user r14c) Shared wind for the vegetation: trees used to sway ~6 cm and read as static bushes.
// windSway(p, instanceMatrix, flutterK, seedP) -> instance-local offset:
//  - gust fronts travel across the city along the wind (~25 m/s) with a slow swell, so neighbouring trees move together
//    and a gust visibly rolls down an avenue;
//  - the whole tree bends like a cantilever (offset ~ h^2: ~0.3 m at the top of a 12 m tree in a gust) along the wind,
//    plus a smaller cross-wind sway at its own phase; the SAME function runs on trunks, near leaf cards and far crowns,
//    so the crown never separates from its trunk;
//  - fast leaf-spray flutter on the outer cards only (flutterK).
// Wind is given in world space and rotated into each instance's local frame (uniform scale + yaw instances).
import * as THREE from 'three';

export const WIND = {
  uWT: { value: 0 },
  uWDir: { value: new THREE.Vector3(0.82, 0, 0.57).normalize() },
  uWStr: { value: 1 },
};

export const WIND_GLSL = /* glsl */`
uniform float uWT; uniform vec3 uWDir; uniform float uWStr;
vec3 windSway(vec3 p, mat4 im, float flutterK, vec3 seedP) {
  vec3 ip = im[3].xyz;
  float ph = dot(ip.xz, vec2(0.13, 0.17));
  float front = dot(ip.xz, uWDir.xz) * 0.035 - uWT * 0.9;
  float gust = clamp(0.45 + 0.35 * sin(front) + 0.2 * sin(front * 2.3 + 1.7), 0.1, 1.0) * uWStr;
  float h = max(p.y, 0.0);
  float bend = h * h * 0.0032;
  mat3 m = mat3(im); float s2 = max(dot(m[0], m[0]), 1e-4);
  vec3 wl = (transpose(m) * uWDir) / s2;
  vec3 sl = (transpose(m) * vec3(-uWDir.z, 0.0, uWDir.x)) / s2;
  vec3 o = wl * bend * gust * (0.55 + 0.3 * sin(uWT * 1.1 + ph)) + sl * bend * 0.22 * gust * sin(uWT * 1.7 + ph * 1.3);
  o += vec3(sin(uWT * 6.3 + dot(seedP, vec3(3.1, 1.7, 2.3))), 0.6 * sin(uWT * 5.1 + dot(seedP, vec3(1.9, 2.9, 1.3))), cos(uWT * 5.7 + dot(seedP, vec3(2.3, 1.1, 3.7))))
       * 0.06 * flutterK * (0.4 + gust);
  return o;
}`;

// inject into a vertex shader (after #include <common>) + share the uniforms
export function addWind(sh) {
  Object.assign(sh.uniforms, WIND);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_GLSL);
}
export function updateWind(t) { WIND.uWT.value = t; }
