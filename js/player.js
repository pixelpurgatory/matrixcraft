// ============ PLAYER — controller, camera, progression, targeting ============
import { THREE } from './engine.js';
import { Actor, Balance, Events, SkillRunner } from './combat.js';
import { buildPlayerModel } from './entities.js';
import { CLASSES, MAX_LEVEL, XP_TABLE, GEAR_SLOTS } from './data_classes.js';

export class Player extends Actor {
  constructor(game, classId, save = null) {
    const cls = CLASSES[classId] || CLASSES.mage;   // migrate saves from removed classes
    classId = cls.id;
    super(game, {
      name: save?.name || 'The Anomaly',
      level: save?.level || 1,
      maxHp: 100, power: 10,
      speed: 6.2,
      attackRange: cls.attackRange,
      model: buildPlayerModel(classId),
      pos: { x: 0, z: 40 },
      icon: cls.icon, faction: 'player',
    });
    this.classId = classId;
    this.cls = cls;
    this.xp = save?.xp || 0;
    this.gear = save?.gear || {};          // slot -> item
    this.bag = save?.bag || [];            // item[]
    this.talents = save?.talents || {};    // rowLvl -> talentId
    this.loreFound = save?.loreFound || [];
    this.veilSight = save?.veilSight || 0;
    this.deaths = save?.deaths || 0;
    this.kills = save?.kills || 0;
    this.maxResource = cls.baseRes;
    this.resource = cls.resource === 'rage' ? 0 : cls.baseRes;
    this.runner = new SkillRunner(game, this, cls, { talents: this.talents, isPlayer: true });
    this.anim.style = classId;
    this.recalcStats();
    this.hp = save?.hp ?? this.maxHp;
    this.vy = 0;
    this.grounded = true;
    this.autoTarget = null;
    this.gcdVisual = 0;
    this.autoOn = false;
    this.nextAuto = 0;
  }

  toggleAuto(on) {
    this.autoOn = on ?? !this.autoOn;
    this.game.log(this.autoOn ? '\u2694\ufe0f Auto-attack ON' : 'Auto-attack off.');
    Events.emit('cooldowns');
  }

  // WoW-style auto attack: arcane staff bolts on a swing timer
  _autoAttackTick() {
    const g = this.game;
    const t = g.target;
    if (!this.autoOn || !t || !t.alive || t.faction !== 'hostile') return;
    if (g.time < this.nextAuto || this.runner.casting || this.ccd || !this.alive) return;
    if (this.distTo(t) > this.cls.attackRange + t.radius) return;
    this.nextAuto = g.time + 1.6 / (1 + this.buffVal('haste'));
    this.faceToward(t.pos.x, t.pos.z, true);
    this.anim.play('castRelease', 0.24);
    g.audio?.play('zap');
    // staff-tip zap: beam flash + fast tracer bolt
    const rig = this.group.userData.rig;
    const from = this.pos.clone().setY(this.pos.y + 1.6);
    if (rig?.weapon?.userData.tip) rig.weapon.userData.tip.getWorldPosition(from);
    g.vfx.beam(from, t.pos.clone().setY(t.pos.y + 1.2), 0xc9a0ff, 0.09, 0.05);
    g.projectiles.spawn({
      from, target: t, speed: 44, color: 0xc9a0ff, size: 0.12,
      onHit: (hp, tgt) => {
        if (!tgt?.alive) return;
        const crit = Math.random() < Balance.critChance(this.gearCrit || 0);
        const skill = this.cls.skills[0];
        let dmg = skill.dmg({ power: this.power }) * (1 + this.buffVal('dmg')) * (crit ? 1.5 : 1);
        tgt.takeDamage(dmg, this, { crit });
      },
    });
  }

  // ---------- stats from gear ----------
  recalcStats() {
    let power = 0, stam = 0, crit = 0;
    for (const slot of GEAR_SLOTS) {
      const it = this.gear[slot];
      if (!it) continue;
      power += it.power; stam += it.stam; crit += it.crit || 0;
    }
    this.gearPower = power; this.gearCrit = crit;
    this.power = Balance.playerPower(this.level, power);
    const hpPct = this.maxHp ? this.hp / this.maxHp : 1;
    let maxHp = Balance.playerHp(this.cls.baseHp, this.cls.hpPerLvl, this.level, stam);
    if (this.runner.hasTalent('thick_hide')) maxHp = Math.round(maxHp * 1.08);
    if (this.runner.hasTalent('colossus')) maxHp = Math.round(maxHp * 1.15);
    this.maxHp = maxHp;
    this.hp = Math.min(this.maxHp, Math.round(this.maxHp * hpPct) || this.maxHp);
    this.avgIlvl = Math.round(GEAR_SLOTS.reduce((s, sl) => s + (this.gear[sl]?.ilvl || 0), 0) / GEAR_SLOTS.length);
    this._weaponGlow();
    Events.emit('stats');
    Events.emit('hp', this);
  }

  // weapon glows with its quality tier (rare+); the mage gem lights up too
  _weaponGlow() {
    const rig = this.group.userData.rig;
    const glow = rig?.weapon?.userData?.qGlow;
    const w = this.gear.weapon;
    const colors = { rare: 0x2f8fff, epic: 0xc45aff, legendary: 0xffa030 };
    if (glow) {
      if (w && colors[w.quality]) {
        glow.visible = true;
        glow.material.color.set(colors[w.quality]);
        glow.material.opacity = w.quality === 'legendary' ? 0.95 : 0.7;
      } else glow.visible = false;
    }
    const gemLight = rig?.weapon?.userData?.glow;
    if (gemLight) gemLight.intensity = w ? { common: 0, uncommon: 0.15, rare: 0.4, epic: 0.7, legendary: 1.1 }[w.quality] ?? 0 : 0;
  }

  gainXp(amount) {
    if (this.level >= MAX_LEVEL) return;
    if (this.runner.hasTalent('quick_learner')) amount = Math.round(amount * 1.1);
    this.xp += amount;
    this.game.log(`+${amount} XP`);
    while (this.level < MAX_LEVEL && this.xp >= XP_TABLE[this.level]) {
      this.xp -= XP_TABLE[this.level];
      this.level++;
      this.recalcStats();
      this.hp = this.maxHp;
      this.game.vfx.ring(this.pos, 0xffd700, 6, 1);
      this.game.vfx.burst(this.pos, 0xffd700, 24, 0.25, 8, 1);
      this.game.log(`⭐ LEVEL UP! You are now level ${this.level}.`);
      this.game.audio?.play('levelup');
      const row = this.cls.talents.find(r => r.lvl === this.level);
      if (row) this.game.log(`New talent row unlocked! Press K to choose.`);
      Events.emit('level');
    }
    Events.emit('xp');
  }

  equip(item) {
    let slot = item.slot;
    if (slot === 'ring1' && this.gear.ring1 && !this.gear.ring2) slot = 'ring2';
    const old = this.gear[slot];
    this.gear[slot] = item;
    this.bag = this.bag.filter(i => i !== item);
    if (old) this.bag.push(old);
    this.recalcStats();
    this.game.audio?.play('equip');
    Events.emit('bag');
  }

  // ---------- movement + camera ----------
  update(dt, input, camYaw) {
    const g = this.game;
    this.tickShared(dt);
    this.runner.update(dt);
    if (!this.alive) { this.anim.update(dt, false); return; }

    let moving = false;
    const speedMult = 1 + this.buffVal('speed');
    const slowed = this.buffVal('slow');

    // dash velocity (from skills)
    if (this._dashUntil && g.time < this._dashUntil) {
      const nx = this.pos.x + this._dashVel.x * dt, nz = this.pos.z + this._dashVel.z * dt;
      const [cx, cz] = g.world.collide(nx, nz, this.radius);
      this.pos.x = cx; this.pos.z = cz;
      moving = true;
    } else if (this._leap) {
      const l = this._leap;
      l.t += dt;
      const p = Math.min(1, l.t / l.dur);
      this.pos.x = THREE.MathUtils.lerp(l.from.x, l.to.x, p);
      this.pos.z = THREE.MathUtils.lerp(l.from.z, l.to.z, p);
      const gy = g.groundY(this.pos);
      this.pos.y = gy + (l.flat ? 0.5 : Math.sin(p * Math.PI) * 4);
      if (p >= 1) { this._leap = null; this.pos.y = gy; }
      moving = true;
    } else if (this._charge) {
      const c = this._charge;
      const d = this.distTo(c.target);
      if (d < 2.2 || !c.target.alive) {
        if (c.target.alive) { c.target.applyCC('stun', 1); }
        this._charge = null;
      } else {
        const dx = c.target.pos.x - this.pos.x, dz = c.target.pos.z - this.pos.z;
        const dd = Math.hypot(dx, dz);
        this.pos.x += dx / dd * c.speed * dt;
        this.pos.z += dz / dd * c.speed * dt;
        this.faceToward(c.target.pos.x, c.target.pos.z, true);
        moving = true;
      }
    } else if (!this.ccd && !this.rooted) {
      const mv = input.move;
      if (Math.abs(mv.x) > 0.05 || Math.abs(mv.y) > 0.05) {
        // camera-relative movement
        const ang = Math.atan2(mv.x, mv.y);
        const dir = camYaw + Math.PI - ang; // forward = away from camera, right = screen right
        const spd = this.speed * speedMult * (1 - Math.min(0.6, slowed)) * Math.min(1, Math.hypot(mv.x, mv.y));
        let nx = this.pos.x + Math.sin(dir) * spd * dt;
        let nz = this.pos.z + Math.cos(dir) * spd * dt;
        [nx, nz] = g.world.collide(nx, nz, this.radius);
        this.pos.x = nx; this.pos.z = nz;
        this.facing = dir;
        this.group.rotation.y = this.facing;
        moving = true;
        // moving interrupts casts
        if (this.runner.casting) { this.runner.interrupt(); g.log('Cast interrupted.'); }
      }
    }

    // gravity / jump
    const gy = g.groundY(this.pos);
    if (!this._leap) {
      if (this.pos.y > gy + 0.01 || this.vy > 0) {
        this.vy -= 30 * dt;
        this.pos.y = Math.max(gy, this.pos.y + this.vy * dt);
        this.grounded = this.pos.y <= gy + 0.01;
      } else { this.pos.y = gy; this.grounded = true; this.vy = 0; }
    }

    this.anim.baseY = this.pos.y;
    this.anim.update(dt, moving);
    this._autoAttackTick();

    // out-of-combat regen
    if (g.time > this.inCombat && this.alive && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05 * dt);
      Events.emit('hp', this);
    }
  }

  jump() {
    if (this.grounded && this.alive && !this.ccd) { this.vy = 9.8; this.grounded = false; }
  }

  // ---------- targeting ----------
  selectTarget() {
    const g = this.game;
    const candidates = g.mobs.filter(m => m.alive && this.distTo(m) < 35);
    if (!candidates.length) { g.setTarget(null); return; }
    candidates.sort((a, b) => this.distTo(a) - this.distTo(b));
    const cur = g.target;
    const idx = candidates.indexOf(cur);
    g.setTarget(candidates[(idx + 1) % candidates.length]);
  }

  nearestEnemy(maxDist = 32) {
    let best = null, bd = maxDist;
    for (const m of this.game.mobs) {
      if (!m.alive) continue;
      const d = this.distTo(m);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  useSkill(index) {
    const g = this.game;
    const skill = this.cls.skills[index];
    if (!skill) return;
    let target = g.target;
    // auto-target for convenience (mobile especially)
    if (skill.target === 'enemy' && (!target || !target.alive)) {
      target = this.nearestEnemy(skill.range || 30);
      if (target) g.setTarget(target);
    }
    if (skill.autoToggle) {
      if (!g.target && target) g.setTarget(target);
      this.toggleAuto();
      return;
    }
    const err = this.runner.use(skill, target, null);
    if (err && err !== 'dead' && err !== 'Not ready' && err !== 'Already casting') g.log(err);
    else if (!err) {
      g.audio?.play(skill.kind === 'mobility' ? 'dash' : this.cls.ranged ? 'cast' : 'swing');
      if (skill.target === 'enemy' || skill.target === 'ground') this.autoOn = true; // casting joins the fight
    }
  }

  onDeath(source) {
    this.deaths++;
    this.game.onPlayerDeath(source);
  }

  serialize() {
    return {
      name: this.name, classId: this.classId, level: this.level, xp: this.xp,
      gear: this.gear, bag: this.bag, talents: this.talents,
      loreFound: this.loreFound, veilSight: this.veilSight,
      hp: Math.round(this.hp), deaths: this.deaths, kills: this.kills,
    };
  }
}

// ---------- third-person camera ----------
export class ThirdPersonCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;      // behind player facing north initially
    this.pitch = 0.35;
    this.dist = 8;
    this.targetDist = 8;
    this.shakeAmt = 0;
  }

  zoom(dir) { this.targetDist = THREE.MathUtils.clamp(this.targetDist + dir * 1.2, 3.5, 14); }

  update(dt, look, playerPos, groundYFn) {
    this.yaw -= look.dx * 0.0032; // drag right = look right
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.0028, -0.2, 1.2);
    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 8);
    const cy = Math.cos(this.pitch), sy = Math.sin(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cy, sy, Math.cos(this.yaw) * cy).multiplyScalar(this.dist);
    const focus = playerPos.clone(); focus.y += 1.8;
    const pos = focus.clone().add(off);
    // keep camera above terrain
    const gy = groundYFn(pos) + 0.6;
    if (pos.y < gy) pos.y = gy;
    if (this.shakeAmt > 0.01) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt;
      pos.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.001, dt);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(focus);
  }
}
