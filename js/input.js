// ============ INPUT — PC (WASD + mouse) and mobile (joystick + touch buttons) ============

export const IS_TOUCH = ('ontouchstart' in window) && matchMedia('(pointer:coarse)').matches;

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', autorun: 'KeyR',
  skill1: 'Digit1', skill2: 'Digit2', skill3: 'Digit3', skill4: 'Digit4', skill5: 'Digit5',
  skill6: 'Digit6', skill7: 'Digit7', skill8: 'Digit8', skill9: 'Digit9', skill10: 'Digit0',
  target: 'Tab', interact: 'KeyE',
  character: 'KeyC', bag: 'KeyB', map: 'KeyM', quests: 'KeyL', talents: 'KeyK',
  dungeons: 'KeyI', pvp: 'KeyP', menu: 'Escape',
};

export class Input {
  constructor() {
    this.binds = { ...DEFAULT_BINDS };
    this.keys = new Set();
    this.move = { x: 0, y: 0 };          // -1..1 (y = forward)
    this.lookDX = 0; this.lookDY = 0;    // per-frame camera deltas
    this.handlers = {};                   // action -> [fn]
    this.uiOpen = false;                  // when a window is open, keys 1-0 still work but movement continues
    this.locked = false;
    this.autorun = false;
    this._initKeyboard();
    this._initMouse();
    if (IS_TOUCH) this._initTouch();
  }

  on(action, fn) { (this.handlers[action] ??= []).push(fn); }
  fire(action, arg) { (this.handlers[action] || []).forEach(f => f(arg)); }

  _actionFor(code) {
    for (const [a, c] of Object.entries(this.binds)) if (c === code) return a;
    return null;
  }

  _initKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      const act = this._actionFor(e.code);
      if (act === 'target' || e.code === 'Tab') e.preventDefault();
      if (this.keys.has(e.code)) { if (act && !act.startsWith('skill')) return; else if (act) return; }
      this.keys.add(e.code);
      if (act) {
        if (act === 'autorun') this.autorun = !this.autorun;
        if (['forward', 'back', 'left', 'right'].includes(act) && act !== 'autorun') this.autorun = false;
        this.fire(act);
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _initMouse() {
    if (IS_TOUCH) return;
    const canvas = document.getElementById('game');
    this.mouseX = innerWidth / 2; this.mouseY = innerHeight / 2;
    canvas.addEventListener('click', (e) => {
      this.fire('canvasclick', { x: e.clientX, y: e.clientY, locked: this.locked });
      if (!this.uiOpen && !this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
      else { this.mouseX = e.clientX; this.mouseY = e.clientY; }
    });
    // right-drag camera when not locked (menus open etc.)
    let rd = false, lx = 0, ly = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2) { rd = true; lx = e.clientX; ly = e.clientY; } });
    addEventListener('mouseup', (e) => { if (e.button === 2) rd = false; });
    addEventListener('mousemove', (e) => {
      if (rd && !this.locked) { this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; }
    });
    addEventListener('wheel', (e) => this.fire('zoom', Math.sign(e.deltaY)), { passive: true });
  }

  releasePointer() { if (this.locked) document.exitPointerLock?.(); }

  _initTouch() {
    const zone = document.getElementById('joy-zone');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    let joyId = null, cx = 0, cy = 0;
    zone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (joyId !== null) continue;
        joyId = t.identifier; cx = t.clientX; cy = t.clientY;
        base.style.display = 'block';
        base.style.left = (cx - 55) + 'px'; base.style.top = (cy - 55) + 'px';
      }
      e.preventDefault();
    }, { passive: false });
    const joyMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const len = Math.hypot(dx, dy), max = 48;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        knob.style.left = (29 + dx) + 'px'; knob.style.top = (29 + dy) + 'px';
        this.move.x = dx / max; this.move.y = -dy / max;
      }
      e.preventDefault();
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null; this.move.x = 0; this.move.y = 0;
        base.style.display = 'none';
        knob.style.left = '29px'; knob.style.top = '29px';
      }
    };
    zone.addEventListener('touchmove', joyMove, { passive: false });
    zone.addEventListener('touchend', joyEnd);
    zone.addEventListener('touchcancel', joyEnd);

    // right half = camera look
    const canvas = document.getElementById('game');
    let lookId = null, llx = 0, lly = 0;
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.45 && lookId === null) {
          lookId = t.identifier; llx = t.clientX; lly = t.clientY;
        }
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.lookDX += (t.clientX - llx) * 2.2; this.lookDY += (t.clientY - lly) * 2.2;
        llx = t.clientX; lly = t.clientY;
      }
    }, { passive: true });
    const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    canvas.addEventListener('touchend', lookEnd);
    canvas.addEventListener('touchcancel', lookEnd);
  }

  // called each frame by the game loop
  poll() {
    if (!IS_TOUCH) {
      let x = 0, y = 0;
      if (this.keys.has(this.binds.forward) || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has(this.binds.back) || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has(this.binds.left) || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has(this.binds.right) || this.keys.has('ArrowRight')) x += 1;
      if (this.autorun && y === 0) y = 1;
      this.move.x = x; this.move.y = y;
    }
    const d = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }
}
