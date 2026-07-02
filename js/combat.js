// ============ COMBAT CORE — actors, damage, buffs, projectiles, VFX, skill runner ============
import { THREE, basicMat, mat } from './engine.js';
import { Animator, blobShadow, buildModel } from './entities.js';

export const Events = {
  handlers: {},
  on(ev, fn) { (this.handlers[ev] ??= []).push(fn); },
  emit(ev, ...args) { (this.handlers[ev] || []).forEach(f => f(...args)); },
};

// ---------------- balance formulas ----------------
export const Balance = {
  mobHp: (base, lvl) => Math.round(base * Math.pow(1 + 0.30 * (lvl - 1), 1.8)),
  mobDmg: (base, lvl) => Math.round(base * Math.pow(1 + 0.25 * (lvl - 1), 1.5)),
  mobXp: (base, lvl) => Math.round(base * (1 + 0.28 * (lvl - 1))),
  itemPower: (ilvl, qmult) => Math.round(ilvl * 0.5 * qmult),
  itemStam: (ilvl, qmult) => Math.round(ilvl * 0.8 * qmult),
  playerPower: (lvl, gearPower) => 8 + lvl * 3 + gearPower,
  playerHp: (base, perLvl, lvl, gearStam) => base + perLvl * (lvl - 1) + gearStam,
  critChance: (gearCrit) => 0.05 + gearCrit / 100,
};

let nextId = 1;

// ---------------- ACTOR ----------------
export class Actor {
  constructor(game, def) {
    this.game = game;
    this.id = def.id ?? ('a' + nextId++);
    this.name = def.name || 'Unknown';
    this.faction = def.faction || 'hostile'; // player | friendly | hostile | party
    this.level = def.level || 1;
    this.maxHp = def.maxHp || 50;
    this.hp = this.maxHp;
    this.power = def.power || 5;
    this.speed = def.speed || 4.5;
    this.attackRange = def.attackRange || 2.2;
    this.alive = true;
    this.buffs = [];
    this.shield = 0;
    this.dots = [];
    this.ccUntil = 0; this.ccKind = null;
    this.rootUntil = 0;
    this.stealthed = false;
    this.inCombat = 0;
    this.icon = def.icon || '❓';
    this.isBoss = !!def.isBoss;
    this.radius = def.radius || 0.6;

    this.group = def.model || buildModel(def.modelKind || 'humanoid', def.color || 0x888888, def.modelOpts || {});
    this.group.add(blobShadow(this.isBoss ? 1.2 : 0.6));
    // generous invisible hitbox so cursor targeting feels WoW-forgiving
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.4, 6),
      new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.y = 1.2;
    hb.userData.actorRef = this;
    this.group.add(hb);
    this.hitboxMesh = hb;
    this._baseScale = 1;
    this.anim = new Animator(this.group);
    if (def.pos) this.group.position.set(def.pos.x, 0, def.pos.z);
    game.scene.add(this.group);
    this.facing = def.facing || 0;
  }

  get pos() { return this.group.position; }

  distTo(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }

  faceToward(x, z, snap = false) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    if (snap) this.facing = want;
    else {
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * 0.25;
    }
    this.group.rotation.y = this.facing;
  }

  hasBuff(id) { return this.buffs.some(b => b.id === id); }
  buffVal(stat) {
    let v = 0;
    for (const b of this.buffs) if (b.stat === stat) v += b.amt;
    return v;
  }

  addBuff(b) {
    const ex = this.buffs.find(x => x.id === b.id);
    if (ex) {
      ex.until = this.game.time + b.dur;
      if (b.maxStacks) ex.stacks = Math.min(b.maxStacks, (ex.stacks || 1) + 1);
    } else {
      this.buffs.push({ ...b, until: this.game.time + b.dur, stacks: 1 });
    }
    if (this === this.game.player) Events.emit('buffs');
  }

  removeBuff(id) {
    const b = this.buffs.find(x => x.id === id);
    this.buffs = this.buffs.filter(x => x.id !== id);
    if (this === this.game.player) Events.emit('buffs');
    return b;
  }

  applyCC(kind, dur) {
    if (this.isBoss) dur *= 0.4; // bosses resist
    this.ccUntil = Math.max(this.ccUntil, this.game.time + dur);
    this.ccKind = kind;
    if (kind === 'poly' && this.group) {
      this._polySwap = true;
      this.group.visible = false;
      if (!this._lamb) {
        this._lamb = buildModel('glitch', 0x39ff88);
        this._lamb.scale.setScalar(0.6);
        this.game.scene.add(this._lamb);
      }
      this._lamb.visible = true;
      this._lamb.position.copy(this.pos);
    }
  }

  get ccd() { return this.game.time < this.ccUntil; }
  get rooted() { return this.game.time < this.rootUntil; }

  takeDamage(amount, source, opts = {}) {
    if (!this.alive) return 0;
    // ghost-type miss chance
    if (this.missChance && Math.random() < this.missChance && !opts.noMiss) {
      this.game.vfx.floater(this.pos, 'MISS', '#aaa');
      return 0;
    }
    let dmg = amount;
    const dr = this.buffVal('dr');
    if (dr) dmg *= (1 - Math.min(0.75, dr));
    if (this.armored) dmg *= 0.85;
    dmg = Math.max(1, Math.round(dmg));
    // damage breaks poly/cc
    if (this.ccKind === 'poly' && this.ccd) { this.ccUntil = 0; this._unpoly(); }
    // shield absorbs
    if (this.shield > 0) {
      const abs = Math.min(this.shield, dmg);
      this.shield -= abs; dmg -= abs;
      if (this._shieldSrc?.livingWard) this.heal(abs * 0.3, this);
      this.game.vfx.floater(this.pos, `(${abs})`, '#88ccff');
    }
    this.hp -= dmg;
    this.inCombat = this.game.time + 5;
    if (source) source.inCombat = this.game.time + 5;
    // lifesteal
    if (source && source.buffVal('lifesteal') > 0) source.heal(dmg * source.buffVal('lifesteal'), source);
    if (dmg > 0) {
      const color = opts.crit ? '#ffdd33' : (source === this.game.player || source?.owner === this.game.player) ? '#ffffff' : '#ff6655';
      this.game.vfx.floater(this.pos, String(dmg), color, opts.crit);
      this.anim.play('hit');
      // physical feedback: the victim visibly pops and flashes
      this._hitPop = opts.crit ? 0.32 : 0.2;
      if (source === this.game.player)
        this.game.vfx.impact(this.pos, opts.crit ? 0xffe066 : 0xffb469, opts.crit ? 2 : 1);
    }
    Events.emit('hp', this);
    if (this.onDamaged) this.onDamaged(source, dmg);
    if (this.hp <= 0) this.die(source);
    return dmg;
  }

  _unpoly() {
    if (this._polySwap) { this.group.visible = true; if (this._lamb) this._lamb.visible = false; this._polySwap = false; }
  }

  heal(amount, source) {
    if (!this.alive) return;
    const h = Math.min(this.maxHp - this.hp, Math.round(amount));
    if (h <= 0) return;
    this.hp += h;
    this.game.vfx.floater(this.pos, '+' + h, '#4dff77');
    Events.emit('hp', this);
  }

  addDot(dot, source) {
    this.dots.push({ ...dot, source, next: this.game.time + dot.interval, left: dot.ticks });
  }

  die(source) {
    this.alive = false;
    this.hp = 0;
    this.group.scale.setScalar(this._baseScale || 1);
    this._unpoly();
    this.anim.play('death');
    this.buffs = []; this.dots = [];
    Events.emit('death', this, source);
    if (this.onDeath) this.onDeath(source);
  }

  tickShared(dt) {
    const t = this.game.time;
    this.buffs = this.buffs.filter(b => {
      if (b.until > t) return true;
      if (this === this.game.player) Events.emit('buffs');
      return false;
    });
    if (this._shieldUntil && t > this._shieldUntil) { this.shield = 0; this._shieldUntil = 0; }
    for (const d of this.dots) {
      if (t >= d.next && d.left > 0) {
        d.next = t + d.interval; d.left--;
        this.takeDamage(d.amount, d.source, { noMiss: true });
      }
    }
    this.dots = this.dots.filter(d => d.left > 0);
    if (this.ccd && this.ccKind === 'poly' && this._lamb) {
      this._lamb.position.copy(this.pos);
      this._lamb.rotation.y += dt * 2;
    }
    if (!this.ccd && this._polySwap) this._unpoly();
    // hit pop decay
    if (this._hitPop > 0) {
      this._hitPop = Math.max(0, this._hitPop - dt * 1.6);
      const s = this._baseScale * (1 + this._hitPop * 0.55);
      this.group.scale.setScalar(s);
    }
  }

  destroy() {
    this.game.scene.remove(this.group);
    if (this._lamb) this.game.scene.remove(this._lamb);
  }
}

// ---------------- VFX ----------------
let _glowTex = null;
export function glowTex() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

export class VFX {
  constructor(game) {
    this.game = game;
    this.live = [];
    this.floatersEl = null;
  }

  // layered impact: glow flash + shockwave ring + sparks. power ~ 1 normal, 2 heavy, 3 huge
  impact(pos, color = 0xffcc66, power = 1) {
    const p = pos.clone(); p.y += 1.1;
    // core flash sprite
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.position.copy(p);
    spr.scale.setScalar(0.6 * power);
    this.game.scene.add(spr);
    this.live.push({ obj: spr, t: 0, life: 0.22, tick: (fx) => {
      spr.scale.setScalar((0.6 + fx.t * 14) * power * 0.6);
      spr.material.opacity = 0.95 * (1 - fx.t / fx.life);
    } });
    // white hot center
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.copy(p);
    core.scale.setScalar(0.3 * power);
    this.game.scene.add(core);
    this.live.push({ obj: core, t: 0, life: 0.1, tick: (fx) => {
      core.scale.setScalar((0.3 + fx.t * 8) * power);
      core.material.opacity = 1 - fx.t / fx.life;
    } });
    this.burst(pos, color, Math.round(8 * power + 4), 0.16 + power * 0.05, 4 + power * 2.5, 0.45);
    if (power >= 1.5) this.ring(pos, color, 2 + power, 0.35);
  }

  floater(pos, text, color = '#fff', crit = false) {
    if (!this.floatersEl) this.floatersEl = document.getElementById('floaters');
    if (!this.floatersEl) return;
    if (this.floatersEl.childElementCount > 40) this.floatersEl.firstChild?.remove();
    const v = pos.clone(); v.y += 2.2;
    v.project(this.game.engine.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'floater' + (crit ? ' crit' : '');
    el.textContent = crit ? text + '!' : text;
    el.style.color = color;
    el.style.left = ((v.x * 0.5 + 0.5) * 100 + (Math.random() - 0.5) * 6) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    this.floatersEl.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  burst(pos, color = 0xffaa33, count = 10, size = 0.16, speed = 5, life = 0.5) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y + 1.2; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * 6.28, b = Math.random() * Math.PI - 1.2;
      vel.push(new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b) + 0.6, Math.sin(a) * Math.cos(b)).multiplyScalar(speed * (0.4 + Math.random() * 0.6)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1 });
    const p = new THREE.Points(geo, m);
    this.game.scene.add(p);
    this.live.push({ obj: p, t: 0, life, tick: (fx, dt) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        a[i * 3] += vel[i].x * dt; a[i * 3 + 1] += vel[i].y * dt; a[i * 3 + 2] += vel[i].z * dt;
        vel[i].y -= 9 * dt;
      }
      geo.attributes.position.needsUpdate = true;
      m.opacity = 1 - fx.t / life;
    } });
  }

  ring(pos, color = 0xffcc44, maxR = 5, life = 0.5, y = 0.15) {
    const g = new THREE.RingGeometry(0.8, 1, 24);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(g, m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, (pos.y || 0) + y, pos.z);
    this.game.scene.add(ring);
    this.live.push({ obj: ring, t: 0, life, tick: (fx) => {
      const s = 1 + (fx.t / life) * maxR;
      ring.scale.setScalar(s);
      m.opacity = 0.9 * (1 - fx.t / life);
    } });
  }

  // ground telegraph (danger circle that fills)
  telegraph(pos, radius, dur, color = 0xff3322) {
    const m1 = new THREE.Mesh(new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    m1.rotation.x = -Math.PI / 2; m1.position.set(pos.x, (pos.y || 0) + 0.12, pos.z);
    const m2 = new THREE.Mesh(new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    m2.rotation.x = -Math.PI / 2; m2.position.set(pos.x, (pos.y || 0) + 0.14, pos.z);
    m2.scale.setScalar(0.01);
    this.game.scene.add(m1, m2);
    this.live.push({ obj: m1, extra: [m2], t: 0, life: dur, tick: (fx) => {
      m2.scale.setScalar(Math.min(1, fx.t / dur));
    } });
  }

  beam(from, to, color = 0x88ccff, life = 0.25, width = 0.12) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(width, width, len);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(geo, m);
    beam.position.copy(from).add(dir.multiplyScalar(0.5));
    beam.lookAt(to);
    this.game.scene.add(beam);
    this.live.push({ obj: beam, t: 0, life, tick: (fx) => { m.opacity = 0.9 * (1 - fx.t / life); } });
  }

  // weapon trail: ribbon that follows the blade between tip and base while the swing is live
  weaponTrail(actor, dur = 0.45, color = 0xffd27a) {
    const w = actor.group.userData.rig?.weapon;
    if (!w?.userData.tip) return;
    const MAX = 14;
    const samples = [];
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array((MAX - 1) * 6 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    this.game.scene.add(mesh);
    const vt = new THREE.Vector3(), vb = new THREE.Vector3();
    this.live.push({ obj: mesh, t: 0, life: dur, tick: (fx) => {
      if (actor.anim.striking || actor.anim.state === 'spin') {
        w.userData.tip.getWorldPosition(vt);
        w.userData.base.getWorldPosition(vb);
        samples.push({ t: vt.clone(), b: vb.clone(), age: 0 });
        if (samples.length > MAX) samples.shift();
      }
      for (const sm of samples) sm.age += 0.016;
      let v = 0;
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i], b = samples[i + 1];
        const quad = [a.t, a.b, b.t, a.b, b.b, b.t];
        for (const q of quad) { posArr[v++] = q.x; posArr[v++] = q.y; posArr[v++] = q.z; }
      }
      geo.setDrawRange(0, v / 3);
      geo.attributes.position.needsUpdate = true;
      m.opacity = 0.75 * (1 - fx.t / fx.life);
    } });
  }

  // muzzle flash at the rifle tip
  muzzleFlash(actor) {
    const w = actor.group.userData.rig?.weapon;
    if (!w?.userData.tip) return;
    const v = new THREE.Vector3();
    w.userData.tip.getWorldPosition(v);
    this.burst(v.clone().setY(v.y - 1.2), 0xffe9a0, 6, 0.14, 3, 0.15);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(v);
    this.game.scene.add(flash);
    this.live.push({ obj: flash, t: 0, life: 0.08, tick: (fx) => {
      flash.scale.setScalar(1 + fx.t * 22);
      flash.material.opacity = 1 - fx.t / fx.life;
    } });
  }

  // arcane sigil under a caster for the duration of the cast
  castCircle(actor, dur, color = 0x88ccff) {
    const g1 = new THREE.RingGeometry(0.9, 1.15, 24);
    const g2 = new THREE.RingGeometry(0.45, 0.55, 6);
    const mk = (g) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const r1 = mk(g1), r2 = mk(g2);
    r1.rotation.x = r2.rotation.x = -Math.PI / 2;
    this.game.scene.add(r1, r2);
    this.live.push({ obj: r1, extra: [r2], t: 0, life: dur + 0.15, tick: (fx, dt) => {
      const y = actor.pos.y + 0.12;
      r1.position.set(actor.pos.x, y, actor.pos.z);
      r2.position.set(actor.pos.x, y + 0.02, actor.pos.z);
      r1.rotation.z += dt * 2.2; r2.rotation.z -= dt * 3.4;
      const fade = actor.alive && (fx.t < dur) ? Math.min(1, fx.t * 6) : Math.max(0, 1 - (fx.t - dur) * 8);
      r1.material.opacity = 0.5 * fade; r2.material.opacity = 0.7 * fade;
    } });
  }

  // frost nova: expanding ice shockwave + frost decal + crystal spikes
  frostNova(pos, radius) {
    const y = this.game.groundY(pos) + 0.15;
    // expanding double shockwave
    this.ring(new THREE.Vector3(pos.x, y, pos.z), 0xbfeaff, radius, 0.4, 0.05);
    this.ring(new THREE.Vector3(pos.x, y, pos.z), 0x6fd0ff, radius * 0.8, 0.55, 0.12);
    // frost decal lingers
    const decal = new THREE.Mesh(new THREE.CircleGeometry(radius, 26),
      new THREE.MeshBasicMaterial({ color: 0x9fdfff, transparent: true, opacity: 0.28, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(pos.x, y - 0.04, pos.z);
    this.game.scene.add(decal);
    this.live.push({ obj: decal, t: 0, life: 2.4, tick: (fx) => { decal.material.opacity = 0.28 * (1 - fx.t / fx.life); } });
    // ice spikes burst up in a ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      const d = radius * (0.45 + Math.random() * 0.5);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5),
        new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.95 }));
      spike.position.set(pos.x + Math.cos(a) * d, y - 0.4, pos.z + Math.sin(a) * d);
      spike.rotation.z = (Math.random() - 0.5) * 0.4;
      this.game.scene.add(spike);
      this.live.push({ obj: spike, t: 0, life: 0.9, tick: (fx) => {
        spike.position.y = y - 0.4 + Math.min(1, fx.t * 6) * 0.75;
        spike.material.opacity = 0.95 * (1 - Math.max(0, fx.t - 0.5) / 0.4);
      } });
    }
    this.burst(pos, 0xbfeaff, 24, 0.2, 8, 0.6);
    this.impact(pos, 0x9fdfff, 2);
  }

  // small persistent ice shackle under a rooted enemy
  rootRing(actor, dur) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 16),
      new THREE.MeshBasicMaterial({ color: 0x9fdfff, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    this.game.scene.add(ring);
    this.live.push({ obj: ring, t: 0, life: dur, tick: (fx, dt) => {
      ring.position.set(actor.pos.x, this.game.groundY(actor.pos) + 0.06, actor.pos.z);
      ring.rotation.z += dt * 2;
      ring.material.opacity = actor.alive ? 0.85 * (1 - fx.t / fx.life * 0.5) : 0;
    } });
  }

  // meteor: streak falls from the sky into an impact
  meteor(target, dmgFn, delay = 0) {
    this.game.schedule(delay, () => {
      const from = target.clone().add(new THREE.Vector3(3 + Math.random() * 2, 14, 2 + Math.random()));
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffaa44 }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff7722,
        transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(2.2);
      rock.add(halo);
      rock.position.copy(from);
      this.game.scene.add(rock);
      const dir = target.clone().sub(from);
      const dur = 0.34;
      this.live.push({ obj: rock, t: 0, life: dur, tick: (fx) => {
        rock.position.copy(from).addScaledVector(dir, fx.t / dur);
        if (fx.t + 0.02 >= dur) {
          this.impact(target, 0xff7733, 2.2);
          this.game.shake(0.18);
          dmgFn?.();
        }
      } });
    });
  }

  // scorched-earth decal after fire abilities
  scorch(pos, radius, dur = 3.5) {
    const y = this.game.groundY(pos) + 0.08;
    const decal = new THREE.Mesh(new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: 0x1a0d06, transparent: true, opacity: 0.55, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(pos.x, y, pos.z);
    const glow = new THREE.Mesh(new THREE.RingGeometry(radius * 0.4, radius * 0.9, 22),
      new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(pos.x, y + 0.02, pos.z);
    this.game.scene.add(decal, glow);
    this.live.push({ obj: decal, extra: [glow], t: 0, life: dur, tick: (fx, dt) => {
      const f = 1 - fx.t / fx.life;
      decal.material.opacity = 0.55 * f;
      glow.material.opacity = 0.35 * f * (0.7 + Math.sin(fx.t * 9) * 0.3);
    } });
  }

  // melee swing arc: a glowing crescent that sweeps with the blow
  swingArc(actor, color = 0xffe0aa) {
    const geo = new THREE.TorusGeometry(1.5, 0.09, 4, 14, 2.4);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const arc = new THREE.Mesh(geo, m);
    arc.position.copy(actor.pos); arc.position.y += 1.3;
    arc.rotation.order = 'YXZ';
    arc.rotation.y = actor.facing + Math.PI / 2 + 0.9;
    arc.rotation.x = -0.4;
    this.game.scene.add(arc);
    this.live.push({ obj: arc, t: 0, life: 0.22, tick: (fx, dt) => {
      arc.rotation.y -= dt * 11;
      m.opacity = 0.85 * (1 - fx.t / fx.life);
      arc.scale.setScalar(1 + fx.t * 1.4);
    } });
  }

  aura(actor, color, dur = 1.2) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
    m.position.y = 1.1;
    actor.group.add(m);
    this.live.push({ obj: m, parent: actor.group, t: 0, life: dur, tick: (fx) => {
      m.scale.setScalar(1 + Math.sin(fx.t * 8) * 0.08);
      m.material.opacity = 0.28 * (1 - fx.t / fx.life);
    } });
  }

  update(dt) {
    for (const fx of this.live) {
      fx.t += dt;
      fx.tick(fx, dt);
      if (fx.t >= fx.life) {
        (fx.parent || this.game.scene).remove(fx.obj);
        fx.extra?.forEach(e => this.game.scene.remove(e));
        fx.done = true;
      }
    }
    this.live = this.live.filter(f => !f.done);
  }
}

// ---------------- PROJECTILES ----------------
export class Projectiles {
  constructor(game) { this.game = game; this.live = []; }

  spawn(opts) {
    // opts: from(Vector3), target(Actor)|to(Vector3), speed, color, size, arc, onHit(hitPos, targetActor), trail
    const size = opts.size || 0.22;
    const geo = opts.kind === 'icicle' ? new THREE.ConeGeometry(size * 0.6, size * 3, 5)
      : new THREE.SphereGeometry(size, 6, 5);
    const m = new THREE.Mesh(geo, basicMat(opts.color || 0xffffff));
    m.position.copy(opts.from);
    // additive glow halo makes every bolt read as a projectile at a glance
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: opts.color || 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(size * 7);
    m.add(halo);
    this.game.scene.add(m);
    this.live.push({ mesh: m, ...opts, t: 0 });
  }

  update(dt) {
    for (const p of this.live) {
      p.t += dt;
      const targetPos = p.target ? p.target.pos.clone().setY(p.target.pos.y + 1.2) : p.to;
      const dir = targetPos.clone().sub(p.mesh.position);
      const dist = dir.length();
      const step = (p.speed || 20) * dt;
      if (dist <= step + 0.3 || p.t > 4) {
        p.onHit?.(p.mesh.position.clone(), p.target);
        this.game.scene.remove(p.mesh);
        p.dead = true;
        continue;
      }
      dir.normalize();
      if (p.arc) dir.y += Math.sin(Math.min(1, p.t * 2) * Math.PI) * 0.3;
      p.mesh.position.add(dir.multiplyScalar(step));
      p.mesh.lookAt(targetPos);
      p.mesh.rotateX(Math.PI / 2);
      if (p.trail && Math.random() < 0.5) this.game.vfx.burst(p.mesh.position.clone().setY(p.mesh.position.y - 1.2), p.color, 1, 0.1, 0.5, 0.3);
    }
    this.live = this.live.filter(p => !p.dead);
  }
}

// ---------------- SKILL RUNNER ----------------
// Executes class skill definitions for any actor (player, arena bot).
export class SkillRunner {
  constructor(game, actor, classDef, opts = {}) {
    this.game = game;
    this.actor = actor;
    this.cls = classDef;
    this.cooldowns = {};   // skillId -> readyAt
    this.charges = {};     // skillId -> remaining (for talents)
    this.gcdUntil = 0;
    this.casting = null;   // {skill, until, target}
    this.channel = null;
    this.talents = opts.talents || {};
    this.isPlayer = !!opts.isPlayer;
    this.summons = [];
  }

  hasTalent(id) { return Object.values(this.talents).includes(id); }

  cdOf(skill) {
    let cd = skill.cd;
    if (skill.id === 'ember_nova' && this.hasTalent('ignition')) cd -= 2;
    if (skill.id === 'time_anchor' && this.hasTalent('anchor_mastery')) cd -= 10;
    if (skill.id === 'charge' && this.hasTalent('juggernaut')) cd -= 4;
    if (skill.id === 'explosive_round' && this.hasTalent('artillery')) cd -= 2;
    return Math.max(0, cd);
  }

  costOf(skill) {
    let c = skill.cost || 0;
    if (skill.id === 'frostfire_bolt' && this.hasTalent('clarity')) c *= 0.6;
    return c;
  }

  ready(skill) {
    const t = this.game.time;
    if (this.actor.ccd || !this.actor.alive) return false;
    if (t < this.gcdUntil && skill.kind !== 'mobility') return false;
    if ((this.cooldowns[skill.id] || 0) > t) {
      const maxCh = this.maxCharges(skill);
      if (maxCh > 1 && (this.charges[skill.id] ?? maxCh) > 0) return true;
      return false;
    }
    return true;
  }

  maxCharges(skill) {
    if (skill.id === 'blink' && this.hasTalent('double_blink')) return 2;
    if (skill.id === 'grapple' && this.hasTalent('double_hook')) return 2;
    return 1;
  }

  canAfford(skill) {
    const res = this.actor.resource ?? 100;
    return res >= this.costOf(skill);
  }

  // returns error string or null on success start
  use(skill, target, groundPos) {
    const t = this.game.time;
    if (!this.actor.alive) return 'dead';
    if (this.actor.ccd) return 'You are incapacitated!';
    if (this.casting) return 'Already casting';
    if (!this.ready(skill)) return 'Not ready';
    if (!this.canAfford(skill)) return `Not enough ${this.cls.resource}`;

    if (skill.target === 'enemy') {
      if (!target || !target.alive) return 'No target';
      const d = this.actor.distTo(target);
      if (d > (skill.range || 5) + target.radius) return 'Out of range';
      this.actor.faceToward(target.pos.x, target.pos.z, true);
    }
    if (skill.target === 'ground' && !groundPos) {
      // default: point in front of actor at range/2, or at target
      groundPos = target && target.alive ? target.pos.clone() :
        this.actor.pos.clone().add(new THREE.Vector3(Math.sin(this.actor.facing), 0, Math.cos(this.actor.facing)).multiplyScalar(Math.min(10, skill.range || 8)));
    }

    const haste = 1 + this.actor.buffVal('haste');
    const castTime = (skill.cast || 0) / haste;
    if (castTime > 0.05) {
      this.casting = { skill, target, groundPos, until: t + castTime, start: t };
      this.actor.anim.play('cast', castTime + 0.2);
      this.game.vfx.castCircle(this.actor, castTime,
        this.cls.id === 'hunter' ? 0xd6b53a : skill.fx?.color || 0x88ccff);
      if (this.isPlayer) Events.emit('cast', skill, castTime);
      return null;
    }
    this._execute(skill, target, groundPos);
    return null;
  }

  interrupt() {
    if (this.casting) { this.casting = null; if (this.isPlayer) Events.emit('castend'); }
  }

  _payAndCd(skill) {
    const t = this.game.time;
    this.actor.resource = Math.max(0, (this.actor.resource ?? 0) - this.costOf(skill));
    if (skill.gain) this.actor.resource = Math.min(this.actor.maxResource ?? 100, (this.actor.resource ?? 0) + skill.gain);
    const cd = this.cdOf(skill);
    const maxCh = this.maxCharges(skill);
    if (maxCh > 1) {
      const cur = this.charges[skill.id] ?? maxCh;
      this.charges[skill.id] = cur - 1;
      if (this.charges[skill.id] <= 0) { this.cooldowns[skill.id] = t + cd; }
      setTimeout(() => { this.charges[skill.id] = Math.min(maxCh, (this.charges[skill.id] ?? 0) + 1); }, cd * 1000);
    } else if (cd > 0) this.cooldowns[skill.id] = t + cd;
    this.gcdUntil = t + 0.9 / (1 + this.actor.buffVal('haste'));
    if (this.isPlayer) { Events.emit('cooldowns'); Events.emit('resource'); }
  }

  _dmgMult() {
    let m = 1 + this.actor.buffVal('dmg');
    if (this.hasTalent('deathwish') && this.actor.hp < this.actor.maxHp * 0.5) m *= 1.2;
    return m;
  }

  _crit(skill, target) {
    let c = Balance.critChance(this.actor.gearCrit || 0);
    if (this.hasTalent('apex')) c += 0.10;
    if (skill.critBonusVsBrand && target?.hasBuff('brand')) c += skill.critBonusVsBrand;
    if (this.actor.stealthed && this.hasTalent('ambusher')) c += 0.3;
    return Math.random() < c;
  }

  _dealDamage(skill, target, base, opts = {}) {
    if (!target?.alive) return;
    let dmg = base * this._dmgMult();
    if (this.hasTalent('permafrost') && ['frostfire_bolt', 'icicle_barrage', 'frost_ward'].includes(skill.id)) dmg *= 1.15;
    if (this.hasTalent('wildfire') && ['ember_nova', 'pyroclasm', 'comet_call'].includes(skill.id)) dmg *= 1.15;
    if (this.hasTalent('crusher') && skill.id === 'skullsplitter') dmg *= 1.2;
    if (this.hasTalent('rifled_barrel') && skill.id === 'rifle_shot') dmg *= 1.2;
    if (this.hasTalent('artillery') && skill.id === 'explosive_round') dmg *= 1.3;
    if (skill.executeBelow && target.hp / target.maxHp < (this.hasTalent('executioner') ? 0.4 : skill.executeBelow)) dmg *= skill.executeMult;
    if (this.actor.stealthed) {
      if (this.hasTalent('ambusher')) dmg *= 1.6;
      this.breakStealth();
    }
    const crit = this._crit(skill, target);
    if (crit) dmg *= 1.5;
    target.takeDamage(dmg, this.actor, { crit, ...opts });
    // game feel: freeze-frame + kick on melee connects (heavier on crits)
    if ((skill.range || 30) <= 6 && this.isPlayer) {
      this.game.hitStop(crit ? 0.1 : 0.05);
      this.game.shake(crit ? 0.32 : 0.14);
      // impact flinch: shove the victim back a step
      if (target.alive && !target.isBoss) {
        const dx = target.pos.x - this.actor.pos.x, dz = target.pos.z - this.actor.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        const [nx, nz] = this.game.world.collide(target.pos.x + dx / dd * 0.45, target.pos.z + dz / dd * 0.45, target.radius);
        target.pos.x = nx; target.pos.z = nz;
      }
    }
    return dmg;
  }

  breakStealth() {
    if (this.actor.stealthed) {
      this.actor.stealthed = false;
      this.actor.group.traverse(o => { if (o.material?.transparent && o.userData.stealth) { o.material.opacity = o.userData.baseOp; o.userData.stealth = false; } });
      this.actor.removeBuff('camo');
    }
  }

  _aoeAround(pos, radius, fn) {
    for (const m of this.game.hostilesOf(this.actor)) {
      if (!m.alive) continue;
      if (Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) <= radius + m.radius) fn(m);
    }
  }

  _execute(skill, target, groundPos) {
    const g = this.game, a = this.actor, vfx = g.vfx;
    this._payAndCd(skill);
    const ctx = { power: a.power };
    if (this.isPlayer) Events.emit('castend');

    // -------- generic handlers by properties --------
    if (skill.applies && target) { /* applied on hit below */ }

    const applyOnHit = (tgt) => {
      if (skill.applies && tgt?.alive) {
        const ap = { ...skill.applies, stat: 'slow', amt: 0 };
        tgt.addBuff(ap);
      }
    };

    const projectileHit = (dmgEach, aoe) => (hitPos, tgt) => {
      if (aoe) {
        vfx.ring(hitPos, skill.fx?.color || 0xff7733, aoe, 0.4);
        vfx.burst(hitPos, skill.fx?.color || 0xff7733, 14, 0.2, 7);
        this._aoeAround(hitPos, aoe, m => { this._dealDamage(skill, m, dmgEach); applyOnHit(m); });
      } else if (tgt?.alive) {
        vfx.impact(tgt.pos, skill.fx?.color || 0xffffff, skill.id === 'fireball' ? 2.4 : 1);
        this._dealDamage(skill, tgt, dmgEach);
        if (skill.dot && tgt.alive)
          tgt.addDot({ amount: Math.round(skill.dot.dmg({ power: this.actor.power }) * this._dmgMult()), interval: skill.dot.interval, ticks: skill.dot.ticks }, this.actor);
        if (skill.id === 'fireball') { g.shake(0.2); vfx.scorch(tgt.pos, 1.6, 2); }
        applyOnHit(tgt);
      }
    };

    // multi-hit scheduling
    const scheduleHits = (n, interval, fire) => {
      for (let i = 0; i < n; i++) g.schedule(i * interval, () => { if (a.alive && (!target || target.alive)) fire(i); });
    };

    switch (true) {
      // ---- projectile nukes ----
      case !!skill.fx?.proj: {
        const n = skill.hits || 1;
        let cnt = n;
        if (skill.id === 'icicle_barrage' && this.hasTalent('shatter')) cnt = 4;
        if (skill.id === 'deadeye_volley' && this.hasTalent('headhunter')) cnt = 7;
        scheduleHits(cnt, skill.hitInterval || 0, () => {
          if (!target?.alive) return;
          if (this.cls.weapon === 'rifle') { a.anim.play('shoot'); vfx.muzzleFlash(a); }
          else if (this.cls.ranged) a.anim.play('castRelease');
          else a.anim.play('slash');
          g.projectiles.spawn({
            from: a.pos.clone().setY(a.pos.y + 1.5), target, speed: skill.id === 'pyroclasm' ? 14 : 26,
            color: skill.fx.color, kind: skill.fx.proj, size: skill.id === 'pyroclasm' ? 0.5 : 0.2, trail: skill.id !== 'rifle_shot',
            onHit: projectileHit(skill.dmg(ctx), skill.aoe && (this.hasTalent('bigger_boom') ? skill.aoe + 2 : skill.aoe)),
          });
          if (skill.id === 'rifle_shot' || skill.id === 'deadeye_volley')
            vfx.beam(a.pos.clone().setY(a.pos.y + 1.5), target.pos.clone().setY(target.pos.y + 1.2), 0xffee88, 0.08, 0.05);
        });
        break;
      }
      // ---- ember nova (instant aoe around target consuming brand) ----
      case skill.id === 'ember_nova': {
        const stacks = target.hasBuff('brand') ? (target.buffs.find(b => b.id === 'brand')?.stacks || 1) : 0;
        target.removeBuff('brand');
        let dmg = skill.dmg(ctx) * (1 + stacks * skill.consumeBonus);
        vfx.ring(target.pos, 0xff7733, skill.aoe, 0.45);
        vfx.burst(target.pos, 0xff7733, 18, 0.24, 8);
        this._aoeAround(target.pos, skill.aoe, m => this._dealDamage(skill, m, dmg));
        if (stacks >= 3 && this.hasTalent('cataclysm')) target.applyCC('stun', 1.5);
        a.anim.play('castRelease');
        break;
      }
      // ---- comet call ----
      case !!skill.fx?.comet: {
        const pos = groundPos.clone();
        vfx.telegraph(pos, skill.aoe, skill.delay);
        const drop = (mult, radius, delay) => g.schedule(delay, () => {
          vfx.burst(pos.clone().setY(this.game.groundY(pos)), 0xffaa44, 26, 0.3, 10, 0.7);
          vfx.ring(pos, 0xff8833, radius, 0.5);
          g.shake(0.5);
          this._aoeAround(pos, radius, m => this._dealDamage(skill, m, skill.dmg(ctx) * mult));
        });
        drop(1, skill.aoe, skill.delay);
        if (this.hasTalent('twin_comet')) drop(0.5, skill.aoe * 0.7, skill.delay + 0.5);
        a.anim.play('castRelease');
        break;
      }
      // ---- melee swings ----
      case ['cleave', 'skullsplitter', 'rampage', 'execute'].includes(skill.id): {
        a.anim.play(['skullsplitter', 'execute'].includes(skill.id) ? 'chop' : 'slash');
        vfx.weaponTrail(a, 0.55, skill.fx?.swing || 0xffd27a);
        vfx.swingArc(a, skill.fx?.swing || 0xffe0aa);
        g.schedule(0.24, () => {
          if (skill.aoe) {
            // frontal cone-ish: all hostiles within aoe of point in front
            const front = a.pos.clone().add(new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing)).multiplyScalar(1.6));
            vfx.ring(front, 0xffbb88, skill.aoe, 0.3);
            this._aoeAround(front, skill.aoe, m => this._dealDamage(skill, m, skill.dmg(ctx)));
          } else if (target?.alive) {
            this._dealDamage(skill, target, skill.dmg(ctx));
            vfx.burst(target.pos, skill.fx?.swing || 0xffffff, 10, 0.18, 6);
            if (skill.dot) {
              const ticks = this.hasTalent('open_veins') && skill.id === 'rampage' ? 7 : skill.dot.ticks;
              target.addDot({ amount: Math.round(skill.dot.dmg(ctx) * this._dmgMult()), interval: skill.dot.interval, ticks }, a);
            }
          }
        });
        break;
      }
      // ---- whirlwind ----
      case skill.id === 'whirlwind': {
        a.anim.play('spin');
        vfx.weaponTrail(a, 1.05, 0xffbb88);
        const spins = this.hasTalent('bladestorm') ? 4 : skill.hits;
        scheduleHits(spins, skill.hitInterval, () => {
          vfx.swingArc(a, 0xffbb88);
          vfx.ring(a.pos, 0xffbb88, skill.aoe, 0.3);
          this._aoeAround(a.pos, skill.aoe, m => this._dealDamage(skill, m, skill.dmg(ctx)));
        });
        break;
      }
      // ---- shields / heals / buffs ----
      case !!skill.shield: {
        a.shield = Math.round(skill.shield(ctx));
        a._shieldUntil = g.time + skill.shieldDur;
        a._shieldSrc = { livingWard: this.hasTalent('living_ward') };
        vfx.aura(a, 0x88ccff, 1);
        a.addBuff({ id: 'ward', name: 'Frost Ward', icon: '🛡️', dur: skill.shieldDur });
        break;
      }
      case !!skill.heal: {
        if (skill.hot) {
          const dur = skill.hotDur;
          const ticks = Math.round(dur);
          const amt = Math.round(skill.heal(ctx)); // heal() is the per-tick amount for HoTs
          for (let i = 1; i <= ticks; i++) g.schedule(i, () => { if (a.alive) a.heal(amt, a); });
          vfx.aura(a, skill.fx?.aura || 0x4dff77, dur);
          if (skill.droneVisual) this._spawnDrone(dur);
          if (skill.id === 'med_drone' && this.hasTalent('combat_medic')) {
            for (const p of g.partyMembersNear(a, 12)) {
              for (let i = 1; i <= ticks; i++) g.schedule(i, () => p.alive && p.heal(amt * 0.5, a));
            }
          }
          a.addBuff({ id: skill.id, name: skill.name, icon: skill.icon, dur });
        } else a.heal(skill.heal(ctx), a);
        break;
      }
      case !!skill.buff: {
        let dur = skill.buff.dur;
        if (skill.id === 'bloodthirst' && this.hasTalent('vampiric')) dur = 12;
        if (skill.id === 'overclock' && this.hasTalent('high_voltage')) dur = 12;
        if (skill.id === 'unbreakable' && this.hasTalent('colossus')) dur = 8;
        if (skill.id === 'unbreakable' && this.hasTalent('iron_will')) { a.rootUntil = 0; a.ccUntil = Math.min(a.ccUntil, g.time); }
        const applyTo = skill.target === 'party' ? [a, ...g.partyMembersNear(a, 30)] : [a];
        for (const m of applyTo) {
          m.addBuff({ id: skill.id + '_b', name: skill.name, icon: skill.icon, dur, stat: skill.buff.stat, amt: skill.buff.amt });
          if (skill.id === 'war_cry' && this.hasTalent('warlord')) m.addBuff({ id: 'warlord', name: 'Warlord', icon: '👟', dur, stat: 'speed', amt: 0.1 });
        }
        if (skill.id === 'war_cry' && this.hasTalent('avatar')) a.addBuff({ id: 'avatar', name: 'Avatar of Wrath', icon: '👹', dur, stat: 'dmg', amt: 0.25 });
        if (skill.fx?.nova) vfx.ring(a.pos, skill.fx.nova, 8, 0.6);
        if (skill.fx?.aura) vfx.aura(a, skill.fx.aura, 1.4);
        break;
      }
      // ---- frost nova: point-blank freeze ----
      case !!skill.nova: {
        a.anim.play('castRelease');
        vfx.frostNova(a.pos.clone(), skill.nova.radius);
        g.shake(0.25);
        g.audio?.play('nova');
        this._aoeAround(a.pos, skill.nova.radius, m => {
          this._dealDamage(skill, m, skill.dmg(ctx));
          if (m.alive) {
            m.rootUntil = g.time + skill.nova.rootDur;
            m.addBuff({ id: 'frozen', name: 'Frozen', icon: '\u2744\ufe0f', dur: skill.nova.rootDur });
            vfx.rootRing(m, skill.nova.rootDur);
            vfx.floater(m.pos, 'FROZEN', '#9fdfff');
          }
        });
        break;
      }
      // ---- rain of fire: channel meteors onto marked ground ----
      case !!skill.rain: {
        const pos = groundPos.clone();
        pos.y = g.groundY(pos);
        a.anim.play('cast', skill.rain.delay + 0.2);
        g.schedule(skill.rain.delay, () => a.alive && a.anim.play('castRelease'));
        vfx.telegraph(pos, skill.rain.radius, skill.rain.delay, 0xff4422);
        g.schedule(skill.rain.delay + 0.4, () => vfx.scorch(pos, skill.rain.radius, skill.rain.waves * skill.rain.interval + 1.5));
        for (let w = 0; w < skill.rain.waves; w++) {
          const at = skill.rain.delay + w * skill.rain.interval;
          // each wave: 2 meteors at random points + area damage
          for (let k = 0; k < 2; k++) {
            const ang = Math.random() * 6.28, dd = Math.random() * skill.rain.radius * 0.85;
            const hitAt = new THREE.Vector3(pos.x + Math.cos(ang) * dd, pos.y, pos.z + Math.sin(ang) * dd);
            vfx.meteor(hitAt, null, at + k * 0.12);
          }
          g.schedule(at + 0.34, () => {
            this._aoeAround(pos, skill.rain.radius, m => this._dealDamage(skill, m, skill.dmg(ctx)));
          });
        }
        break;
      }
      // ---- cc ----
      case !!skill.cc: {
        if (target?.alive) {
          target.applyCC(skill.cc, skill.ccDur);
          vfx.burst(target.pos, 0x39ff88, 16, 0.2, 5);
          g.log(`${target.name} is glitched!`);
        }
        break;
      }
      // ---- stealth ----
      case !!skill.stealth: {
        const dur = this.hasTalent('silent_running') ? 8 : skill.stealth;
        a.stealthed = true;
        a.group.traverse(o => {
          if (o.material && !o.userData.stealth) {
            o.userData.baseOp = o.material.opacity ?? 1;
            o.material.transparent = true; o.material = o.material.clone();
            o.material.opacity = 0.25; o.userData.stealth = true;
          }
        });
        if (this.hasTalent('silent_running')) a.addBuff({ id: 'camo_speed', name: 'Silent Running', icon: '👟', dur, stat: 'speed', amt: 0.3 });
        a.addBuff({ id: 'camo', name: 'Camouflage', icon: '🌫️', dur });
        g.dropThreat(a);
        g.schedule(dur, () => this.breakStealth());
        break;
      }
      // ---- mobility ----
      case !!skill.dash || !!skill.teleport: {
        const dir = new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing));
        const dist = skill.dash;
        if (skill.teleport) {
          vfx.burst(a.pos, 0x88ccff, 12, 0.2, 4);
          const np = a.pos.clone().add(dir.multiplyScalar(dist));
          const [cx, cz] = g.world.collide(np.x, np.z, a.radius);
          a.pos.set(cx, g.groundY({ x: cx, z: cz }), cz);
          vfx.burst(a.pos, 0x88ccff, 12, 0.2, 4);
        } else {
          a._dashVel = dir.multiplyScalar(dist / 0.25);
          a._dashUntil = g.time + 0.25;
          if (skill.fx?.trail) vfx.aura(a, skill.fx.trail, 0.4);
        }
        break;
      }
      case !!skill.speedBuff: {
        a.addBuff({ id: skill.id, name: skill.name, icon: skill.icon, dur: skill.speedDur, stat: 'speed', amt: skill.speedBuff });
        vfx.aura(a, skill.fx?.aura || 0xbfeaff, 1);
        break;
      }
      case !!skill.leap: {
        const pos = groundPos.clone();
        a._leap = { from: a.pos.clone(), to: pos, t: 0, dur: 0.55 };
        g.schedule(0.55, () => {
          vfx.ring(a.pos, 0xffaa66, skill.aoe, 0.4);
          vfx.burst(a.pos, 0xffaa66, 16, 0.22, 8);
          g.shake(0.4);
          this._aoeAround(a.pos, skill.aoe, m => {
            this._dealDamage(skill, m, skill.dmg(ctx));
            if (this.hasTalent('shockwave')) m.applyCC('stun', 1.5);
          });
        });
        break;
      }
      case !!skill.chargeTo: {
        if (!target?.alive) break;
        a._charge = { target, speed: 26 };
        g.schedule(0.05, () => { });
        break;
      }
      case !!skill.grappleTo: {
        const pos = groundPos.clone();
        vfx.beam(a.pos.clone().setY(a.pos.y + 1.4), pos.clone().setY(g.groundY(pos) + 1.4), 0xccaa66, 0.3, 0.06);
        a._leap = { from: a.pos.clone(), to: pos, t: 0, dur: 0.4, flat: true };
        break;
      }
      // ---- summons ----
      case !!skill.summonTurret: {
        this._spawnTurret(skill, groundPos || a.pos.clone());
        break;
      }
      case !!skill.trap: {
        this._spawnTrap(skill, groundPos || a.pos.clone());
        break;
      }
    }
  }

  _spawnDrone(dur) {
    const g = this.game, a = this.actor;
    const drone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), mat(0x7a8a6a));
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), mat(0xcccccc));
    rotor.position.y = 0.14; drone.add(body, rotor);
    g.scene.add(drone);
    const start = g.time;
    this.summons.push({ obj: drone, tick: () => {
      const t = g.time - start;
      if (t > dur || !a.alive) { g.scene.remove(drone); return false; }
      drone.position.set(a.pos.x + Math.cos(t * 2) * 1.2, a.pos.y + 2.4 + Math.sin(t * 3) * 0.2, a.pos.z + Math.sin(t * 2) * 1.2);
      rotor.rotation.y += 0.6;
      return true;
    } });
  }

  _spawnTurret(skill, pos) {
    const g = this.game, a = this.actor;
    const cfg = skill.summonTurret;
    const dur = this.hasTalent('war_machine') ? 18 : cfg.dur;
    const interval = this.hasTalent('twin_sentry') ? cfg.interval * 0.75 : cfg.interval;
    const turret = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 6), mat(0x5a5a4a));
    base.position.y = 0.25;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.8), mat(0x333333));
    gun.position.y = 0.62;
    turret.add(base, gun);
    const y = g.groundY(pos);
    turret.position.set(pos.x, y, pos.z);
    g.scene.add(turret);
    g.vfx.burst(turret.position, 0xd6b53a, 10, 0.15, 4);
    const start = g.time;
    let nextShot = start + 0.5;
    this.summons.push({ obj: turret, tick: () => {
      if (g.time - start > dur || !a.alive) { g.scene.remove(turret); return false; }
      // find target
      let best = null, bd = cfg.range;
      for (const m of g.hostilesOf(a)) {
        if (!m.alive) continue;
        const d = Math.hypot(m.pos.x - turret.position.x, m.pos.z - turret.position.z);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) {
        gun.lookAt(best.pos.clone().setY(best.pos.y + 1));
        if (g.time >= nextShot) {
          nextShot = g.time + interval;
          g.vfx.beam(turret.position.clone().setY(y + 0.6), best.pos.clone().setY(best.pos.y + 1), 0xffee66, 0.1, 0.04);
          this._dealDamage(skill, best, cfg.dmg({ power: a.power }));
        }
      }
      return true;
    } });
  }

  _spawnTrap(skill, pos) {
    const g = this.game, a = this.actor;
    const cfg = skill.trap;
    const trap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 6), mat(0x4a4a3a));
    const y = g.groundY(pos);
    trap.position.set(pos.x, y + 0.06, pos.z);
    g.scene.add(trap);
    const start = g.time;
    this.summons.push({ obj: trap, tick: () => {
      const t = g.time - start;
      if (t > cfg.life) { g.scene.remove(trap); return false; }
      if (t < cfg.armTime) return true;
      for (const m of g.hostilesOf(a)) {
        if (!m.alive) continue;
        if (Math.hypot(m.pos.x - trap.position.x, m.pos.z - trap.position.z) < 1.6) {
          g.vfx.ring(trap.position, 0xffcc44, cfg.aoe, 0.4);
          g.vfx.burst(trap.position, 0xffcc44, 18, 0.2, 8);
          const root = this.hasTalent('barbed_shrapnel') ? 3.5 : cfg.rootDur;
          this._aoeAround(trap.position, cfg.aoe, mm => {
            this._dealDamage(skill, mm, cfg.dmg({ power: a.power }));
            mm.rootUntil = g.time + root;
          });
          g.scene.remove(trap);
          return false;
        }
      }
      return true;
    } });
  }

  update(dt) {
    const g = this.game, a = this.actor;
    // finish casts
    if (this.casting && g.time >= this.casting.until) {
      const c = this.casting; this.casting = null;
      // re-validate range
      if (c.skill.target === 'enemy' && (!c.target?.alive || a.distTo(c.target) > (c.skill.range || 5) + 3)) {
        if (this.isPlayer) { Events.emit('castend'); g.log('Target lost.'); }
      } else this._execute(c.skill, c.target, c.groundPos);
    }
    // summons
    this.summons = this.summons.filter(s => s.tick());
    // resource regen
    const cls = this.cls;
    if (cls.resource === 'rage') {
      if (g.time > a.inCombat && !this.hasTalent('battle_trance'))
        a.resource = Math.max(0, a.resource - 8 * dt);
    } else {
      let regen = cls.resRegen;
      if (cls.resource === 'mana' && this.hasTalent('mana_font')) regen *= 1.5;
      if (cls.resource === 'energy' && this.hasTalent('field_rations')) regen *= 1.15;
      a.resource = Math.min(a.maxResource, a.resource + regen * dt);
    }
  }
}
