// OWNER: systems engineer. (user r19) Peter Parker in civvies, anywhere: [G] on the ground swaps suit <-> civvies with a
// short dip to black. While civilian (player.civ): no webs, swinging, zips or wall runs (player.js strips the input,
// traversal s.civ limits speeds / hops / step-ups), crimes never engage him, and the civvies model (systems/peter.js)
// copies the hidden Spider-Man skeleton every frame after the animator ran. The apartment and the motorbike use the
// same switch (set(on, {instant})).
// Debug: __sys.civ.set(true) / .state()
import { loadPeter, retarget } from './peter.js';

export function createCivilian(sys) {
  const { ctx, ui } = sys;
  const P = ctx.player;
  let peter = null, on = false, fading = false, veil = null, lockReason = null;
  loadPeter().then(pe => { peter = pe; if (on) attach(); });

  // ---- dip to black (shared by the apartment / bike transitions)
  function fade(mid, { hold = 0 } = {}) {
    if (!veil) { veil = document.createElement('div'); Object.assign(veil.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', zIndex: 39, pointerEvents: 'none', transition: 'opacity .28s ease-in' }); document.body.appendChild(veil); }
    fading = true; veil.style.transition = 'opacity .28s ease-in'; veil.style.opacity = '1';
    setTimeout(() => {
      try { mid(); } finally {
        setTimeout(() => { veil.style.transition = 'opacity .55s ease-out'; veil.style.opacity = '0'; setTimeout(() => { fading = false; }, 560); }, hold);
      }
    }, 300);
  }
  function attach() {
    if (!peter) return;
    if (peter.object.parent !== P.object) P.object.add(peter.object);
    peter.object.position.set(0, 0, 0); peter.object.quaternion.identity(); peter.object.visible = true;
    try { retarget(peter, P.rig); } catch (e) { /* rig not ready */ }
  }
  function apply(v) {
    on = v; P.civ = v;
    if (v) { attach(); P.rig.object.visible = false; }
    else { if (peter) peter.object.visible = false; P.rig.object.visible = true; }
    if (P.cam) P.cam.distScale = v ? 0.78 : 1;
    sys.events?.emit?.('civ:changed', { on: v });
  }
  // public switch. instant: no fade (the caller runs its own transition)
  function set(v, { instant = false, after = null } = {}) {
    if (v === on || (fading && !instant)) return false; // instant: called from inside another transition's fade
    if (instant) { apply(v); after?.(); return true; }
    fade(() => { apply(v); after?.(); sys.audio?.sfx?.select?.(); });
    return true;
  }
  // [G] suit up / suit off: on the ground, out of combat, not inside the apartment / on the bike / mid-transition
  function canToggle() {
    if (lockReason) return lockReason;
    if (!sys.flow.isPlaying) return 'busy';
    if (P.frozen) return 'busy';
    if (ctx.combat?.engaged) return 'Not during a fight';
    if (P.state?.mode !== 'ground') return 'Land first';
    return null;
  }
  sys.flow.onKey((e, mode) => {
    if (mode !== 'play' || e.code !== 'KeyG' || e.repeat) return false;
    const why = canToggle();
    if (why) { if (why !== 'busy') ui.toast({ title: on ? 'Suit Up' : 'Suit Off', text: why, icon: 'xp', tone: 'cyan' }); return true; }
    set(!on);
    ui.toast({ title: on ? 'Spider-Man' : 'Peter Parker', text: on ? 'Suit on. Mask down.' : 'Suit off — just Peter. [G] to suit up.', icon: 'xp', tone: on ? 'cyan' : 'gold' });
    return true;
  });

  const api = {
    get on() { return on; }, get peter() { return peter; }, get fading() { return fading; },
    set, fade,
    lock(reason) { lockReason = reason || null; },       // the apartment / bike block [G] while active
    update() {
      if (!on || !peter) return;
      if (peter.object.parent !== P.object) attach();
      P.rig.object.visible = false;
      // camera occlusion (as for Spider-Man): never render the lens inside him
      const cd = ctx.camera.position.distanceTo(P.position);
      peter.object.visible = cd > 0.55;
      if (!P.frozen || api.retargetFrozen) retarget(peter, P.rig);
    },
    retargetFrozen: false,                                  // the bike poses the frozen rig itself and asks for a copy
    state: () => ({ on, fading, peter: !!peter, lock: lockReason }),
  };
  return api;
}
