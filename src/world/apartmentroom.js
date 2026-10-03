// OWNER: city agent. (user r14d / r19) Peter Parker's apartment — The Amazing Spider-Man 2 inspired (the cluttered
// student-scientist look), built procedurally: every prop is primitive geometry + canvas-painted textures, all artwork
// is original (no film stills, no real brands / logos).
//   buildApartment(origin) -> { group, col (InteriorCol), doors, rooms, lamps, window: {mat}, spots, pois }
// (user r19) the whole flat is walkable: bedroom, hallway, living room, kitchen, bathroom, utility closet, a two-flight
// stairwell down to the building lobby and its street door. Every wall / floor / large piece of furniture is also a
// collision solid (world/interiorcol.js); doors swing on their hinges and their solid switches off while open.
// Local frame (metres): apartment floor y = 0, +Z = the street (window wall), +X = east. Lobby floor y = -3.2.
//   bedroom x -2.7..2.7, z -2.3..2.3  · living x 2.7..8.7, z -2.3..2.3  · hallway x -2.7..8.7, z -3.7..-2.3
//   bathroom x -2.7..0.5, z -6.3..-3.7 · closet x 0.5..3.2 · kitchen x 3.2..8.7 (same z)
//   stairwell x -5.4..-2.7, z -8.0..-2.3 (top landing at y 0, mid landing y -1.6) · lobby x -5.4..-2.7, z -3.6..2.6
import * as THREE from 'three';
import { InteriorCol } from './interiorcol.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const W = 5.4, D = 4.6, HT = 2.9, hw = W / 2, hd = D / 2;   // the bedroom (as before)
const LY = -3.2;                                              // lobby floor
let SEED = 1337;
const rnd = () => ((SEED = (SEED * 16807) % 2147483647) / 2147483647);
const pick = a => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------- canvas helpers
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function noise(g, w, h, a = 0.08, n = 4000, col = '0,0,0') { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }
const planksTex = (r = 120, gg = 78, b = 46) => canvas(1024, 1024, (g, w, h) => {
  const rows = 8, ph = h / rows;
  for (let rr = 0; rr < rows; rr++) {
    let x = -rnd() * 300;
    while (x < w) {
      const L = 260 + rnd() * 420, t = 0.75 + rnd() * 0.3;
      g.fillStyle = `rgb(${Math.round(r * t)},${Math.round(gg * t)},${Math.round(b * t)})`; g.fillRect(x, rr * ph, L, ph);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(60,35,18,${0.08 + rnd() * 0.12})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y0 = rr * ph + rnd() * ph; g.moveTo(x, y0); g.bezierCurveTo(x + L * 0.3, y0 + rnd() * 8 - 4, x + L * 0.6, y0 + rnd() * 8 - 4, x + L, y0 + rnd() * 6 - 3); g.stroke(); }
      g.fillStyle = 'rgba(30,18,8,0.75)'; g.fillRect(x, rr * ph, 3, ph); x += L;
    }
    g.fillStyle = 'rgba(30,18,8,0.8)'; g.fillRect(0, rr * ph, w, 3);
  }
  noise(g, w, h, 0.07, 9000); noise(g, w, h, 0.05, 3000, '255,240,220');
});
const brickTex = () => canvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#b9ab98'; g.fillRect(0, 0, w, h);
  const bh = 34, bw = 92;
  for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) {
    const x = c * bw + (r % 2) * bw / 2 + 4, y = r * bh + 4, t = 0.7 + rnd() * 0.45;
    g.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(70 * t)},${Math.round(52 * t)})`; g.fillRect(x, y, bw - 8, bh - 8);
    if (rnd() < 0.3) { g.fillStyle = 'rgba(230,220,200,0.18)'; g.fillRect(x, y, bw - 8, bh - 8); } // old paint residue
  }
  noise(g, w, h, 0.18, 14000); noise(g, w, h, 0.1, 5000, '255,250,235');
});
const paintTex = (hex) => canvas(512, 512, (g, w, h) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); noise(g, w, h, 0.04, 6000); noise(g, w, h, 0.03, 2500, '255,255,255'); });
// two-tone wall: lower `split` (0..1 of the texture height, bottom) in colour a with a chair rail, upper in b
const wainscotTex = (a, b, split = 0.36) => canvas(512, 1024, (g, w, h) => {
  g.fillStyle = b; g.fillRect(0, 0, w, h); const y = h * (1 - split);
  g.fillStyle = a; g.fillRect(0, y, w, h - y);
  for (let x = 24; x < w; x += 128) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3; g.strokeRect(x, y + 40, 90, h - y - 80); }
  g.fillStyle = 'rgba(240,235,220,0.9)'; g.fillRect(0, y - 10, w, 14); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 4, w, 3);
  noise(g, w, h, 0.05, 7000); noise(g, w, h, 0.03, 3000, '255,255,255');
});
// subway / square tiles; `upper` paint above `split` (fraction from the bottom), 1 = tiles all the way up
const tileTex = (tile, grout, { size = 64, brick = true, upper = null, split = 1, sq = false } = {}) => canvas(512, 1024, (g, w, h) => {
  const y0 = h * (1 - split);
  if (upper) { g.fillStyle = upper; g.fillRect(0, 0, w, y0); noise(g, w, y0, 0.04, 3000); }
  g.fillStyle = grout; g.fillRect(0, y0, w, h - y0);
  const th = sq ? size : size / 2;
  for (let r = 0; y0 + r * th < h; r++) for (let c = -1; c * size < w; c++) {
    const x = c * size + (brick && r % 2 ? size / 2 : 0), y = y0 + r * th, t = 0.92 + rnd() * 0.1;
    g.fillStyle = tile; g.globalAlpha = 1; g.fillRect(x + 2, y + 2, size - 4, th - 4);
    g.fillStyle = `rgba(255,255,255,${0.12 * t})`; g.fillRect(x + 4, y + 3, size - 10, 3);
  }
  if (upper) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y0 - 2, w, 6); }
  noise(g, w, h, 0.04, 3000);
});
const checkerTex = (a, b, n = 8) => canvas(512, 512, (g, w, h) => {
  const s = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, h); g.stroke(); g.beginPath(); g.moveTo(0, k * s); g.lineTo(w, k * s); g.stroke(); }
  noise(g, w, h, 0.08, 7000); noise(g, w, h, 0.05, 2000, '255,255,255');
});
const hexTex = (a, b) => canvas(512, 512, (g, w, h) => { // small hex mosaic (bathroom / lobby), a few accent tiles
  g.fillStyle = '#6f6a62'; g.fillRect(0, 0, w, h); const r = 13, dx = r * Math.sqrt(3);
  for (let row = -1; row * r * 1.5 < h + r; row++) for (let col = -1; col * dx < w + dx; col++) {
    const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * r * 1.5; g.fillStyle = rnd() < 0.07 ? b : a;
    g.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(an) * (r - 1.2), cy + Math.sin(an) * (r - 1.2)); } g.closePath(); g.fill();
  }
  noise(g, w, h, 0.06, 5000);
});
const fabricTex = (a, b, plaid = false) => canvas(512, 512, (g, w, h) => {
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  if (plaid) { g.globalAlpha = 0.45; g.fillStyle = b; for (let i = 0; i < w; i += 64) { g.fillRect(i, 0, 22, h); g.fillRect(0, i, w, 22); } g.globalAlpha = 0.25; g.fillStyle = '#e8e0c8'; for (let i = 30; i < w; i += 64) { g.fillRect(i, 0, 4, h); g.fillRect(0, i, w, 4); } g.globalAlpha = 1; }
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + 0.03 * (y % 4 === 0)})`; g.fillRect(0, y, w, 1); }
  noise(g, w, h, 0.06, 5000);
});
function poster(title, sub, bg, fg, art) {
  return canvas(512, 720, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); art(g, w, h);
    g.fillStyle = fg; g.font = '900 64px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillText(title, w / 2, h - 110);
    g.font = '600 26px Arial, sans-serif'; g.fillText(sub, w / 2, h - 60);
    noise(g, w, h, 0.07, 5000);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  });
}
function clipping(i) { // newspaper clippings / notes / blueprints / photos for the research wall (original content)
  const kinds = ['news', 'news', 'news', 'photo', 'photo', 'note', 'blueprint', 'map', 'news'];
  const kind = kinds[i % kinds.length];
  const HEAD = ['OSCORP EXEC VANISHES', 'GENETICS LAB FIRE', 'WHO IS SPIDER-MAN?', 'CROSS-SPECIES RESEARCH HALTED', 'MYSTERY ON FLIGHT 0816',
    'POWER GRID FAILURE', 'ROOSEVELT STATION SEALED', 'BUGLE: MENACE OR HERO?', 'OSBORN HEIR TAKES OVER', 'SCIENTIST\'S NOTES MISSING', 'ELECTRICAL WORKER IN COMA'];
  const NOTE = ['WHY DID DAD LEAVE?', 'decay rate?? -> 4.7%', 'TALK TO HARRY', 'ROOSEVELT - subway', 'tensile x3!!', 'Gwen 8pm', 'project: SPIDER'];
  return canvas(256, kind === 'note' ? 256 : 320, (g, w, h) => {
    if (kind === 'news') {
      g.fillStyle = '#e7e0cf'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a'; g.font = '900 24px Georgia, serif'; g.textAlign = 'left';
      const words = HEAD[i % HEAD.length].split(' '); let y = 34, line = '';
      for (const wd of words) { if (g.measureText(line + wd).width > w - 24) { g.fillText(line, 12, y); y += 26; line = ''; } line += wd + ' '; } g.fillText(line, 12, y);
      g.fillStyle = '#777'; g.fillRect(12, y + 14, w - 24, 90 + rnd() * 30);
      for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(20,20,20,${rnd() * 0.5})`; g.beginPath(); g.arc(12 + rnd() * (w - 24), y + 14 + rnd() * 110, 1.4, 0, 6.28); g.fill(); }
      g.fillStyle = '#333'; for (let l = y + 140; l < h - 8; l += 9) g.fillRect(12, l, (w - 24) * (0.7 + rnd() * 0.3), 3);
    } else if (kind === 'photo') {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      const sky = g.createLinearGradient(0, 14, 0, h - 70); sky.addColorStop(0, pick(['#f2a65a', '#4a6fa5', '#2b2d42', '#c97b63'])); sky.addColorStop(1, '#1d1d24');
      g.fillStyle = sky; g.fillRect(14, 14, w - 28, h - 84);
      g.fillStyle = 'rgba(10,10,14,0.92)'; let x = 14; while (x < w - 14) { const bw = 12 + rnd() * 30, bh = 40 + rnd() * 140; g.fillRect(x, h - 70 - bh, bw, bh); x += bw + 2; }
      g.fillStyle = '#333'; g.font = 'italic 20px "Segoe Print", cursive'; g.fillText(pick(['the bridge', 'roof, 2am', 'midtown', 'Queens', 'Gwen & me', 'the view']), 22, h - 30);
    } else if (kind === 'note') {
      g.fillStyle = pick(['#f7e76a', '#f6c5d8', '#bfe5f5']); g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = 'bold 30px "Segoe Print", "Comic Sans MS", cursive'; const t = NOTE[i % NOTE.length].split(' ');
      let y = 60; let line = ''; for (const wd of t) { if (g.measureText(line + wd).width > w - 30) { g.fillText(line, 16, y); y += 40; line = ''; } line += wd + ' '; } g.fillText(line, 16, y);
    } else if (kind === 'blueprint') {
      g.fillStyle = '#1d4e89'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(220,235,255,0.85)'; g.lineWidth = 2;
      for (let k = 0; k < w; k += 16) { g.globalAlpha = 0.18; g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } g.globalAlpha = 1;
      g.strokeRect(40, 80, 176, 90); g.beginPath(); g.arc(128, 125, 30, 0, 6.28); g.stroke(); g.strokeRect(60, 200, 136, 40);
      g.fillStyle = '#dbe9ff'; g.font = '16px monospace'; g.fillText('WEB-SHOOTER v4', 40, 40); g.fillText('cartridge 2.2ml', 40, 290);
    } else {
      g.fillStyle = '#e9e4d2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9db2a2'; g.lineWidth = 6;
      for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(rnd() * w, 0); g.lineTo(rnd() * w, h); g.stroke(); }
      g.strokeStyle = '#c0392b'; g.lineWidth = 4; g.beginPath(); g.arc(w * 0.6, h * 0.4, 24, 0, 6.28); g.stroke();
    }
    noise(g, w, h, 0.08, 1500);
  });
}
const screenTex = (kind) => canvas(512, 320, (g, w, h) => {
  if (kind === 'code') {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h); g.font = '13px monospace';
    const L = ['// polymer tensile model', 'k = 0.0471 * decay(t)', 'for (s of strands)', '  s.tension = E * strain', 'if (load > 380) warn()', 'viscosity -> 2.4 cP', '// TODO ask Dr. Connors', 'fluid.ratio = [3, 1, 0.2]'];
    L.forEach((t, i) => { g.fillStyle = ['#7ee787', '#79c0ff', '#d2a8ff', '#ffa657'][i % 4]; g.fillText(t, 16, 28 + i * 22); });
    g.strokeStyle = '#3fb950'; g.beginPath(); for (let x = 0; x < 200; x++) g.lineTo(290 + x, 230 - 70 * Math.exp(-x / 60) * Math.cos(x / 9)); g.stroke();
  } else if (kind === 'game') { // a (fictional) racing game paused on the TV
    const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#ff8a3d'); sky.addColorStop(1, '#5b2a6e'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.55);
    g.fillStyle = '#1b1530'; let x = 0; while (x < w) { const bw = 14 + rnd() * 28, bh = 30 + rnd() * 90; g.fillRect(x, h * 0.55 - bh, bw, bh); x += bw; }
    g.fillStyle = '#2b2b33'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.42, h * 0.55); g.lineTo(w * 0.58, h * 0.55); g.lineTo(w, h); g.fill();
    g.strokeStyle = '#f5d76e'; g.lineWidth = 4; g.setLineDash([18, 16]); g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * 0.56); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#c0392b'; g.fillRect(w / 2 - 34, h - 70, 68, 34); g.fillStyle = '#111'; g.fillRect(w / 2 - 30, h - 50, 60, 12);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w / 2 - 90, 24, 180, 44); g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('PAUSED', w / 2, 56);
    g.textAlign = 'left'; g.font = 'bold 18px monospace'; g.fillText('LAP 2/3   01:42.6', 16, h - 16);
  } else {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1b2a3a'); gr.addColorStop(1, '#0b1018'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0392b'; g.font = 'bold 22px Arial'; g.fillText('DAILY BUGLE  •  photo submissions', 18, 34);
    for (let k = 0; k < 6; k++) { g.fillStyle = `hsl(${200 + k * 20},30%,${30 + k * 6}%)`; g.fillRect(18 + (k % 3) * 160, 60 + Math.floor(k / 3) * 120, 150, 108); }
  }
});
const doorTex = (hex) => canvas(256, 512, (g, w, h) => { // 4-panel door
  g.fillStyle = hex; g.fillRect(0, 0, w, h);
  for (const [x, y, ww, hh] of [[28, 30, 84, 190], [144, 30, 84, 190], [28, 270, 84, 210], [144, 270, 84, 210]]) {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y, ww, hh); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, y + 6, ww - 12, hh - 12);
    g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x + 6, y + hh - 10, ww - 12, 4);
  }
  noise(g, w, h, 0.05, 3000);
});
const photoTex = (seed) => canvas(256, 200, (g, w, h) => { // framed family / friends snapshot (silhouettes, original)
  SEED = 4000 + seed;
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, pick(['#9cc3d5', '#e9b872', '#b7c9a8', '#d7a9a9'])); bg.addColorStop(1, pick(['#4f6d7a', '#7a5c3b', '#5a6e4f']));
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) { const x = w * (k + 1) / (n + 1); g.fillStyle = pick(['#3b2a20', '#2a2a35', '#5b3a29']); g.beginPath(); g.arc(x, h * 0.42, 22, 0, 6.28); g.fill(); g.fillRect(x - 30, h * 0.55, 60, h * 0.5); }
  noise(g, w, h, 0.08, 1500);
});
const blindsTex = () => canvas(256, 256, (g, w, h) => { // closed venetian blinds lit from outside
  for (let y = 0; y < h; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#fbf6ea'); gr.addColorStop(0.8, '#d9cfbb'); gr.addColorStop(1, '#8f8676'); g.fillStyle = gr; g.fillRect(0, y, w, 16); }
});

// ---------------------------------------------------------------- the apartment
export function buildApartment(origin) {
  SEED = 1337;
  const group = new THREE.Group(); group.name = 'peterApartment'; group.position.copy(origin);
  const col = new InteriorCol();
  const O = origin;
  const solid = (x0, y0, z0, x1, y1, z1, o) => col.box(O.x + x0, O.y + y0, O.z + z0, O.x + x1, O.y + y1, O.z + z1, o);
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const add = (geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, ry, rx, rz);
  const cyl = (r0, r1, h, mat, x, y, z, seg = 16) => add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z);
  const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => { const m = add(new THREE.PlaneGeometry(w, h), mat, x, y, z, ry, rx); m.castShadow = false; return m; };
  // furniture block: visual box + collision solid (x0..x1, y0..y1, z0..z1 in local metres)
  const blockC = (x0, y0, z0, x1, y1, z1, kind = 'equipment') => solid(x0, y0, z0, x1, y1, z1, { kind });
  const lamps = [];

  // ---- materials (one per room surface)
  const tex = (t, rx, ry) => { t.repeat.set(rx, ry); return t; };
  const P = {
    bed: M({ map: tex(paintTex('#6f8a86'), 2, 1), roughness: 0.92 }),
    brick: M({ map: tex(brickTex(), 2.2, 1.4), roughness: 0.95 }),
    hall: M({ map: tex(wainscotTex('#5d4636', '#cbb89a', 0.33), 2, 1), roughness: 0.9 }),
    living: M({ map: tex(paintTex('#8c9c8a'), 2, 1), roughness: 0.92 }),
    kitchen: M({ map: tex(tileTex('#f1eee6', '#bdb6a8', { upper: '#e6dcc3', split: 0.52 }), 3, 1), roughness: 0.6 }),
    bath: M({ map: tex(tileTex('#f4f5f2', '#c9cbc6', { upper: '#9fc3c9', split: 0.46 }), 3, 1), roughness: 0.45 }),
    closet: M({ map: tex(paintTex('#b5ab9a'), 2, 1), roughness: 0.95 }),
    stair: M({ map: tex(wainscotTex('#2f4a3a', '#d8cfb6', 0.32), 2, 1), roughness: 0.9 }),
    out: M({ color: 0x8a8278, roughness: 0.95 }),
  };
  const trimM = M({ color: 0xe8e2d4, roughness: 0.6 });

  // ---- walls: thin boxes with openings; each face takes the paint of the room it faces. Collision: the full panel
  // minus door / arch openings (windows stay solid). axis 'x' = the wall runs along X at z = c (faces +Z / -Z);
  // axis 'z' = runs along Z at x = c (faces +X / -X). holes: [{a0, a1, y0, y1, pass}] (pass: walkable opening)
  const WT = 0.12;
  function wall(axis, c, a0, a1, y0, y1, matPos, matNeg, holes = []) {
    const pieces = [];
    let a = a0;
    const hs = holes.slice().sort((p, q) => p.a0 - q.a0);
    for (const h of hs) {
      if (h.a0 > a + 1e-3) pieces.push([a, h.a0, y0, y1]);
      if (h.y0 > y0 + 1e-3) pieces.push([h.a0, h.a1, y0, h.y0]);
      if (h.y1 < y1 - 1e-3) pieces.push([h.a0, h.a1, h.y1, y1]);
      a = h.a1;
    }
    if (a < a1 - 1e-3) pieces.push([a, a1, y0, y1]);
    for (const [p0, p1, q0, q1] of pieces) {
      const L = p1 - p0, H = q1 - q0, mid = (p0 + p1) / 2, my = (q0 + q1) / 2;
      const g = axis === 'x' ? new THREE.BoxGeometry(L, H, WT) : new THREE.BoxGeometry(WT, H, L);
      // world-scaled UVs: the paint / tile textures keep their size on every panel (texture tile = 2.7 x 2.9 m)
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * L + (p0 - a0)) / 2.7, (uv.getY(i) * H + q0) / 2.9);
      }
      const mats = axis === 'x' ? [trimM, trimM, trimM, trimM, matPos, matNeg] : [matPos, matNeg, trimM, trimM, trimM, trimM];
      const m = new THREE.Mesh(g, mats); m.castShadow = true; m.receiveShadow = true;
      if (axis === 'x') m.position.set(mid, my, c); else m.position.set(c, my, mid);
      group.add(m);
    }
    // collision: solid panel minus the walkable openings
    const cps = []; let ca = a0;
    for (const h of hs.filter(h => h.pass)) {
      if (h.a0 > ca + 1e-3) cps.push([ca, h.a0, y0, y1]);
      if (h.y1 < y1 - 1e-3) cps.push([h.a0, h.a1, h.y1, y1]);
      if (h.y0 > y0 + 1e-3) cps.push([h.a0, h.a1, y0, h.y0]);
      ca = h.a1;
    }
    if (ca < a1 - 1e-3) cps.push([ca, a1, y0, y1]);
    for (const [p0, p1, q0, q1] of cps) {
      if (axis === 'x') solid(p0, q0, c - WT / 2, p1, q1, c + WT / 2, { kind: 'wall' });
      else solid(c - WT / 2, q0, p0, c + WT / 2, q1, p1, { kind: 'wall' });
    }
  }
  // door / arch casings (both faces of the wall)
  function casing(axis, c, a0, a1, y0, y1) {
    for (const s of [-1, 1]) {
      const off = c + s * (WT / 2 + 0.012);
      if (axis === 'x') { box(0.07, y1 - y0, 0.025, trimM, a0 - 0.035, (y0 + y1) / 2, off); box(0.07, y1 - y0, 0.025, trimM, a1 + 0.035, (y0 + y1) / 2, off); box(a1 - a0 + 0.14, 0.08, 0.025, trimM, (a0 + a1) / 2, y1 + 0.04, off); }
      else { box(0.025, y1 - y0, 0.07, trimM, off, (y0 + y1) / 2, a0 - 0.035); box(0.025, y1 - y0, 0.07, trimM, off, (y0 + y1) / 2, a1 + 0.035); box(0.025, 0.08, a1 - a0 + 0.14, trimM, off, y1 + 0.04, (a0 + a1) / 2); }
    }
  }
  // floors + ceilings (visual planes, collision slabs)
  function floor(x0, z0, x1, z1, y, mat, rep = 1.6) {
    const m = plane(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, y + 0.001, (z0 + z1) / 2, 0, -Math.PI / 2);
    const g = m.geometry, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / rep + x0 / rep, uv.getY(i) * (z1 - z0) / rep + z0 / rep);
    return m;
  }
  const ceilM = M({ map: tex(paintTex('#e9e4da'), 1, 1), roughness: 0.95 });
  const roofM = M({ color: 0x55504a, roughness: 1 });
  // ceilings: the plane inside + a shadow-casting slab above it (the sun must not shine down through the flat)
  function ceiling(x0, z0, x1, z1, y) {
    const m = plane(x1 - x0, z1 - z0, ceilM, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, Math.PI / 2); m.receiveShadow = true;
    const r = box(x1 - x0 + 0.3, 0.25, z1 - z0 + 0.3, roofM, (x0 + x1) / 2, y + 0.135, (z0 + z1) / 2); r.receiveShadow = false;
    solid(x0, y, z0, x1, y + 0.25, z1, { over: true, kind: 'ceiling' });
  }
  // baseboards along a room's walls (skipping walkable openings)
  function baseboards(x0, z0, x1, z1, y = 0, gaps = []) {
    const run = (axis, c, a0, a1, s) => {
      let a = a0; const gs = gaps.filter(g => g.axis === axis && Math.abs(g.c - c) < 0.2).sort((p, q) => p.a0 - q.a0);
      const seg = (p, q) => { if (q - p < 0.05) return; if (axis === 'x') box(q - p, 0.12, 0.025, trimM, (p + q) / 2, y + 0.06, c + s * 0.0725); else box(0.025, 0.12, q - p, trimM, c + s * 0.0725, y + 0.06, (p + q) / 2); };
      for (const g of gs) { seg(a, g.a0); a = g.a1; } seg(a, a1);
    };
    run('x', z1, x0, x1, -1); run('x', z0, x0, x1, 1); run('z', x0, z0, z1, 1); run('z', x1, z0, z1, -1);
  }

  // ======================================================================== SHELL
  // floors
  floor(-2.7, -2.3, 2.7, 2.3, 0, M({ map: planksTex(), roughness: 0.55 }), 2.5);                                  // bedroom
  floor(2.7, -2.3, 8.7, 2.3, 0, M({ map: planksTex(150, 104, 66), roughness: 0.5 }), 2.5);                         // living
  floor(-2.7, -3.7, 8.7, -2.3, 0, M({ map: planksTex(110, 70, 42), roughness: 0.55 }), 2.5);                       // hallway
  floor(3.2, -6.3, 8.7, -3.7, 0, M({ map: checkerTex('#1d1d1f', '#ecebe6'), roughness: 0.4 }), 1.6);               // kitchen
  floor(-2.7, -6.3, 0.5, -3.7, 0, M({ map: hexTex('#f2f2ee', '#3c6e8f'), roughness: 0.35 }), 1.0);                  // bathroom
  floor(0.5, -6.3, 3.2, -3.7, 0, M({ color: 0x7d776c, roughness: 0.9 }), 2);                                       // closet
  const stairFloorM = M({ map: hexTex('#d9d2c2', '#7d2b2b'), roughness: 0.6 });
  floor(-5.4, -3.6, -2.7, -2.3, 0, stairFloorM, 1.2);                                                              // top landing
  floor(-5.4, -8.0, -2.7, -6.4, -1.6, stairFloorM, 1.2);                                                           // mid landing
  floor(-5.4, -3.6, -2.7, 2.6, LY, M({ map: checkerTex('#7a2424', '#e2dccb', 6), roughness: 0.45 }), 1.4);         // lobby
  solid(-2.7, -0.25, -6.3, 8.7, 0, 2.3, { kind: 'floor' });
  solid(-5.4, -0.25, -3.6, -2.7, 0, -2.3, { kind: 'floor' });
  solid(-5.4, LY - 0.25, -3.6, -2.7, LY, 2.6, { kind: 'floor' });
  // ceilings
  ceiling(-2.7, -6.3, 8.7, 2.3, HT); ceiling(-5.4, -8.0, -2.7, -2.3, HT); ceiling(-5.4, -2.3, -2.7, 2.6, -0.25);
  { const m = plane(2.7, 1.3, ceilM, -4.05, -0.26, -2.95, 0, Math.PI / 2); m.receiveShadow = true; } // under the top landing

  // walls — apartment level (y 0 .. HT)
  wall('x', 2.3, -2.7, 2.7, 0, HT, P.out, P.bed, [{ a0: -0.95, a1: 0.95, y0: 0.8, y1: 2.45 }]);                                    // bedroom front (window)
  wall('x', 2.3, 2.7, 8.7, 0, HT, P.out, P.living, [{ a0: 3.6, a1: 4.8, y0: 0.8, y1: 2.45 }, { a0: 6.6, a1: 7.8, y0: 0.8, y1: 2.45 }]); // living front
  wall('z', 8.7, -2.3, 2.3, 0, HT, P.out, P.living); wall('z', 8.7, -3.7, -2.3, 0, HT, P.out, P.hall); wall('z', 8.7, -6.3, -3.7, 0, HT, P.out, P.kitchen);
  wall('x', -6.3, -2.7, 0.5, 0, HT, P.bath, P.out); wall('x', -6.3, 0.5, 3.2, 0, HT, P.closet, P.out);
  wall('x', -6.3, 3.2, 8.7, 0, HT, P.kitchen, P.out, [{ a0: 6.2, a1: 7.3, y0: 1.25, y1: 2.25 }]);                                  // kitchen (window over the sink)
  wall('z', -2.7, -8.0, -3.7, LY, HT, P.bath, P.stair);                                                                             // bathroom | stairwell
  wall('z', -2.7, -3.7, -2.3, LY, HT, P.hall, P.stair, [{ a0: -3.45, a1: -2.55, y0: 0, y1: 2.1, pass: true }]);                     // hallway | stair landing (front door)
  wall('z', -2.7, -2.3, 2.3, 0, HT, P.brick, P.out);                                                                                // bedroom brick wall
  wall('x', -2.3, -2.7, 2.7, 0, HT, P.bed, P.hall, [{ a0: 1.05, a1: 1.95, y0: 0, y1: 2.1, pass: true }]);                           // bedroom | hallway (door)
  wall('x', -2.3, 2.7, 8.7, 0, HT, P.living, P.hall, [{ a0: 4.4, a1: 6.2, y0: 0, y1: 2.35, pass: true }]);                          // living | hallway (arch)
  wall('z', 2.7, -2.3, 2.3, 0, HT, P.living, P.bed);                                                                               // bedroom | living
  wall('x', -3.7, -2.7, 0.5, 0, HT, P.hall, P.bath, [{ a0: -1.6, a1: -0.8, y0: 0, y1: 2.05, pass: true }]);                         // hallway | bathroom (door)
  wall('x', -3.7, 0.5, 3.2, 0, HT, P.hall, P.closet, [{ a0: 1.3, a1: 2.1, y0: 0, y1: 2.05, pass: true }]);                          // hallway | closet (door)
  wall('x', -3.7, 3.2, 8.7, 0, HT, P.hall, P.kitchen, [{ a0: 4.6, a1: 6.4, y0: 0, y1: 2.35, pass: true }]);                         // hallway | kitchen (arch)
  wall('z', 0.5, -6.3, -3.7, 0, HT, P.closet, P.bath); wall('z', 3.2, -6.3, -3.7, 0, HT, P.kitchen, P.closet);
  // stairwell + lobby
  wall('z', -5.4, -8.0, -2.3, LY, HT, P.stair, P.out);
  wall('x', -8.0, -5.4, -2.7, LY, HT, P.stair, P.out, [{ a0: -4.6, a1: -3.5, y0: -0.9, y1: 0.55 }]);                               // mid-landing window
  wall('x', -2.3, -5.4, -2.7, -0.25, HT, P.out, P.stair);                                                                           // above the lobby
  wall('z', -5.4, -2.3, 2.6, LY, -0.25, P.stair, P.out); wall('z', -2.7, -2.3, 2.6, LY, -0.25, P.out, P.stair);
  wall('x', 2.6, -5.4, -2.7, LY, -0.25, P.out, P.stair, [{ a0: -4.55, a1: -3.55, y0: LY, y1: -1.0 }]);                            // lobby street door
  for (const [a, cx, c, a0, a1, y0, y1] of [['x', 0, -2.3, 1.05, 1.95, 0, 2.1], ['x', 0, -3.7, -1.6, -0.8, 0, 2.05], ['x', 0, -3.7, 1.3, 2.1, 0, 2.05], ['z', 0, -2.7, -3.45, -2.55, 0, 2.1], ['x', 0, 2.6, -4.55, -3.55, LY, -1.0],
    ['x', 0, -2.3, 4.4, 6.2, 0, 2.35], ['x', 0, -3.7, 4.6, 6.4, 0, 2.35]]) casing(a, c, a0, a1, y0, y1);
  baseboards(-2.7, -2.3, 2.7, 2.3, 0, [{ axis: 'x', c: -2.3, a0: 1.05, a1: 1.95 }]);
  baseboards(2.7, -2.3, 8.7, 2.3, 0, [{ axis: 'x', c: -2.3, a0: 4.4, a1: 6.2 }]);
  baseboards(-2.7, -3.7, 8.7, -2.3, 0, [{ axis: 'x', c: -2.3, a0: 1.05, a1: 1.95 }, { axis: 'x', c: -2.3, a0: 4.4, a1: 6.2 }, { axis: 'x', c: -3.7, a0: -1.6, a1: -0.8 }, { axis: 'x', c: -3.7, a0: 1.3, a1: 2.1 }, { axis: 'x', c: -3.7, a0: 4.6, a1: 6.4 }, { axis: 'z', c: -2.7, a0: -3.45, a1: -2.55 }]);
  baseboards(3.2, -6.3, 8.7, -3.7, 0, [{ axis: 'x', c: -3.7, a0: 4.6, a1: 6.4 }]);
  baseboards(0.5, -6.3, 3.2, -3.7, 0, [{ axis: 'x', c: -3.7, a0: 1.3, a1: 2.1 }]);
  baseboards(-5.4, -3.6, -2.7, 2.6, LY, [{ axis: 'x', c: 2.6, a0: -4.55, a1: -3.55 }]);

  // ======================================================================== DOORS
  // pivot at the hinge; the leaf hangs along the wall (dir = +1 / -1 along the wall axis); `open` = the open angle
  const doors = [];
  const knobM = M({ color: 0xb8a060, metalness: 0.9, roughness: 0.3 });
  function door(id, name, axis, c, hingeA, dir, w, y0, h, openA, hex, { glass = false, solidOn = true } = {}) {
    const pivot = new THREE.Group();
    if (axis === 'x') pivot.position.set(hingeA, y0, c); else pivot.position.set(c, y0, hingeA);
    group.add(pivot);
    const leafMat = glass ? M({ color: 0x3b2f25, roughness: 0.5 }) : M({ map: doorTex(hex), roughness: 0.55 });
    const leaf = new THREE.Group(); pivot.add(leaf);
    const along = (v) => axis === 'x' ? new THREE.Vector3(v, 0, 0) : new THREE.Vector3(0, 0, v);
    const cen = along(dir * w / 2);
    if (glass) { // frame + glass panel
      const t = 0.045;
      for (const [ww, hh, x, y] of [[w, 0.12, 0, h - 0.06], [w, 0.5, 0, 0.25], [0.1, h, -w / 2 + 0.05, h / 2], [0.1, h, w / 2 - 0.05, h / 2]]) {
        const g = axis === 'x' ? new THREE.BoxGeometry(ww, hh, t) : new THREE.BoxGeometry(t, hh, ww);
        const m = new THREE.Mesh(g, leafMat); m.position.copy(cen).add(along(dir * x)).setY(y); m.castShadow = true; leaf.add(m);
      }
      const gm = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xfff0d0, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 });
      const g = axis === 'x' ? new THREE.PlaneGeometry(w - 0.2, h - 0.62) : new THREE.PlaneGeometry(w - 0.2, h - 0.62);
      const gp = new THREE.Mesh(g, gm); gp.position.copy(cen).setY(0.5 + (h - 0.62) / 2); if (axis === 'z') gp.rotation.y = Math.PI / 2; leaf.add(gp);
      const gp2 = gp.clone(); gp2.rotation.y += Math.PI; leaf.add(gp2);
    } else {
      const g = axis === 'x' ? new THREE.BoxGeometry(w, h, 0.045) : new THREE.BoxGeometry(0.045, h, w);
      const m = new THREE.Mesh(g, leafMat); m.position.copy(cen).setY(h / 2); m.castShadow = true; m.receiveShadow = true; leaf.add(m);
    }
    for (const s of [-1, 1]) { // knobs on both faces
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), knobM);
      k.position.copy(along(dir * (w - 0.08))).setY(1.0); if (axis === 'x') k.position.z += s * 0.045; else k.position.x += s * 0.045; leaf.add(k);
    }
    // collision (closed)
    let ci = -1;
    if (solidOn) {
      const a0 = Math.min(hingeA, hingeA + dir * w), a1 = Math.max(hingeA, hingeA + dir * w);
      ci = axis === 'x' ? solid(a0, y0, c - 0.06, a1, y0 + h, c + 0.06, { kind: 'door' }) : solid(c - 0.06, y0, a0, c + 0.06, y0 + h, a1, { kind: 'door' });
    }
    const centre = new THREE.Vector3().copy(pivot.position).add(cen).setY(y0 + 1.1);
    const d = { id, name, pivot, leaf, axis, openA, ci, open: false, a: 0, centre, y0 };
    doors.push(d); return d;
  }
  door('bedroom', 'Bedroom door', 'x', -2.3, 1.05, 1, 0.9, 0, 2.08, -Math.PI / 2, '#6e4a2e');
  door('bathroom', 'Bathroom door', 'x', -3.7, -1.6, 1, 0.8, 0, 2.03, Math.PI / 2, '#ece6da');
  door('closet', 'Closet door', 'x', -3.7, 2.1, -1, 0.8, 0, 2.03, -Math.PI / 2, '#ece6da');
  door('front', 'Front door', 'z', -2.7, -2.55, -1, 0.9, 0, 2.08, -Math.PI / 2, '#3d2b20');
  door('street', 'Street door', 'x', 2.6, -4.55, 1, 1.0, LY, 2.18, -Math.PI / 2, '#3d2b20', { glass: true });
  // a peephole + number on the apartment's front door (hallway side faces +X)
  { const num = canvas(128, 64, (g, w, h) => { g.fillStyle = '#c9a75a'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.fillText('2B', w / 2, 48); });
    const fd = doors.find(d => d.id === 'front'); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ map: num, transparent: true, roughness: 0.4, metalness: 0.6 }));
    pl.position.set(-0.03, 1.62, -0.45); pl.rotation.y = -Math.PI / 2; fd.leaf.add(pl);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 10), knobM); pe.rotation.z = Math.PI / 2; pe.position.set(0, 1.5, -0.45); fd.leaf.add(pe); }

  // ======================================================================== BEDROOM (r14d props, the shell above replaces the old planes)
  const fz = hd, ox0 = -0.95, ox1 = 0.95, oy0 = 0.8, oy1 = 2.45;
  const frameM = M({ color: 0xf0ebe0, roughness: 0.5 });
  const glassM0 = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.12, metalness: 0 });
  const viewMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const radM = M({ color: 0xd9d4c8, roughness: 0.45, metalness: 0.3 });
  const curM = M({ map: fabricTex('#5c6b4a', '#3f4a33'), side: THREE.DoubleSide, roughness: 0.95 });
  // a street window (frame, sash, sill, glass, radiator under it, curtains): x0..x1 at the front wall
  function streetWindow(x0, x1, viewOff = 3.2) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    box(w + 0.1, 0.08, 0.16, frameM, cx, oy0 - 0.02, fz - 0.06); box(w + 0.1, 0.08, 0.12, frameM, cx, oy1, fz - 0.04);
    box(0.08, oy1 - oy0, 0.12, frameM, x0 - 0.02, (oy0 + oy1) / 2, fz - 0.04); box(0.08, oy1 - oy0, 0.12, frameM, x1 + 0.02, (oy0 + oy1) / 2, fz - 0.04);
    box(w - 0.05, 0.05, 0.06, frameM, cx, (oy0 + oy1) / 2 + 0.05, fz - 0.02); box(0.04, oy1 - oy0, 0.05, frameM, cx, (oy0 + oy1) / 2, fz - 0.02);
    box(w + 0.25, 0.05, 0.3, frameM, cx, oy0 - 0.06, fz - 0.15);
    plane(w - 0.05, oy1 - oy0, glassM0, cx, (oy0 + oy1) / 2, fz - 0.01, Math.PI).castShadow = false;
    const n = Math.max(5, Math.round(w / 0.12) - 4);
    for (let k = 0; k < n; k++) box(0.06, 0.55, 0.14, radM, cx - (n - 1) * 0.06 + k * 0.12, 0.42, fz - 0.16);
    box(n * 0.12 + 0.05, 0.04, 0.16, radM, cx, 0.17, fz - 0.16); box(n * 0.12 + 0.05, 0.04, 0.16, radM, cx, 0.7, fz - 0.16);
    for (const sx of [-1, 1]) {
      const cg = new THREE.PlaneGeometry(0.55, 2.2, 14, 1); const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.04);
      cg.computeVertexNormals(); add(cg, curM, cx + sx * (w / 2 + 0.27), 1.55, fz - 0.12, Math.PI);
    }
    box(w + 0.95, 0.025, 0.025, M({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.4 }), cx, 2.66, fz - 0.12);
    blockC(cx - n * 0.06 - 0.05, 0, fz - 0.26, cx + n * 0.06 + 0.05, 0.72, fz); // radiator
  }
  streetWindow(ox0, ox1);
  const viewPlane = plane(9, 6, viewMat, 0, 1.6, fz + 3.2, Math.PI); viewPlane.name = 'aptView';
  streetWindow(3.6, 4.8); streetWindow(6.6, 7.8);
  { const vp = plane(8.4, 5.6, viewMat, 5.7, 1.6, fz + 3.4, Math.PI); vp.name = 'aptView2'; }

  // ---- bed (against the brick wall, head at the back)
  const wood = M({ color: 0x5a3a24, roughness: 0.6 }), woodL = M({ color: 0x8a6440, roughness: 0.55 });
  const bx = -hw + 0.75, bz = -hd + 1.05;
  box(1.45, 0.3, 2.05, wood, bx, 0.15, bz); box(1.45, 0.9, 0.06, wood, bx, 0.45, -hd + 0.03);
  box(1.38, 0.22, 1.98, M({ color: 0xece8e0 }), bx, 0.41, bz);
  const duvG = new THREE.BoxGeometry(1.42, 0.12, 1.45, 18, 2, 18), dp = duvG.attributes.position;
  for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i); if (dp.getY(i) > 0) dp.setY(i, dp.getY(i) + 0.05 * Math.sin(x * 7 + z * 3) + 0.04 * Math.sin(z * 11) + 0.03 * rnd()); }
  duvG.computeVertexNormals(); add(duvG, M({ map: fabricTex('#3a4f6e', '#2a3a52', true), roughness: 0.95 }), bx, 0.55, bz + 0.25);
  for (const dx of [-0.32, 0.32]) { const pg = new THREE.SphereGeometry(0.3, 16, 10); pg.scale(1, 0.32, 0.6); add(pg, M({ color: 0xf2efe8, roughness: 0.95 }), bx + dx, 0.6, -hd + 0.4, 0, 0, dx * 0.2); }
  blockC(bx - 0.73, 0, bz - 1.03, bx + 0.73, 0.62, bz + 1.03, 'furniture');
  // nightstand + lamp + alarm clock + a small speaker
  box(0.45, 0.55, 0.4, woodL, -hw + 0.3, 0.275, 0.35); blockC(-hw + 0.06, 0, 0.14, -hw + 0.53, 0.56, 0.56, 'furniture');
  cyl(0.07, 0.09, 0.04, M({ color: 0x222222 }), -hw + 0.3, 0.57, 0.35); cyl(0.012, 0.012, 0.35, M({ color: 0x222222 }), -hw + 0.3, 0.75, 0.35);
  const shade = M({ color: 0xf3dfb4, emissive: 0xffb760, emissiveIntensity: 1.2, side: THREE.DoubleSide }); lamps.push(shade);
  add(new THREE.CylinderGeometry(0.09, 0.15, 0.2, 18, 1, true), shade, -hw + 0.3, 0.98, 0.35);
  box(0.12, 0.07, 0.05, M({ color: 0x111111, emissive: 0xff3322, emissiveIntensity: 0.6 }), -hw + 0.38, 0.6, 0.2);
  { const sp = M({ color: 0x1f1f22, roughness: 0.7 }); cyl(0.045, 0.045, 0.13, sp, -hw + 0.18, 0.62, 0.48, 18); cyl(0.046, 0.046, 0.02, M({ color: 0x3a6ea5, emissive: 0x2d6fb0, emissiveIntensity: 0.6 }), -hw + 0.18, 0.69, 0.48, 18); }
  // ---- desk + research wall (right)
  const dX = hw - 0.38, dz0 = -0.55, dz1 = 1.65, dzc = (dz0 + dz1) / 2;
  box(0.72, 0.04, dz1 - dz0, woodL, dX, 0.76, dzc);
  for (const z of [dz0 + 0.04, dz1 - 0.04]) for (const x of [dX - 0.32, dX + 0.32]) box(0.04, 0.74, 0.04, M({ color: 0x2c2c2c, metalness: 0.6, roughness: 0.4 }), x, 0.37, z);
  box(0.6, 0.18, 0.45, woodL, dX, 0.66, dz0 + 0.3);
  blockC(dX - 0.36, 0, dz0, dX + 0.36, 0.78, dz1, 'furniture');
  const scrCode = M({ map: screenTex('code'), emissive: 0xffffff, emissiveMap: screenTex('code'), emissiveIntensity: 0.9, roughness: 0.3 });
  box(0.05, 0.4, 0.62, M({ color: 0x151515, roughness: 0.4 }), hw - 0.12, 1.08, 0.35); plane(0.58, 0.36, scrCode, hw - 0.145, 1.08, 0.35, -Math.PI / 2);
  box(0.18, 0.02, 0.15, M({ color: 0x151515 }), hw - 0.12, 0.79, 0.35); cyl(0.02, 0.02, 0.2, M({ color: 0x151515 }), hw - 0.12, 0.88, 0.35);
  box(0.16, 0.015, 0.44, M({ color: 0x2a2a2a, roughness: 0.6 }), dX - 0.12, 0.79, 0.35);
  const lap = new THREE.Group(); lap.position.set(dX - 0.05, 0.785, 1.25); lap.rotation.y = -Math.PI / 2 - 0.35; group.add(lap);
  { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), M({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 })); lap.add(b);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.01), M({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 })); lid.position.set(0, 0.11, -0.12); lid.rotation.x = -0.25; lap.add(lid);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), M({ map: screenTex('bugle'), emissive: 0xffffff, emissiveMap: screenTex('bugle'), emissiveIntensity: 0.85 })); scr.position.set(0, 0.11, -0.114); scr.rotation.x = -0.25; lap.add(scr); }
  cyl(0.045, 0.04, 0.1, M({ color: 0xb03a2e, roughness: 0.4 }), dX - 0.2, 0.83, -0.05);
  { const cam = new THREE.Group(); cam.position.set(dX - 0.18, 0.83, 0.85); group.add(cam);
    const bm = M({ color: 0x1b1b1b, roughness: 0.5 }), sm = M({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.3 });
    cam.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), bm));
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.05), sm); top.position.y = 0.05; cam.add(top);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.06, 20), bm); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.05); cam.add(lens);
    cam.rotation.y = 0.6; }
  { const mt = canvas(256, 256, (g, w, h) => { g.fillStyle = '#a3151e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(k / 12 * 6.28) * 200, h / 2 + Math.sin(k / 12 * 6.28) * 200); g.stroke(); } for (let r = 20; r < 180; r += 24) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 6.28); g.stroke(); } });
    const mg = new THREE.SphereGeometry(0.11, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); mg.scale(1, 0.75, 1.15);
    add(mg, M({ map: mt, roughness: 0.6, side: THREE.DoubleSide }), dX - 0.15, 0.8, 1.55, 0.4, -Math.PI / 2 + 0.25);
    for (const ex of [-0.04, 0.04]) { const eg = new THREE.CircleGeometry(0.03, 16); eg.scale(1.3, 0.75, 1); add(eg, M({ color: 0xd8e6ea, metalness: 0.4, roughness: 0.2 }), dX - 0.15 + ex, 0.86, 1.62, 0.4, -0.4); } }
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, metalness: 0 });
  const fluid = M({ color: 0x6fb8ff, emissive: 0x2a6fbf, emissiveIntensity: 0.35, roughness: 0.1 });
  box(0.12, 0.02, 0.42, woodL, dX + 0.18, 0.79, -0.25); box(0.12, 0.02, 0.42, woodL, dX + 0.18, 0.9, -0.25);
  for (let k = 0; k < 6; k++) { const z = -0.43 + k * 0.07; cyl(0.016, 0.016, 0.16, glassM, dX + 0.18, 0.88, z, 10); cyl(0.014, 0.014, 0.05 + 0.06 * rnd(), fluid, dX + 0.18, 0.83, z, 10); }
  for (const [x, z, r, h] of [[dX - 0.1, -0.35, 0.05, 0.12], [dX - 0.02, -0.18, 0.035, 0.16], [dX - 0.22, -0.4, 0.04, 0.09]]) { cyl(r, r, h, glassM, x, 0.78 + h / 2, z, 18); cyl(r * 0.92, r * 0.92, h * 0.4, fluid, x, 0.78 + h * 0.2, z, 18); }
  cyl(0.04, 0.05, 0.08, M({ color: 0x777777, metalness: 0.8, roughness: 0.3 }), dX - 0.28, 0.82, -0.12);
  { const ws = new THREE.Group(); ws.position.set(dX - 0.25, 0.8, 0.12); group.add(ws);
    const metal = M({ color: 0x8c8f93, metalness: 0.9, roughness: 0.28 }), blk = M({ color: 0x181818, roughness: 0.6 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.015, 10, 24), blk); band.rotation.x = Math.PI / 2; ws.add(band);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 12), metal); can.rotation.z = Math.PI / 2; can.position.set(0, 0.02, 0.05); ws.add(can);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.25), M({ color: 0xd8d2c4 })); cloth.rotation.x = -Math.PI / 2; cloth.position.y = -0.008; ws.add(cloth); }
  { const lm = M({ color: 0x2e2e2e, metalness: 0.5, roughness: 0.4 });
    cyl(0.08, 0.09, 0.02, lm, dX + 0.2, 0.79, 1.0); const a1 = box(0.02, 0.38, 0.02, lm, dX + 0.2, 0.97, 0.92); a1.rotation.x = 0.4;
    const a2 = box(0.02, 0.32, 0.02, lm, dX + 0.2, 1.2, 0.72); a2.rotation.x = -0.9;
    const hs = M({ color: 0x2e2e2e, emissive: 0xffd28a, emissiveIntensity: 0.0, side: THREE.DoubleSide });
    add(new THREE.ConeGeometry(0.07, 0.13, 20, 1, true), hs, dX + 0.2, 1.22, 0.56, 0, 2.4);
    const bulb = M({ color: 0xffffff, emissive: 0xffd8a0, emissiveIntensity: 2.2 }); lamps.push(bulb);
    add(new THREE.SphereGeometry(0.025, 10, 8), bulb, dX + 0.2, 1.18, 0.52); }
  // headphones on the desk
  { const hm = M({ color: 0x1c1c1c, roughness: 0.5 }); const hb = new THREE.TorusGeometry(0.08, 0.008, 8, 24, Math.PI); add(hb, hm, dX + 0.05, 0.8, 1.6, 0.4, -Math.PI / 2);
    for (const s of [-1, 1]) cyl(0.035, 0.035, 0.025, hm, dX + 0.05 + s * 0.075, 0.8, 1.6, 16); }
  // chair
  { const cm = M({ color: 0x3a3a3a, roughness: 0.6 });
    box(0.46, 0.06, 0.46, cm, dX - 0.75, 0.48, 0.45); box(0.06, 0.5, 0.42, cm, dX - 0.97, 0.78, 0.45);
    cyl(0.03, 0.03, 0.4, M({ color: 0x777777, metalness: 0.8, roughness: 0.3 }), dX - 0.75, 0.25, 0.45);
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; box(0.3, 0.03, 0.04, cm, dX - 0.75 + Math.cos(a) * 0.15, 0.04, 0.45 + Math.sin(a) * 0.15, -a); }
    blockC(dX - 1.0, 0, 0.22, dX - 0.52, 0.52, 0.68, 'furniture'); }
  // research wall
  const corkT = canvas(512, 256, (g, w, h) => { g.fillStyle = '#b08458'; g.fillRect(0, 0, w, h); for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '60,35,15' : '230,200,150'},${rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
  box(0.03, 1.15, 2.3, M({ map: corkT, roughness: 0.95 }), hw - 0.075, 1.72, dzc);
  const pins = [];
  for (let i = 0; i < 28; i++) {
    const ww = 0.17 + rnd() * 0.1, hh = ww * (0.95 + rnd() * 0.4);
    const z = dz0 + 0.2 + rnd() * (dz1 - dz0 - 0.4), y = 1.25 + rnd() * 0.9;
    const p = plane(ww, hh, M({ map: clipping(i), roughness: 0.9, side: THREE.DoubleSide }), hw - 0.095 - i * 0.0006, y, z, -Math.PI / 2);
    p.rotation.z = (rnd() - 0.5) * 0.25;
    const pp = new THREE.Vector3(hw - 0.11 - i * 0.0006, y + hh * 0.4, z);
    cyl(0.008, 0.008, 0.015, M({ color: pick([0xd32f2f, 0x1976d2, 0xfbc02d]) }), pp.x, pp.y, pp.z, 8).rotation.z = Math.PI / 2;
    pins.push(pp);
  }
  { const pts = []; for (let k = 0; k < 16; k++) { const a = pins[Math.floor(rnd() * pins.length)], b = pins[Math.floor(rnd() * pins.length)]; if (a !== b) pts.push(a.clone().setX(a.x - 0.008), b.clone().setX(b.x - 0.008)); }
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xc0281e }))); }
  // posters
  const P1 = poster('NIGHT ORBIT', 'live at the hangar • 9pm', '#16213e', '#f5d76e', (g, w) => { g.fillStyle = '#f5d76e'; g.beginPath(); g.arc(w / 2, 260, 150, 0, 6.28); g.fill(); g.fillStyle = '#16213e'; g.beginPath(); g.arc(w / 2 + 50, 230, 140, 0, 6.28); g.fill(); });
  const P2 = poster('THE ARCHITECT', 'a film by nobody you know', '#e8e1d0', '#1a1a1a', (g, w) => { g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; for (let k = 0; k < 10; k++) { g.strokeRect(60 + k * 18, 80 + k * 22, w - 120 - k * 36, 380 - k * 40); } });
  const P3 = poster('NEW YORK', 'science fair 2014 • 1st place', '#0f4c5c', '#ffffff', (g, w) => { g.strokeStyle = '#e36414'; g.lineWidth = 4; for (let k = 0; k < 16; k++) { g.beginPath(); g.moveTo(w / 2, 300); g.lineTo(w / 2 + Math.cos(k / 16 * 6.28) * 220, 300 + Math.sin(k / 16 * 6.28) * 220); g.stroke(); } for (let r = 30; r < 220; r += 30) { g.beginPath(); g.arc(w / 2, 300, r, 0, 6.28); g.stroke(); } });
  plane(0.7, 0.98, M({ map: P1, roughness: 0.8 }), -hw + 0.07, 1.75, -1.15, Math.PI / 2).rotation.z = 0.03;
  plane(0.6, 0.84, M({ map: P2, roughness: 0.8 }), -hw + 0.07, 1.68, -0.25, Math.PI / 2).rotation.z = -0.04;
  plane(0.62, 0.87, M({ map: P3, roughness: 0.8 }), 0.62, 1.7, -hd + 0.065, 0);
  const fl = M({ color: 0xffffff, emissive: 0xffc070, emissiveIntensity: 2.5 }); lamps.push(fl);
  for (let k = 0; k < 26; k++) { const z = -hd + 0.2 + k * (D - 0.4) / 25; add(new THREE.SphereGeometry(0.018, 8, 6), fl, -hw + 0.1, 2.62 - 0.08 * Math.sin(k / 25 * Math.PI * 4) ** 2, z).castShadow = false; }
  // bookshelf
  const sx0 = -0.95, shelfW = 1.25;
  box(shelfW, 1.9, 0.02, wood, sx0 + shelfW / 2, 0.95, -hd + 0.07);
  box(0.025, 1.9, 0.32, wood, sx0 + 0.0125, 0.95, -hd + 0.22); box(0.025, 1.9, 0.32, wood, sx0 + shelfW - 0.0125, 0.95, -hd + 0.22);
  box(shelfW, 0.03, 0.32, wood, sx0 + shelfW / 2, 1.9, -hd + 0.22);
  blockC(sx0, 0, -hd + 0.06, sx0 + shelfW, 1.92, -hd + 0.38, 'furniture');
  function books(x0, x1, y, z, depth = 0.2) {
    let x = x0;
    while (x < x1 - 0.04) {
      if (rnd() < 0.08) { x += 0.12; continue; }
      const bw2 = 0.025 + rnd() * 0.035, bh = 0.2 + rnd() * 0.12;
      const c = new THREE.Color().setHSL(rnd(), 0.35 + rnd() * 0.3, 0.2 + rnd() * 0.3);
      box(bw2, bh, depth, M({ color: c, roughness: 0.75 }), x + bw2 / 2, y + bh / 2, z, 0, 0, rnd() < 0.08 ? 0.25 : 0);
      x += bw2 + 0.003;
    }
  }
  for (let s = 0; s < 5; s++) { const y = 0.12 + s * 0.42; box(shelfW - 0.06, 0.025, 0.28, woodL, sx0 + shelfW / 2, y, -hd + 0.24); books(sx0 + 0.06, sx0 + shelfW - 0.04, y + 0.013, -hd + 0.25); }
  { const tm = M({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 }); cyl(0.04, 0.06, 0.12, tm, sx0 + 0.25, 1.86, -hd + 0.25); cyl(0.05, 0.02, 0.1, tm, sx0 + 0.25, 1.97, -hd + 0.25); }
  { const cub = new THREE.Group(); cub.position.set(sx0 + 0.95, 1.83, -hd + 0.25); group.add(cub); const cols = [0xd32f2f, 0x1976d2, 0xfbc02d, 0x388e3c, 0xffffff, 0xf57c00];
    for (let i = 0; i < 27; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.019), M({ color: cols[i % 6], roughness: 0.4 })); m.position.set(((i % 3) - 1) * 0.02, (Math.floor(i / 3) % 3 - 1) * 0.02, (Math.floor(i / 9) - 1) * 0.02); cub.add(m); } cub.rotation.y = 0.5; }
  // skateboard (front-right corner now), backpack + hoodie on hooks (right of the door), sneakers, laundry, rug
  { const sk = new THREE.Group(); sk.position.set(hw - 0.17, 0.45, 2.0); sk.rotation.set(0, -Math.PI / 2, 0); group.add(sk);
    const inner = new THREE.Group(); inner.rotation.set(-1.32, 0, 0.12); sk.add(inner);
    const deckT = canvas(128, 512, (g, w, h) => { g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8c547'; g.fillRect(0, h * 0.4, w, 30); g.fillStyle = '#c0392b'; g.fillRect(0, h * 0.4 + 40, w, 14); noise(g, w, h, 0.2, 2000, '255,255,255'); });
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.81, 0.015), M({ map: deckT, roughness: 0.7 })));
    for (const y of [-0.27, 0.27]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.03), M({ color: 0x999999, metalness: 0.8, roughness: 0.3 })); tr.position.set(0, y, 0.03); inner.add(tr);
      for (const x of [-0.08, 0.08]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 14), M({ color: 0xf2efe6, roughness: 0.4 })); wh.rotation.z = Math.PI / 2; wh.position.set(x, y, 0.055); inner.add(wh); } } }
  for (const x of [2.45, 2.2]) box(0.04, 0.04, 0.04, M({ color: 0x888888, metalness: 0.8 }), x, 1.7, -hd + 0.1);
  { const bp = new THREE.SphereGeometry(0.17, 14, 10); bp.scale(1, 1.25, 0.55); add(bp, M({ color: 0x2c3e50, roughness: 0.9 }), 2.45, 1.45, -hd + 0.17); }
  { const hd2 = new THREE.BoxGeometry(0.42, 0.62, 0.08, 6, 6, 1); const hp = hd2.attributes.position; for (let i = 0; i < hp.count; i++) hp.setZ(i, hp.getZ(i) + 0.03 * Math.sin(hp.getY(i) * 9)); hd2.computeVertexNormals(); add(hd2, M({ color: 0x7f8c8d, roughness: 0.95 }), 2.2, 1.38, -hd + 0.14); }
  for (const [x, z, r] of [[-0.6, 0.6, 0.3], [-0.42, 0.68, 0.1]]) { box(0.11, 0.09, 0.28, M({ color: 0xeeeeee, roughness: 0.7 }), x, 0.045, z, r); box(0.115, 0.025, 0.29, M({ color: 0xc0392b }), x, 0.012, z, r); }
  { const lg = new THREE.SphereGeometry(0.32, 14, 8, 0, 6.28, 0, Math.PI / 2); lg.scale(1.2, 0.45, 0.9); add(lg, M({ map: fabricTex('#4a4f57', '#6a3a3a', true), roughness: 1 }), -1.15, 0, 1.35); }
  { const rugT = canvas(512, 512, (g, w, h) => { g.fillStyle = '#7a2e2e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9b77c'; g.lineWidth = 10; g.strokeRect(30, 30, w - 60, h - 60); g.lineWidth = 4; g.strokeRect(60, 60, w - 120, h - 120);
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(w / 2, 90 + k * 60); g.lineTo(w / 2 + 120, 120 + k * 60); g.lineTo(w / 2, 150 + k * 60); g.lineTo(w / 2 - 120, 120 + k * 60); g.closePath(); g.stroke(); } noise(g, w, h, 0.25, 9000); });
    plane(2.2, 1.6, M({ map: rugT, roughness: 1 }), 0.1, 0.006, 0.55, 0, -Math.PI / 2).rotation.z = 0.06; }
  // (user r19) dresser + mirror (front-left corner), guitar against the brick, plant, wall clock
  { const dm = M({ color: 0x6b4a32, roughness: 0.55 });
    box(1.0, 0.85, 0.45, dm, -2.08, 0.425, 1.98); blockC(-2.6, 0, 1.75, -1.58, 0.86, 2.24, 'furniture');
    for (let r = 0; r < 3; r++) { box(0.94, 0.012, 0.01, M({ color: 0x3a2618 }), -2.08, 0.25 + r * 0.25, 1.75); for (const s of [-0.25, 0.25]) box(0.08, 0.02, 0.02, knobM, -2.08 + s, 0.15 + r * 0.25, 1.745); }
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), new THREE.MeshStandardMaterial({ color: 0xc8d4d8, metalness: 1, roughness: 0.05 }));
    mir.position.set(-2.08, 1.35, 2.215); mir.rotation.y = Math.PI; group.add(mir); box(0.68, 0.86, 0.03, dm, -2.08, 1.35, 2.235);
    cyl(0.06, 0.05, 0.12, M({ color: 0xc46a3f, roughness: 0.8 }), -2.35, 0.91, 2.0); // plant pot
    for (let k = 0; k < 7; k++) { const lf = new THREE.SphereGeometry(0.06, 8, 6); lf.scale(0.5, 1.6, 0.3); add(lf, M({ color: 0x3f7d3a, roughness: 0.8 }), -2.35 + Math.cos(k) * 0.04, 1.05, 2.0 + Math.sin(k) * 0.04, k, 0.3, 0.2 * Math.sin(k)); }
    box(0.18, 0.02, 0.13, M({ color: 0x1f1f1f }), -1.8, 0.86, 1.95, 0.4); // a phone
  }
  { const gb = M({ color: 0x8b4a1f, roughness: 0.4 }), gn = M({ color: 0x2a1a10, roughness: 0.5 }); const gt = new THREE.Group(); gt.position.set(-hw + 0.2, 0.0, 1.0); gt.rotation.set(0, Math.PI / 2, 0.18); group.add(gt);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 24), gb); b1.rotation.x = Math.PI / 2; b1.position.y = 0.28; gt.add(b1);
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 24), gb); b2.rotation.x = Math.PI / 2; b2.position.y = 0.55; gt.add(b2);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 18), M({ color: 0x0b0b0b })); hole.position.set(0, 0.46, 0.046); gt.add(hole);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.03), gn); neck.position.y = 0.95; gt.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.03), gn); head.position.y = 1.3; gt.add(head); }
  { const clk = canvas(128, 128, (g, w, h) => { g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(64, 64, 60, 0, 6.28); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 5; g.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; g.fillStyle = '#222'; g.fillRect(64 + Math.cos(a) * 48 - 2, 64 + Math.sin(a) * 48 - 2, 4, 4); } g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 28); g.stroke(); g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke(); });
    const cm = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), M({ map: clk, roughness: 0.5 })); cm.position.set(1.65, 2.25, hd - 0.075); cm.rotation.y = Math.PI; group.add(cm); }

  // ======================================================================== HALLWAY
  { const rugT = canvas(256, 1024, (g, w, h) => { g.fillStyle = '#2f3e55'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a75a'; g.lineWidth = 8; g.strokeRect(16, 16, w - 32, h - 32); for (let y = 80; y < h - 60; y += 90) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + 50, y + 30); g.lineTo(w / 2, y + 60); g.lineTo(w / 2 - 50, y + 30); g.closePath(); g.stroke(); } noise(g, w, h, 0.25, 6000); });
    const r = plane(0.9, 7.6, M({ map: rugT, roughness: 1 }), 2.6, 0.006, -3.0, 0, -Math.PI / 2); r.rotation.z = Math.PI / 2; }
  // coat hooks + jacket + scarf, shoe rack (by the front door, on the bedroom wall's hallway side)
  { for (let k = 0; k < 4; k++) box(0.03, 0.03, 0.06, M({ color: 0x777777, metalness: 0.8 }), -2.2 + k * 0.28, 1.68, -2.39);
    box(1.0, 0.06, 0.03, M({ color: 0x5a3a24 }), -1.78, 1.68, -2.375);
    const jk = new THREE.BoxGeometry(0.45, 0.7, 0.12, 4, 6, 1); const jp = jk.attributes.position; for (let i = 0; i < jp.count; i++) jp.setZ(i, jp.getZ(i) + 0.03 * Math.sin(jp.getY(i) * 8 + jp.getX(i) * 4)); jk.computeVertexNormals();
    add(jk, M({ color: 0x4a5a3a, roughness: 0.95 }), -2.08, 1.3, -2.45); add(jk.clone(), M({ color: 0x232a35, roughness: 0.95 }), -1.55, 1.32, -2.45);
    box(0.12, 0.9, 0.04, M({ map: fabricTex('#a8332d', '#e3c26a', true) }), -1.25, 1.25, -2.42);
    box(0.85, 0.32, 0.3, M({ color: 0x4a3426, roughness: 0.6 }), -1.8, 0.16, -2.53); blockC(-2.23, 0, -2.7, -1.37, 0.33, -2.36);
    for (const [x, c] of [[-2.1, 0x1c1c1c], [-1.9, 0xe9e5dd], [-1.65, 0x6b3f22], [-1.45, 0x2d4f7c]]) for (const s of [-0.04, 0.04]) box(0.09, 0.08, 0.26, M({ color: c, roughness: 0.6 }), x + s, 0.36, -2.53); }
  // console table + bowl of keys + mail + mirror (east end of the hallway)
  { box(1.1, 0.04, 0.32, woodL, 7.6, 0.8, -3.5); for (const x of [7.1, 8.1]) for (const z of [-3.62, -3.38]) box(0.04, 0.78, 0.04, wood, x, 0.39, z);
    blockC(7.05, 0, -3.68, 8.15, 0.82, -3.33);
    cyl(0.12, 0.08, 0.06, M({ color: 0x2f6f8f, roughness: 0.3 }), 7.4, 0.85, -3.5, 20);
    box(0.06, 0.012, 0.02, M({ color: 0xc9a75a, metalness: 0.9 }), 7.42, 0.885, -3.5, 0.6);
    for (let k = 0; k < 3; k++) box(0.22, 0.004, 0.11, M({ color: [0xf2efe6, 0xd9e3ec, 0xe8d7b8][k] }), 7.85 + k * 0.02, 0.825 + k * 0.004, -3.5, k * 0.3);
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0xc8d4d8, metalness: 1, roughness: 0.05 })); mir.position.set(7.6, 1.55, -3.635); group.add(mir); box(0.78, 0.98, 0.03, wood, 7.6, 1.55, -3.655); }
  // family photos (framed) along the hallway's north wall
  for (let k = 0; k < 5; k++) { const x = 2.4 + k * 0.42, y = 1.45 + (k % 2) * 0.32; box(0.32, 0.26, 0.025, M({ color: k % 2 ? 0x2a2a2a : 0x7a5530 }), x, y, -2.375);
    plane(0.27, 0.21, M({ map: photoTex(k), roughness: 0.6 }), x, y, -2.392, Math.PI); }
  // radiator + thermostat
  { const n = 8; for (let k = 0; k < n; k++) box(0.06, 0.55, 0.12, radM, 0.4 + k * 0.12, 0.42, -3.57); box(n * 0.12, 0.04, 0.14, radM, 0.82, 0.17, -3.57); box(n * 0.12, 0.04, 0.14, radM, 0.82, 0.7, -3.57); blockC(0.33, 0, -3.65, 1.31, 0.72, -3.5);
    box(0.09, 0.12, 0.025, M({ color: 0xf0ede6 }), 3.0, 1.5, -2.375); }
  const hallPost = poster('CITY LIGHTS', 'night photography • the hangar', '#101418', '#e9e3d0', (g, w) => { g.fillStyle = '#e9b04a'; for (let k = 0; k < 120; k++) g.fillRect(rnd() * w, 120 + rnd() * 380, 3, 3); });
  plane(0.7, 0.98, M({ map: hallPost, roughness: 0.8 }), 8.635, 1.6, -3.0, -Math.PI / 2);

  // ======================================================================== LIVING ROOM
  { const rugT = canvas(512, 512, (g, w, h) => { g.fillStyle = '#c9b79c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3b4a5a'; g.lineWidth = 12; g.strokeRect(24, 24, w - 48, h - 48); g.lineWidth = 3; for (let k = 40; k < w; k += 40) { g.beginPath(); g.moveTo(k, 50); g.lineTo(k, h - 50); g.stroke(); } noise(g, w, h, 0.2, 9000); });
    plane(3.2, 2.4, M({ map: rugT, roughness: 1 }), 5.9, 0.006, 0, 0, -Math.PI / 2); }
  // sofa (faces the TV on the east wall)
  { const sm = M({ map: fabricTex('#4b5d6b', '#3c4b57'), roughness: 0.95 });
    box(0.85, 0.42, 2.2, sm, 4.6, 0.21, 0); box(0.25, 0.85, 2.2, sm, 4.29, 0.43, 0); for (const s of [-1, 1]) box(0.85, 0.62, 0.22, sm, 4.6, 0.31, s * 1.0);
    for (const z of [-0.45, 0.45]) { const c = new THREE.BoxGeometry(0.62, 0.16, 0.86, 4, 2, 4); const cp = c.attributes.position; for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) cp.setY(i, cp.getY(i) + 0.03 * Math.cos(cp.getX(i) * 4) * Math.cos(cp.getZ(i) * 3)); c.computeVertexNormals(); add(c, sm, 4.68, 0.5, z); }
    for (const [z, c] of [[-0.75, '#c0392b'], [0.7, '#e3c26a']]) { const pg = new THREE.BoxGeometry(0.14, 0.38, 0.38, 2, 4, 4); const pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) pp.setX(i, pp.getX(i) * (1 - 0.6 * Math.abs(pp.getY(i)) / 0.19)); pg.computeVertexNormals(); add(pg, M({ color: c, roughness: 0.95 }), 4.45, 0.75, z, 0, 0, -0.25); }
    const bl = new THREE.BoxGeometry(0.5, 0.06, 0.7, 6, 1, 6); const bp = bl.attributes.position; for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) + 0.04 * Math.sin(bp.getX(i) * 12) * Math.cos(bp.getZ(i) * 9)); bl.computeVertexNormals();
    add(bl, M({ map: fabricTex('#8a2f2f', '#d9b77c', true), roughness: 1 }), 4.75, 0.6, 0.55, 0.3);
    blockC(4.15, 0, -1.12, 5.05, 0.5, 1.12, 'furniture'); blockC(4.15, 0, -1.12, 4.42, 0.88, 1.12, 'furniture'); }
  // coffee table + pizza box + controller + magazines + mug + remote
  { box(1.0, 0.05, 0.62, woodL, 6.0, 0.42, 0); for (const x of [5.56, 6.44]) for (const z of [-0.26, 0.26]) box(0.05, 0.4, 0.05, wood, x, 0.2, z);
    box(0.92, 0.02, 0.54, woodL, 6.0, 0.12, 0); blockC(5.48, 0, -0.33, 6.52, 0.45, 0.33);
    const pz = canvas(256, 256, (g, w, h) => { g.fillStyle = '#d8c3a0'; g.fillRect(0, 0, w, h); g.fillStyle = '#b03a2e'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.fillText("JOE'S", w / 2, 110); g.font = 'italic 22px Georgia'; g.fillText('slice of heaven', w / 2, 150); noise(g, w, h, 0.1, 2000); });
    box(0.42, 0.05, 0.42, M({ map: pz, roughness: 0.9 }), 5.82, 0.47, -0.08, 0.2);
    { const cm = M({ color: 0x1d1d22, roughness: 0.5 }); const cg = new THREE.Group(); cg.position.set(6.25, 0.46, 0.12); cg.rotation.y = 0.7; group.add(cg);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.08), cm); cg.add(body); for (const s of [-1, 1]) { const gp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), cm); gp.position.set(s * 0.07, 0, 0.02); cg.add(gp); } }
    box(0.3, 0.012, 0.22, M({ color: 0xc9d6e3 }), 6.2, 0.453, -0.18, -0.3); box(0.3, 0.012, 0.22, M({ color: 0xe7c9a1 }), 6.22, 0.465, -0.2, -0.1);
    cyl(0.04, 0.035, 0.09, M({ color: 0xe8e2d4, roughness: 0.4 }), 5.68, 0.49, 0.2); box(0.05, 0.02, 0.16, M({ color: 0x222222 }), 6.38, 0.455, 0.2, 0.4); }
  // TV wall: console, TV (paused game), console box + controllers, speakers
  { const tm = M({ color: 0x2b2420, roughness: 0.5 });
    box(0.42, 0.5, 2.0, tm, 8.47, 0.25, 0); blockC(8.24, 0, -1.02, 8.7, 0.52, 1.02);
    box(0.06, 0.82, 1.46, M({ color: 0x0c0c0e, roughness: 0.3, metalness: 0.3 }), 8.6, 1.32, 0);
    const scr = screenTex('game'); plane(1.38, 0.76, M({ map: scr, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 0.75, roughness: 0.25 }), 8.565, 1.32, 0, -Math.PI / 2);
    box(0.3, 0.06, 0.22, M({ color: 0xf2f2f2, roughness: 0.35 }), 8.42, 0.53, -0.6); box(0.02, 0.008, 0.18, M({ color: 0x4aa3ff, emissive: 0x4aa3ff, emissiveIntensity: 1.2 }), 8.27, 0.535, -0.6);
    for (const z of [-0.85, 0.85]) { box(0.2, 0.3, 0.18, M({ color: 0x1b1b1b }), 8.45, 0.65, z); cyl(0.05, 0.05, 0.01, M({ color: 0x333333 }), 8.34, 0.68, z).rotation.z = Math.PI / 2; }
    for (let k = 0; k < 6; k++) box(0.13, 0.17, 0.015, M({ color: new THREE.Color().setHSL(rnd(), 0.5, 0.35) }), 8.4, 0.12, -0.5 + k * 0.02); }
  // armchair (by the right window, angled to the TV), side table + framed photo, floor lamp, shelf, plants, bean bag
  { const am = M({ map: fabricTex('#7a4a2f', '#5e3823'), roughness: 0.95 }); const ac = new THREE.Group(); ac.position.set(7.0, 0, 1.55); ac.rotation.y = -2.3; group.add(ac);
    for (const [w, h, d, x, y, z] of [[0.8, 0.42, 0.78, 0, 0.21, 0], [0.8, 0.82, 0.18, 0, 0.41, -0.32], [0.16, 0.6, 0.78, -0.36, 0.3, 0], [0.16, 0.6, 0.78, 0.36, 0.3, 0], [0.5, 0.12, 0.6, 0, 0.48, 0.04]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), am); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; ac.add(m); }
    blockC(6.55, 0, 1.1, 7.45, 0.6, 2.0, 'furniture');
    box(0.45, 0.55, 0.45, woodL, 4.6, 0.275, 1.62); blockC(4.37, 0, 1.39, 4.83, 0.56, 1.85);
    box(0.16, 0.2, 0.02, M({ color: 0x7a5530 }), 4.62, 0.66, 1.62, 0.5); plane(0.13, 0.16, M({ map: photoTex(9) }), 4.62 - 0.006, 0.66, 1.62 + 0.012, 0.5);
    const lm = M({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.35 }); cyl(0.14, 0.16, 0.03, lm, 3.15, 0.015, 1.9); cyl(0.015, 0.015, 1.55, lm, 3.15, 0.8, 1.9);
    const fsh = M({ color: 0xf3e3c3, emissive: 0xffc77a, emissiveIntensity: 1.1, side: THREE.DoubleSide }); lamps.push(fsh);
    add(new THREE.CylinderGeometry(0.16, 0.24, 0.32, 20, 1, true), fsh, 3.15, 1.65, 1.9);
    box(0.35, 1.8, 1.3, wood, 2.95, 0.9, -1.3); blockC(2.76, 0, -1.96, 3.13, 1.81, -0.64, 'furniture');
    for (let s = 0; s < 4; s++) { const y = 0.1 + s * 0.45; box(0.3, 0.02, 1.24, woodL, 2.95, y, -1.3); if (s < 3) { for (let k = 0; k < 6; k++) box(0.24, 0.3, 0.012, M({ color: new THREE.Color().setHSL(rnd(), 0.45, 0.4) }), 2.95, y + 0.16, -1.85 + k * 0.025 + s * 0.08); } }
    cyl(0.09, 0.07, 0.15, M({ color: 0xd8d2c4 }), 2.95, 1.47, -0.9, 16); for (let k = 0; k < 9; k++) { const lf = new THREE.SphereGeometry(0.07, 8, 6); lf.scale(0.4, 1.4, 0.25); add(lf, M({ color: 0x3f7d3a }), 2.95 + Math.cos(k) * 0.05, 1.63, -0.9 + Math.sin(k) * 0.05, k, 0.5 * Math.cos(k * 2), 0.5 * Math.sin(k * 2)); }
    // big plant in the corner
    cyl(0.22, 0.17, 0.42, M({ color: 0x3b3b3b, roughness: 0.6 }), 8.35, 0.21, 1.95, 20); blockC(8.12, 0, 1.72, 8.58, 0.45, 2.18);
    for (let k = 0; k < 14; k++) { const lf = new THREE.SphereGeometry(0.16, 8, 6); lf.scale(0.35, 1.6, 0.12); add(lf, M({ color: k % 2 ? 0x2f6b2c : 0x447d35, roughness: 0.75 }), 8.35 + Math.cos(k * 2.4) * 0.14, 0.8 + (k % 4) * 0.18, 1.95 + Math.sin(k * 2.4) * 0.14, k * 2.4, 0.5 * Math.cos(k), 0.5 * Math.sin(k)); }
    const bb = new THREE.SphereGeometry(0.45, 18, 12); bb.scale(1, 0.55, 1); const bbp = bb.attributes.position; for (let i = 0; i < bbp.count; i++) if (bbp.getY(i) < 0) bbp.setY(i, Math.max(bbp.getY(i), -0.2)); bb.computeVertexNormals();
    add(bb, M({ color: 0x6b2f5a, roughness: 0.95 }), 7.4, 0.24, -1.55); blockC(7.0, 0, -1.95, 7.8, 0.45, -1.15, 'furniture');
    const art = poster('LUNA', 'prints & paper • brooklyn', '#d9cfbb', '#2c2c2c', (g, w) => { g.fillStyle = '#c0392b'; g.beginPath(); g.arc(w / 2, 280, 140, 0, 6.28); g.fill(); g.fillStyle = '#2c2c2c'; g.fillRect(0, 380, w, 4); });
    box(0.86, 1.18, 0.03, M({ color: 0x1f1f1f }), 4.8, 1.75, -2.2); plane(0.78, 1.1, M({ map: art }), 4.8, 1.75, -2.183); }

  // ======================================================================== KITCHEN
  { const cab = M({ color: 0x3d5a6c, roughness: 0.5 }), top = M({ color: 0xe9e6df, roughness: 0.3 }), steel = M({ color: 0xc9ccd0, metalness: 0.85, roughness: 0.3 });
    box(4.2, 0.86, 0.6, cab, 5.45, 0.43, -6.0); box(4.25, 0.04, 0.64, top, 5.45, 0.88, -5.99); blockC(3.33, 0, -6.3, 7.57, 0.9, -5.66);
    for (let k = 0; k < 7; k++) { const x = 3.6 + k * 0.6; box(0.56, 0.7, 0.012, M({ color: 0x46667a, roughness: 0.45 }), x, 0.43, -5.695); box(0.12, 0.02, 0.02, steel, x, 0.72, -5.68); }
    // stove (4 burners) + oven door + knobs + range hood
    box(0.76, 0.02, 0.6, M({ color: 0x151515, roughness: 0.25 }), 5.38, 0.905, -6.0);
    for (const [x, z] of [[5.2, -5.85], [5.56, -5.85], [5.2, -6.15], [5.56, -6.15]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 20), M({ color: 0x333333, metalness: 0.6 })); r.rotation.x = Math.PI / 2; r.position.set(x, 0.92, z); group.add(r); }
    box(0.7, 0.55, 0.012, M({ color: 0x1a1a1a, roughness: 0.2, metalness: 0.4 }), 5.38, 0.43, -5.69); box(0.5, 0.25, 0.006, M({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.2 }), 5.38, 0.45, -5.684);
    for (let k = 0; k < 4; k++) cyl(0.02, 0.02, 0.02, steel, 5.13 + k * 0.17, 0.78, -5.68).rotation.x = Math.PI / 2;
    box(0.8, 0.35, 0.5, steel, 5.38, 2.0, -6.03); box(0.6, 0.6, 0.3, steel, 5.38, 2.45, -6.12);
    // sink + faucet + dish rack (under the window)
    box(0.62, 0.05, 0.44, M({ color: 0x9da2a7, metalness: 0.8, roughness: 0.25 }), 6.75, 0.875, -6.0);
    { const fm = steel; cyl(0.02, 0.02, 0.28, fm, 6.75, 1.04, -6.2); const sp = new THREE.TorusGeometry(0.09, 0.016, 8, 16, Math.PI); add(sp, fm, 6.75, 1.18, -6.11, Math.PI / 2, 0, 0); }
    box(0.4, 0.02, 0.3, M({ color: 0x9fb3c6 }), 7.3, 0.91, -5.98); for (let k = 0; k < 5; k++) box(0.01, 0.22, 0.2, M({ color: 0xf2f2f2 }), 7.15 + k * 0.07, 1.02, -5.98, 0, 0, 0.2);
    // upper cabinets (left of the hood and right of the window), window with blinds
    for (const [x0, x1] of [[3.35, 4.95], [7.35, 7.6]]) { box(x1 - x0, 0.72, 0.34, cab, (x0 + x1) / 2, 1.85, -6.12); }
    const bl = blindsTex(); plane(1.05, 0.95, M({ map: bl, emissive: 0xffffff, emissiveMap: bl, emissiveIntensity: 0.55, roughness: 0.6 }), 6.75, 1.75, -6.22, 0);
    for (const [w, h, x, y] of [[1.15, 0.06, 6.75, 2.25], [1.15, 0.06, 6.75, 1.25], [0.06, 1.0, 6.2, 1.75], [0.06, 1.0, 7.3, 1.75]]) box(w, h, 0.06, frameM, x, y, -6.22);
    // fridge (tall, east end) with magnets + photos, pantry (west end)
    box(0.82, 1.86, 0.68, M({ color: 0xe6e6e2, roughness: 0.35, metalness: 0.2 }), 8.22, 0.93, -5.94); blockC(7.8, 0, -6.3, 8.64, 1.87, -5.58, 'furniture');
    box(0.02, 0.4, 0.03, steel, 7.83, 1.3, -5.58); box(0.02, 0.3, 0.03, steel, 7.83, 0.6, -5.58); box(0.8, 0.01, 0.01, M({ color: 0xbdbdb8 }), 8.22, 1.05, -5.6);
    for (let k = 0; k < 4; k++) plane(0.13, 0.1, M({ map: photoTex(20 + k) }), 8.05 + (k % 2) * 0.2, 1.45 + Math.floor(k / 2) * 0.17, -5.595, 0);
    box(0.5, 2.1, 0.55, M({ color: 0x46667a, roughness: 0.5 }), 3.55, 1.05, -4.25); blockC(3.28, 0, -4.53, 3.82, 2.11, -3.98, 'furniture');
    // counter clutter: microwave, toaster, kettle, fruit bowl, cutting board, knife block, paper towels, spice jars
    box(0.48, 0.28, 0.36, M({ color: 0x2a2a2a, roughness: 0.4 }), 3.75, 1.04, -6.05); box(0.3, 0.2, 0.01, M({ color: 0x050505, roughness: 0.05 }), 3.7, 1.04, -5.87);
    box(0.24, 0.17, 0.14, steel, 4.3, 0.985, -6.05); cyl(0.08, 0.09, 0.2, M({ color: 0xb03a2e, roughness: 0.3 }), 4.65, 1.0, -6.05, 18);
    cyl(0.16, 0.1, 0.08, M({ color: 0xd8d2c4, roughness: 0.5 }), 6.2, 0.94, -5.9, 20); for (const [dx, dz, c] of [[0, 0, 0xe0b23c], [0.06, 0.04, 0xc0392b], [-0.05, 0.03, 0x6aa84f], [0.02, -0.06, 0xf08a24]]) add(new THREE.SphereGeometry(0.045, 12, 8), M({ color: c, roughness: 0.5 }), 6.2 + dx, 1.0, -5.9 + dz);
    box(0.36, 0.02, 0.25, M({ color: 0xa47a4c, roughness: 0.6 }), 4.95, 0.91, -5.85, 0.2); box(0.12, 0.22, 0.1, wood, 4.98, 1.0, -6.18);
    cyl(0.05, 0.05, 0.26, M({ color: 0xf5f3ee }), 7.48, 1.03, -6.15, 14);
    for (let k = 0; k < 6; k++) cyl(0.022, 0.022, 0.08, M({ color: [0xc0392b, 0x8e6b3c, 0x3f7d3a, 0xe0b23c, 0x5b3a29, 0x9a9a9a][k] }), 3.5 + k * 0.06, 0.94, -6.22, 10);
    // small round dining table + 2 chairs + calendar + trash bin
    cyl(0.45, 0.45, 0.04, woodL, 7.75, 0.75, -4.55, 28); cyl(0.04, 0.05, 0.72, wood, 7.75, 0.37, -4.55, 12); cyl(0.25, 0.28, 0.03, wood, 7.75, 0.015, -4.55, 20);
    blockC(7.3, 0, -5.0, 8.2, 0.77, -4.1);
    for (const [x, z, ry] of [[7.15, -4.4, Math.PI / 2], [8.3, -4.75, -Math.PI / 2]]) { const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = ry; group.add(ch);
      for (const [w, h, d, yy, zz] of [[0.42, 0.04, 0.42, 0.46, 0], [0.42, 0.45, 0.03, 0.7, -0.2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); m.position.set(0, yy, zz); m.castShadow = true; ch.add(m); }
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), wood); m.position.set(lx, 0.225, lz); ch.add(m); }
      solid(x - 0.23, 0, z - 0.23, x + 0.23, 0.5, z + 0.23, { kind: 'furniture' }); }
    cyl(0.16, 0.15, 0.45, steel, 3.95, 0.225, -5.45, 18);
    const cal = canvas(256, 320, (g, w, h) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f6f8f'; g.fillRect(0, 0, w, 90); g.fillStyle = '#fff'; g.font = 'bold 34px Georgia'; g.fillText('OCTOBER', 20, 60); g.strokeStyle = '#888'; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.strokeRect(10 + c * 34, 100 + r * 42, 34, 42); g.fillStyle = '#c0392b'; g.font = 'bold 14px Arial'; g.fillText('MJ 8pm', 50, 160); g.fillText('rent!', 160, 230); });
    plane(0.3, 0.38, M({ map: cal }), 8.635, 1.55, -4.55, -Math.PI / 2); }

  // ======================================================================== BATHROOM
  { const por = M({ color: 0xf6f6f2, roughness: 0.25 }), chrome = M({ color: 0xd0d4d8, metalness: 0.95, roughness: 0.15 });
    // tub (south-west corner) + shower curtain + shower head
    box(1.66, 0.56, 0.76, por, -1.82, 0.28, -5.9); box(1.5, 0.05, 0.6, M({ color: 0xdfe6ea, roughness: 0.15 }), -1.82, 0.55, -5.9); blockC(-2.65, 0, -6.28, -0.98, 0.57, -5.52);
    cyl(0.012, 0.012, 1.7, chrome, -1.82, 2.05, -5.5).rotation.z = Math.PI / 2;
    { const cg = new THREE.PlaneGeometry(0.75, 1.5, 16, 1); const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 26) * 0.035); cg.computeVertexNormals();
      add(cg, M({ map: fabricTex('#e9eef0', '#8fb7c4', true), side: THREE.DoubleSide, roughness: 0.9 }), -2.25, 1.3, -5.5); }
    cyl(0.05, 0.03, 0.04, chrome, -2.6, 1.85, -5.9).rotation.z = Math.PI / 2; cyl(0.01, 0.01, 0.15, chrome, -2.63, 1.85, -5.9).rotation.z = Math.PI / 2;
    // toilet
    { const tg = new THREE.Group(); tg.position.set(-0.25, 0, -5.98); group.add(tg);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 20), por); bowl.position.set(0, 0.2, 0.08); bowl.scale.set(1, 1, 1.25); tg.add(bowl);
      const seat = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), M({ color: 0xffffff, roughness: 0.3 })); seat.rotation.x = Math.PI / 2; seat.position.set(0, 0.41, 0.1); seat.scale.set(1, 1.25, 1); tg.add(seat);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.18), por); tank.position.set(0, 0.6, -0.22); tg.add(tank);
      blockC(-0.48, 0, -6.3, -0.02, 0.45, -5.65, 'furniture'); }
    // vanity + sink + mirror cabinet (east wall), towel rail, bath mat, hamper, toilet paper, toothbrushes
    box(0.5, 0.82, 0.8, M({ color: 0x5f7f8f, roughness: 0.5 }), 0.19, 0.41, -4.7); box(0.54, 0.04, 0.84, M({ color: 0xe9e6df, roughness: 0.25 }), 0.18, 0.84, -4.7); blockC(-0.09, 0, -5.12, 0.44, 0.86, -4.28);
    box(0.36, 0.04, 0.44, por, 0.15, 0.87, -4.7); cyl(0.012, 0.012, 0.16, chrome, 0.38, 0.95, -4.7);
    { const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8d4d8, metalness: 1, roughness: 0.05 })); mir.position.set(0.425, 1.55, -4.7); mir.rotation.y = -Math.PI / 2; group.add(mir); box(0.1, 0.78, 0.63, M({ color: 0xf2f0ea }), 0.39, 1.55, -4.7); }
    cyl(0.03, 0.025, 0.1, M({ color: 0x9fc3c9, roughness: 0.4 }), 0.3, 0.91, -4.95, 12); for (const [dz, c] of [[-0.01, 0xc0392b], [0.015, 0x2d6fb0]]) box(0.008, 0.16, 0.008, M({ color: c }), 0.3, 1.0, -4.95 + dz, 0, 0, 0.15);
    cyl(0.01, 0.01, 0.7, chrome, -0.25, 1.15, -3.82).rotation.z = Math.PI / 2;
    { const tw = new THREE.BoxGeometry(0.5, 0.6, 0.05, 2, 6, 1); const tp = tw.attributes.position; for (let i = 0; i < tp.count; i++) tp.setZ(i, tp.getZ(i) + 0.015 * Math.sin(tp.getY(i) * 14)); tw.computeVertexNormals(); add(tw, M({ color: 0xd7663f, roughness: 1 }), -0.25, 0.85, -3.84); }
    plane(0.8, 0.5, M({ color: 0x3c6e8f, roughness: 1 }), -1.4, 0.007, -5.25, 0, -Math.PI / 2);
    cyl(0.17, 0.15, 0.5, M({ map: fabricTex('#c9b79c', '#a89678'), roughness: 1 }), -2.35, 0.25, -4.1, 16); blockC(-2.55, 0, -4.3, -2.15, 0.5, -3.9);
    cyl(0.055, 0.055, 0.1, M({ color: 0xffffff, roughness: 0.9 }), 0.05, 0.62, -5.9, 16).rotation.x = Math.PI / 2; }

  // ======================================================================== UTILITY CLOSET
  { const appl = M({ color: 0xeeeeea, roughness: 0.4 }), shelfM = M({ color: 0x6b6f75, metalness: 0.6, roughness: 0.4 });
    for (const x of [0.95, 1.65]) { box(0.66, 0.86, 0.62, appl, x, 0.43, -5.96); const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), M({ color: 0x2b2b2b, roughness: 0.15, metalness: 0.3 })); dr.rotation.x = Math.PI / 2; dr.position.set(x, 0.45, -5.64); group.add(dr); box(0.6, 0.06, 0.01, M({ color: 0xcfd3d8 }), x, 0.8, -5.645); }
    blockC(0.6, 0, -6.3, 2.0, 0.88, -5.63);
    box(0.5, 1.9, 1.6, shelfM, 2.88, 0.95, -5.3); blockC(2.6, 0, -6.15, 3.16, 1.92, -4.45, 'furniture');
    const labels = ['XMAS', 'PHOTOS', 'WEB FLUID', 'TAXES', "DAD'S", 'MISC'];
    for (let s = 0; s < 4; s++) { const y = 0.1 + s * 0.55; box(0.48, 0.03, 1.56, shelfM, 2.88, y, -5.3);
      if (s < 3) for (let k = 0; k < 2; k++) { const lt = canvas(128, 96, (g, w, h) => { g.fillStyle = '#b9925f'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2a2a'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText(labels[(s * 2 + k) % labels.length], w / 2, h / 2 + 7); noise(g, w, h, 0.1, 800); });
        box(0.4, 0.34, 0.55, M({ map: lt, roughness: 0.9 }), 2.86, y + 0.19, -5.85 + k * 0.62); } }
    // helmet + riding jacket on hooks (for the bike), ironing board, vacuum, toolbox, mop bucket
    { const hm = M({ color: 0x1b2a44, roughness: 0.25, metalness: 0.3 }); const hg = new THREE.SphereGeometry(0.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); add(hg, hm, 0.68, 1.55, -4.6, 0, 0, Math.PI / 2);
      const vis = new THREE.SphereGeometry(0.151, 16, 8, -0.8, 1.6, 0.9, 0.7); add(vis, M({ color: 0x111111, roughness: 0.05, metalness: 0.4 }), 0.68, 1.55, -4.6, 0, 0, Math.PI / 2);
      box(0.03, 0.03, 0.06, M({ color: 0x777777, metalness: 0.8 }), 0.58, 1.68, -4.6); box(0.03, 0.03, 0.06, M({ color: 0x777777, metalness: 0.8 }), 0.58, 1.68, -5.1);
      const jk = new THREE.BoxGeometry(0.12, 0.75, 0.5, 1, 6, 4); const jp = jk.attributes.position; for (let i = 0; i < jp.count; i++) jp.setX(i, jp.getX(i) + 0.02 * Math.sin(jp.getY(i) * 9 + jp.getZ(i) * 5)); jk.computeVertexNormals();
      add(jk, M({ color: 0x1a1a1a, roughness: 0.55 }), 0.64, 1.28, -5.1); }
    box(0.04, 1.3, 0.38, M({ color: 0xd7d2c6 }), 2.4, 0.66, -4.0, 0, 0, 0.12);
    cyl(0.14, 0.14, 0.25, M({ color: 0xc0392b, roughness: 0.4 }), 1.2, 0.125, -5.25, 18); cyl(0.015, 0.015, 0.9, M({ color: 0x444444 }), 1.2, 0.7, -5.3);
    box(0.45, 0.18, 0.2, M({ color: 0xc0392b, metalness: 0.4, roughness: 0.4 }), 2.25, 0.09, -5.45); box(0.06, 0.05, 0.2, M({ color: 0x222222 }), 2.25, 0.2, -5.45);
    cyl(0.16, 0.13, 0.28, M({ color: 0xe0b23c, roughness: 0.4 }), 1.75, 0.14, -4.6, 16); }

  // ======================================================================== STAIRWELL + LOBBY
  const stepM = M({ color: 0x7d6a58, roughness: 0.7 }), noseM = M({ color: 0x4a3a2c, roughness: 0.5 });
  // flight 1: x -5.4..-4.12 from the top landing (z -3.6, y 0) down to the mid landing (z -6.4, y -1.6)
  // flight 2: x -3.98..-2.7 from the mid landing (z -6.4, y -1.6) down to the lobby (z -3.6, y LY)
  const N = 10, RISE = 0.16, RUN = 0.28;
  for (let k = 0; k < N; k++) {
    const y1 = -RISE * (k + 1), za = -3.6 - RUN * (k + 1), zb = -3.6 - RUN * k;
    box(1.28, y1 - LY, zb - za, stepM, -4.76, (y1 + LY) / 2, (za + zb) / 2); box(1.28, 0.03, 0.04, noseM, -4.76, y1 + 0.015, zb - 0.02);
    const y2 = -1.6 - RISE * (k + 1), zc = -6.4 + RUN * k, zd = -6.4 + RUN * (k + 1);
    box(1.28, y2 - LY + 0.001, zd - zc, stepM, -3.34, (y2 + LY) / 2, (zc + zd) / 2); box(1.28, 0.03, 0.04, noseM, -3.34, y2 + 0.015, zc + 0.02);
  }
  box(2.7, 1.6, 1.6, stepM, -4.05, -0.8 - 1.6, -7.2); // mid landing block
  // walking surfaces: smooth ramps half a riser under the step nosings (feet sit on the treads within +-8 cm)
  col.ramp(O.x - 5.4, O.z - 6.4, O.x - 4.12, O.z - 3.6, 2, O.y - 1.68, O.y - 0.08, O.y + LY);
  col.ramp(O.x - 3.98, O.z - 6.4, O.x - 2.7, O.z - 3.6, 2, O.y - 1.68, O.y + LY - 0.08, O.y + LY);
  solid(-5.4, LY, -8.0, -2.7, -1.6, -6.4, { kind: 'floor' });
  // the flights are split by a solid partition (old tenement style) with a handrail on each side; a railing guards the
  // top-landing edge over flight 2
  const railM = M({ color: 0x2a1d14, roughness: 0.4 }), balM = M({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 });
  box(0.14, 0.95 - LY, 2.8, M({ map: tex(wainscotTex('#2f4a3a', '#d8cfb6', 0.6), 1, 1), roughness: 0.85 }), -4.05, (0.95 + LY) / 2, -5.0);
  solid(-4.12, LY, -6.4, -3.98, 1.0, -3.6, { kind: 'rail' });
  { const len = Math.hypot(2.8, 1.6), ang = Math.atan2(1.6, 2.8);
    // flight 1 rises toward +z (from the mid landing up to the top landing), flight 2 falls toward +z
    for (const [x, yMid, up] of [[-5.33, -0.8 + 0.9, true], [-4.19, -0.8 + 0.9, true], [-3.91, -2.4 + 0.9, false], [-2.77, -2.4 + 0.9, false]]) {
      const r = box(0.055, 0.055, len, railM, x, yMid, -5.0); r.rotation.x = up ? -ang : ang;
    } }
  box(0.16, 0.06, 0.16, railM, -4.05, 0.98, -3.6);
  box(1.3, 0.06, 0.06, railM, -3.35, 0.97, -3.6); for (let k = 0; k <= 6; k++) box(0.02, 0.95, 0.02, balM, -3.95 + k * 0.21, 0.47, -3.6);
  solid(-3.98, 0, -3.66, -2.7, 1.0, -3.56, { kind: 'rail' });
  // mid-landing window (frosted, daylight)
  { const fr = M({ color: 0xfff3dc, emissive: 0xfff0d0, emissiveIntensity: 1.0, roughness: 0.5 }); plane(1.1, 1.45, fr, -4.05, -0.18, -7.93, 0); box(1.2, 0.06, 0.12, frameM, -4.05, -0.92, -7.9); }
  // lobby: mailboxes, radiator, notice board, plant, doormat, intercom, umbrella stand
  { const brass = M({ color: 0xb08d57, metalness: 0.85, roughness: 0.35 });
    box(0.12, 0.9, 1.6, brass, -5.33, -1.85, -0.5);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { box(0.012, 0.18, 0.22, M({ color: 0x8c6d3f, metalness: 0.8, roughness: 0.4 }), -5.265, -2.18 + r * 0.22, -1.1 + c * 0.24); box(0.01, 0.03, 0.08, M({ color: 0x1a1a1a }), -5.26, -2.13 + r * 0.22, -1.1 + c * 0.24); }
    const nb = canvas(256, 320, (g, w, h) => { g.fillStyle = '#5a3a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4a57a'; g.fillRect(10, 10, w - 20, h - 20); const notes = ['LAUNDRY ROOM CLOSED TUES', 'Lost cat: MILO (orange)', 'Super: Mr. Ditkovich 1A', 'RENT DUE 1ST', 'Piano lessons - 3C'];
      notes.forEach((t, i) => { g.fillStyle = ['#f7e76a', '#ffffff', '#bfe5f5', '#f6c5d8', '#ffffff'][i]; g.fillRect(20 + (i % 2) * 110, 24 + i * 56, 105, 48); g.fillStyle = '#222'; g.font = '11px Arial'; g.fillText(t.slice(0, 18), 26 + (i % 2) * 110, 44 + i * 56); g.fillText(t.slice(18), 26 + (i % 2) * 110, 58 + i * 56); }); });
    plane(0.55, 0.7, M({ map: nb }), -2.765, -1.6, -0.5, -Math.PI / 2);
    for (let k = 0; k < 9; k++) box(0.06, 0.55, 0.12, radM, -2.84, LY + 0.42, 0.9 + k * 0.12); blockC(-2.95, LY, 0.83, -2.7, LY + 0.72, 1.95);
    cyl(0.2, 0.16, 0.4, M({ color: 0x2b2b2b }), -5.1, LY + 0.2, 2.25, 18); blockC(-5.34, LY, 2.0, -4.86, LY + 0.42, 2.48);
    for (let k = 0; k < 12; k++) { const lf = new THREE.SphereGeometry(0.15, 8, 6); lf.scale(0.3, 1.7, 0.12); add(lf, M({ color: 0x356b2e }), -5.1 + Math.cos(k * 2.4) * 0.12, LY + 0.75 + (k % 3) * 0.15, 2.25 + Math.sin(k * 2.4) * 0.12, k * 2.4, 0.5 * Math.cos(k), 0.5 * Math.sin(k)); }
    plane(1.0, 0.6, M({ color: 0x3b2a1f, roughness: 1 }), -4.05, LY + 0.007, 2.1, 0, -Math.PI / 2);
    box(0.2, 0.32, 0.04, brass, -3.25, LY + 1.45, 2.53); for (let k = 0; k < 8; k++) box(0.03, 0.02, 0.01, M({ color: 0x1a1a1a }), -3.25 + ((k % 2) - 0.5) * 0.08, LY + 1.35 + Math.floor(k / 2) * 0.05, 2.51);
    cyl(0.1, 0.1, 0.5, M({ color: 0x1f3a2b }), -3.0, LY + 0.25, 2.3, 14);
    // transom over the street door + "418" + wall sconces
    const tr = M({ color: 0xfff3dc, emissive: 0xfff0d0, emissiveIntensity: 0.9 }); plane(1.0, 0.4, tr, -4.05, LY + 2.45, 2.535, Math.PI);
    const num = canvas(256, 96, (g, w, h) => { g.fillStyle = '#c9a75a'; g.font = 'bold 64px Georgia'; g.textAlign = 'center'; g.fillText('418', w / 2, 72); });
    plane(0.5, 0.19, new THREE.MeshStandardMaterial({ map: num, transparent: true, metalness: 0.6, roughness: 0.4 }), -4.05, LY + 2.45, 2.525, Math.PI); }
  // light fixtures (emissive) per room; the room lights themselves (3 point lights) follow the player (apartment system)
  const fixM = M({ color: 0xf6efe0, emissive: 0xffcf8a, emissiveIntensity: 1.4, side: THREE.DoubleSide }); lamps.push(fixM);
  const fixtures = [[0, HT, 0.1], [0.5, HT, -3.0], [6.0, HT, -3.0], [5.7, HT, 0], [6.0, HT, -5.0], [-1.1, HT, -5.0], [1.85, HT, -5.0], [-4.05, HT, -5.0], [-4.05, -0.25, -0.5], [-4.05, -0.25, 1.8]];
  for (const [x, y, z] of fixtures) { cyl(0.008, 0.008, 0.25, M({ color: 0x222222 }), x, y - 0.125, z); add(new THREE.SphereGeometry(0.16, 18, 10, 0, 6.28, 0, Math.PI * 0.55), fixM, x, y - 0.3, z, 0, Math.PI); }

  // ======================================================================== rooms, spots, points of interest
  const rooms = [
    { name: 'Bedroom', min: [-2.7, 0, -2.3], max: [2.7, HT, 2.3], light: [0, 2.15, 0.1] },
    { name: 'Hallway', min: [-2.7, 0, -3.7], max: [8.7, HT, -2.3], light: [2.4, 2.4, -3.0] },
    { name: 'Living room', min: [2.7, 0, -2.3], max: [8.7, HT, 2.3], light: [5.7, 2.3, 0] },
    { name: 'Kitchen', min: [3.2, 0, -6.3], max: [8.7, HT, -3.7], light: [6.0, 2.3, -5.0] },
    { name: 'Bathroom', min: [-2.7, 0, -6.3], max: [0.5, HT, -3.7], light: [-1.1, 2.3, -5.0] },
    { name: 'Closet', min: [0.5, 0, -6.3], max: [3.2, HT, -3.7], light: [1.85, 2.3, -5.0] },
    { name: 'Stairwell', min: [-5.4, LY, -8.0], max: [-2.7, HT, -2.3], light: [-4.05, 0.8, -5.2] },
    { name: 'Lobby', min: [-5.4, LY, -3.6], max: [-2.7, -0.25, 2.6], light: [-4.05, -1.0, 0.0] },
  ];
  const spots = {
    window: new THREE.Vector3(0, 0, 1.75), windowYaw: Math.PI,           // stand at the bedroom window, facing in
    windowUse: new THREE.Vector3(0, 1.6, 2.0),
    lobby: new THREE.Vector3(-4.05, LY, 1.7), lobbyYaw: Math.PI,         // just inside the street door, facing in
    streetUse: new THREE.Vector3(-4.05, LY + 1.1, 2.35),
  };
  const pois = [
    { name: 'The Research Wall', text: 'Clippings, photos and red string: Oscorp, a missing scientist, and a father who left too many questions.', pos: new THREE.Vector3(hw - 0.1, 1.7, dzc), r: 1.6 },
    { name: 'Web-Fluid Lab', text: 'Test tubes of polymer mix, a scorched burner and a web-shooter mid-rebuild. Tensile strength x3 — finally.', pos: new THREE.Vector3(dX, 0.88, -0.25), r: 1.2 },
    { name: 'The Desk', text: 'Code on the monitor, Bugle photo submissions on the laptop, a vintage film camera and the mask, folded and waiting.', pos: new THREE.Vector3(dX, 0.95, 0.9), r: 1.2 },
    { name: 'Bookshelf', text: 'Organic chemistry, a science-fair trophy, comics, and a cube puzzle solved in 41 seconds.', pos: new THREE.Vector3(sx0 + shelfW / 2, 1.2, -hd), r: 1.3 },
    { name: 'The TV', text: 'A racing game paused on lap two. Has been paused for three weeks.', pos: new THREE.Vector3(8.4, 1.3, 0), r: 2.0 },
    { name: 'The Fridge', text: 'Leftover pizza, eggs, a note from Aunt May: "EAT SOMETHING GREEN."', pos: new THREE.Vector3(8.2, 1.2, -5.7), r: 1.3 },
    { name: 'Helmet & Jacket', text: 'Riding gear for the bike parked outside. The jacket hides web-shooters nicely.', pos: new THREE.Vector3(0.66, 1.4, -4.85), r: 1.2 },
  ];
  bakeStatic(group, new Set(doors.map(d => d.pivot)));
  return { group, col, doors, rooms, lamps, window: { plane: viewPlane, mat: viewMat, w: 9, h: 6 }, spots, pois, size: { W, D, HT }, lobbyY: LY };
}

// (user r19 perf) ~1100 props -> a few dozen draw calls. Every static mesh in the set (not the swinging doors) is baked
// into the group's frame and merged: plain-coloured standard materials (books, cushions, boxes, frames...) share ONE
// vertex-coloured material per (roughness, metalness, side, shadow) bucket; textured / emissive / transparent / special
// materials merge per material appearance. Multi-material meshes (the walls) are split by their face groups first.
function bakeStatic(group, skip) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const buckets = new Map(), victims = [], vcMats = new Map(), col = new THREE.Color();
  const plain = (m) => m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.map && !m.emissiveMap && !m.alphaMap && !m.transparent && !m.vertexColors
    && m.emissive.getHex() === 0 && !m.polygonOffset && !m.onBeforeCompile.toString().includes('discard') && m.alphaTest === 0;
  const keyOf = (m, cast) => plain(m) ? `vc|${m.roughness.toFixed(2)}|${m.metalness.toFixed(2)}|${m.side}|${cast}`
    : `m|${m.uuid}|${cast}`;
  const walk = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) victims.push(o);
    for (const c of o.children) walk(c);
  };
  for (const c of group.children) walk(c);
  for (const mesh of victims) {
    m4.multiplyMatrices(inv, mesh.matrixWorld);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const g0 = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const a of Object.keys(g0.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g0.deleteAttribute(a);
    if (!g0.attributes.uv) g0.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g0.attributes.position.count * 2), 2));
    g0.applyMatrix4(m4);
    // split by material group (walls)
    const parts = [];
    if (Array.isArray(mesh.material) && mesh.geometry.groups.length) {
      const idx = mesh.geometry.index;
      for (const gr of mesh.geometry.groups) {
        const start = gr.start, count = gr.count; // non-indexed copy keeps index order: triangle k -> vertices 3k..3k+2
        const sub = new THREE.BufferGeometry();
        for (const a of ['position', 'normal', 'uv']) { const src = g0.attributes[a]; sub.setAttribute(a, new THREE.BufferAttribute(src.array.slice(start * src.itemSize, (start + count) * src.itemSize), src.itemSize)); }
        parts.push({ g: sub, m: mats[gr.materialIndex] });
        void idx;
      }
    } else parts.push({ g: g0, m: mats[0] });
    for (const { g, m } of parts) {
      if (!m) continue;
      const key = keyOf(m, mesh.castShadow);
      if (key.startsWith('vc|')) { // bake the flat colour into the vertices
        col.copy(m.color); const n = g.attributes.position.count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        if (!vcMats.has(key)) vcMats.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness, metalness: m.metalness, side: m.side }));
      }
      let b = buckets.get(key); if (!b) buckets.set(key, b = { geos: [], mat: key.startsWith('vc|') ? vcMats.get(key) : m, cast: mesh.castShadow, recv: mesh.receiveShadow, order: mesh.renderOrder });
      b.geos.push(g);
    }
  }
  for (const mesh of victims) mesh.parent?.remove(mesh);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false); if (!merged) continue;
    merged.computeBoundingSphere();
    const mm = new THREE.Mesh(merged, b.mat); mm.castShadow = b.cast; mm.receiveShadow = true; mm.renderOrder = b.order; mm.name = 'aptBaked';
    group.add(mm);
  }
}

// ---------------------------------------------------------------- street entrance (in the city, under the window)
// a recessed door with a stoop, a lamp and the house number. Local frame: +Z = out of the facade, origin on the facade
// at ground level. Returns { group, use (local point for the [F] prompt) }.
export function buildStreetEntrance() {
  const g = new THREE.Group(); g.name = 'aptStreetDoor';
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const stone = M({ color: 0x8c8378, roughness: 0.9 }), dark = M({ color: 0x2a211b, roughness: 0.5 });
  add(new THREE.BoxGeometry(2.2, 0.16, 1.1), stone, 0, 0.08, 0.55); add(new THREE.BoxGeometry(1.8, 0.16, 0.7), stone, 0, 0.24, 0.35); // stoop
  add(new THREE.BoxGeometry(1.7, 2.9, 0.12), M({ color: 0x5b4a3c }), 0, 1.6, 0.04);                                                // surround
  add(new THREE.BoxGeometry(1.15, 2.3, 0.06), dark, 0, 1.47, 0.11);                                                              // door
  const glass = M({ color: 0xffe6b8, emissive: 0xffd28a, emissiveIntensity: 0.7, roughness: 0.2 });
  add(new THREE.PlaneGeometry(0.75, 1.3), glass, 0, 1.75, 0.145); add(new THREE.PlaneGeometry(1.1, 0.35), glass, 0, 2.85, 0.105);
  add(new THREE.SphereGeometry(0.035, 12, 8), M({ color: 0xb8a060, metalness: 0.9, roughness: 0.3 }), 0.42, 1.2, 0.16);
  const lamp = M({ color: 0xfff2d6, emissive: 0xffc777, emissiveIntensity: 1.6 }); add(new THREE.SphereGeometry(0.11, 14, 10), lamp, 0.95, 2.45, 0.22);
  const num = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#c9a75a'; x.font = 'bold 64px Georgia'; x.textAlign = 'center'; x.fillText('418', 128, 72); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  add(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshStandardMaterial({ map: num, transparent: true, metalness: 0.6, roughness: 0.4 }), 0, 2.85, 0.12);
  return { group: g, use: new THREE.Vector3(0, 1.2, 0.9) };
}
