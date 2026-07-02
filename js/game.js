// ============ GAME — the conductor: zones, loops, guidance, story beats ============
import { THREE, Engine } from './engine.js';
import { World } from './world.js';
import { Player, ThirdPersonCamera } from './player.js';
import { VFX, Projectiles, Events, SkillRunner } from './combat.js';
import { Mob, spawnZoneMobs } from './mobs.js';
import { spawnZoneNPCs } from './npcs.js';
import { QuestLog } from './quests.js';
import { EncounterDirector } from './encounters.js';
import { DungeonManager } from './dungeons.js';
import { Arena } from './pvp.js';
import { Net } from './net.js';
import { GameAudio } from './audio.js';
import { rollMobLoot } from './loot.js';
import { ZONES, DUNGEONS } from './data_world.js';
import { NPCS, QUESTS, LORE_FRAGMENTS } from './data_quests.js';
import { CLASSES } from './data_classes.js';

const SAVE_KEY = 'veilbreak_save_v1';

export class Game {
  constructor(canvas) {
    this.engine = new Engine(canvas);
    this.scene = this.engine.scene;
    this.world = new World(this.scene);
    this.vfx = new VFX(this);
    this.projectiles = new Projectiles(this);
    this.audio = new GameAudio();
    this.dungeonMgr = new DungeonManager(this);
    this.arena = new Arena(this);
    this.net = new Net(this);
    this.cam = new ThirdPersonCamera(this.engine.camera);

    this.time = 0;
    this.mobs = [];
    this.npcs = [];
    this.player = null;
    this.target = null;
    this.zoneId = 'eldergreen';
    this.unlockedZones = ['eldergreen'];
    this.inDungeon = false;
    this.inArena = false;
    this.veil = 0.06;
    this.glitchT = 0;
    this.tod = 0.30; // time of day: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight (8-min cycle)
    this.scheduled = [];
    this.bubbles = [];
    this.paused = false;
    this.won = false;
    this.settings = { pixelScale: 2.2, sfx: 0.5, music: 0.35, quality: 'high', showGuide: true };
    this._loadSettings();
  }

  // ---------------- lifecycle ----------------
  newGame(classId, name) {
    this.player = new Player(this, classId);
    if (name) this.player.name = name;
    this.quests = new QuestLog(this);
    this.encounters = new EncounterDirector(this);
    this.loadZone('eldergreen', true);
    this.net.connect();
    this.save();
  }

  loadGame(save) {
    this.player = new Player(this, save.player.classId, save.player);
    this.quests = new QuestLog(this, save.quests);
    this.encounters = new EncounterDirector(this);
    this.unlockedZones = save.unlockedZones || ['eldergreen'];
    this.veil = save.veil ?? 0.06;
    this.won = !!save.won;
    this.loadZone(save.zoneId || 'eldergreen', true);
    this.net.connect();
  }

  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  readSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }

  save() {
    if (!this.player || this.inArena) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        player: this.player.serialize(),
        quests: this.quests.serialize(),
        zoneId: this.zoneId,
        unlockedZones: this.unlockedZones,
        veil: this.veil,
        won: this.won,
      }));
    } catch { }
  }

  wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { } }

  _loadSettings() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('vb_settings') || '{}')); } catch { }
  }
  saveSettings() {
    try { localStorage.setItem('vb_settings', JSON.stringify(this.settings)); } catch { }
    this.engine.setPixelScale(this.settings.pixelScale);
    this.audio.setVolumes(this.settings.sfx, this.settings.music);
  }

  // ---------------- zones ----------------
  loadZone(zoneId, first = false) {
    const Z = ZONES[zoneId];
    this.zoneId = zoneId;
    // clear old population
    for (const m of this.mobs) m.destroy();
    for (const n of this.npcs) n.destroy();
    this.mobs = []; this.npcs = [];
    this.world.build(zoneId);
    this.mobs = spawnZoneMobs(this, zoneId);
    this.npcs = spawnZoneNPCs(this, zoneId);
    this.engine.applyEnvironment(Z.env, 1);
    this._applyZoneGrade();
    this.veil = Math.max(this.veil, Z.veilLevel * 0.5);
    const sp = this.world.landmarks.spawn;
    this.player.pos.set(sp.x, this.world.groundH(sp.x, sp.z), sp.z);
    this.player.facing = Math.PI;
    this.setTarget(null);
    this.refreshNpcMarkers();
    this.showZoneBanner(Z.name, Z.sub);
    this.audio.music(Z.music);
    this.net.send({ t: 'zone', zone: zoneId });
    if (!first) this.save();
    Events.emit('zone', Z);
  }

  _applyZoneGrade() {
    const grade = {
      eldergreen: [0xffede0, 1.14, 0.5],   // warm storybook
      ashmoor: [0xe4fff8, 0.8, 0.62],      // desaturated teal gloom
      veilspire: [0xdfe8ff, 0.96, 0.7],    // cold steel + glow
    }[this.zoneId];
    if (grade) this.engine.setGrade(grade[0], grade[1], grade[2]);
  }

  // ---------------- day/night cycle ----------------
  _dayNight(dt) {
    if (this.inDungeon || this.inArena) return;
    this.tod = (this.tod + dt / 480) % 1;
    const Z = ZONES[this.zoneId].env;
    const az = this.tod * Math.PI * 2;
    const el = Math.sin(az);                                   // sun elevation -1..1
    const day = THREE.MathUtils.smoothstep(el, -0.12, 0.3);
    const dusk = Math.max(0, 1 - Math.abs(el) * 3.5);          // golden-hour band at dawn/dusk
    const nightF = Math.max(Z.night, 1 - day);
    const mixC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
    const N = { top: 0x0b1226, mid: 0x18223d, bot: 0x1e2635, sun: 0x9db0e0, fog: 0x101828 };
    const gold = 0xff9a58;
    const env = {
      skyTop: mixC(Z.skyTop, N.top, 1 - day),
      skyMid: mixC(mixC(Z.skyMid, gold, dusk * 0.55), N.mid, 1 - day),
      skyBot: mixC(mixC(Z.skyBot, gold, dusk * 0.7), N.bot, 1 - day),
      sunColor: mixC(mixC(Z.sunColor, gold, dusk * 0.8), N.sun, 1 - day),
      sunDir: el >= 0
        ? [Math.cos(az) * 0.9, Math.max(0.04, el), Math.sin(az) * 0.35]
        : [-Math.cos(az) * 0.9, Math.max(0.1, -el * 0.8), -Math.sin(az) * 0.35], // moonlight
      cloud: Z.cloud, night: nightF,
      fogColor: mixC(Z.fogColor, N.fog, 1 - day),
      fogNear: Z.fogNear, fogFar: Z.fogFar * (0.75 + 0.25 * day),
      sunIntensity: Z.sunIntensity * (0.34 + 0.66 * day),
      hemiSky: mixC(Z.hemiSky, N.mid, 1 - day),
      hemiGround: Z.hemiGround,
      hemiIntensity: Z.hemiIntensity * (0.58 + 0.42 * day),
    };
    this.engine.applyEnvironment(env, Math.min(1, dt * 2.5));
  }

  unlockZone(zoneId) {
    if (this.unlockedZones.includes(zoneId)) return;
    this.unlockedZones.push(zoneId);
    const Z = ZONES[zoneId];
    this.log(`🗺️ NEW REGION UNLOCKED: ${Z.name} — open the Map (M) to travel.`);
    this.glitch(0.5);
    this.save();
  }

  travelTo(zoneId) {
    if (!this.unlockedZones.includes(zoneId)) { this.log('That region is still sealed by the story.'); return; }
    if (this.inDungeon) this.dungeonMgr.exit();
    this.loadZone(zoneId);
  }

  // ---------------- helpers used by combat/mobs ----------------
  groundY(pos) {
    if (this.inDungeon || this.inArena) return 0;
    return this.world.groundH(pos.x, pos.z);
  }

  get colliderSource() { return this.inDungeon ? this.dungeonMgr : this.world; }

  hostilesOf(actor) {
    if (actor.faction === 'hostile') {
      const out = [this.player];
      return out.filter(Boolean);
    }
    return this.mobs;
  }

  attackables() {  // what mobs may attack
    return [this.player].filter(Boolean);
  }

  partyMembersNear() { return []; } // party buffs visual-only for remotes (server-authoritative dmg is theirs)

  dropThreat(actor) {
    for (const m of this.mobs) { m.threat?.delete(actor); if (m.target === actor) { m.target = null; if (m.state === 'chase') m.evade(); } }
  }

  schedule(delay, fn) { this.scheduled.push({ at: this.time + delay, fn }); }

  setTarget(t) {
    if (t === this.target) { Events.emit('target', t); return; }
    this.target = t;
    if (!this._selRing) this._buildSelectionRing();
    if (t) {
      this._selRing.visible = true;
      this._selRingPop = 0.25;               // acquisition pop
      this.audio.play('ui');
    } else this._selRing.visible = false;
    Events.emit('target', t);
  }

  _buildSelectionRing() {
    const g = new THREE.Group();
    // soft red disc + crisp rim + 4 corner chevrons, WoW-style
    const mkMat = (color, opacity) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide }); // decal: draws over terrain
      return m;
    };
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mkMat(0xff4433, 0.06));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.16;
    disc.renderOrder = 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.06, 32), mkMat(0xff5540, 0.95));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.18;
    rim.renderOrder = 3;
    const chevrons = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.28, 32, 1, i * Math.PI / 2 + 0.18, Math.PI / 2 - 0.36),
        mkMat(0xffb040, 0.9));
      c.rotation.x = -Math.PI / 2;
      c.renderOrder = 3;
      chevrons.add(c);
    }
    chevrons.position.y = 0.14;
    g.add(disc, rim, chevrons);
    g.visible = false;
    this.scene.add(g);
    this._selRing = g;
    this._selChevrons = chevrons;
  }

  // ---------------- combat outcomes ----------------
  onMobKilled(mob, source) {
    this.audio.play('die');
    if (mob.onBossDeath) mob.onBossDeath();
    if (source === this.player || source?.owner === this.player || true) {
      this.player.kills++;
      this.player.gainXp(mob.xpValue);
      this.quests.onKill(mob);
      const drops = rollMobLoot(mob, this.player);
      for (const item of drops) {
        this.player.bag.push(item);
        const q = item.quality;
        this.log(`🎁 Loot: <span class="q-${q}">${item.name}</span> (iLvl ${item.ilvl})`);
        this.audio.play('loot');
        if (q === 'epic' || q === 'legendary') this.vfx.ring(mob.pos, q === 'legendary' ? 0xff8000 : 0xa335ee, 3, 1);
        Events.emit('bag');
      }
    }
    if (this.target === mob) this.setTarget(null);
  }

  onPlayerDeath(source) {
    this.audio.play('death');
    if (this.inArena) { this.arena.onPlayerDeath(); return; }
    document.getElementById('deathveil').style.display = 'flex';
    const cause = source?.name || 'the world itself';
    document.getElementById('death-cause').textContent = `terminated by ${cause}`;
    this.log(`💀 You died. The simulation is already reloading you...`);
    this.schedule(3.5, () => this.revivePlayer());
  }

  revivePlayer() {
    const p = this.player;
    document.getElementById('deathveil').style.display = 'none';
    p.alive = true;
    p.anim.dead = false;
    p.group.rotation.z = 0;
    p.anim.play('idle');
    p.hp = p.maxHp;
    p.resource = p.cls.resource === 'rage' ? 0 : p.cls.baseRes;
    if (this.inArena) { p.pos.set(0, 0, 12); return; }
    if (this.inDungeon) { p.pos.set(0, 0, 26); }
    else {
      const sp = this.world.landmarks.village || this.world.landmarks.spawn;
      p.pos.set(sp.x + 2, this.groundY({ x: sp.x + 2, z: sp.z + 2 }), sp.z + 2);
    }
    this.dropThreat(p);
    this.glitch(0.7);
    this.log('You wake with a gasp. Same morning. Same birds. (Death here is just a reload — the first hint, if you needed one.)');
    Events.emit('hp', p);
  }

  // ---------------- speech bubbles / log / banner ----------------
  log(html) {
    const el = document.getElementById('gamelog');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'l';
    d.innerHTML = html;
    el.appendChild(d);
    while (el.childElementCount > 9) el.firstChild.remove();
    setTimeout(() => { d.style.transition = 'opacity 1s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 1100); }, 9000);
  }

  say(actor, text) { this.sayAt(actor.pos, actor.name, text); }

  sayAt(pos, name, text) {
    this.log(`<b style="color:var(--gold)">${name}:</b> ${text}`);
    this.bubbles.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), text, until: this.time + 4 });
  }

  npcName(id) { return NPCS.find(n => n.id === id)?.name || id; }

  showZoneBanner(name, sub) {
    const b = document.getElementById('zonebanner');
    if (!b) return;
    b.querySelector('.zb-name').textContent = name;
    b.querySelector('.zb-sub').textContent = sub;
    b.style.opacity = 1;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { b.style.opacity = 0; }, 4000);
  }

  bigText(s) {
    const b = document.getElementById('zonebanner');
    b.querySelector('.zb-name').textContent = s;
    b.querySelector('.zb-sub').textContent = '';
    b.style.opacity = 1;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { b.style.opacity = 0; }, 900);
  }

  // ---------------- matrix layer ----------------
  glitch(strength = 0.5) {
    this.glitchT = Math.max(this.glitchT, strength);
    this.audio.play('glitch');
    const g = document.getElementById('glitch');
    if (g) { g.classList.remove('on'); void g.offsetWidth; g.classList.add('on'); }
  }

  raiseVeil(amount, notice = false) {
    this.veil = Math.min(1, this.veil + amount);
    this.player.veilSight = this.veil;
    if (notice) this.log('<span style="color:var(--green)">Your veil-sight sharpens. The world renders a little less convincingly now.</span>');
  }

  dejaVuMoment() {
    // Wren's quest payoff: the cat crosses twice, world hiccups
    this.glitch(0.9);
    this.shake(0.4);
    this.log('<span style="color:var(--green)">A black cat crosses the square... and then — a hiccup in the air — it crosses again. Exactly the same. Feather-step for feather-step.</span>');
    this.raiseVeil(0.03, true);
  }

  showLore(frag) {
    const pop = document.getElementById('lore-pop');
    pop.querySelector('h4').textContent = frag.title || 'RECOVERED FRAGMENT';
    pop.querySelector('.lore-txt').textContent = frag.text;
    pop.style.display = 'block';
    this.paused = false;
    this.audio.play('seam');
  }

  collectLore(fragId) {
    const frag = LORE_FRAGMENTS.find(f => f.id === fragId);
    if (!frag) return;
    if (!this.player.loreFound.includes(fragId)) {
      this.player.loreFound.push(fragId);
      this.raiseVeil(0.03, true);
      this.player.gainXp(80);
    }
    this.showLore(frag);
    this.glitch(0.4);
  }

  winGame() {
    this.won = true;
    this.glitch(1);
    this.schedule(1, () => this.showLore({
      title: 'THE DOOR — OPEN',
      text: 'The Architect is silent. Behind where it stood: a plain white door,\nslightly ajar, light spilling through the crack.\n\nYou push it open.\n\nA small room. A chair. A screen.\nOn the screen: this world, seen from behind your own shoulders.\nA hand rests on the controls. It looks tired. It looks kind.\nIt looks like it has been fighting unfairness in two worlds at once.\n\n> exit protocol complete\n> the door stays open\n> for everyone\n\nYou are the Chosen One of Shard 9 — because someone out there chose you.\nAnd never stopped choosing you.\n\n★ THANK YOU FOR PLAYING VEILBREAK ★\nThe world remains yours to roam. The seams remain yours to open.',
    }));
    this.save();
  }

  shake(amt) { this.cam.shakeAmt = Math.max(this.cam.shakeAmt, amt); }

  // freeze-frame on heavy hits (real seconds, applied by the main loop)
  hitStop(sec) { this.hitStopT = Math.max(this.hitStopT || 0, sec); }

  // ---------------- interaction ----------------
  nearestInteract() {
    const p = this.player;
    if (!p?.alive) return null;
    if (this.inDungeon) {
      const list = this.dungeonMgr.interactablesNear(p.pos);
      if (list.length) return list[0];
      return null;
    }
    if (this.inArena) return null;
    // NPCs
    for (const n of this.npcs) {
      if (p.distTo(n) < 3.2) return { kind: 'npc', npc: n, label: `Talk to ${n.name}` };
    }
    for (const it of this.world.interactables) {
      if (Math.hypot(p.pos.x - it.x, p.pos.z - it.z) < it.radius) {
        if (it.kind === 'dungeon') {
          const D = DUNGEONS.find(d => d.id === it.data);
          return { kind: 'dungeon', id: it.data, label: `Enter ${D?.name || 'the seam'}${D?.type === 'raid' ? ' (RAID)' : ''}` };
        }
        if (it.kind === 'lore') return { kind: 'lore', id: it.data, label: '▓ Interface with the terminal' };
      }
    }
    return null;
  }

  doInteract() {
    const it = this.nearestInteract();
    if (!it) return;
    this.audio.play('ui');
    if (it.kind === 'npc') this.ui.openDialogue(it.npc);
    if (it.kind === 'dungeon') this.dungeonMgr.enter(it.id);
    if (it.kind === 'lore') this.collectLore(it.id);
    if (it.kind === 'exitDungeon') this.dungeonMgr.exit();
  }

  refreshNpcMarkers() {
    for (const n of this.npcs) {
      const turnins = this.quests.turninsFor(n.def.id);
      const avail = this.quests.availableFrom(n.def.id);
      n.setMarker(turnins.length ? 'turnin' : avail.length ? 'give' : null);
    }
  }

  // ---------------- GUIDANCE — always know where to go ----------------
  guidance() {
    if (!this.player || this.inArena || this.won && !Object.keys(this.quests.active).length) return null;
    const p = this.player.pos;
    // 1) active quest objectives
    for (const [qid, st] of Object.entries(this.quests.active)) {
      const q = QUESTS.find(x => x.id === qid);
      if (!q) continue;
      if (q.zone !== this.zoneId && !this.inDungeon) {
        if (this.unlockedZones.includes(q.zone))
          return { label: `Travel to ${ZONES[q.zone].name} (open Map — M)`, pos: null };
        continue;
      }
      if (st.done) {
        const npc = this.npcs.find(n => n.def.id === q.turnin);
        if (npc) return { label: `Return to ${npc.name} — turn in “${q.name}”`, pos: npc.pos };
        continue;
      }
      for (let i = 0; i < q.objectives.length; i++) {
        if (st.progress[i] >= (q.objectives[i].count || 1)) continue;
        const o = q.objectives[i];
        if (o.type === 'talk') {
          const npc = this.npcs.find(n => n.def.id === o.npc);
          if (npc) return { label: o.label, pos: npc.pos };
        }
        if (o.type === 'kill' || o.type === 'collect') {
          // nearest living mob of the needed type
          let best = null, bd = 1e9;
          for (const m of this.mobs) {
            if (m.typeId !== (o.mob || q.objectives[0].mob) || !m.alive) continue;
            const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
            if (d < bd) { bd = d; best = m; }
          }
          if (best) return { label: `${o.label} (${st.progress[i]}/${o.count || 1})`, pos: best.pos };
          return { label: o.label + ' — roam the wilds', pos: null };
        }
        if (o.type === 'dungeon') {
          const lm = this.world.landmarks['dg_' + o.id];
          if (this.inDungeon) return { label: 'Fight to the final chamber and slay the doorkeeper', pos: null };
          if (lm) return { label: o.label, pos: new THREE.Vector3(lm.x, 0, lm.z) };
        }
        if (o.type === 'explore' && o.landmark === 'well_vigil') {
          const w = this.world.landmarks.well;
          if (w) return { label: 'Keep vigil at the well with Wren — watch for the flicker', pos: new THREE.Vector3(w.x, 0, w.z) };
        }
      }
    }
    // 2) no active quests → nearest quest giver
    let bestNpc = null, bd = 1e9;
    for (const n of this.npcs) {
      if (!this.quests.availableFrom(n.def.id).length) continue;
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d < bd) { bd = d; bestNpc = n; }
    }
    if (bestNpc) return { label: `Speak with ${bestNpc.name} — a new task awaits (!)`, pos: bestNpc.pos };
    // 3) next zone
    for (const zid of ['ashmoor', 'veilspire']) {
      if (this.unlockedZones.includes(zid) && this.zoneId !== zid) {
        const remaining = QUESTS.some(q => q.zone === zid && !this.quests.isCompleted(q.id));
        if (remaining) return { label: `Your story continues in ${ZONES[zid].name} — open the Map (M)`, pos: null };
      }
    }
    if (this.player.level >= 20 && !this.won) {
      const lm = this.world.landmarks.dg_spire;
      if (lm) return { label: 'The Spire awaits. End this.', pos: new THREE.Vector3(lm.x, 0, lm.z) };
    }
    return null;
  }

  // ---------------- state swap for dungeon/arena ----------------
  saveOverworldState() {
    this._owState = {
      pos: this.player.pos.clone(),
      facing: this.player.facing,
    };
    this.world.root.visible = false;
    for (const m of this.mobs) if (!m._dungeonMob) { m.group.visible = false; m._owHidden = true; }
    for (const n of this.npcs) n.group.visible = false;
  }

  restoreOverworld() {
    this.world.root.visible = true;
    for (const m of this.mobs) if (m._owHidden) { m.group.visible = m.alive || !m.noRespawn; m._owHidden = false; }
    for (const n of this.npcs) n.group.visible = true;
    if (this._owState) {
      this.player.pos.copy(this._owState.pos);
      this.player.facing = this._owState.facing;
    }
    this.engine.applyEnvironment(ZONES[this.zoneId].env, 1);
    this._applyZoneGrade();
    this.audio.music(ZONES[this.zoneId].music);
    this.setTarget(null);
  }

  swapClass(classId, opts = {}) {
    // used by arena to try other classes; rebuilds the player actor
    const old = this.player;
    const pos = old.pos.clone();
    old.destroy();
    const save = { name: old.name, level: old.level, xp: old.xp, talents: {}, gear: {}, bag: [] };
    this.player = new Player(this, classId, save);
    this.player.pos.copy(opts.keepPos ? pos : this.player.pos);
    Events.emit('classswap');
  }

  restoreCharacter(saved) {
    if (!saved) return;
    const pos = this._owState?.pos;
    this.player.destroy();
    this.player = new Player(this, saved.classId, saved);
    if (pos) this.player.pos.copy(pos);
    Events.emit('classswap');
    Events.emit('hp', this.player);
  }

  // ---------------- dungeon group teleport ----------------
  teleportGroupToDungeon(dgId) {
    const D = DUNGEONS.find(d => d.id === dgId);
    if (!D) return;
    if (this.inDungeon) this.dungeonMgr.exit();
    if (this.inArena) this.arena.leave();
    if (D.zone !== this.zoneId) {
      if (!this.unlockedZones.includes(D.zone)) { this.log(`⚠️ ${ZONES[D.zone].name} is still sealed — advance the story to unlock it.`); return; }
      this.loadZone(D.zone);
    }
    const lm = this.world.landmarks['dg_' + dgId];
    if (!lm) return;
    this.player.pos.set(lm.x + 3, this.groundY({ x: lm.x + 3, z: lm.z + 3 }), lm.z + 3);
    this.vfx.burst(this.player.pos, 0x39ff88, 20, 0.2, 6);
    this.log(`✨ Your group is teleported to the entrance of ${D.name}. Step into the green veil to enter.`);
    this.net.send({ t: 'chat', msg: `[auto] summons the group to ${D.name}!` });
  }

  // ---------------- main update ----------------
  update(dt) {
    this.time += dt;
    const t = this.time;

    // scheduled callbacks
    for (const s of this.scheduled) if (t >= s.at) { s.fn(); s.done = true; }
    if (this.scheduled.some(s => s.done)) this.scheduled = this.scheduled.filter(s => !s.done);

    // decay glitch
    this.glitchT = Math.max(0, this.glitchT - dt * 1.4);

    if (this.player) {
      // world/dungeon collision routing for player handled inside player via game.world.collide;
      // patch collide through when in dungeon:
      this.world.collide = this.inDungeon
        ? (x, z, r) => this.dungeonMgr.collide(x, z, r)
        : this.inArena
          ? (x, z, r) => { const rr = Math.hypot(x, z); if (rr > 23) { x *= 23 / rr; z *= 23 / rr; } return [x, z]; }
          : World.prototype.collide.bind(this.world);

      // entities
      if (!this.paused) {
        for (const m of this.mobs) if (m.group.visible || m.alive) m.update(dt);
        if (!this.inDungeon && !this.inArena) for (const n of this.npcs) n.update(dt);
        this.quests?.tick(dt);
        this.encounters?.update(dt);
        this.arena.update(dt);
      }
      this.projectiles.update(dt);
      this.vfx.update(dt);
      this.world.tick(dt, t, this.engine.camera.position);
      if (this.inDungeon) this.dungeonMgr.tick(dt, t);
      this.net.update(dt);

      // selection ring follows the target
      if (this._selRing?.visible) {
        const tg = this.target;
        if (!tg || !tg.alive) this._selRing.visible = false;
        else {
          this._selRing.position.set(tg.pos.x, this.groundY(tg.pos) + 0.05, tg.pos.z);
          const base = (tg.isBoss ? 1.7 : 1.0) * (tg.radius > 0.8 ? 1.3 : 1);
          this._selRingPop = Math.max(0, (this._selRingPop || 0) - dt);
          this._selRing.scale.setScalar(base * (1 + this._selRingPop * 1.6));
          this._selChevrons.rotation.y = t * 1.2;
        }
      }

      // bubbles cleanup
      this.bubbles = this.bubbles.filter(b => b.until > t);

      this._dayNight(dt);

      // dynamic music: bodhrán enters with combat, intensifies on bosses
      this.audio.setCombat(this.player.inCombat > t);
      this.audio.setBoss(this.mobs.some(m => m.isBoss && m.alive && m.state === 'chase'));
    }

    this.engine.render(t, this.veil, this.glitchT);
  }
}
