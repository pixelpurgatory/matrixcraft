// ============ MOBS — AI, spawning, behaviors, boss mechanics ============
// Design:
//  • Mob level scales with distance from the zone's village hub → natural difficulty rings.
//  • Camps of 2–4 mobs share social aggro (12m). Knights/bandits patrol waypoint loops.
//  • Attacks are telegraphed: melee has a 0.55s windup, ranged a 1.1s cast — dodgeable.
//  • Leash: 42m from home → evade (return, heal full, briefly immune).
//  • Species quirks: werewolves howl-enrage at 50% hp, ghosts phase (25% miss, shimmer),
//    beasts flee at 15% hp, zombies never stop, glitchlings blink-teleport, knights raise
//    a shield stance periodically (-50% damage taken), swarms orbit their prey.
import { THREE, rng } from './engine.js';
import { Actor, Balance, Events } from './combat.js';
import { MOB_TYPES, ZONE_MOBS, ZONES } from './data_world.js';

export class Mob extends Actor {
  constructor(game, typeId, level, pos, opts = {}) {
    const T = MOB_TYPES[typeId] || opts.bossDef;
    const def = opts.bossDef || T;
    super(game, {
      name: def.name, level,
      maxHp: opts.bossDef ? def.hp * (1 + 0.12 * (level - 1)) : Balance.mobHp(def.hp, level),
      power: 0,
      speed: def.speed,
      attackRange: def.range,
      modelKind: def.model, color: def.color,
      pos, icon: def.icon,
      faction: 'hostile',
      isBoss: !!opts.bossDef,
      radius: opts.bossDef ? 1.1 : 0.6,
    });
    this.typeId = typeId;
    this.T = def;
    this.dmg = opts.bossDef ? Math.round(def.dmg * (1 + 0.1 * (level - 1))) : Balance.mobDmg(def.dmg, level);
    this.xpValue = Balance.mobXp(def.xp, level);
    this.home = { x: pos.x, z: pos.z };
    this.camp = opts.camp || null;
    this.patrol = opts.patrol || null;   // [{x,z},...]
    this.patrolIdx = 0;
    this.state = 'idle';
    this.target = null;
    this.nextThink = 0;
    this.nextAttack = 0;
    this.windup = null;   // {at, target}
    this.wanderTo = null;
    this.evadeUntil = 0;
    this.fled = false;
    this.saidLine = false;
    this.enraged = false;
    this.blockUntil = 0; this.nextBlock = game.time + 6 + Math.random() * 6;
    this.nextTeleport = 0;
    if (def.ranged) this.ranged = true;
    if (def.translucent) this.missChance = 0.25;
    if (def.armored) this.armored = true;
    if (this.isBoss) this.group.scale.multiplyScalar(1.6);
    this.anim.baseY = 0;
    this.mechanics = opts.bossDef?.mechanics || [];
    this.mechTimers = {};
    this.threat = new Map();
    this.aggroRadius = def.aggro || 10;
  }

  addThreat(actor, amt) {
    this.threat.set(actor, (this.threat.get(actor) || 0) + amt);
  }

  pickTarget() {
    // highest threat alive & in leash range
    let best = null, bt = -1;
    for (const [a, t] of this.threat) {
      if (!a.alive || a.stealthed) continue;
      if (t > bt) { bt = t; best = a; }
    }
    return best;
  }

  onDamaged(source, dmg) {
    if (!source || source === this) return;
    this.addThreat(source, dmg);
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'patrol') this.aggro(source);
    // social aggro
    if (this.camp) for (const m of this.camp) {
      if (m !== this && m.alive && m.state !== 'chase' && m.distTo(this) < 12) m.aggro(source);
    }
    // werewolf howl at 50%
    if (this.T.howls && !this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      this.anim.play('howl');
      this.addBuff({ id: 'frenzy', name: 'Frenzy', icon: '🌕', dur: 8, stat: 'dmg', amt: 0.3 });
      this.game.vfx.ring(this.pos, 0xffdd66, 4, 0.6);
      this.game.log(`${this.name} howls at the moon!`);
      this.game.audio?.play('howl');
    }
    // beast flee
    if (this.T.model === 'beast' && !this.fled && this.hp < this.maxHp * 0.15) {
      this.fled = true;
      this.state = 'flee';
      this.fleeUntil = this.game.time + 2.5;
    }
  }

  aggro(target) {
    if (!this.alive || this.game.time < this.evadeUntil) return;
    if (this.state === 'chase' || this.state === 'flee') return;
    this.state = 'chase';
    this.target = target;
    this.addThreat(target, 1);
    if (this.T.talks && !this.saidLine) {
      this.saidLine = true;
      this.game.say(this, this.T.talks[Math.floor(Math.random() * this.T.talks.length)]);
    }
    if (this.T.moans) this.game.audio?.play('moan');
    if (this.isBoss) Events.emit('bossengage', this);
  }

  evade() {
    this.state = 'evade';
    this.target = null;
    this.threat.clear();
    this.windup = null;
    this.evadeUntil = this.game.time + 3;
    this.hp = this.maxHp;
    Events.emit('hp', this);
  }

  update(dt) {
    if (!this.alive) { this.anim.update(dt, false); return; }
    this.tickShared(dt);
    const g = this.game, t = g.time;
    const player = g.player;

    if (this.ccd) { this.anim.update(dt, false); return; }

    // ---- proximity aggro scan (cheap: every 0.4s) ----
    if (t > this.nextThink) {
      this.nextThink = t + 0.35 + Math.random() * 0.15;
      if ((this.state === 'idle' || this.state === 'wander' || this.state === 'patrol') && t > this.evadeUntil) {
        for (const a of g.attackables()) {
          if (!a.alive || a.stealthed) continue;
          const d = this.distTo(a);
          const lvlPenalty = Math.max(0, a.level - this.level) * 0.8;
          if (d < Math.max(4, this.aggroRadius - lvlPenalty)) { this.aggro(a); break; }
        }
      }
      // knight block stance
      if (this.T.armored && this.state === 'chase' && t > this.nextBlock) {
        this.nextBlock = t + 9 + Math.random() * 4;
        this.blockUntil = t + 2.5;
        this.addBuff({ id: 'block', name: 'Shield Stance', icon: '🛡️', dur: 2.5, stat: 'dr', amt: 0.5 });
      }
      // boss mechanics
      if (this.isBoss && this.state === 'chase') this.runMechanics();
    }

    let moving = false;

    switch (this.state) {
      case 'idle': {
        if (this.patrol) { this.state = 'patrol'; break; }
        if (Math.random() < 0.008) {
          const a = Math.random() * 6.28, d = 3 + Math.random() * 6;
          this.wanderTo = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
          this.state = 'wander';
        }
        break;
      }
      case 'wander': {
        moving = this.moveToward(this.wanderTo.x, this.wanderTo.z, dt, this.speed * 0.4);
        if (!moving) this.state = 'idle';
        break;
      }
      case 'patrol': {
        const wp = this.patrol[this.patrolIdx];
        const arrived = !this.moveToward(wp.x, wp.z, dt, this.speed * 0.5);
        moving = !arrived;
        if (arrived) this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
        break;
      }
      case 'flee': {
        if (t > this.fleeUntil) { this.state = this.target ? 'chase' : 'idle'; break; }
        if (this.target) {
          const dx = this.pos.x - this.target.pos.x, dz = this.pos.z - this.target.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          moving = this.moveToward(this.pos.x + dx / d * 8, this.pos.z + dz / d * 8, dt, this.speed);
        }
        break;
      }
      case 'evade': {
        moving = this.moveToward(this.home.x, this.home.z, dt, this.speed * 1.4);
        if (!moving) this.state = 'idle';
        break;
      }
      case 'chase': {
        this.target = this.pickTarget() || this.target;
        const tgt = this.target;
        if (!tgt || !tgt.alive || tgt.stealthed) { this.evade(); break; }
        // leash (bosses in dungeons don't leash by distance from home)
        const leash = this.isBoss ? 60 : 42;
        if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > leash) { this.evade(); break; }
        const d = this.distTo(tgt);
        const inRange = d <= this.attackRange + tgt.radius;
        // glitchling teleport
        if (this.T.glitch && t > this.nextTeleport && d > 4) {
          this.nextTeleport = t + 5;
          const a = Math.random() * 6.28;
          const nx = tgt.pos.x + Math.cos(a) * 6, nz = tgt.pos.z + Math.sin(a) * 6;
          g.vfx.burst(this.pos, 0x39ff88, 10, 0.15, 4);
          this.pos.set(nx, g.groundY({ x: nx, z: nz }), nz);
          g.vfx.burst(this.pos, 0x39ff88, 10, 0.15, 4);
        }
        // swarm orbits while attacking
        if (this.T.model === 'swarm' && inRange) {
          const orb = t * 2 + this.id.length;
          moving = this.moveToward(tgt.pos.x + Math.cos(orb) * 1.6, tgt.pos.z + Math.sin(orb) * 1.6, dt, this.speed * 0.8);
        } else if (!inRange && (!this.ranged || d > this.attackRange * 0.9)) {
          if (!this.rooted) moving = this.moveToward(tgt.pos.x, tgt.pos.z, dt, this.speed);
        }
        this.faceToward(tgt.pos.x, tgt.pos.z);
        // ---- attack cycle with windup ----
        if (this.windup) {
          if (t >= this.windup.at) {
            const w = this.windup; this.windup = null;
            if (w.kind === 'melee') {
              if (this.distTo(tgt) <= this.attackRange + tgt.radius + 0.8 && tgt.alive) {
                tgt.takeDamage(this.dmg * (1 + this.buffVal('dmg')), this);
                g.audio?.play('hit');
              }
            } else {
              // ranged bolt
              g.projectiles.spawn({
                from: this.pos.clone().setY(this.pos.y + 1.4), target: tgt, speed: 18,
                color: this.T.glitch ? 0x39ff88 : 0x9db8d8, size: 0.22, trail: true,
                onHit: (hp, hitT) => { if (hitT?.alive) hitT.takeDamage(this.dmg * (1 + this.buffVal('dmg')), this); },
              });
            }
            this.nextAttack = t + (this.isBoss ? 2.2 : this.ranged ? 2.6 : 1.9);
          }
        } else if (t >= this.nextAttack && (inRange || (this.ranged && d < this.attackRange))) {
          const kind = this.ranged && d > 3 ? 'ranged' : 'melee';
          this.windup = { at: t + (kind === 'melee' ? 0.55 : 1.1), kind };
          this.anim.play(kind === 'melee' ? 'attack' : 'cast');
        }
        break;
      }
    }

    // ground snap
    if (!this._inDungeonFlat) this.pos.y = g.groundY(this.pos);
    this.anim.update(dt, moving);
    // ghost shimmer
    if (this.T.translucent) {
      const op = 0.4 + Math.sin(t * 3 + this.pos.x) * 0.15;
      this.group.traverse(o => { if (o.material?.transparent) o.material.opacity = Math.min(op, o.material.opacity + 0.5 * dt); });
    }
  }

  moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return false;
    const s = speed * dt;
    let nx = this.pos.x + dx / d * s, nz = this.pos.z + dz / d * s;
    [nx, nz] = this.game.world.collide(nx, nz, this.radius);
    this.pos.x = nx; this.pos.z = nz;
    this.faceToward(x, z);
    return true;
  }

  onDeath(source) {
    this.windup = null;
    this.game.onMobKilled(this, source);
    // respawn only in open world
    if (!this.noRespawn) {
      this.game.schedule(9, () => { this.group.visible = false; });
      this.game.schedule(26, () => {
        if (this.game.mobs.includes(this)) {
          this.alive = true; this.hp = this.maxHp;
          this.pos.set(this.home.x, this.game.groundY(this.home), this.home.z);
          this.state = 'idle'; this.threat.clear(); this.target = null;
          this.enraged = false; this.fled = false; this.saidLine = false;
          this.group.visible = true;
          this.anim.dead = false; this.anim.play('idle');
          this.group.rotation.z = 0;
          Events.emit('hp', this);
        }
      });
    } else {
      this.game.schedule(8, () => { this.group.visible = false; });
    }
  }

  // ---------------- BOSS MECHANICS ----------------
  runMechanics() {
    const g = this.game, t = g.time;
    for (const mech of this.mechanics) {
      const timer = this.mechTimers[mech] ?? (this.mechTimers[mech] = t + 6 + Math.random() * 4);
      if (t < timer) continue;
      this.mechTimers[mech] = t + this._mechCd(mech);
      this._runMechanic(mech);
    }
  }

  _mechCd(m) {
    return { howl_adds: 18, frenzy: 22, spirit_volley: 12, summon_drowned: 20, royal_decree: 15,
      knight_adds: 25, loop_reset: 30, plague_pools: 10, rat_tide: 22, bell_toll: 14, hanged_chorus: 20,
      murder_of_crows: 12, mirror_feathers: 18, queens_gambit: 30, ice_tomb: 16, shatter_field: 11,
      segfault: 13, garbage_collection: 20, rewrite: 15, firewall: 20, deprecation: 12, final_argument: 45 }[m] || 15;
  }

  _summonAdds(typeId, n, label) {
    const g = this.game;
    g.log(`${this.name} summons ${label}!`);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const pos = new THREE.Vector3(this.pos.x + Math.cos(a) * 5, this.pos.y, this.pos.z + Math.sin(a) * 5);
      const add = new Mob(g, typeId, Math.max(1, this.level - 1), pos);
      add.noRespawn = true;
      add.maxHp = Math.round(add.maxHp * 0.5); add.hp = add.maxHp;
      add._inDungeonFlat = this._inDungeonFlat;
      g.mobs.push(add);
      if (this.target) add.aggro(this.target);
      g.vfx.burst(pos, 0x8866aa, 10, 0.2, 5);
    }
  }

  _groundBlast(pos, radius, mult, color, warn = 1.6) {
    const g = this.game;
    g.vfx.telegraph(pos, radius, warn, color);
    g.schedule(warn, () => {
      g.vfx.ring(pos, color, radius, 0.5);
      g.vfx.burst(pos, color, 20, 0.25, 9);
      g.shake(0.5);
      for (const a of g.attackables()) {
        if (a.alive && Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) <= radius)
          a.takeDamage(this.dmg * mult, this);
      }
    });
  }

  _runMechanic(mech) {
    const g = this.game, tgt = this.target;
    switch (mech) {
      case 'howl_adds': this.anim.play('howl'); this._summonAdds('wolf', 2, 'the pack'); break;
      case 'frenzy':
        this.addBuff({ id: 'frenzy', name: 'Frenzy', icon: '🌕', dur: 6, stat: 'dmg', amt: 0.4 });
        g.log(`${this.name} goes into a frenzy!`); break;
      case 'spirit_volley':
        g.say(this, 'The water remembers you...');
        for (const a of g.attackables()) if (a.alive) {
          g.projectiles.spawn({ from: this.pos.clone().setY(this.pos.y + 2), target: a, speed: 14, color: 0xbfe0e8, size: 0.3, trail: true,
            onHit: (hp, hitT) => hitT?.alive && hitT.takeDamage(this.dmg * 0.8, this) });
        }
        break;
      case 'summon_drowned': this._summonAdds('zombie', 2, 'the drowned'); break;
      case 'royal_decree':
        g.say(this, 'KNEEL.');
        if (tgt?.alive) { tgt.applyCC('stun', 2); g.vfx.ring(tgt.pos, 0xffd700, 3, 0.6); }
        break;
      case 'knight_adds': this._summonAdds('knight', 2, 'the Kingsguard'); break;
      case 'loop_reset':
        g.say(this, 'Let us begin the day again.');
        this.heal(this.maxHp * 0.06, this);
        g.glitch(0.6);
        break;
      case 'plague_pools':
        for (const a of g.attackables()) if (a.alive) this._groundBlast(a.pos.clone(), 4, 1.1, 0x88aa33, 1.8);
        break;
      case 'rat_tide': this._summonAdds('plague_dog', 3, 'the tide'); break;
      case 'bell_toll':
        g.say(this, '🔔 The bell tolls for you.');
        g.shake(0.8);
        for (const a of g.attackables()) if (a.alive) a.takeDamage(this.dmg * 0.6, this);
        break;
      case 'hanged_chorus': this._summonAdds('ghost', 2, 'the hanged'); break;
      case 'murder_of_crows':
        if (tgt?.alive) {
          g.log('A murder of crows descends!');
          for (let i = 0; i < 4; i++) g.schedule(i * 0.4, () => tgt.alive && g.projectiles.spawn({
            from: this.pos.clone().setY(this.pos.y + 3), target: tgt, speed: 20, color: 0x222233, size: 0.25,
            onHit: (hp, hitT) => hitT?.alive && hitT.takeDamage(this.dmg * 0.45, this) }));
        }
        break;
      case 'mirror_feathers':
        g.say(this, 'See yourselves as I see you — from OUTSIDE.');
        for (const a of g.attackables()) if (a.alive) this._groundBlast(a.pos.clone(), 3.5, 1.2, 0x8888ff, 2);
        break;
      case 'queens_gambit':
        this.addBuff({ id: 'gambit', name: 'Queen’s Gambit', icon: '👑', dur: 8, stat: 'dr', amt: 0.6 });
        this._summonAdds('raven_swarm', 2, 'her court');
        g.log('Corvessa shields herself with wings — burn the swarms!');
        break;
      case 'ice_tomb':
        if (tgt?.alive) {
          g.say(this, 'Stand watch. Forever.');
          tgt.applyCC('stun', 2.5);
          g.vfx.aura(tgt, 0xbfe8ff, 2.5);
        }
        break;
      case 'shatter_field':
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * 6.28, d = 3 + Math.random() * 8;
          this._groundBlast(new THREE.Vector3(this.pos.x + Math.cos(a) * d, this.pos.y, this.pos.z + Math.sin(a) * d), 4, 1.3, 0xbfe8ff, 1.6);
        }
        break;
      case 'segfault':
        if (tgt?.alive) {
          g.say(this, 'SEGMENTATION FAULT.');
          g.glitch(0.8);
          this._groundBlast(tgt.pos.clone(), 5, 1.5, 0x39ff88, 1.4);
        }
        break;
      case 'garbage_collection':
        g.say(this, 'Collecting garbage. That means you.');
        this._summonAdds('glitchling', 2, 'orphaned processes');
        break;
      case 'rewrite':
        g.say(this, 'I will simply rewrite this encounter.');
        g.glitch(0.7);
        for (const a of g.attackables()) if (a.alive) this._groundBlast(a.pos.clone(), 4.5, 1.2, 0x39ff88, 1.7);
        break;
      case 'firewall': {
        g.log('The Architect raises a FIREWALL — get out of the burning ring!');
        const c = this.pos.clone();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 6.28;
          this._groundBlast(new THREE.Vector3(c.x + Math.cos(a) * 8, c.y, c.z + Math.sin(a) * 8), 3.4, 1.0, 0xff5522, 2.2);
        }
        break;
      }
      case 'deprecation':
        if (tgt?.alive) {
          g.say(this, 'You are deprecated.');
          tgt.addDot({ amount: Math.round(this.dmg * 0.3), interval: 1, ticks: 5 }, this);
        }
        break;
      case 'final_argument':
        g.say(this, 'FINAL ARGUMENT: none of you are real.');
        g.glitch(1);
        g.shake(1.2);
        for (const a of g.attackables()) if (a.alive) a.takeDamage(this.dmg * 1.1, this);
        this._summonAdds('glitchling', 2, 'counterexamples');
        break;
    }
  }
}

// ---------------- SPAWNER ----------------
export function spawnZoneMobs(game, zoneId) {
  const Z = ZONES[zoneId];
  const table = ZONE_MOBS[zoneId];
  const R = rng(Z.seed + 555);
  const mobs = [];
  const L = game.world.landmarks;
  const hub = L.village;
  const safeSpots = Object.values(L);
  const totalWeight = table.reduce((s, [, w]) => s + w, 0);
  const [minL, maxL] = Z.levels;
  const maxDist = Z.size * 0.45;

  const pickType = () => {
    let r = R() * totalWeight;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  };

  const CAMPS = 16;
  for (let c = 0; c < CAMPS; c++) {
    // find a valid camp spot
    let x, z, ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      x = (R() - 0.5) * Z.size * 0.86; z = (R() - 0.5) * Z.size * 0.86;
      if (game.world.groundH(x, z) > 24) continue;
      ok = safeSpots.every(s => Math.hypot(x - s.x, z - s.z) > 34);
    }
    if (!ok) continue;
    const dist = Math.hypot(x - hub.x, z - hub.z);
    const lvl = Math.min(maxL, Math.max(minL, Math.round(minL + (dist / maxDist) * (maxL - minL) + (R() - 0.5))));
    const typeId = pickType();
    const T = MOB_TYPES[typeId];
    const n = 2 + Math.floor(R() * 3);
    const camp = [];
    // patrols for humanoid soldier types
    const isPatroller = ['knight', 'bandit', 'storm_knight', 'cultist'].includes(typeId) && R() < 0.6;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = 2 + R() * 5;
      const pos = new THREE.Vector3(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
      let patrol = null;
      if (isPatroller && i === 0) {
        patrol = [];
        for (let p = 0; p < 4; p++) {
          const pa = R() * 6.28, pd = 8 + R() * 14;
          patrol.push({ x: x + Math.cos(pa) * pd, z: z + Math.sin(pa) * pd });
        }
      }
      const m = new Mob(game, typeId, lvl, pos, { camp, patrol });
      camp.push(m); mobs.push(m);
    }
  }

  // lone roamers along roads
  for (let i = 0; i < 10; i++) {
    let x = (R() - 0.5) * Z.size * 0.8, z = (R() - 0.5) * Z.size * 0.8;
    if (!safeSpots.every(s => Math.hypot(x - s.x, z - s.z) > 30)) continue;
    if (game.world.groundH(x, z) > 24) continue;
    const dist = Math.hypot(x - hub.x, z - hub.z);
    const lvl = Math.min(maxL, Math.max(minL, Math.round(minL + (dist / maxDist) * (maxL - minL))));
    const m = new Mob(game, pickType(), lvl, new THREE.Vector3(x, 0, z));
    mobs.push(m);
  }
  return mobs;
}
