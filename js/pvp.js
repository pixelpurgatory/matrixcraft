// ============ 1v1 PVP ARENA — instant max level, best gear, pure skill ============
// A separate mode: pick any class, get level 20 + full legendary iLvl 60 kit,
// and duel in the Null Chamber — a floating arena outside the simulation's map.
// Online: real opponent via matchmaking. Offline (or no match in 6s): the
// DUELIST DAEMON, an AI that plays a real rotation with dodges and cooldowns.
import { THREE, mat, basicMat, tex } from './engine.js';
import { Actor, SkillRunner, Events } from './combat.js';
import { buildPlayerModel, blobShadow } from './entities.js';
import { CLASSES } from './data_classes.js';
import { bisSet } from './loot.js';
import { Balance } from './combat.js';

const BOT_NAMES = ['AGENT MOROSE', 'AGENT VELVET', 'AGENT NULL', 'AGENT CANDLE', 'AGENT WINTER'];

export class ArenaBot extends Actor {
  constructor(game, classId) {
    const cls = CLASSES[classId];
    const gear = bisSet(classId);
    const gearPower = Object.values(gear).reduce((s, i) => s + i.power, 0);
    const gearStam = Object.values(gear).reduce((s, i) => s + i.stam, 0);
    super(game, {
      name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
      level: 20,
      maxHp: Balance.playerHp(cls.baseHp, cls.hpPerLvl, 20, gearStam),
      power: Balance.playerPower(20, gearPower),
      speed: 6.2,
      attackRange: cls.attackRange,
      model: buildPlayerModel(classId),
      pos: { x: 0, z: -12 },
      icon: cls.icon, faction: 'hostile',
    });
    this.classId = classId;
    this.cls = cls;
    this.gearCrit = Object.values(gear).reduce((s, i) => s + (i.crit || 0), 0);
    this.maxResource = cls.baseRes;
    this.resource = cls.resource === 'rage' ? 30 : cls.baseRes;
    // bot picks sensible talents
    const talents = {};
    for (const row of cls.talents) talents[row.lvl] = row.choices[Math.floor(Math.random() * 3)].id;
    this.runner = new SkillRunner(game, this, cls, { talents });
    this.nextThink = 0;
    this.strafeDir = 1;
    this.nextStrafeFlip = 0;
    this.reaction = 0.25 + Math.random() * 0.2; // human-ish reaction time
  }

  update(dt) {
    const g = this.game;
    this.tickShared(dt);
    this.runner.update(dt);
    if (!this.alive) { this.anim.update(dt, false); return; }
    if (this.ccd) { this.anim.update(dt, false); return; }
    const foe = g.player;
    if (!foe?.alive) { this.anim.update(dt, false); return; }

    const t = g.time;
    const d = this.distTo(foe);
    const wantRange = this.cls.ranged ? 16 : 2.6;
    let moving = false;

    // dash-move handling from skills
    if (this._dashUntil && t < this._dashUntil) {
      this.pos.x += this._dashVel.x * dt; this.pos.z += this._dashVel.z * dt;
      moving = true;
    } else if (this._leap) {
      const l = this._leap; l.t += dt;
      const p = Math.min(1, l.t / l.dur);
      this.pos.x = THREE.MathUtils.lerp(l.from.x, l.to.x, p);
      this.pos.z = THREE.MathUtils.lerp(l.from.z, l.to.z, p);
      this.pos.y = Math.sin(p * Math.PI) * 3;
      if (p >= 1) { this._leap = null; this.pos.y = 0; }
      moving = true;
    } else if (this._charge) {
      const c = this._charge;
      if (this.distTo(c.target) < 2.2 || !c.target.alive) { c.target.alive && c.target.applyCC('stun', 1); this._charge = null; }
      else {
        const dx = c.target.pos.x - this.pos.x, dz = c.target.pos.z - this.pos.z, dd = Math.hypot(dx, dz);
        this.pos.x += dx / dd * 26 * dt; this.pos.z += dz / dd * 26 * dt;
        moving = true;
      }
    } else if (!this.rooted && !this.runner.casting) {
      // positioning: close/kite to ideal range, strafe otherwise
      if (t > this.nextStrafeFlip) { this.strafeDir *= -1; this.nextStrafeFlip = t + 1.2 + Math.random() * 1.6; }
      const dx = foe.pos.x - this.pos.x, dz = foe.pos.z - this.pos.z, dd = Math.hypot(dx, dz) || 1;
      let mx = 0, mz = 0;
      if (d > wantRange + 1) { mx = dx / dd; mz = dz / dd; }
      else if (d < wantRange - 2 && this.cls.ranged) { mx = -dx / dd; mz = -dz / dd; }
      else { mx = -dz / dd * this.strafeDir; mz = dx / dd * this.strafeDir; }
      const spd = this.speed * (1 + this.buffVal('speed')) * (1 - Math.min(0.6, this.buffVal('slow')));
      let nx = this.pos.x + mx * spd * dt, nz = this.pos.z + mz * spd * dt;
      const rr = Math.hypot(nx, nz);
      if (rr > 22) { nx *= 22 / rr; nz *= 22 / rr; } // stay on the platform
      this.pos.x = nx; this.pos.z = nz;
      moving = true;
    }
    this.faceToward(foe.pos.x, foe.pos.z);

    // decision brain
    if (t > this.nextThink && !this.runner.casting) {
      this.nextThink = t + this.reaction;
      this._chooseSkill(foe, d);
    }
    this.pos.y = Math.max(0, this.pos.y);
    this.anim.update(dt, moving);
  }

  _try(id, foe) {
    const skill = this.cls.skills.find(s => s.id === id);
    if (!skill) return false;
    if (!this.runner.ready(skill) || !this.runner.canAfford(skill)) return false;
    const err = this.runner.use(skill, foe, foe.pos.clone());
    return !err;
  }

  _chooseSkill(foe, d) {
    const hpPct = this.hp / this.maxHp;
    const foePct = foe.hp / foe.maxHp;
    const c = this.classId;
    // defensive layer
    if (hpPct < 0.45) {
      if (c === 'mage' && (this._try('frost_ward', foe) || this._try('time_anchor', foe))) return;
      if (c === 'barbarian' && (this._try('unbreakable', foe) || this._try('bloodthirst', foe))) return;
      if (c === 'hunter' && this._try('med_drone', foe)) return;
    }
    // escape when melee'd (ranged classes)
    if (this.cls.ranged && d < 5) {
      if (c === 'mage' && this._try('blink', foe)) return;
      if (c === 'hunter' && this._try('booster_dash', foe)) return;
    }
    // gap close (melee)
    if (c === 'barbarian' && d > 8 && this._try('charge', foe)) return;
    if (c === 'barbarian' && d > 6 && this._try('heroic_leap', foe)) return;
    // burst windows
    if (c === 'mage') {
      if (foePct < 0.6 && this._try('glitch_lamb', foe)) return;
      const brand = foe.buffs.find(b => b.id === 'brand');
      if (brand?.stacks >= 3 && this._try('ember_nova', foe)) return;
      if (this._try('comet_call', foe)) return;
      if (this._try('pyroclasm', foe)) return;
      if (this._try('icicle_barrage', foe)) return;
      this._try('frostfire_bolt', foe);
    } else if (c === 'barbarian') {
      if (d < 4) {
        if (foePct < 0.35 && this._try('execute', foe)) return;
        if (this._try('war_cry', foe)) return;
        if (this._try('skullsplitter', foe)) return;
        if (this._try('rampage', foe)) return;
        if (this._try('whirlwind', foe)) return;
        this._try('cleave', foe);
      }
    } else {
      if (this._try('overclock', foe)) return;
      if (this._try('turret', foe)) return;
      if (d < 8 && this._try('shrapnel_trap', foe)) return;
      if (this._try('explosive_round', foe)) return;
      if (this._try('deadeye_volley', foe)) return;
      this._try('rifle_shot', foe);
    }
  }

  onDeath() { this.game.arena?.onBotDeath(); }
}

export class Arena {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.state = null;   // {bot, score:[you,them], round, savedChar}
    this.built = false;
  }

  _build() {
    if (this.built) return;
    this.built = true;
    // the Null Chamber: floating hex platform in the void with data pillars
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 3, 6), mat(0x3a4258, { tex: 'paving', rep: 8 }));
    plat.position.y = -1.5;
    this.root.add(plat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 0.4, 6, 6), basicMat(0x39ff88, { transparent: true, opacity: 0.7 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.1;
    this.root.add(rim);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 1.4), mat(0x232838));
      pillar.position.set(Math.cos(a) * 12, 2.5, Math.sin(a) * 12);
      this.root.add(pillar);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), basicMat(0x39ff88));
      glow.position.set(Math.cos(a) * 12, 5.2, Math.sin(a) * 12);
      this.root.add(glow);
    }
    // floating code shards in the void
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.05), basicMat(0x39ff88, { transparent: true, opacity: 0.4 }));
      const a = Math.random() * 6.28, r = 34 + Math.random() * 50;
      s.position.set(Math.cos(a) * r, -20 + Math.random() * 50, Math.sin(a) * r);
      this.root.add(s);
    }
    this.pillars = [{ x: 12, z: 0 }]; // simplified collision anchor
  }

  enter(classId) {
    const g = this.game;
    this._build();
    g.saveOverworldState({ arena: true });
    g.inArena = true;
    this.root.visible = true;
    // snapshot & re-spec the player at max
    const p = g.player;
    this.saved = p.serialize();
    p.level = 20;
    p.xp = 0;
    if (classId && classId !== p.classId) g.swapClass(classId, { keepPos: false });
    const pl = g.player;
    pl.gear = bisSet(pl.classId);
    pl.bag = [];
    // full talents (player can re-pick in K menu during setup)
    for (const row of pl.cls.talents) if (!pl.talents[row.lvl]) pl.talents[row.lvl] = row.choices[0].id;
    pl.recalcStats();
    pl.hp = pl.maxHp;
    pl.resource = pl.cls.resource === 'rage' ? 30 : pl.cls.baseRes;
    pl.pos.set(0, 0, 12);
    pl.facing = Math.PI;
    g.engine.applyEnvironment({
      skyTop: 0x000000, skyMid: 0x02110a, skyBot: 0x04231a, sunColor: 0x39ff88,
      sunDir: [0, 1, 0], cloud: 0, night: 1,
      fogColor: 0x010806, fogNear: 40, fogFar: 160, sunIntensity: 0.9,
      hemiSky: 0x1a5a3a, hemiGround: 0x0a1a10, hemiIntensity: 1,
    }, 1);
    g.engine.setGrade(0xdcffe8, 1.1, 0.95);
    g.audio?.music('arena');
    this.state = { score: [0, 0], round: 1, live: false };
    g.showZoneBanner('THE NULL CHAMBER', '1v1 — max level, best gear, pure skill');
    // matchmaking: try online, fall back to daemon
    let matched = false;
    if (g.net?.connected) {
      g.net.send({ t: 'arenaQueue', cls: pl.classId });
      g.net.onArenaMatch = (opp) => { matched = true; this._startRound(null, opp); };
      g.schedule(6, () => { if (!matched && this.state) { g.net.send({ t: 'arenaLeave' }); this._startRound(this._pickBotClass()); } });
      g.log('Searching for another dreamer... (6s until a DAEMON answers instead)');
    } else {
      this._startRound(this._pickBotClass());
    }
  }

  _pickBotClass() {
    const ids = Object.keys(CLASSES);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  _startRound(botClass, remoteOpp = null) {
    const g = this.game;
    if (!this.state) return;
    if (this.bot) { this.bot.destroy(); g.mobs = g.mobs.filter(m => m !== this.bot); this.bot = null; }
    g.player.pos.set(0, 0, 12);
    g.player.hp = g.player.maxHp;
    g.player.resource = g.player.cls.resource === 'rage' ? 30 : g.player.cls.baseRes;
    if (remoteOpp) {
      this.remote = remoteOpp;
      g.log(`⚔️ MATCH FOUND: ${remoteOpp.name} (${CLASSES[remoteOpp.cls]?.name}). Round ${this.state.round} — FIGHT!`);
    } else {
      this.bot = new ArenaBot(g, botClass);
      g.mobs.push(this.bot);
      g.setTarget(this.bot);
      g.log(`⚔️ ${this.bot.name} materializes — ${CLASSES[botClass].name}. Round ${this.state.round}!`);
    }
    // countdown
    this.state.live = false;
    let n = 3;
    const count = () => {
      if (!this.state) return;
      if (n > 0) { g.bigText(String(n)); g.audio?.play('ui'); n--; g.schedule(1, count); }
      else { g.bigText('FIGHT!'); g.audio?.play('pvp'); this.state.live = true; }
    };
    count();
    Events.emit('arena', this.state);
  }

  onBotDeath() {
    const g = this.game;
    if (!this.state) return;
    this.state.score[0]++;
    g.bigText('VICTORY');
    g.audio?.play('levelup');
    this._roundEnd();
  }

  onPlayerDeath() {
    const g = this.game;
    if (!this.state) return;
    this.state.score[1]++;
    g.bigText('DEFEATED');
    this._roundEnd();
  }

  _roundEnd() {
    const g = this.game;
    const [a, b] = this.state.score;
    Events.emit('arena', this.state);
    if (a >= 2 || b >= 2) {
      g.log(a > b ? `🏆 MATCH WON ${a}–${b}! The daemon dissolves into green rain.` : `Match lost ${a}–${b}. The chamber hums, unimpressed. Again?`);
      g.schedule(2.5, () => this.leave(true));
    } else {
      this.state.round++;
      g.schedule(2.5, () => {
        if (!this.state) return;
        if (!g.player.alive) g.revivePlayer();
        this._startRound(this.bot ? this.bot.classId : this._pickBotClass());
      });
    }
  }

  onRemoteHit(m) {
    if (this.state?.live && this.game.player.alive)
      this.game.player.takeDamage(m.dmg, null);
  }

  leave(offerRematch = false) {
    const g = this.game;
    if (!this.state) return;
    if (this.bot) { this.bot.destroy(); g.mobs = g.mobs.filter(m => m !== this.bot); this.bot = null; }
    this.state = null;
    this.root.visible = false;
    g.inArena = false;
    g.net?.send({ t: 'arenaLeave' });
    // restore the real character
    g.restoreCharacter(this.saved);
    g.restoreOverworld();
    if (offerRematch) g.ui?.openPvp();
    Events.emit('arena', null);
  }

  update(dt) {
    if (!this.state) return;
    // player falls off? clamp to platform
    const p = this.game.player.pos;
    const r = Math.hypot(p.x, p.z);
    if (r > 23) { p.x *= 23 / r; p.z *= 23 / r; }
  }
}
