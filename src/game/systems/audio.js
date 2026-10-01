// OWNER: systems engineer. File-based WebAudio: playlist score + tonal SFX.
//   music:  two full tracks from public/assets/audio, played in order on a loop (crossfaded)
//   sfx:    sprites (trav / combat / ui / world) + JSON map (manifest.json)
//   world:  positional loops (bank alarm bell, police siren) and horns through HRTF PannerNodes
// Buses: master -> {music (duck + pause low-pass), world (pause muffle) -> {sfx, ambience}, ui}; volumes from settings.
// Loading is lazy (first user gesture), async and never blocks the game; calls before load are silently dropped.
import * as THREE from 'three';

const BASE = '/assets/audio/';
const MUSIC_XFADE = 4;
const SPRITE_BUS = { trav: 'sfx', combat: 'sfx', ui: 'ui', world: 'ambience' };
const clamp = THREE.MathUtils.clamp;

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, ready = false, man = null, master, comp, muffle, musicLP, musicDuck, loadErr = null;
  const vol = { master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.75, ui: 0.7 };
  const MUSIC_K = 0.45; // playlist tracks sit under SFX; the music slider scales on top
  const bus = {}, bufs = {}, mbufs = {}, lbufs = {}, voices = new Map();
  const music = { started: false, t0: 0, idx: 0, cur: null, prev: null, timer: 0 };
  const listenerPos = new THREE.Vector3(), _f = new THREE.Vector3();
  const loops = new Map(); // id -> { kind, pos, src, gain, panner }
  let paused = false;

  const G = (v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const now = () => ac.currentTime;

  function init() {
    if (ac || !AC) return;
    try { ac = new AC({ latencyHint: 'interactive' }); } catch { return; }
    master = G(vol.master);
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.25;
    master.connect(comp).connect(ac.destination);
    musicLP = ac.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 20000; musicLP.Q.value = 0.5;
    musicDuck = G(1); bus.music = G(vol.music * MUSIC_K); bus.music.connect(musicDuck).connect(musicLP).connect(master);
    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
    const world = G(1); world.connect(muffle).connect(master);
    bus.sfx = G(vol.sfx); bus.sfx.connect(world);
    bus.ambience = G(vol.ambience); bus.ambience.connect(world);
    bus.ui = G(vol.ui); bus.ui.connect(master);
    ready = true;
    load();
  }
  const resume = () => { init(); if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, resume, { capture: true, passive: true });

  // ------------------------------------------------------------------ loading (lazy, async, never blocking)
  async function fetchBuf(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url); return await ac.decodeAudioData(await r.arrayBuffer()); }
      catch (e) { if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
    }
  }
  async function load() {
    try {
      man = await (await fetch(BASE + 'manifest.json')).json();
      // small sprites first (UI / traversal are heard right away), then the loops, then the music stems
      await Promise.all(Object.entries(man.sprites).map(async ([k, s]) => { bufs[k] = await fetchBuf(s.url); }));
      await Promise.all(Object.entries(man.loops).map(async ([k, s]) => { lbufs[k] = await fetchBuf(s.url); }));
      const tracks = man.music?.tracks || [];
      await Promise.all(tracks.map(async (tr) => {
        try { mbufs[tr.id] = await fetchBuf(tr.url); }
        catch (e) { console.warn('[audio] track failed:', tr.id, e); }
      }));
      startMusic();
    } catch (e) { loadErr = String(e?.message || e); console.warn('[audio] load failed:', loadErr); }
  }

  // ------------------------------------------------------------------ music
  function playlist() { return (man?.music?.tracks || []).filter((tr) => mbufs[tr.id]); }
  function startMusic() {
    const tracks = playlist();
    if (music.started || !tracks.length) return;
    music.started = true;
    const t0 = now() + 0.25;
    musicDuck.gain.setValueAtTime(0, t0); musicDuck.gain.linearRampToValueAtTime(1, t0 + 5);
    playTrack(0, t0, true);
  }
  function playTrack(idx, at = now(), fadeIn = true) {
    const tracks = playlist();
    if (!tracks.length) return;
    const tr = tracks[((idx % tracks.length) + tracks.length) % tracks.length];
    const buf = mbufs[tr.id]; if (!buf) return;
    const t = Math.max(at, now());
    const fade = Math.min(MUSIC_XFADE, buf.duration * 0.12);
    if (music.cur?.g) {
      const pg = music.cur.g.gain;
      pg.cancelScheduledValues(t); pg.setValueAtTime(1, t); pg.linearRampToValueAtTime(0, t + fade);
      try { music.cur.s.stop(t + fade + 0.05); } catch { /* already stopped */ }
      music.prev = music.cur;
    }
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = G(0); s.connect(g).connect(bus.music);
    if (fadeIn) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); }
    else g.gain.setValueAtTime(1, t);
    s.start(t);
    music.idx = tracks.indexOf(tr); music.t0 = t; music.cur = { s, g, id: tr.id, dur: buf.duration };
    const nextAt = t + buf.duration - fade;
    clearTimeout(music.timer);
    const wait = Math.max(50, (nextAt - now()) * 1000);
    music.timer = setTimeout(() => playTrack(music.idx + 1, now(), true), wait);
  }
  function duck(amount = 0.4, hold = 0.8, release = 0.9) {
    if (!ready || !music.started) return;
    const t = now(), g = musicDuck.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(1 - amount, t, 0.06); g.setTargetAtTime(1, t + hold, release);
  }

  // ------------------------------------------------------------------ one-shots
  // play(name, {gain, pan, rate, at, k (force variation), pos (Vector3 / {x,y,z} -> positional), out (bus)})
  function play(name, o = {}) {
    if (!ready || !man) return null;
    const s = man.sounds[name]; const buf = s && bufs[s.sprite]; if (!buf) return null;
    const t = now() + (o.at || 0);
    let vs = voices.get(name); if (!vs) voices.set(name, vs = []);
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i].end < now()) vs.splice(i, 1);
    if (vs.length && t - vs[vs.length - 1].t < 0.03) return null; // same-moment spam
    while (vs.length >= (s.max || 4)) { const v = vs.shift(); try { v.g.gain.setTargetAtTime(0, now(), 0.015); v.src.stop(now() + 0.1); } catch { /* ended */ } }
    const n = s.v.length;
    let k = o.k != null ? clamp(Math.round(o.k), 0, n - 1) : Math.floor(Math.random() * n);
    if (o.k == null && n > 1 && k === s.last) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
    s.last = k;
    const [off, dur] = s.v[k];
    const rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (s.jit || 0));
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = G(s.gain * (o.gain ?? 1));
    let node = src.connect(g);
    if (o.pos) {
      const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = o.ref || 10; p.rolloffFactor = 1; p.maxDistance = 2000;
      setPos(p, o.pos); node = node.connect(p);
    } else if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); node = node.connect(p); }
    node.connect(bus[o.out || SPRITE_BUS[s.sprite] || 'sfx']);
    src.start(t, off, dur);
    vs.push({ src, g, t, end: t + dur / rate });
    return { src, g };
  }
  function setPos(p, v) {
    if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
  }

  // (user r-oldzip) "the web zip sounds are bad, bring back the old ones only": the previous live-synth web thwip
  // (band-passed white-noise bursts + a falling triangle chirp), restored verbatim for the web shot / zip. Every other
  // sound stays on the new sprites.
  let wNoise = null;
  function oldEnv(g, t, a, peak, d, rel = 0.05) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.gain.setValueAtTime(0, t + a + d + rel);
  }
  function oldOut(n, pan) { if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; n = n.connect(p); } n.connect(bus.sfx); }
  function oldNoise({ f, f2, q, dur, g, at = 0, pan = 0, a = 0.005 }) {
    if (!wNoise) { const n = Math.floor(ac.sampleRate * 3); wNoise = ac.createBuffer(2, n, ac.sampleRate); for (let c = 0; c < 2; c++) { const d = wNoise.getChannelData(c); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } }
    const t = now() + at, sN = ac.createBufferSource(); sN.buffer = wNoise;
    const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
    const gg = G(0); oldEnv(gg, t, a, g, dur); oldOut(sN.connect(fl).connect(gg), pan); sN.start(t, Math.random() * 2); sN.stop(t + a + dur + 0.1);
  }
  function oldTone({ f, f2, dur, g, pan = 0, a = 0.005 }) {
    const t = now(), o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gg = G(0); oldEnv(gg, t, a, g, dur); oldOut(o.connect(gg), pan); o.start(t); o.stop(t + a + dur + 0.1);
  }
  function oldThwip(strength = 1, pan = 0) {
    if (!ready) return;
    const p = (Math.random() - 0.5) * 0.3 + pan;
    oldNoise({ f: 4200, f2: 1300, q: 2.2, dur: 0.09, g: 0.32 * strength, pan: p });
    oldNoise({ f: 2400, f2: 700, q: 6, dur: 0.16, g: 0.12 * strength, at: 0.012, pan: p });
    oldTone({ f: 1900 + Math.random() * 300, f2: 420, dur: 0.07, g: 0.07 * strength, pan: p });
  }

  const sfx = {
    // --- web / traversal
    thwip(strength = 1, pan = 0) { oldThwip(strength, pan); }, // (user r-oldzip) old synth thwip
    zip() { oldThwip(1.2); }, // (user r-oldzip) as before: zips play the thwip only
    attach(pan = 0) { play('attach', { pan }); },
    release(pan = 0) { play('release', { pan }); },
    slingCreak(t = 0.5, pan = 0) { const k = clamp(t, 0, 1); play('creak', { k: k * 3.4, gain: 0.45 + 0.6 * k, pan }); },
    slingLaunch(t = 1) { const k = clamp(t, 0, 1); play('launch', { gain: 0.6 + 0.4 * k }); if (k > 0.6) duck(0.15, 0.3); },
    // user r13b: air rip — the fast pass through the bottom of a swing arc / a dive-catch slingshot (filtered noise sweep)
    airRip(k = 1, pan = 0) {
      if (!ready) return; k = clamp(k, 0, 1.4);
      oldNoise({ f: 380, f2: 2600, q: 0.9, dur: 0.42, g: 0.22 * k, a: 0.12, pan });
      oldNoise({ f: 1800, f2: 600, q: 1.4, dur: 0.5, g: 0.1 * k, at: 0.14, a: 0.05, pan: -pan });
    },
    whoosh(speed = 20) { play('swipe', { gain: clamp(speed / 22, 0.4, 1.1) }); }, // combat swings: a soft tonal swipe, no air noise
    land(sev = 0.5) {
      const t = clamp(sev, 0, 1);
      if (t < 0.3) play('land_soft', { gain: 0.6 + t });
      else if (t < 0.7) play('land_med', { gain: 0.7 + 0.4 * (t - 0.3) / 0.4 });
      else { play('land_heavy', { gain: 0.8 + 0.3 * (t - 0.7) / 0.3 }); duck(0.3, 0.5); }
    },
    step(g = 1, pan = 0, kind = 'ground') {
      const k = clamp(g, 0.3, 1.6);
      if (kind === 'rope') play('rope', { gain: 0.7, pan });
      else play(kind === 'wall' ? 'wallstep' : 'step', { gain: 0.45 + 0.4 * k, pan });
    },
    jumpLoad() { play('jumpload'); },
    jump(charge = 0) { play('jump', { gain: 0.7 + 0.5 * clamp(charge, 0, 1) }); },
    wallContact() { play('wall'); },
    perch() { play('perch'); },
    // --- UI
    hover() { play('hover'); }, move() { play('move'); }, select() { play('select'); }, back() { play('back'); },
    open() { play('open'); }, close() { play('close'); }, deny() { play('deny'); }, toast() { play('toast'); },
    xp() { play('xp'); }, pickup() { play('pickup'); duck(0.2, 0.6); },
    levelUp() { play('levelup'); duck(0.45, 1.8, 1.4); },
    district() { play('district'); duck(0.4, 2.2, 1.6); },
    towerCharge(t) { play('tick', { rate: 0.8 + 0.8 * clamp(t, 0, 1) }); },
    shutter() { play('shutter'); },
    crime() { play('crime'); duck(0.25, 0.8); },
    success() { play('success'); duck(0.3, 1.0); },
    travel() { play('travel'); duck(0.55, 2.2, 1.2); },
    // --- combat
    hit(heavy = 0) { if (heavy > 0.5) play('hitheavy', { gain: 0.8 + 0.3 * heavy }); else play('hit', { gain: 0.75 + 0.5 * heavy }); },
    hurt(heavy = false) { play('hurt', { gain: heavy ? 1.1 : 0.8 }); if (heavy) duck(0.2, 0.4); },
    shot() { play('shot'); },
    slam() { play('slam'); duck(0.3, 0.5); },
    // --- world
    horn(pan = 0, dist = 1) { play(Math.random() < 0.3 ? 'horn_big' : 'horn_small', { pan, gain: clamp(1.4 / Math.max(1, dist), 0.12, 1) }); },
    hornAt(x, y, z, big = false) { play(big ? 'horn_big' : 'horn_small', { pos: { x, y, z }, ref: 8 }); },
    distantSiren(pan = 0) { // the tonal siren loop as a far one-shot (swell in, pass, fade), low-passed by distance
      const b = lbufs.siren; if (!ready || !b) return; const t = now();
      const s = ac.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = G(0); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
      const lv = (man.loops.siren.gain || 0.5) * 0.28;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 2); g.gain.setValueAtTime(lv, t + 4.5); g.gain.linearRampToValueAtTime(0, t + 7.5);
      let n = s.connect(lp).connect(g); if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n = n.connect(p); }
      n.connect(bus.ambience); s.start(t, Math.random() * 4); s.stop(t + 7.6);
    },
  };

  // ------------------------------------------------------------------ positional loops (bank alarm, police siren)
  function startLoopNodes(L) {
    const b = lbufs[L.kind === 'alarm' ? 'alarm' : 'siren']; if (!b) return;
    const panner = ac.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 14; panner.rolloffFactor = 1.1; panner.maxDistance = 2000;
    const gain = G(0); gain.gain.linearRampToValueAtTime(man.loops[L.kind === 'alarm' ? 'alarm' : 'siren'].gain || 0.4, now() + 0.8);
    const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
    src.connect(gain).connect(panner).connect(bus.sfx); src.start(now(), Math.random() * b.duration);
    setPos(panner, L.pos);
    Object.assign(L, { src, gain, panner });
  }
  function loop(id, kind, pos) {
    if (!ready || loops.has(id)) return;
    const L = { kind, pos: pos.clone(), src: null };
    loops.set(id, L);
    startLoopNodes(L); // (if the loop buffer is still loading, update() starts it once it arrives)
  }
  function loopPos(id, pos) { const L = loops.get(id); if (L) L.pos.copy(pos); }
  function stopLoop(id) {
    const L = loops.get(id); if (!L) return; loops.delete(id);
    if (!L.src) return;
    const t = now(); L.gain.gain.cancelScheduledValues(t); L.gain.gain.setValueAtTime(L.gain.gain.value, t); L.gain.gain.linearRampToValueAtTime(0, t + 0.6);
    L.src.stop(t + 0.7);
  }

  // ------------------------------------------------------------------ per-frame mix
  let hornT = 14, sirenT = 40;
  // user r13b: speed wind — a looped stereo noise bed through a band-pass whose level / brightness rise with speed in the
  // air (swing, fall, zip), plus a low rumble layer past ~35 m/s. Silent on foot and when paused.
  let wind = null;
  function windNodes() {
    if (wind || !ac) return wind;
    const n = Math.floor(ac.sampleRate * 4), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let br = 0; for (let i = 0; i < n; i++) { br = br * 0.985 + (Math.random() * 2 - 1) * 0.15; d[i] = br + (Math.random() * 2 - 1) * 0.35; } }
    const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
    const g = G(0);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    const g2 = G(0);
    src.connect(bp).connect(g).connect(bus.sfx); src.connect(lp).connect(g2).connect(bus.sfx); src.start();
    return (wind = { bp, g, g2, k: 0 });
  }
  function update(dt, { camera, playerPos, ground = 0, speed = 0, mode = '' }) {
    if (!ready) return;
    { const W = windNodes(), air = mode === 'swing' || mode === 'air' || mode === 'zip';
      if (W) {
        const want = paused || !air ? 0 : clamp((speed - 9) / 46, 0, 1);
        W.k += (want - W.k) * (1 - Math.exp(-(want > W.k ? 3 : 2) * dt));
        const t = now(), k = W.k;
        W.g.gain.setTargetAtTime(0.32 * k * k + 0.03 * k, t, 0.08);
        W.bp.frequency.setTargetAtTime(380 + 2400 * k * k, t, 0.1);
        W.g2.gain.setTargetAtTime(0.5 * clamp((speed - 34) / 24, 0, 1) * k, t, 0.15);
      } }
    // sparse distant city life (tonal): a far horn now and then near street level, a passing siren every minute or two
    const h = Math.max(0, playerPos.y - ground);
    const street = clamp(1 - (h - 4) / 70, 0, 1);
    if (!paused) {
      hornT -= dt; sirenT -= dt;
      if (hornT < 0) { hornT = 12 + Math.random() * 20; if (street > 0.3) sfx.horn((Math.random() - 0.5) * 1.6, 3 + Math.random() * 4); }
      if (sirenT < 0) { sirenT = 60 + Math.random() * 70; sfx.distantSiren((Math.random() - 0.5) * 1.6); }
    }
    // listener
    const Ls = ac.listener; camera.getWorldDirection(_f); listenerPos.copy(camera.position);
    if (Ls.positionX) { Ls.positionX.value = listenerPos.x; Ls.positionY.value = listenerPos.y; Ls.positionZ.value = listenerPos.z; Ls.forwardX.value = _f.x; Ls.forwardY.value = _f.y; Ls.forwardZ.value = _f.z; Ls.upX.value = 0; Ls.upY.value = 1; Ls.upZ.value = 0; }
    else { Ls.setPosition(listenerPos.x, listenerPos.y, listenerPos.z); Ls.setOrientation(_f.x, _f.y, _f.z, 0, 1, 0); }
    for (const Lp of loops.values()) { if (!Lp.src) startLoopNodes(Lp); if (Lp.panner) setPos(Lp.panner, Lp.pos); }
  }

  function setVolumes(s) {
    vol.master = s.masterVolume; vol.music = s.musicVolume ?? 0.6; vol.sfx = s.sfxVolume; vol.ambience = s.ambienceVolume; vol.ui = s.uiVolume;
    if (!ready) return; const t = now();
    master.gain.setTargetAtTime(vol.master, t, 0.05); bus.music.gain.setTargetAtTime(vol.music * MUSIC_K, t, 0.05); bus.sfx.gain.setTargetAtTime(vol.sfx, t, 0.05);
    bus.ambience.gain.setTargetAtTime(vol.ambience, t, 0.05); bus.ui.gain.setTargetAtTime(vol.ui, t, 0.05);
  }
  function setPaused(p) {
    paused = p; if (!ready) return;
    muffle.frequency.setTargetAtTime(p ? 700 : 20000, now(), p ? 0.08 : 0.2);
    musicLP.frequency.setTargetAtTime(p ? 900 : 20000, now(), p ? 0.15 : 0.3);
  }
  function state() {
    const r3 = x => Math.round(x * 1000) / 1000;
    return { ready, ctx: ac?.state || 'none', sr: ac?.sampleRate, loadErr, sprites: Object.keys(bufs), loops: Object.keys(lbufs), tracks: Object.keys(mbufs),
      music: { started: music.started, track: music.cur?.id || null, pos: music.started ? r3(now() - music.t0) : 0 },
      voices: [...voices.values()].reduce((a, v) => a + v.length, 0), activeLoops: loops.size };
  }

  const api = { sfx, play, duck, loop, loopPos, stopLoop, update, setVolumes, setPaused, resume, state, get ready() { return ready; }, get context() { return ac; } };
  window.__audio = api; // debug / playtest probe + the traffic system's horns (world/npc/traffic.js)
  return api;
}
