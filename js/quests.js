// ============ QUEST ENGINE — tracking, objectives, dialogue integration ============
import { QUESTS } from './data_quests.js';
import { Events } from './combat.js';
import { generateItem } from './loot.js';

export class QuestLog {
  constructor(game, save = null) {
    this.game = game;
    this.active = {};     // questId -> {progress: [n,...], done:bool}
    this.completed = new Set(save?.completed || []);
    if (save?.active) this.active = save.active;
  }

  serialize() { return { active: this.active, completed: [...this.completed] }; }

  isActive(id) { return !!this.active[id]; }
  isCompleted(id) { return this.completed.has(id); }

  // quests an NPC can offer right now
  availableFrom(npcId) {
    return QUESTS.filter(q => q.giver === npcId
      && !this.isActive(q.id) && !this.isCompleted(q.id)
      && this.game.player.level >= q.level
      && this._prereqDone(q));
  }

  _prereqDone(q) {
    // simple gating: quests unlock in listed order per giver+zone
    const chain = QUESTS.filter(x => x.zone === q.zone);
    const idx = chain.indexOf(q);
    // require: all lower-level quests in the same zone by same giver completed
    for (let i = 0; i < idx; i++) {
      const prev = chain[i];
      if (prev.giver === q.giver && prev.level < q.level && !this.isCompleted(prev.id)) return false;
    }
    return true;
  }

  turninsFor(npcId) {
    return QUESTS.filter(q => q.turnin === npcId && this.isActive(q.id) && this.active[q.id].done);
  }

  accept(q) {
    this.active[q.id] = { progress: q.objectives.map(() => 0), done: false };
    this.game.log(`📜 Quest accepted: ${q.name}`);
    this.game.audio?.play('quest');
    this._check(q);
    Events.emit('quests');
    this.game.refreshNpcMarkers();
  }

  turnIn(q) {
    delete this.active[q.id];
    this.completed.add(q.id);
    const p = this.game.player;
    p.gainXp(q.reward.xp);
    if (q.reward.gear) {
      const item = generateItem({
        ilvl: q.level * 3 + (q.reward.ilvlBonus || 0) + 2,
        classId: p.classId,
        qualityBonus: q.reward.ilvlBonus ? 2 : 0.5,
        minQuality: 'uncommon',
      });
      p.bag.push(item);
      this.game.log(`🎁 Reward: ${item.name}`);
      Events.emit('bag');
    }
    this.game.log(`✅ Quest complete: ${q.name}`);
    this.game.audio?.play('questdone');
    Events.emit('quests');
    this.game.refreshNpcMarkers();
    // story beats
    if (q.id === 'q_deja_vu') this.game.raiseVeil(0.03, true);
    if (q.id === 'q_audience') this.game.unlockZone('ashmoor');
    if (q.id === 'q_rookery') this.game.unlockZone('veilspire');
    if (q.id === 'q_the_door') this.game.winGame();
  }

  _obj(q, i) { return this.active[q.id]?.progress[i] ?? 0; }

  _check(q) {
    const st = this.active[q.id];
    if (!st) return;
    st.done = q.objectives.every((o, i) => {
      const need = o.count || 1;
      return st.progress[i] >= need;
    });
    if (st.done) {
      this.game.log(`Quest objectives complete: ${q.name} — return to ${this.game.npcName(q.turnin)}.`);
      this.game.refreshNpcMarkers();
    }
  }

  // ---------- event hooks ----------
  onKill(mob) {
    for (const q of QUESTS) {
      const st = this.active[q.id];
      if (!st || st.done) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === 'kill' && o.mob === mob.typeId && st.progress[i] < o.count) {
          st.progress[i]++;
          this.game.log(`${q.name}: ${o.label} ${st.progress[i]}/${o.count}`);
          this._check(q); Events.emit('quests');
        }
        if (o.type === 'collect' && o.fromLast) {
          const killObj = q.objectives.findIndex(oo => oo.type === 'kill' && oo.mob === mob.typeId);
          if (killObj >= 0 && st.progress[killObj] >= q.objectives[killObj].count && st.progress[i] < 1) {
            st.progress[i] = 1;
            this.game.log(`${q.name}: ${o.label} ✓`);
            this._check(q); Events.emit('quests');
          }
        }
      });
    }
  }

  onTalk(npcId) {
    for (const q of QUESTS) {
      const st = this.active[q.id];
      if (!st || st.done) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === 'talk' && o.npc === npcId && st.progress[i] < 1) {
          st.progress[i] = 1;
          this._check(q); Events.emit('quests');
        }
      });
    }
  }

  onDungeonClear(dgId) {
    for (const q of QUESTS) {
      const st = this.active[q.id];
      if (!st || st.done) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === 'dungeon' && o.id === dgId && st.progress[i] < 1) {
          st.progress[i] = 1;
          this._check(q); Events.emit('quests');
        }
      });
    }
  }

  // explore objectives with timers (e.g. Wren's vigil)
  tick(dt) {
    for (const q of QUESTS) {
      const st = this.active[q.id];
      if (!st || st.done) continue;
      q.objectives.forEach((o, i) => {
        if (o.type !== 'explore' || st.progress[i] >= 1) return;
        if (o.landmark === 'well_vigil') {
          const well = this.game.world.landmarks.well;
          if (well && Math.hypot(this.game.player.pos.x - well.x, this.game.player.pos.z - well.z) < 6) {
            st._t = (st._t || 0) + dt;
            if (st._t > (o.timer || 15)) {
              st.progress[i] = 1;
              // THE GLITCH MOMENT — the cat crosses twice
              this.game.dejaVuMoment();
              this._check(q); Events.emit('quests');
            }
          } else st._t = 0;
        }
      });
    }
  }

  trackedList() {
    return Object.keys(this.active).map(id => {
      const q = QUESTS.find(x => x.id === id);
      const st = this.active[id];
      return { q, st };
    }).slice(0, 4);
  }
}
