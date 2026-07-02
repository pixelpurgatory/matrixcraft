// ============ RANDOM ENCOUNTERS — RDR2-style roadside moments ============
// While the player roams the open world, occasionally stage a small scene just
// ahead of their path: rescues, ambushes, vignettes, glitches, escorts, duels.
import { THREE } from './engine.js';
import { ENCOUNTERS } from './data_quests.js';
import { Mob } from './mobs.js';
import { buildHumanoid, blobShadow } from './entities.js';
import { generateItem } from './loot.js';
import { Events } from './combat.js';

export class EncounterDirector {
  constructor(game) {
    this.game = game;
    this.nextAt = game.time + 45;         // first one comes fairly quick
    this.activeEnc = null;
    this.doneIds = new Set();
    this.lastPos = null;
    this.travelled = 0;
  }

  update(dt) {
    const g = this.game;
    if (g.inDungeon || g.inArena || !g.player?.alive) return;
    // measure actual travel so idling doesn't spawn events
    const p = g.player.pos;
    if (this.lastPos) this.travelled += Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos = { x: p.x, z: p.z };

    if (this.activeEnc) { this._tickActive(dt); return; }
    if (g.time < this.nextAt || this.travelled < 60) return;

    // only trigger away from the village hub
    const hub = g.world.landmarks.village;
    if (hub && Math.hypot(p.x - hub.x, p.z - hub.z) < 45) return;

    const pool = ENCOUNTERS.filter(e => e.zones.includes(g.zoneId)
      && !this.doneIds.has(e.id) && (!e.veil || g.veil > 0.05));
    if (!pool.length) { this.doneIds.clear(); return; }
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total, enc = pool[0];
    for (const e of pool) { r -= e.weight; if (r <= 0) { enc = e; break; } }
    this._start(enc);
  }

  _spotAhead(dist = 16) {
    const g = this.game, p = g.player;
    const dir = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    const pos = p.pos.clone().add(dir.multiplyScalar(dist));
    const [x, z] = g.world.collide(pos.x, pos.z, 1);
    return new THREE.Vector3(x, g.groundY({ x, z }), z);
  }

  _civilian(pos, name) {
    const g = this.game;
    const m = buildHumanoid({ colors: { robe: 0x7a6a4a, trim: 0xc0a878, skin: 0xd8a878, hair: 0x555555 } });
    m.add(blobShadow());
    m.position.copy(pos);
    g.scene.add(m);
    return { group: m, name, remove: () => g.scene.remove(m) };
  }

  _start(enc) {
    const g = this.game;
    this.doneIds.add(enc.id);
    this.nextAt = g.time + 90 + Math.random() * 90;
    this.travelled = 0;
    const spot = this._spotAhead(18);
    const st = { enc, spot, t: 0, mobs: [], props: [], stage: 0 };
    this.activeEnc = st;
    g.log(`✦ ${enc.setup}`);
    g.audio?.play('encounter');

    switch (enc.kind) {
      case 'rescue': {
        st.victim = this._civilian(spot, 'Merchant');
        st.props.push(st.victim);
        for (let i = 0; i < enc.count; i++) {
          const a = Math.random() * 6.28;
          const mp = spot.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3));
          const m = new Mob(g, enc.mob, g.player.level, mp);
          m.noRespawn = true;
          g.mobs.push(m); st.mobs.push(m);
        }
        break;
      }
      case 'ambush': {
        for (let i = 0; i < enc.count; i++) {
          const a = Math.random() * 6.28;
          const mp = spot.clone().add(new THREE.Vector3(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5));
          const m = new Mob(g, enc.mob, g.player.level, mp);
          m.noRespawn = true;
          g.mobs.push(m); st.mobs.push(m);
          g.schedule(1.2, () => m.alive && m.aggro(g.player));
        }
        break;
      }
      case 'vignette': {
        st.speaker = this._civilian(spot, 'Stranger');
        st.props.push(st.speaker);
        st.lineIdx = 0;
        st.nextLine = g.time + 1;
        break;
      }
      case 'glitch': {
        g.glitch(0.5);
        g.raiseVeil(enc.reward.veil || 0.01);
        st.lineIdx = 0;
        st.nextLine = g.time + 1.2;
        break;
      }
      case 'escort': {
        st.child = this._civilian(spot, 'Lost Child');
        st.child.group.scale.setScalar(0.65);
        st.props.push(st.child);
        st.goal = g.world.landmarks.village;
        break;
      }
      case 'duel': {
        const m = new Mob(g, 'storm_knight', g.player.level, spot);
        m.name = 'Loopbreaker Veteran';
        m.noRespawn = true;
        m.maxHp = Math.round(m.maxHp * 0.8); m.hp = m.maxHp;
        g.mobs.push(m); st.mobs.push(m);
        g.schedule(2, () => m.alive && m.aggro(g.player));
        break;
      }
    }
  }

  _finish(success = true) {
    const g = this.game, st = this.activeEnc;
    if (!st) return;
    if (success) {
      const r = st.enc.reward;
      if (st.enc.thanks) g.log(`✦ ${st.enc.thanks}`);
      if (r.xp) g.player.gainXp(r.xp);
      if (r.gear) {
        const item = generateItem({ ilvl: g.player.level * 3 + 1, classId: g.player.classId, minQuality: 'uncommon' });
        g.player.bag.push(item);
        g.log(`🎁 You receive: ${item.name}`);
        Events.emit('bag');
      }
    }
    g.schedule(4, () => { st.props.forEach(p => p.remove()); });
    this.activeEnc = null;
  }

  _tickActive(dt) {
    const g = this.game, st = this.activeEnc;
    st.t += dt;
    // abandon if the player walks far away
    if (g.player.pos.distanceTo(st.spot) > 70 && st.enc.kind !== 'escort') {
      st.props.forEach(p => p.remove());
      st.mobs.forEach(m => { if (m.alive) { m.alive = false; m.destroy(); g.mobs = g.mobs.filter(x => x !== m); } });
      this.activeEnc = null;
      return;
    }
    switch (st.enc.kind) {
      case 'rescue': case 'ambush': case 'duel': {
        if (st.mobs.every(m => !m.alive)) this._finish(true);
        // victim cowers
        if (st.victim) st.victim.group.rotation.y += Math.sin(g.time * 8) * 0.02;
        break;
      }
      case 'vignette': case 'glitch': {
        if (g.time >= st.nextLine && st.lineIdx < st.enc.lines.length) {
          const line = st.enc.lines[st.lineIdx++];
          if (st.speaker) g.sayAt(st.speaker.group.position, st.speaker.name, line);
          else g.log(`✦ ${line}`);
          st.nextLine = g.time + 3.2;
        }
        if (st.lineIdx >= st.enc.lines.length && g.time > st.nextLine) this._finish(true);
        break;
      }
      case 'escort': {
        const child = st.child.group;
        const pd = child.position.distanceTo(g.player.pos);
        if (pd < 6) {
          // follow player toward village
          const dir = g.player.pos.clone().sub(child.position).setY(0).normalize();
          child.position.add(dir.multiplyScalar(2.6 * dt));
          child.position.y = g.groundY(child.position);
          child.rotation.y = Math.atan2(dir.x, dir.z);
        }
        const goal = st.goal;
        if (goal && Math.hypot(child.position.x - goal.x, child.position.z - goal.z) < 24) this._finish(true);
        break;
      }
    }
  }
}
