// OWNER: systems engineer. (user r14e) Peter Parker in civvies (public/assets/peter.glb, tools/peter/build_peter.py;
// Sketchfab "Peter Parker" by Player 1 The SFM Animator, CC-BY-4.0). Shown instead of Spider-Man inside the apartment.
// He has no clips of his own: every frame his 17 logical bones copy Spider-Man's (hidden, still animated) skeleton in
// character space - Qpeter = D * R * bindPeter, D = Qspidey * bindSpidey^-1 (Spider-Man's motion since his bind pose),
// R = the bind-direction alignment per limb (Peter binds in an A-pose, Spider-Man in his own pose), hips translation
// scaled by the leg-length ratio. Fingers get a relaxed curl (Mixamo binds them straight).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveBones, LOGICAL, CHILD } from '../../player/rig.js';

const URL_ = '/assets/peter.glb';
const HEIGHT = 1.75;
let loading = null;

export function loadPeter() {
  if (!loading) loading = new GLTFLoader().loadAsync(URL_).then(build).catch(e => { console.warn('[peter] model unavailable', e); return null; });
  return loading;
}

function build(gltf) {
  const root = gltf.scene, wrap = new THREE.Group(); wrap.name = 'PeterParker'; wrap.add(root);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    for (const m of [].concat(o.material)) {
      const n = (m.name || '').toLowerCase();
      // hair + brows carry alpha baked by tools/peter/prep_alpha.py: the hair cap alpha-cut (sorts with everything),
      // the brows soft-blended over the skin. The eye shell maps its cornea onto a pale-blue disc of the eye texture:
      // cut those texels in the shader, else the eyes render blank white
      if (/short|hair/.test(n)) { m.transparent = false; m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      else if (/eyebrow|lash/.test(n)) { m.transparent = true; m.depthWrite = false; m.alphaTest = 0.02; m.side = THREE.DoubleSide; m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -8; o.renderOrder = 2; o.castShadow = false; } // offset: the brow cards sit in the forehead skin
      else m.side = THREE.FrontSide;
      if (/high-poly/.test(n)) {
        const cut = 'diffuseColor.b > diffuseColor.r * 1.18 && diffuseColor.b > 0.45';
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
 if (${cut}) discard;`); };
        m.customProgramCacheKey = () => 'peter-eye-cut';
      }
      if (/high-poly/.test(n)) { m.roughness = 0.12; } // eyes
      if (/peter_parker/.test(n)) { m.roughness = Math.max(0.55, m.roughness ?? 0.6); }
      if (m.map) m.map.anisotropy = 4;
    }
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true), h = box.max.y - box.min.y;
  root.scale.multiplyScalar(HEIGHT / h); root.updateMatrixWorld(true); box.setFromObject(root, true);
  root.position.y -= box.min.y; wrap.updateMatrixWorld(true);
  const bones = resolveBones(root);
  const missing = LOGICAL.filter(k => !bones[k]);
  if (missing.length) console.warn('[peter] missing bones', missing.join(','));
  // bind data in character space (wrap frame)
  const bind = {};
  for (const k of LOGICAL) {
    const b = bones[k]; if (!b) continue;
    const d = { A: b.getWorldQuaternion(new THREE.Quaternion()), dir: null, pos: b.getWorldPosition(new THREE.Vector3()) };
    let c = CHILD[k] && bones[CHILD[k]];
    if (!c && /hand/.test(k)) c = b.children.find(x => /middle/i.test(x.name));
    if (c) d.dir = c.getWorldPosition(new THREE.Vector3()).sub(d.pos).normalize();
    bind[k] = d;
  }
  // finger curl axis per hand (bind, character space): the knuckle line (index1 -> pinky1), signed so the fingertips
  // swing toward the palm (the side the thumb sits on); stored per joint in its parent's bind frame
  const fingers = [], byName = {};
  root.traverse(o => { if (o.isBone) byName[o.name.replace(/^mixamorig:?/i, '').replace(/_\d+$/, '')] = o; });
  for (const SD of ['Left', 'Right']) {
    const i1 = byName[SD + 'HandIndex1'], p1 = byName[SD + 'HandPinky1'], t1 = byName[SD + 'HandThumb1'], hand = bones['hand' + SD[0]];
    if (!i1 || !p1 || !t1 || !hand) continue;
    const pi = i1.getWorldPosition(new THREE.Vector3()), pp = p1.getWorldPosition(new THREE.Vector3()), pt = t1.getWorldPosition(new THREE.Vector3());
    const axis = pp.clone().sub(pi).normalize(), fd = bind['hand' + SD[0]].dir || new THREE.Vector3(0, -1, 0);
    const palm = pt.sub(pi.clone().add(pp).multiplyScalar(0.5)); palm.addScaledVector(axis, -palm.dot(axis)).addScaledVector(fd, -palm.dot(fd));
    const test = fd.clone().applyAxisAngle(axis, 0.3).sub(fd);
    if (test.dot(palm) < 0) axis.negate();
    hand.traverse(o => {
      if (!o.isBone || o === hand) return;
      const n = o.name.replace(/^mixamorig:?/i, '');
      if (!/Hand(Index|Middle|Ring|Pinky|Thumb)\d/i.test(n) || /4/.test(n.replace(/_\d+$/, '').slice(-1))) return;
      const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      fingers.push({ b: o, rest: o.quaternion.clone(), thumb: /thumb/i.test(n), axis: axis.clone().applyQuaternion(pq).normalize(), j: +n.replace(/_\d+$/, '').slice(-1) });
    });
  }
  console.info('[peter] loaded', bones && Object.entries(bones).map(([k, b]) => k + '=' + (b ? b.name : '-')).join(' '));
  return { object: wrap, root, bones, bind, fingers, align: null };
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(1, 0, 0);

// alignment of Peter's bind limbs onto Spider-Man's bind directions (computed once per Spider-Man rig)
function alignFor(pe, rig) {
  const A = {};
  for (const k of LOGICAL) {
    const p = pe.bind[k], s = rig.bind[k];
    A[k] = p && s && p.dir && s.dir && /Arm|Leg/.test(k) ? new THREE.Quaternion().setFromUnitVectors(p.dir, s.dir) : new THREE.Quaternion();
  }
  // hands follow their forearm's alignment, feet their shin's (no direction of their own worth matching)
  A.handL.copy(A.lowerArmL); A.handR.copy(A.lowerArmR); A.footL.copy(A.lowerLegL); A.footR.copy(A.lowerLegR);
  return A;
}

// copy Spider-Man's current pose (rig = player rig) onto Peter
export function retarget(pe, rig) {
  if (!pe.align) {
    pe.align = alignFor(pe, rig);
    const sh = rig.bones.hips && rig.bind.hips ? rig.bones.hips : null;
    pe.hipRatio = 1;
    if (sh) { rig.object.updateMatrixWorld(true); const so = rig.object.matrixWorld.clone().invert(); const sy = _v.setFromMatrixPosition(sh.matrixWorld).applyMatrix4(so).y; pe.hipRatio = pe.bind.hips.pos.y / Math.max(0.3, sy); pe.sHip0 = sy; }
  }
  const S = rig.object, Pw = pe.object;
  S.updateMatrixWorld(true); Pw.updateMatrixWorld(true);
  const sInv = S.getWorldQuaternion(_qi).invert().clone(), pW = Pw.getWorldQuaternion(new THREE.Quaternion());
  for (const k of LOGICAL) {
    const sb = rig.bones[k], pb = pe.bones[k], bs = rig.bind[k], bp = pe.bind[k];
    if (!sb || !pb || !bs || !bp) continue;
    const sQ = sb.getWorldQuaternion(_q).premultiply(sInv);                   // Spider-Man, character space
    const D = sQ.multiply(_q2.copy(bs.A).invert());                            // his motion since bind
    const tgt = D.multiply(pe.align[k]).multiply(bp.A);                        // Peter, character space
    tgt.premultiply(pW);                                                       // -> world
    pb.parent.getWorldQuaternion(_qp).invert();
    pb.quaternion.copy(_qp.multiply(tgt));
    pb.updateMatrixWorld(true);
    if (k === 'hips') {
      // translation: Spider-Man's hips offset from his bind height, scaled to Peter
      const so = _m.copy(S.matrixWorld).invert();
      _v.setFromMatrixPosition(sb.matrixWorld).applyMatrix4(so);
      _v2.set(_v.x * pe.hipRatio, bp.pos.y + (_v.y - pe.sHip0) * pe.hipRatio, _v.z * pe.hipRatio);
      _v2.applyMatrix4(Pw.matrixWorld); pb.parent.worldToLocal(_v2); pb.position.copy(_v2); pb.updateMatrixWorld(true);
    }
  }
  // relaxed hands: a natural curl (a touch more at the outer joints, little at the thumb), about the knuckle line
  for (const f of pe.fingers) f.b.quaternion.copy(f.rest).premultiply(_q.setFromAxisAngle(f.axis, f.thumb ? 0.1 : 0.22 + 0.06 * f.j));
}
