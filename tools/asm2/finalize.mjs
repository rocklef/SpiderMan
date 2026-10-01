// Build step 2 of public/assets/spiderman.glb: add the SpiderRig clips to the re-rigged ASM2 mesh (build_spiderman.py).
//
//   node tools/asm2/finalize.mjs --mesh <mesh.glb> --rig <rig.glb> [--extra <author_clips.glb>] --out public/assets/spiderman.glb
//   (--extra: clips hand-keyed on the same SpiderRig by author_clips.py; only names the rig doesn't have are added)
//
// The clip channels of the previous spiderman.glb are copied verbatim (same bone names): every re-seated bone's rest
// frame is the old frame turned onto the new limb, so the old absolute local rotations reproduce the old world pose of
// each bone (the new limb segment follows it). Only the translations are adapted:
//  - non-hips bones: the old clips key their (constant) rest offsets -> dropped, so the new skeleton keeps its own
//    proportions (warns if a clip actually moves one),
//  - hips: mapped by leg length (rest ankle height + (y - old rest ankle) * new / old hip-to-ankle) so the feet stay planted,
//  - constant unit scale channels: dropped.
// Plain GLB JSON + binary chunk surgery (three is only used for the rest-pose math).
import fs from 'fs';
import * as THREE from 'three';

const argv = process.argv.slice(2);
const opt = {}; for (let i = 0; i < argv.length - 1; i += 2) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1];
for (const k of ['mesh', 'rig', 'out']) if (!opt[k]) { console.error('missing --' + k); process.exit(1); }

function readGLB(p) {
  const b = fs.readFileSync(p);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(p + ': not a GLB');
  let off = 12, json = null, bin = Buffer.alloc(0);
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + len;
  }
  return { json, bin };
}
function writeGLB(p, json, bin) {
  const pad = (buf, c) => Buffer.concat([buf, Buffer.alloc((4 - buf.length % 4) % 4, c)]);
  const jb = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), bb = pad(bin, 0);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  const ch = (t, d) => { const c = Buffer.alloc(8); c.writeUInt32LE(d.length, 0); c.writeUInt32LE(t, 4); return Buffer.concat([c, d]); };
  fs.writeFileSync(p, Buffer.concat([h, ch(0x4e4f534a, jb), ch(0x004e4942, bb)]));
}
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readFloats(g, ai) { // float accessors only (Blender clips are float)
  const a = g.json.accessors[ai], bv = g.json.bufferViews[a.bufferView], n = NCOMP[a.type];
  if (a.componentType !== 5126) throw new Error('non-float animation accessor');
  const stride = bv.byteStride || n * 4, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = g.bin.readFloatLE(base + i * stride + k * 4);
  return { data: out, n, type: a.type, count: a.count, min: a.min, max: a.max };
}

const mesh = readGLB(opt.mesh), rig = readGLB(opt.rig), extra = opt.extra ? readGLB(opt.extra) : null;
const J = mesh.json;
if (J.animations?.length) { console.warn('mesh already has', J.animations.length, 'clips: replacing them'); J.animations = []; }
const nodeByName = new Map(J.nodes.map((n, i) => [n.name, i]));
const oldNode = name => rig.json.nodes.find(n => n.name === name);

// the clips are authored against the SpiderRig root transform: both rigs must share it
const rootT = n => JSON.stringify([n?.translation || [0, 0, 0], n?.rotation || [0, 0, 0, 1], n?.scale || [1, 1, 1]].map(v => v.map(x => +x.toFixed(4))));
if (rootT(oldNode('SpiderRig')) !== rootT(J.nodes[nodeByName.get('SpiderRig')])) console.warn('WARNING: SpiderRig root transform differs', rootT(oldNode('SpiderRig')), rootT(J.nodes[nodeByName.get('SpiderRig')]));
function restY(json, name) { // world rest height of a node (Y-up)
  const parent = new Map(); json.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
  const m = new THREE.Matrix4(), t = new THREE.Matrix4();
  for (let i = json.nodes.findIndex(n => n.name === name); i !== undefined; i = parent.get(i)) {
    const n = json.nodes[i];
    t.compose(new THREE.Vector3().fromArray(n.translation || [0, 0, 0]), new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]), new THREE.Vector3().fromArray(n.scale || [1, 1, 1]));
    m.premultiply(t);
  }
  return new THREE.Vector3().setFromMatrixPosition(m).y;
}
const hipO = restY(rig.json, 'hips'), hipN = restY(J, 'hips');
const ankO = (restY(rig.json, 'foot.L') + restY(rig.json, 'foot.R')) / 2, ankN = (restY(J, 'foot.L') + restY(J, 'foot.R')) / 2;
const LEGK = (hipN - ankN) / (hipO - ankO);
const mapHips = (v, i) => i % 3 === 1 ? ankN + (v - ankO) * LEGK : v * LEGK;
console.log('rest hips/ankle old %s/%s new %s/%s -> leg scale %s', hipO.toFixed(3), ankO.toFixed(3), hipN.toFixed(3), ankN.toFixed(3), LEGK.toFixed(4));

const chunks = [J.buffers[0].byteLength ? mesh.bin : Buffer.alloc(0)];
let binLen = chunks[0].length;
function addAccessor(src, map = null) {
  const data = map ? src.data.map(map) : src.data;
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const pad = (4 - binLen % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); binLen += pad; }
  J.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: buf.length });
  chunks.push(Buffer.from(buf)); binLen += buf.length;
  const acc = { bufferView: J.bufferViews.length - 1, componentType: 5126, count: src.count, type: src.type };
  if (src.n === 1) { let mn = Infinity, mx = -Infinity; for (const v of data) { mn = Math.min(mn, v); mx = Math.max(mx, v); } acc.min = [mn]; acc.max = [mx]; }
  J.accessors.push(acc); return J.accessors.length - 1;
}

let kept = 0, droppedT = 0, droppedS = 0; const moved = new Set(), missing = new Set();
J.animations = [];
const sources = [...rig.json.animations.map(A => [rig, A])];
if (extra) { const have = new Set(rig.json.animations.map(a => a.name)); for (const A of extra.json.animations) if (!have.has(A.name)) sources.push([extra, A]); }
const timeAccs = new Map([[rig, new Map()], [extra, new Map()]]);
for (const [src, A] of sources) {
  const timeAcc = timeAccs.get(src);
  const anim = { name: A.name, channels: [], samplers: [] };
  for (const c of A.channels) {
    const name = src.json.nodes[c.target.node].name, ni = nodeByName.get(name);
    if (ni === undefined) { missing.add(name); continue; }
    const s = A.samplers[c.sampler], out = readFloats(src, s.output);
    let map = null;
    if (c.target.path === 'translation') {
      if (name !== 'hips') {
        const r = src.json.nodes[c.target.node].translation || [0, 0, 0];
        for (let i = 0; i < out.data.length; i++) if (Math.abs(out.data[i] - r[i % 3]) > 1e-3) { moved.add(A.name + ':' + name); break; }
        droppedT++; continue;
      }
      map = mapHips;
    } else if (c.target.path === 'scale') {
      if (out.data.every(v => Math.abs(v - 1) < 1e-4)) { droppedS++; continue; }
    }
    if (!timeAcc.has(s.input)) timeAcc.set(s.input, addAccessor(readFloats(src, s.input)));
    anim.samplers.push({ input: timeAcc.get(s.input), output: addAccessor(out, map), interpolation: s.interpolation || 'LINEAR' });
    anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: ni, path: c.target.path } });
    kept++;
  }
  J.animations.push(anim);
}
// suit fabric is dielectric: the Sketchfab export marks the red / blue panels ~metallic (fine under a bright studio env,
// dark tinted metal under the game's sky / city IBL). Keep their roughness maps, zero the metalness.
for (const m of J.materials || []) if (/^SpiderSuit(Blue)?$/.test(m.name) && m.pbrMetallicRoughness) m.pbrMetallicRoughness.metallicFactor = 0;
const bin = Buffer.concat(chunks);
J.buffers[0].byteLength = bin.length;
if (missing.size) console.warn('WARNING: bones missing on the new rig:', [...missing].join(','));
if (moved.size) console.warn('WARNING: clips move non-hips bone offsets (dropped):', [...moved].slice(0, 20).join(' '));
console.log('clips %d, channels kept %d, rest-offset translations dropped %d, unit scales dropped %d', J.animations.length, kept, droppedT, droppedS);
writeGLB(opt.out, J, bin);
console.log('wrote', opt.out, (fs.statSync(opt.out).size / 1e6).toFixed(1), 'MB');
