// ============ DUNGEONS & RAIDS — instanced interiors, bosses, the exits ============
// Entering swaps the overworld out for a themed instance: a chain of rooms and
// corridors, trash packs guarding the way, and a doorkeeper (boss) at the end.
// Killing the boss tears a SEAM — the matrix-green exit — plus loot and lore.
import { THREE, mat, basicMat, rng, tex } from './engine.js';
import { DUNGEONS, DUNGEON_ENV, MOB_TYPES } from './data_world.js';
import { Mob } from './mobs.js';
import { generateItem } from './loot.js';
import { Events } from './combat.js';

const THEMES = {
  cave:      { floor: 0x8a7358, wall: 0x6a5a44, accent: 0x6a5a3a, light: 0xff9040, fTex: 'rock', wTex: 'rock' },
  crypt:     { floor: 0x7a848c, wall: 0x606874, accent: 0x50707a, light: 0x60c0d0, fTex: 'paving', wTex: 'stonewall' },
  castle:    { floor: 0x8e8ea0, wall: 0x787890, accent: 0x8a7a50, light: 0xffd080, fTex: 'paving', wTex: 'stonewall' },
  sewer:     { floor: 0x74886a, wall: 0x5c7050, accent: 0x5a7a4a, light: 0x90c060, fTex: 'paving', wTex: 'stonewall' },
  cathedral: { floor: 0x8080a0, wall: 0x646484, accent: 0x7a8ac0, light: 0x8090ff, fTex: 'paving', wTex: 'stonewall' },
  tower:     { floor: 0x6a6a84, wall: 0x525268, accent: 0x5a5a80, light: 0xb0a0ff, fTex: 'planks', wTex: 'stonewall' },
  keep:      { floor: 0x8a9ab0, wall: 0x6c7a94, accent: 0x8ab0d0, light: 0xa0d0ff, fTex: 'paving', wTex: 'stonewall' },
  glitch:    { floor: 0x0e1a14, wall: 0x0a120e, accent: 0x39ff88, light: 0x39ff88 },
  spire:     { floor: 0x14141f, wall: 0x0e0e18, accent: 0x39ff88, light: 0x66ffb0 },
};

export class DungeonManager {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.active = null;
    this.colliders = [];
    this.animated = [];
    this.clearedToday = new Set();
  }

  enter(dgId) {
    const g = this.game;
    const D = DUNGEONS.find(d => d.id === dgId);
    if (!D) return;
    if (g.player.level < D.minLevel) {
      g.log(`⚠️ ${D.name} requires level ${D.minLevel}.`);
      return;
    }
    g.saveOverworldState();
    this._build(D);
    this.active = { D, bossDead: false, entered: g.time };
    g.inDungeon = true;
    const glitchy = D.theme === 'glitch' || D.theme === 'spire';
    g.engine.applyEnvironment(glitchy
      ? { ...DUNGEON_ENV, fogColor: 0x061009, hemiSky: 0x1a4a30, sunColor: 0x39ff88 }
      : DUNGEON_ENV, 1);
    g.engine.setGrade(glitchy ? 0xd8ffe4 : 0xfff2e2, glitchy ? 1.05 : 0.88, 0.85);
    // move party
    const spawn = { x: 0, z: 26 };
    g.player.pos.set(spawn.x, 0, spawn.z);
    g.player.facing = Math.PI;
    for (const rp of g.remotePlayers?.values() || []) if (rp.inMyParty) rp.group.position.set(spawn.x + 1, 0, spawn.z + 1);
    g.net?.send({ t: 'enterDungeon', dg: dgId });
    g.showZoneBanner(D.name, D.type === 'raid' ? '☠ RAID — the seam is close' : 'a seam in the world');
    g.log(`You have entered ${D.name}. ${D.type === 'raid' ? 'This is a RAID — bring everything you have.' : ''}`);
    g.audio?.play('dungeon');
    g.audio?.music(D.theme === 'glitch' || D.theme === 'spire' ? 'glitch' : 'dungeon');
    Events.emit('dungeon', D);
  }

  exit() {
    const g = this.game;
    if (!this.active) return;
    this._teardown();
    g.inDungeon = false;
    g.restoreOverworld();
    g.net?.send({ t: 'exitDungeon' });
  }

  _teardown() {
    const g = this.game;
    // remove dungeon mobs
    for (const m of g.mobs) if (m._dungeonMob) { m.destroy(); }
    g.mobs = g.mobs.filter(m => !m._dungeonMob);
    this.root.clear();
    this.root.visible = false;
    this.colliders = [];
    this.animated = [];
    this.active = null;
  }

  // --------------- geometry ---------------
  _wall(x, z, w, d, h, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, this._theme?.wTex ? { tex: this._theme.wTex, rep: 3 } : {}));
    m.position.set(x, h / 2, z);
    this.root.add(m);
    // collider chain along the wall
    const steps = Math.ceil(Math.max(w, d) / 2);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.colliders.push({ x: x - w / 2 + w * t * (w > d ? 1 : 0), z: z - d / 2 + d * t * (d > w ? 1 : 0), r: Math.min(w, d) / 2 + 0.2 });
    }
  }

  _torch(x, z, color) {
    const l = new THREE.PointLight(color, 2.4, 24);
    l.position.set(x, 3, z);
    this.root.add(l);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 5), basicMat(color));
    flame.position.set(x, 2.6, z);
    this.root.add(flame);
    this.animated.push((dt, t) => { l.intensity = 2.2 + Math.sin(t * 9 + x) * 0.4; flame.scale.setScalar(0.9 + Math.sin(t * 12 + z) * 0.15); });
  }

  _build(D) {
    const g = this.game;
    const T = THEMES[D.theme];
    this._theme = T;
    const R = rng(D.id.length * 999 + 7);
    this.root.visible = true;
    const isRaid = D.type === 'raid';
    // room chain going -z; player enters at z=26
    const rooms = [];
    let z = 12;
    const nRooms = isRaid ? 4 : 3;
    for (let i = 0; i < nRooms; i++) {
      const w = (i === nRooms - 1) ? (isRaid ? 44 : 34) : 24 + R() * 8;
      const d = (i === nRooms - 1) ? (isRaid ? 44 : 34) : 20 + R() * 8;
      rooms.push({ x: 0, z: z - d / 2, w, d, boss: i === nRooms - 1 });
      z -= d + 8; // 8 = corridor length
    }
    this.rooms = rooms;

    // floor: one big slab under everything
    const totalD = 40 - z;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 1, totalD + 40), mat(T.floor, T.fTex ? { tex: T.fTex, rep: 14 } : {}));
    floor.position.set(0, -0.5, (40 + z) / 2 - 10);
    this.root.add(floor);
    // floor detail tiles
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.12, 2), mat(T.accent, T.fTex ? { tex: 'paving' } : {}), 80);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) {
      m4.setPosition((R() - 0.5) * 40, 0.01, z + R() * (totalD));
      tiles.setMatrixAt(i, m4);
    }
    this.root.add(tiles);

    // room walls + corridors
    const wallH = D.theme === 'cathedral' || isRaid ? 12 : 7;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const zN = r.z + r.d / 2, zS = r.z - r.d / 2;
      // north wall with door gap (except first room's entry)
      const gap = 4;
      this._wall(r.x - r.w / 4 - gap / 4, zN, r.w / 2 - gap / 2, 1.6, wallH, T.wall);
      this._wall(r.x + r.w / 4 + gap / 4, zN, r.w / 2 - gap / 2, 1.6, wallH, T.wall);
      // south wall with gap (except boss room = solid)
      if (i === rooms.length - 1) this._wall(r.x, zS, r.w, 1.6, wallH, T.wall);
      else {
        this._wall(r.x - r.w / 4 - gap / 4, zS, r.w / 2 - gap / 2, 1.6, wallH, T.wall);
        this._wall(r.x + r.w / 4 + gap / 4, zS, r.w / 2 - gap / 2, 1.6, wallH, T.wall);
        // corridor side walls
        this._wall(r.x - gap / 2 - 0.8, zS - 4, 1.6, 9, wallH, T.wall);
        this._wall(r.x + gap / 2 + 0.8, zS - 4, 1.6, 9, wallH, T.wall);
      }
      // east/west walls
      this._wall(r.x - r.w / 2, r.z, 1.6, r.d, wallH, T.wall);
      this._wall(r.x + r.w / 2, r.z, 1.6, r.d, wallH, T.wall);
      // torches at corners
      this._torch(r.x - r.w / 2 + 2, r.z - r.d / 2 + 2, T.light);
      this._torch(r.x + r.w / 2 - 2, r.z + r.d / 2 - 2, T.light);
      if (r.boss) { this._torch(r.x - r.w / 2 + 2, r.z + r.d / 2 - 2, T.light); this._torch(r.x + r.w / 2 - 2, r.z - r.d / 2 + 2, T.light); }
      // props: pillars
      if (r.w > 26) {
        for (const [px, pz] of [[-r.w / 4, 0], [r.w / 4, 0]]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, wallH, 8), mat(T.accent, T.wTex ? { tex: T.wTex, rep: 2 } : {}));
          pillar.position.set(r.x + px, wallH / 2, r.z + pz);
          this.root.add(pillar);
          this.colliders.push({ x: r.x + px, z: r.z + pz, r: 1.4 });
        }
      }
    }

    // theme decoration in boss room
    const bossRoom = rooms[rooms.length - 1];
    if (D.theme === 'glitch' || D.theme === 'spire') {
      for (let i = 0; i < 14; i++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3 + R() * 6, 0.2), basicMat(0x39ff88, { transparent: true, opacity: 0.5 }));
        col.position.set(bossRoom.x + (R() - 0.5) * bossRoom.w * 0.8, 2, bossRoom.z + (R() - 0.5) * bossRoom.d * 0.8);
        this.root.add(col);
        this.animated.push((dt, t) => { col.material.opacity = 0.25 + Math.abs(Math.sin(t * 2 + i)) * 0.4; });
      }
    }
    if (D.theme === 'crypt' || D.theme === 'cathedral') {
      for (let i = 0; i < 8; i++) {
        const coffin = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 2.2), mat(0x2a2a30));
        coffin.position.set((R() - 0.5) * 20, 0.3, rooms[1].z + (R() - 0.5) * 12);
        this.root.add(coffin);
      }
    }
    // entry portal back
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), basicMat(0x39ff88, { transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    back.position.set(0, 2, 30);
    this.root.add(back);
    this.exitPortal = { x: 0, z: 30 };

    // ---------- populate ----------
    const lvl = Math.max(D.minLevel, Math.min(20, g.player.level));
    const packRooms = rooms.slice(0, -1);
    let packsLeft = D.packs;
    let pr = 0;
    this.trash = [];
    while (packsLeft-- > 0) {
      const room = packRooms[pr % packRooms.length]; pr++;
      const cx = room.x + (R() - 0.5) * room.w * 0.5;
      const cz = room.z + (R() - 0.5) * room.d * 0.5;
      const camp = [];
      const n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const typeId = D.trash[Math.floor(R() * D.trash.length)];
        const pos = new THREE.Vector3(cx + (R() - 0.5) * 4, 0, cz + (R() - 0.5) * 4);
        const m = new Mob(g, typeId, lvl, pos, { camp });
        m._dungeonMob = true; m._inDungeonFlat = true; m.noRespawn = true;
        m.lootIlvl = D.ilvl - 3;
        camp.push(m); g.mobs.push(m); this.trash.push(m);
      }
    }
    // boss
    const b = D.boss;
    const bpos = new THREE.Vector3(bossRoom.x, 0, bossRoom.z);
    const boss = new Mob(g, null, lvl, bpos, { bossDef: b });
    boss._dungeonMob = true; boss._inDungeonFlat = true; boss.noRespawn = true;
    boss.lootIlvl = D.ilvl;
    boss.raidBoss = isRaid;
    boss.aggroRadius = 14;
    boss.onBossDeath = () => this._onBossDeath(D, boss);
    g.mobs.push(boss);
    this.boss = boss;
    // boss intro when engaged
    Events.on('bossengage', this._engageHandler = (m) => {
      if (m === boss && !this._saidIntro) {
        this._saidIntro = true;
        g.say(boss, b.say);
        g.audio?.play('boss');
      }
    });
  }

  _onBossDeath(D, boss) {
    const g = this.game;
    if (!this.active || this.active.bossDead) return;
    this.active.bossDead = true;
    g.shake(1);
    g.glitch(1);
    g.log(`☠ ${boss.name} has been defeated!`);
    g.quests.onDungeonClear(D.id);
    // THE SEAM — matrix exit reveal
    g.schedule(1.5, () => {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), basicMat(0x39ff88, { transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
      seam.position.set(boss.pos.x, 3, boss.pos.z - 4);
      this.root.add(seam);
      const light = new THREE.PointLight(0x39ff88, 0, 30);
      light.position.set(boss.pos.x, 4, boss.pos.z - 4);
      this.root.add(light);
      this.animated.push((dt, t) => {
        seam.material.opacity = Math.min(0.75, seam.material.opacity + dt * 0.3);
        light.intensity = Math.min(3, light.intensity + dt);
        seam.scale.y = 1 + Math.sin(t * 3) * 0.04;
      });
      g.log('A SEAM tears open where the doorkeeper fell. Green light pours through — a glimpse of the machine beneath the world.');
      g.showLore({ title: `${D.name} — THE SEAM`, text: D.lore });
      g.raiseVeil(0.04, true);
      g.audio?.play('seam');
    });
  }

  interactablesNear(pos) {
    const out = [];
    if (this.exitPortal && Math.hypot(pos.x - this.exitPortal.x, pos.z - this.exitPortal.z) < 4)
      out.push({ kind: 'exitDungeon', label: 'Leave ' + (this.active?.D.name || 'dungeon') });
    return out;
  }

  collide(x, z, r) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 0.001) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
    }
    x = THREE.MathUtils.clamp(x, -30, 30);
    z = THREE.MathUtils.clamp(z, this.rooms ? this.rooms[this.rooms.length - 1].z - 24 : -100, 34);
    return [x, z];
  }

  tick(dt, t) { for (const a of this.animated) a(dt, t); }
}
