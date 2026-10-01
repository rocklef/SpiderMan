// OWNER: combat engineer. Combat HUD (DOM, pointer-events none): health bar with trailing damage, 3-segment focus bar,
// combo counter, spider-sense edge arrows toward attackers, brute health bar, damage vignette, perfect-dodge banner,
// controls hint strip at the start of a fight, transient messages.
import * as THREE from 'three';
import { clamp } from './util.js';

const CSS = `
#cmb-hud{position:fixed;inset:0;pointer-events:none;z-index:25;font-family:var(--sys-body,'Manrope',system-ui,sans-serif);color:#fff;opacity:0;transition:opacity .45s}
#cmb-hud.on{opacity:1}
#cmb-hud .bars{position:absolute;left:2.2vw;top:3.2vh;width:min(24vw,360px);padding:10px 14px 12px;background:rgba(10,11,14,.5);border:1px solid rgba(255,255,255,.1);border-radius:14px;backdrop-filter:blur(16px);clip-path:none}
#cmb-hud .hp{position:relative;height:8px;transform:none;background:rgba(255,255,255,.1);box-shadow:none;overflow:hidden;border-radius:99px}
#cmb-hud .hp i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%}
#cmb-hud .hp .trail{background:rgba(255,255,255,.45)}
#cmb-hud .hp .fill{background:linear-gradient(90deg,#ff5a62,#ff2b3a)}
#cmb-hud .hp.low .fill{animation:cmbLow .6s ease-in-out infinite}
@keyframes cmbLow{50%{filter:brightness(1.6)}}
#cmb-hud .lbl{display:flex;justify-content:space-between;font:650 11px/1 var(--sys-body,sans-serif);letter-spacing:.12em;color:rgba(255,255,255,.62);margin:0 0 6px 2px;text-shadow:none}
#cmb-hud .focus{display:flex;gap:5px;margin-top:8px;width:78%}
#cmb-hud .focus b{position:relative;flex:1;height:5px;transform:none;background:rgba(255,255,255,.1);box-shadow:none;overflow:hidden;border-radius:99px}
#cmb-hud .focus b i{position:absolute;inset:0;background:#fff;transform-origin:0 50%}
#cmb-hud .focus b.full{box-shadow:0 0 10px rgba(255,255,255,.35)}
#cmb-hud .combo{position:absolute;right:4.5vw;top:38vh;text-align:right;opacity:0;transition:opacity .25s;text-shadow:0 2px 16px rgba(0,0,0,.5)}
#cmb-hud .combo.on{opacity:1}
#cmb-hud .combo .n{font:750 56px/0.9 var(--sys-head,sans-serif);letter-spacing:-.03em}
#cmb-hud .combo .n small{font-size:.45em;margin-right:4px;color:rgba(255,43,58,.85)}
#cmb-hud .combo .t{font:650 12px/1 var(--sys-body,sans-serif);letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:4px}
#cmb-hud .combo .bar{height:2px;background:#ff2b3a;margin-top:8px;transform-origin:100% 50%;border-radius:99px}
#cmb-hud .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(200,0,10,.4) 100%);opacity:0}
#cmb-hud .slow{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 50%,rgba(20,40,80,.28) 100%);opacity:0;transition:opacity .2s}
#cmb-hud .banner{position:absolute;left:50%;top:27vh;transform:translateX(-50%) scale(.96);font:750 26px/1 var(--sys-head,sans-serif);letter-spacing:.12em;opacity:0;transition:opacity .2s,transform .2s;text-shadow:0 2px 18px rgba(0,0,0,.55);white-space:nowrap}
#cmb-hud .banner.on{opacity:1;transform:translateX(-50%) scale(1)}
#cmb-hud .msg{position:absolute;left:50%;bottom:22vh;transform:translateX(-50%);font:600 15px/1 var(--sys-body,sans-serif);letter-spacing:.08em;text-transform:uppercase;opacity:0;transition:opacity .25s;text-shadow:0 1px 8px #000}
#cmb-hud .msg.on{opacity:.95}
#cmb-hud .arrows i{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
#cmb-hud .arrows i:before{content:'';position:absolute;left:-15px;top:-11px;border-left:30px solid currentColor;border-top:11px solid transparent;border-bottom:11px solid transparent;filter:drop-shadow(0 0 6px currentColor)}
#cmb-hud .ebar{position:absolute;left:0;top:0;width:90px;height:4px;margin-left:-45px;background:rgba(0,0,0,.45);box-shadow:none;transform:none;border-radius:99px;opacity:0}
#cmb-hud .ebar i{position:absolute;inset:0;background:#ff2b3a;transform-origin:0 50%;border-radius:99px}
#cmb-hud .ebar.stun i{background:#e8eaef}
#cmb-hud .ebar.boss{width:140px;height:6px;margin-left:-70px;box-shadow:0 0 12px rgba(80,200,255,.35)}
#cmb-hud .ebar.boss i{background:linear-gradient(90deg,#9af4ff,#2ab4ff)}
#cmb-hud .boss{position:absolute;left:50%;top:4.4vh;transform:translateX(-50%);width:min(42vw,520px);opacity:0;transition:opacity .35s;pointer-events:none}
#cmb-hud .boss.on{opacity:1}
#cmb-hud .boss .nm{font:650 12px/1 var(--sys-body,sans-serif);letter-spacing:.28em;text-align:center;margin-bottom:8px;color:#c8f4ff;text-shadow:0 0 16px rgba(40,180,255,.5)}
#cmb-hud .boss .hp{position:relative;height:8px;transform:none;background:rgba(4,12,28,.55);box-shadow:none;overflow:hidden;border-radius:99px}
#cmb-hud .boss .hp i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:0 50%}
#cmb-hud .boss .hp .trail{background:#9fefff}
#cmb-hud .boss .hp .fill{background:linear-gradient(90deg,#7af4ff,#1aa8ff)}
#cmb-hud .hint{position:absolute;left:50%;bottom:3vh;transform:translateX(-50%);width:max-content;max-width:min(58vw,760px);display:flex;flex-wrap:wrap;justify-content:center;gap:9px 16px;font:550 13px/1 var(--sys-body,sans-serif);letter-spacing:.02em;opacity:0;transition:opacity .8s;white-space:nowrap;text-shadow:0 1px 8px #000}
#cmb-hud .hint.on{opacity:.92}
#cmb-hud .hint span{display:flex;align-items:center;gap:6px}
#cmb-hud .hint kbd{font:650 11px/1 var(--sys-body,sans-serif);border:1px solid rgba(255,255,255,.22);border-radius:7px;padding:3px 6px;background:rgba(10,11,14,.5)}
`;

export function createHud(c) {
  if (!document.getElementById('cmb-css')) { const st = document.createElement('style'); st.id = 'cmb-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'cmb-hud';
  root.innerHTML = `
    <div class="vig"></div><div class="slow"></div>
    <div class="bars"><div class="lbl"><span>HEALTH</span><span class="hpn">100</span></div>
      <div class="hp"><i class="trail"></i><i class="fill"></i></div>
      <div class="focus"><b><i></i></b><b><i></i></b><b><i></i></b></div></div>
    <div class="combo"><div class="n"><small>x</small><span>0</span></div><div class="t">COMBO</div><div class="bar"></div></div>
    <div class="arrows"></div><div class="ebars"></div>
    <div class="banner">PERFECT DODGE</div><div class="msg"></div>
    <div class="boss"><div class="nm">ELECTRO</div><div class="hp"><i class="trail"></i><i class="fill"></i></div></div>
    <div class="hint">
      <span><kbd>LMB</kbd>Attack</span><span><kbd>Hold LMB</kbd>Launch / Slam</span><span><kbd>C</kbd>Dodge</span><span><kbd>Space</kbd>Jump (evades)</span>
      <span><kbd>E</kbd>Web Strike</span><span><kbd>F</kbd>Web</span><span><kbd>R</kbd>Throw</span><span><kbd>Q</kbd>Finisher</span><span><kbd>Z</kbd>Heal</span></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const fill = $('.hp .fill'), trail = $('.hp .trail'), hpBox = $('.hp'), hpn = $('.hpn');
  const segs = [...root.querySelectorAll('.focus b')];
  const combo = $('.combo'), comboN = $('.combo .n span'), comboBar = $('.combo .bar');
  const vig = $('.vig'), slow = $('.slow'), banner = $('.banner'), msg = $('.msg'), hint = $('.hint');
  const arrows = $('.arrows'), ebars = $('.ebars');
  const arrowEls = [], ebarEls = new Map();
  let trailV = 1, vigV = 0, bannerT = 0, msgT = 0, hintT = 0, shown = false, lastHp = 100;
  const _v = new THREE.Vector3();

  return {
    show(on) { shown = on; root.classList.toggle('on', on); if (on) { hintT = 9; } },
    hurt(k) { vigV = Math.min(1, vigV + 0.5 + k); },
    banner(text) { banner.textContent = text; bannerT = 1.1; },
    flash(text) { msg.textContent = text; msgT = 1.4; },
    update(realDt, S) {
      const me = c.spidey;
      const hp = clamp(me.hp / me.maxHp, 0, 1);
      fill.style.transform = `scaleX(${hp})`;
      if (hp < trailV) trailV = Math.max(hp, trailV - realDt * (me.hp < lastHp ? 0 : 0.45)); else trailV = hp;
      if (me.hp < lastHp) this._hold = 0.5; lastHp = me.hp;
      this._hold = (this._hold || 0) - realDt; if (this._hold <= 0) trailV = Math.max(hp, trailV - realDt * 0.5);
      trail.style.transform = `scaleX(${trailV})`;
      hpBox.classList.toggle('low', hp < 0.3); hpn.textContent = Math.ceil(me.hp);
      segs.forEach((b, i) => { const k = clamp(me.focus - i, 0, 1); b.firstChild.style.transform = `scaleX(${k})`; b.classList.toggle('full', k >= 1); });
      // combo
      const on = c.combo.n >= 2; combo.classList.toggle('on', on);
      if (on) { comboN.textContent = c.combo.n; comboBar.style.transform = `scaleX(${clamp(1 - c.combo.t / 3.2, 0, 1)})`; }
      vigV = Math.max(0, vigV - realDt * 1.6); vig.style.opacity = vigV.toFixed(3);
      slow.style.opacity = c.slowK > 0.05 ? (c.slowK * 0.9).toFixed(2) : '0';
      bannerT -= realDt; banner.classList.toggle('on', bannerT > 0);
      msgT -= realDt; msg.classList.toggle('on', msgT > 0);
      hintT -= realDt; hint.classList.toggle('on', shown && hintT > 0);
      // spider-sense edge arrows (attackers the player may not see) + brute bars
      const cam = c.ctx.camera, W = innerWidth, Hh = innerHeight;
      const threats = S.threats;
      while (arrowEls.length < threats.length) { const i = document.createElement('i'); arrows.appendChild(i); arrowEls.push(i); }
      arrowEls.forEach((el, k) => {
        const t = threats[k]; if (!t) { el.style.display = 'none'; return; }
        const p = t.e.chest(_v).project(cam);
        const behind = p.z > 1;
        let x = p.x, y = p.y; if (behind) { x = -x; y = -y; }
        const onScreen = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.8;
        const lvl = clamp(1 - (t.at - c.time) / 0.9, 0, 1);
        if (onScreen || lvl <= 0) { el.style.display = 'none'; return; }
        const a = Math.atan2(y, x); const r = Math.max(Math.abs(Math.cos(a)) / 0.9, Math.abs(Math.sin(a)) / 0.82);
        const sx = (Math.cos(a) / r * 0.5 + 0.5) * W, sy = (1 - (Math.sin(a) / r * 0.5 + 0.5)) * Hh;
        el.style.display = 'block'; el.style.color = t.kind === 'gun' ? '#ff4040' : '#ffd070';
        el.style.opacity = (0.35 + 0.65 * lvl).toFixed(2);
        el.style.transform = `translate(${sx}px,${sy}px) rotate(${-a}rad) scale(${0.8 + 0.5 * lvl})`;
      });
      for (const e of c.enemies) {
        let el = ebarEls.get(e);
        const want = e.type === 'brute' && e.alive;
        if (!want) { if (el) el.style.opacity = 0; continue; }
        if (!el) { el = document.createElement('div'); el.className = 'ebar'; el.innerHTML = '<i></i>'; ebars.appendChild(el); ebarEls.set(e, el); }
        const p = e.headPos(_v); p.y += 0.45; p.project(cam);
        if (p.z > 1 || Math.abs(p.x) > 1.1) { el.style.opacity = 0; continue; }
        el.style.opacity = 1; el.style.transform = `translate(${(p.x * 0.5 + 0.5) * W}px,${(1 - (p.y * 0.5 + 0.5)) * Hh}px) skewX(-18deg)`;
        el.firstChild.style.transform = `scaleX(${clamp(e.hp / e.maxHp, 0, 1)})`; el.classList.toggle('stun', e.stun > 0);
      }
      for (const [e, el] of ebarEls) if (!c.enemies.includes(e)) { el.remove(); ebarEls.delete(e); }
    },
  };
}
