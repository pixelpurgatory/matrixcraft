// ============ NPCs — friendly characters that feel alive ============
// Behaviors: wander near their spot with natural pauses, turn to face the player
// when approached, speak ambient lines (speech bubbles), glitch-flicker if "awake",
// carry quest markers (! available / ? turn-in) that update live.
import { THREE, basicMat } from './engine.js';
import { Actor } from './combat.js';
import { buildHumanoid, blobShadow } from './entities.js';
import { NPCS } from './data_quests.js';

const NPC_PALETTES = [
  { robe: 0x6a4a7a, trim: 0xc0a0d0, skin: 0xd8a878, hair: 0xe8e0d0, weapon: null },
  { robe: 0x7a5a3a, trim: 0xc8a86a, skin: 0xc89468, hair: 0x40291a, weapon: null },
  { robe: 0x3a5a6a, trim: 0x88b0c0, skin: 0xd8a878, hair: 0x886a4a, weapon: null },
  { robe: 0x5a6a3a, trim: 0xa8c088, skin: 0xe8b888, hair: 0x2a2a2a, weapon: null },
];

function markerTexture(char, color) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 52px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.fillStyle = color; ctx.fillText(char, 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}
let EXCL_MAT = null, QUEST_MAT = null;

export class NPC extends Actor {
  constructor(game, def, pos) {
    const pal = NPC_PALETTES[Math.abs(def.id.length * 7 + def.id.charCodeAt(0)) % NPC_PALETTES.length];
    super(game, {
      name: def.name, level: 0, maxHp: 999999, speed: 1.6,
      model: buildHumanoid({ colors: pal }),
      pos, icon: def.icon, faction: 'friendly',
    });
    this.def = def;
    this.home = { x: pos.x, z: pos.z };
    this.wanderR = def.wander ?? 3;
    this.wanderTo = null;
    this.pauseUntil = game.time + Math.random() * 4;
    this.nextAmbient = game.time + 6 + Math.random() * 14;
    this.glitchy = !!def.glitches;
    // child-size for Wren
    if (def.id === 'wren') this.group.scale.setScalar(0.7);
    // quest marker sprite
    if (!EXCL_MAT) {
      EXCL_MAT = new THREE.SpriteMaterial({ map: markerTexture('!', '#ffd100'), depthTest: false });
      QUEST_MAT = new THREE.SpriteMaterial({ map: markerTexture('?', '#ffd100'), depthTest: false });
    }
    this.marker = new THREE.Sprite(EXCL_MAT);
    this.marker.scale.setScalar(1.1);
    this.marker.position.y = 2.6;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  setMarker(kind) { // 'give' | 'turnin' | null
    if (!kind) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.material = kind === 'give' ? EXCL_MAT : QUEST_MAT;
  }

  update(dt) {
    const g = this.game, t = g.time;
    const player = g.player;
    const pd = player ? this.distTo(player) : 999;
    let moving = false;

    if (pd < 5) {
      // face the player, stop wandering
      this.faceToward(player.pos.x, player.pos.z);
      this.wanderTo = null;
      this.pauseUntil = t + 2;
    } else if (t > this.pauseUntil) {
      if (!this.wanderTo) {
        const a = Math.random() * 6.28, d = Math.random() * this.wanderR;
        this.wanderTo = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
      }
      const dx = this.wanderTo.x - this.pos.x, dz = this.wanderTo.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) { this.wanderTo = null; this.pauseUntil = t + 2 + Math.random() * 6; }
      else {
        this.pos.x += dx / d * this.speed * dt;
        this.pos.z += dz / d * this.speed * dt;
        this.faceToward(this.wanderTo.x, this.wanderTo.z);
        moving = true;
      }
    }

    // ambient chatter when player nearby
    if (pd < 11 && t > this.nextAmbient && this.def.ambient?.length) {
      this.nextAmbient = t + 14 + Math.random() * 18;
      const line = this.def.ambient[Math.floor(Math.random() * this.def.ambient.length)];
      g.say(this, line);
    }

    // glitch flicker: "awake" NPCs briefly de-render (subtle at low veil, obvious later)
    if (this.glitchy && Math.random() < 0.0015 + g.veil * 0.004) {
      this.group.visible = false;
      g.schedule(0.07, () => { this.group.visible = true; });
      if (Math.random() < 0.3) g.vfx.burst(this.pos, 0x39ff88, 4, 0.08, 2, 0.4);
    }

    this.pos.y = g.groundY(this.pos);
    // marker bob
    if (this.marker.visible) this.marker.position.y = 2.6 + Math.sin(t * 3) * 0.15;
    this.anim.update(dt, moving);
  }
}

export function spawnZoneNPCs(game, zoneId) {
  const list = [];
  for (const def of NPCS) {
    if (def.zone !== zoneId) continue;
    const spot = game.world.landmarks[def.spot] || game.world.landmarks.village;
    if (!spot) continue;
    const a = Math.random() * 6.28, d = 1 + Math.random() * 3;
    const pos = new THREE.Vector3(spot.x + Math.cos(a) * d, 0, spot.z + Math.sin(a) * d);
    pos.y = game.world.groundH(pos.x, pos.z);
    const npc = new NPC(game, def, pos);
    list.push(npc);
  }
  return list;
}
