// ============ ENTITIES — procedural character models + programmatic animation ============
// Every creature is a small hierarchy of flat-shaded boxes ("paper-doll rig").
// Animation is code-driven: walk cycles, attack swings, casts, hit reacts, deaths.
// The pixel pass makes these read as chunky hand-placed sprites in 3D.

import { THREE, mat, matS, basicMat } from './engine.js';

const B = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
// smooth organic primitives for bodies (higher-res look than raw boxes)
const CAP = (r, len, color) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), matS(color));
const SPH = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 11), matS(color));

// palette helpers per class
const CLASS_SKIN = {
  mage:      { robe: 0x2e4a7a, trim: 0x88ccff, skin: 0xd8a878, hair: 0xe8e0d0, weapon: 0x6a4a2a, gem: 0x88ddff },
  barbarian: { robe: 0x7a3a2a, trim: 0xc8874a, skin: 0xc89468, hair: 0x40291a, weapon: 0x888888, gem: 0xff6644 },
  hunter:    { robe: 0x3a5a3a, trim: 0xa8b06a, skin: 0xd8a878, hair: 0x6a4a2a, weapon: 0x5a4530, gem: 0xffee88 },
};

// ---------------------------------------------------------------
// Humanoid rig: root -> [torso, head, armL, armR, legL, legR, weapon]
// ---------------------------------------------------------------
export function buildHumanoid(opts = {}) {
  const c = opts.colors || { robe: 0x555b66, trim: 0x777f8c, skin: 0xd0a080, hair: 0x333333, weapon: 0x775533 };
  const g = new THREE.Group();
  const scale = opts.scale || 1;

  const torso = CAP(0.32, 0.4, c.robe); torso.position.y = 1.05; torso.scale.z = 0.72; g.add(torso);
  const chest = B(0.62, 0.22, 0.44, c.trim); chest.position.y = 0.26; torso.add(chest);
  const head = SPH(0.26, c.skin); head.position.y = 1.68; g.add(head);
  const hair = SPH(0.27, c.hair); hair.position.y = 0.06; hair.scale.y = 0.72; head.add(hair);

  const mkArm = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(0.4 * side, 1.36, 0); g.add(pivot);
    const arm = CAP(0.095, 0.4, c.robe); arm.position.y = -0.29; pivot.add(arm);
    const hand = SPH(0.1, c.skin); hand.position.y = -0.34; arm.add(hand);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(0.16 * side, 0.74, 0); g.add(pivot);
    const leg = CAP(0.11, 0.46, opts.legColor ?? 0x2c2c34); leg.position.y = -0.36; pivot.add(leg);
    return pivot;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // weapon in right hand
  let weapon = null;
  if (opts.weapon === 'staff') {
    weapon = new THREE.Group();
    const shaft = B(0.09, 1.5, 0.09, c.weapon); shaft.position.y = 0.4; weapon.add(shaft);
    const gem = B(0.2, 0.2, 0.2, c.gem); gem.position.y = 1.2; gem.rotation.z = Math.PI / 4; weapon.add(gem);
    const gm = new THREE.PointLight(c.gem, 0.0, 4); gem.add(gm); weapon.userData.glow = gm;
  } else if (opts.weapon === 'axe') {
    weapon = new THREE.Group();
    const shaft = B(0.1, 1.1, 0.1, 0x5a4028); shaft.position.y = 0.3; weapon.add(shaft);
    const headL = B(0.5, 0.4, 0.08, c.weapon); headL.position.set(0.22, 0.75, 0); weapon.add(headL);
  } else if (opts.weapon === 'rifle') {
    weapon = new THREE.Group();
    const barrel = B(0.09, 0.09, 1.15, 0x444444); barrel.position.z = 0.42; weapon.add(barrel);
    const stock = B(0.12, 0.22, 0.42, c.weapon); stock.position.z = -0.18; weapon.add(stock);
  } else if (opts.weapon === 'sword') {
    weapon = new THREE.Group();
    const blade = B(0.08, 0.95, 0.16, 0xb8c0cc); blade.position.y = 0.5; weapon.add(blade);
    const hilt = B(0.26, 0.08, 0.1, 0x8a6a30); hilt.position.y = 0.05; weapon.add(hilt);
  }
  if (weapon) {
    weapon.position.set(0, -0.72, 0.08); armR.add(weapon);
    // quality glow strip — hidden until gear earns it (player.recalcStats controls it)
    const qGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    qGlow.position.y = 0.55;
    qGlow.visible = false;
    weapon.add(qGlow);
    weapon.userData.qGlow = qGlow;
    // trail rail markers: ribbon sweeps between tip and base during strikes
    const tip = new THREE.Object3D(), base = new THREE.Object3D();
    if (opts.weapon === 'staff') { tip.position.y = 1.25; base.position.y = 0.3; }
    else if (opts.weapon === 'axe') { tip.position.set(0.32, 0.85, 0); base.position.set(0, 0.15, 0); }
    else if (opts.weapon === 'rifle') { tip.position.z = 1.0; base.position.z = 0.2; }
    else { tip.position.y = 0.98; base.position.y = 0.1; }
    weapon.add(tip, base);
    weapon.userData.tip = tip; weapon.userData.base = base;
  }

  // simple face (two dark pixels)
  const eyeL = B(0.06, 0.08, 0.02, 0x1a1a1a); eyeL.position.set(-0.09, 0.02, 0.24); head.add(eyeL);
  const eyeR = B(0.06, 0.08, 0.02, 0x1a1a1a); eyeR.position.set(0.09, 0.02, 0.24); head.add(eyeR);

  g.scale.setScalar(scale);
  g.userData.rig = { torso, head, armL, armR, legL, legR, weapon, type: 'humanoid' };
  return g;
}

// knight variant: bulkier, helmet, shield
export function buildKnight(color = 0x8a93a5) {
  const g = buildHumanoid({ colors: { robe: color, trim: 0x5a6375, skin: 0x8a93a5, hair: color, weapon: 0x999999 }, weapon: 'sword', legColor: 0x4a5262 });
  const r = g.userData.rig;
  const helm = B(0.48, 0.3, 0.46, color); helm.position.y = 0.18; r.head.add(helm);
  const plume = B(0.08, 0.26, 0.3, 0xaa3333); plume.position.y = 0.38; r.head.add(plume);
  const shield = B(0.1, 0.6, 0.44, 0x5a4a30); shield.position.set(-0.16, -0.5, 0.05); r.armL.add(shield);
  return g;
}

// zombie: hunched, arms forward, tattered colors
export function buildZombie(color = 0x6f8a5a) {
  const g = buildHumanoid({ colors: { robe: 0x4a4438, trim: 0x3a382a, skin: color, hair: 0x2a2a1a, weapon: null }, legColor: 0x3a3830 });
  const r = g.userData.rig;
  r.torso.rotation.x = 0.35; r.head.position.z = 0.18; r.head.position.y = 1.55;
  r.armL.rotation.x = -1.2; r.armR.rotation.x = -1.2;
  g.userData.zombie = true;
  return g;
}

// ghost: floating translucent sheet-body
export function buildGhost(color = 0xa8c8d8) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.55, flatShading: true, emissive: color, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 6), bodyMat); body.position.y = 1.1; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.42), bodyMat.clone()); head.position.y = 1.75; g.add(head);
  const eyeL = B(0.08, 0.12, 0.02, 0x0a2a3a); eyeL.position.set(-0.1, 0, 0.22); head.add(eyeL);
  const eyeR = B(0.08, 0.12, 0.02, 0x0a2a3a); eyeR.position.set(0.1, 0, 0.22); head.add(eyeR);
  const armL = new THREE.Group(); armL.position.set(-0.4, 1.35, 0); g.add(armL);
  const aL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), bodyMat.clone()); aL.position.y = -0.25; armL.add(aL);
  const armR = new THREE.Group(); armR.position.set(0.4, 1.35, 0); g.add(armR);
  const aR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), bodyMat.clone()); aR.position.y = -0.25; armR.add(aR);
  g.userData.rig = { torso: body, head, armL, armR, legL: null, legR: null, weapon: null, type: 'ghost' };
  g.userData.floats = true;
  return g;
}

// quadruped beast (wolf/boar/hound)
export function buildBeast(color = 0x7a7d85, bulk = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * bulk, 0.65 * bulk, 4, 10).rotateX(Math.PI / 2), matS(color));
  body.position.y = 0.62 * bulk; g.add(body);
  const head = SPH(0.24 * bulk, color); head.position.set(0, 0.78 * bulk, 0.72 * bulk); g.add(head);
  const snout = B(0.22 * bulk, 0.18 * bulk, 0.26 * bulk, 0x3a3a3a); snout.position.set(0, -0.06 * bulk, 0.32 * bulk); head.add(snout);
  const earL = B(0.1, 0.16, 0.06, color); earL.position.set(-0.13 * bulk, 0.26 * bulk, -0.05); head.add(earL);
  const earR = earL.clone(); earR.position.x *= -1; head.add(earR);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), basicMat(0xffcc44));
  eyeL.position.set(-0.11 * bulk, 0.06, 0.26 * bulk); head.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x *= -1; head.add(eyeR);
  const tail = B(0.12, 0.12, 0.44 * bulk, color); tail.position.set(0, 0.72 * bulk, -0.66 * bulk); tail.rotation.x = -0.5; g.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(0.2 * bulk * sx, 0.45 * bulk, 0.38 * bulk * sz); g.add(pivot);
    const leg = CAP(0.075 * bulk, 0.3 * bulk, color); leg.position.y = -0.24 * bulk; pivot.add(leg);
    legs.push(pivot);
  }
  g.userData.rig = { torso: body, head, legs, tail, type: 'beast' };
  return g;
}

// werewolf: humanoid + beast head + claws, hunched and big
export function buildWerewolf(color = 0x5d554e) {
  const g = buildHumanoid({ colors: { robe: color, trim: color, skin: color, hair: 0x3a342e, weapon: null }, scale: 1.25, legColor: color });
  const r = g.userData.rig;
  // wolf head
  r.head.children.forEach(ch => ch.visible = false);
  const snout = B(0.24, 0.2, 0.36, 0x2a2622); snout.position.set(0, -0.05, 0.3); r.head.add(snout);
  const earL = B(0.1, 0.22, 0.08, color); earL.position.set(-0.15, 0.3, 0); r.head.add(earL);
  const earR = earL.clone(); earR.position.x *= -1; r.head.add(earR);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), basicMat(0xffdd33));
  eyeL.position.set(-0.11, 0.05, 0.22); r.head.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x *= -1; r.head.add(eyeR);
  r.torso.rotation.x = 0.28;
  // claws
  for (const arm of [r.armL, r.armR]) {
    const claw = B(0.22, 0.2, 0.22, 0xd8d0c0); claw.position.y = -0.72; arm.add(claw);
  }
  g.userData.werewolf = true;
  return g;
}

// raven swarm: cloud of small dark tetras orbiting a center
export function buildSwarm(color = 0x1a1a22) {
  const g = new THREE.Group();
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16), mat(color));
    b.userData.phase = Math.random() * Math.PI * 2;
    b.userData.r = 0.5 + Math.random() * 0.7;
    b.userData.h = 0.9 + Math.random() * 1.1;
    g.add(b); birds.push(b);
  }
  g.userData.rig = { birds, type: 'swarm' };
  g.userData.floats = true;
  return g;
}

// glitchling: jittering neon lattice creature
export function buildGlitch(color = 0x39ff88) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45),
    new THREE.MeshBasicMaterial({ color, wireframe: true }));
  core.position.y = 1.2; g.add(core);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), basicMat(color, { transparent: true, opacity: 0.7 }));
  core.add(inner);
  const shards = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12), basicMat(color, { transparent: true, opacity: 0.8 }));
    s.userData.phase = i; g.add(s); shards.push(s);
  }
  g.userData.rig = { torso: core, shards, type: 'glitch' };
  g.userData.floats = true;
  g.userData.glitch = true;
  return g;
}

export function buildModel(model, color, opts = {}) {
  switch (model) {
    case 'beast': return buildBeast(color, opts.bulk || 1);
    case 'werewolf': return buildWerewolf(color);
    case 'zombie': return buildZombie(color);
    case 'ghost': return buildGhost(color);
    case 'knight': return buildKnight(color);
    case 'swarm': return buildSwarm(color);
    case 'glitch': return buildGlitch(color);
    default: return buildHumanoid({ colors: { robe: color, trim: 0x333333, skin: 0xd0a080, hair: 0x40291a, weapon: 0x775533 }, weapon: opts.weapon || 'sword' });
  }
}

export function buildPlayerModel(classId) {
  const skin = CLASS_SKIN[classId];
  const weapons = { mage: 'staff', barbarian: 'axe', hunter: 'rifle' };
  const m = buildHumanoid({ colors: skin, weapon: weapons[classId], legColor: 0x2c2c34 });
  // hero cloak, swaying with movement
  const cloakColors = { mage: 0x1c2f52, barbarian: 0x4a2018, hunter: 0x24361f };
  const cloakPivot = new THREE.Group();
  cloakPivot.position.set(0, 1.48, -0.2);
  const cloak = B(0.6, 0.85, 0.06, cloakColors[classId]);
  cloak.position.y = -0.42;
  cloakPivot.add(cloak);
  m.add(cloakPivot);
  m.userData.rig.cloak = cloakPivot;
  if (classId === 'barbarian') {
    const r = m.userData.rig;
    const pauldron = B(0.3, 0.2, 0.4, 0x8a5a3a); pauldron.position.set(0.42, 1.44, 0); m.add(pauldron);
    const pauldron2 = pauldron.clone(); pauldron2.position.x = -0.42; m.add(pauldron2);
    m.scale.setScalar(1.1);
  }
  if (classId === 'hunter') {
    const pack = B(0.4, 0.5, 0.2, 0x6a5230); pack.position.set(0, 1.1, -0.3); m.add(pack);
    const antenna = B(0.04, 0.4, 0.04, 0xaaaaaa); antenna.position.set(0.14, 0.4, 0); pack.add(antenna);
  }
  return m;
}

// blob shadow (fake, cheap)
export function blobShadow(radius = 0.6) {
  const s = new THREE.Mesh(new THREE.CircleGeometry(radius, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.position.y = 0.03;
  return s;
}

// ---------- easing ----------
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;
const easeOutBack = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const clamp01 = (p) => Math.max(0, Math.min(1, p));
// phase helper: progress within [a,b] of p
const ph = (p, a, b) => clamp01((p - a) / (b - a));

// ---------------------------------------------------------------
// ANIMATOR — drives a rig from entity state each frame
// Authored multi-phase actions (anticipation → strike → follow-through):
// idle | walk | chop | slash | shoot | cast | castRelease | hit | death | howl | spin
// 'attack' is kept as an alias of 'chop' for the generic mobs.
// ---------------------------------------------------------------
export class Animator {
  constructor(group) {
    this.g = group;
    this.rig = group.userData.rig;
    this.t = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.stateDur = 0.5;
    this.moveSpeed = 0;
    this.baseY = 0;
    this.dead = false;
    this.style = null;         // 'mage' | 'barbarian' | 'hunter' — class idle/handling
    this.onStrike = null;      // callback fired at the strike frame (trails/impacts hook here)
    this._struck = false;
    this._baseTorsoRotX = this.rig?.torso?.rotation.x ?? 0;
  }

  play(state, dur) {
    if (this.dead && state !== 'death') return;
    if (state === 'attack') state = 'chop';
    this.state = state;
    this.stateT = 0;
    this._struck = false;
    this.stateDur = dur ?? { chop: 0.55, slash: 0.5, shoot: 0.32, castRelease: 0.34, hit: 0.3, howl: 1.2, spin: 1.0 }[state] ?? 0.5;
  }

  get striking() { // window where a melee swing is "live" (drives weapon trails)
    if (this.state === 'chop') return this.stateT / this.stateDur > 0.3 && this.stateT / this.stateDur < 0.75;
    if (this.state === 'slash') return this.stateT / this.stateDur > 0.28 && this.stateT / this.stateDur < 0.8;
    if (this.state === 'spin') return true;
    return false;
  }

  update(dt, moving) {
    this.t += dt; this.stateT += dt;
    const r = this.rig; if (!r) return;
    const t = this.t;

    if (this.state === 'death') { this._death(dt); return; }
    if (['chop', 'slash', 'shoot', 'castRelease', 'hit', 'howl'].includes(this.state) && this.stateT > this.stateDur) {
      this.state = 'idle'; this.stateT = 0;
    }
    if (this.state === 'spin' && this.stateT > this.stateDur) { this.state = 'idle'; this.stateT = 0; }

    const walking = moving && this.state !== 'spin';
    const wt = t * 9;

    if (r.type === 'humanoid') {
      const swing = walking ? Math.sin(wt) * 0.75 : 0;
      if (r.legL) r.legL.rotation.x = swing;
      if (r.legR) r.legR.rotation.x = -swing;
      if (r.weapon) r.weapon.rotation.x = 0; // poses below counter-rotate as needed
      // reset per-frame pose accumulators
      let torsoX = this._baseTorsoRotX, torsoY = 0, headX = Math.sin(t * 0.7) * 0.06;
      const p = clamp01(this.stateT / this.stateDur);

      switch (this.state) {
        case 'chop': {
          // anticipation: raise high behind the head; strike: violent downswing; recover
          const wind = easeOut(ph(p, 0, 0.3));
          const strike = easeIn(ph(p, 0.3, 0.55));
          const rec = easeOut(ph(p, 0.55, 1));
          r.armR.rotation.x = -0.4 + wind * -2.7 + strike * 3.9 - rec * (0.8);
          r.armR.rotation.z = wind * 0.35 - strike * 0.3;
          r.armL.rotation.x = wind * -0.8 + strike * 0.4;
          torsoX += wind * -0.18 + strike * 0.34 - rec * 0.16;
          torsoY = wind * 0.25 - strike * 0.4 + rec * 0.15;
          headX += strike * 0.25;
          this.g.position.y = this.baseY - strike * 0.12 + 0;
          if (!this._struck && p > 0.5) { this._struck = true; this.onStrike?.('chop'); }
          break;
        }
        case 'slash': {
          // horizontal cleave: arm sweeps across the body, torso counter-rotates
          const wind = easeOut(ph(p, 0, 0.28));
          const strike = easeIn(ph(p, 0.28, 0.55));
          const rec = easeOut(ph(p, 0.55, 1));
          r.armR.rotation.x = -1.35;
          r.armR.rotation.y = wind * -1.15 + strike * 2.4 - rec * 1.25;
          r.armR.rotation.z = -0.25;
          r.armL.rotation.x = -0.35 - wind * 0.3;
          torsoY = wind * -0.4 + strike * 0.75 - rec * 0.35;
          torsoX += strike * 0.12;
          if (!this._struck && p > 0.48) { this._struck = true; this.onStrike?.('slash'); }
          break;
        }
        case 'shoot': {
          // shoulder the rifle, recoil kick, settle
          const kick = Math.max(0, 1 - p * 3.2);
          if (r.weapon) r.weapon.rotation.x = 1.45 - kick * 0.25; // counter-rotate: barrel stays level
          r.armR.rotation.x = -1.52 + kick * 0.3;
          r.armR.rotation.y = -0.12;
          r.armL.rotation.x = -1.28 + kick * 0.2;
          r.armL.rotation.y = 0.5;
          torsoY = 0.28 + kick * 0.12;
          headX = -0.08;
          if (!this._struck) { this._struck = true; this.onStrike?.('shoot'); }
          break;
        }
        case 'cast': {
          // two-hand channel: staff raised, energy gathering
          const gather = Math.min(1, this.stateT * 3);
          r.armR.rotation.x = -1.6 - gather * 0.5 + Math.sin(t * 11) * 0.05;
          r.armR.rotation.z = -0.2;
          r.armL.rotation.x = -1.7 + Math.sin(t * 11 + 1.5) * 0.07;
          r.armL.rotation.z = 0.35;
          torsoX += -0.06;
          if (r.weapon?.userData.glow) r.weapon.userData.glow.intensity = 0.6 + Math.sin(t * 14) * 0.4;
          break;
        }
        case 'castRelease': {
          // thrust the staff forward, release the bolt
          const thrust = easeOutBack(ph(p, 0, 0.5));
          const rec = easeOut(ph(p, 0.5, 1));
          r.armR.rotation.x = -2.1 + thrust * 0.9 - rec * 0.2;
          r.armL.rotation.x = -0.9 - thrust * 0.5;
          torsoX += thrust * 0.14;
          torsoY = -0.15 + thrust * 0.2;
          if (!this._struck && p > 0.28) { this._struck = true; this.onStrike?.('castRelease'); }
          break;
        }
        case 'hit': {
          const rec = 1 - p;
          torsoX += -0.3 * rec;
          headX += -0.2 * rec;
          r.armL.rotation.x = -0.45 * rec; r.armR.rotation.x = -0.45 * rec;
          break;
        }
        case 'howl': {
          r.head.rotation.x = -0.7;
          r.armL.rotation.x = -0.9; r.armR.rotation.x = -0.9;
          break;
        }
        case 'spin': {
          this.g.rotation.y += dt * 15;
          r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.5;
          r.armL.rotation.z = -1.25; r.armR.rotation.z = 1.25;
          break;
        }
        default: {
          // idle / walk with class-flavored weapon handling
          const zomb = this.g.userData.zombie;
          r.armR.rotation.y = 0; r.armR.rotation.z = 0; r.armL.rotation.z = 0; r.armL.rotation.y = 0;
          if (zomb) {
            r.armL.rotation.x = -1.2 + Math.sin(t * 2) * 0.1;
            r.armR.rotation.x = -1.2 - Math.sin(t * 2) * 0.1;
          } else if (this.style === 'barbarian') {
            r.armR.rotation.x = -0.62 + Math.sin(t * 2.2) * 0.03;      // axe rested on shoulder
            r.armR.rotation.z = -0.3;
            r.armL.rotation.x = -swing * 0.85;
          } else if (this.style === 'hunter') {
            r.armR.rotation.x = -0.95 + swing * 0.15;                   // rifle held low-ready
            r.armR.rotation.y = -0.15;
            if (r.weapon) r.weapon.rotation.x = 0.8;                    // barrel level-ish
            r.armL.rotation.x = -0.5 - swing * 0.2;
          } else if (this.style === 'mage') {
            r.armR.rotation.x = -0.32 + Math.sin(t * 2.2) * 0.03;      // staff planted
            r.armL.rotation.x = -swing * 0.85;
          } else {
            r.armL.rotation.x = -swing * 0.85;
            r.armR.rotation.x = swing * 0.85;
          }
          if (!walking) {
            torsoX = this._baseTorsoRotX;
            r.torso.position.y = 1.05 + Math.sin(t * 2.2) * 0.015;
          } else torsoX += 0.1; // running lean
        }
      }

      r.torso.rotation.x = torsoX;
      r.torso.rotation.y = torsoY;
      r.head.rotation.x = headX;
      if (walking) this.g.position.y = this.baseY + Math.abs(Math.sin(wt)) * 0.06;
      else if (!this.g.userData.floats && this.state !== 'chop') this.g.position.y = this.baseY;
      // cloak sway: billows when running, whips on strikes
      if (r.cloak) {
        const strikeKick = (this.state === 'chop' || this.state === 'slash') ? 0.3 : 0;
        const want = walking ? 0.34 + Math.abs(Math.sin(wt)) * 0.16 : 0.06 + Math.sin(t * 1.6) * 0.04 + strikeKick;
        r.cloak.rotation.x += (want - r.cloak.rotation.x) * 0.18;
      }
    }

    if (r.type === 'beast') {
      const swing = walking ? Math.sin(wt * 1.3) * 0.8 : 0;
      r.legs[0].rotation.x = swing; r.legs[3].rotation.x = swing;
      r.legs[1].rotation.x = -swing; r.legs[2].rotation.x = -swing;
      r.tail.rotation.y = Math.sin(t * 5) * 0.3;
      if (this.state === 'chop') {
        const p = clamp01(this.stateT / this.stateDur);
        // pounce: rear back, then lunge the whole body forward with a bite
        const wind = easeOut(ph(p, 0, 0.35)), strike = easeIn(ph(p, 0.35, 0.6)), rec = easeOut(ph(p, 0.6, 1));
        r.head.rotation.x = wind * -0.6 + strike * 1.1 - rec * 0.5;
        r.torso.rotation.x = wind * -0.25 + strike * 0.3 - rec * 0.05;
        this.g.position.y = this.baseY + Math.sin(strike * Math.PI) * 0.25;
      } else r.head.rotation.x = walking ? 0.05 : Math.sin(t * 1.5) * 0.08;
      if (this.state === 'hit') r.torso.rotation.z = 0.2; else r.torso.rotation.z = 0;
    }

    if (r.type === 'ghost') {
      this.g.position.y = this.baseY + 0.25 + Math.sin(t * 2.4) * 0.12;
      r.armL.rotation.x = -0.6 + Math.sin(t * 2) * 0.2;
      r.armR.rotation.x = -0.6 - Math.sin(t * 2) * 0.2;
      if (this.state === 'cast') { r.armL.rotation.x = -1.8; r.armR.rotation.x = -1.8; }
      this.g.rotation.z = Math.sin(t * 1.4) * 0.05;
    }

    if (r.type === 'swarm') {
      for (const b of r.birds) {
        const ph = b.userData.phase + t * (2.2 + b.userData.phase * 0.1);
        b.position.set(Math.cos(ph) * b.userData.r, b.userData.h + Math.sin(t * 3 + b.userData.phase) * 0.3, Math.sin(ph) * b.userData.r);
        b.rotation.set(ph, ph * 1.3, 0);
      }
    }

    if (r.type === 'glitch') {
      r.torso.rotation.y += dt * 1.5; r.torso.rotation.x += dt * 0.7;
      this.g.position.y = this.baseY + Math.sin(t * 3) * 0.1;
      for (const s of r.shards) {
        const ph = s.userData.phase * 1.05 + t * 1.8;
        s.position.set(Math.cos(ph) * 0.9, 1.2 + Math.sin(ph * 1.7) * 0.5, Math.sin(ph) * 0.9);
      }
      // stutter teleport jitter
      if (Math.random() < 0.02) r.torso.position.x = (Math.random() - 0.5) * 0.2; else r.torso.position.x *= 0.8;
    }
  }

  _death(dt) {
    this.dead = true;
    const r = this.rig;
    const p = Math.min(1, this.stateT / 0.7);
    if (this.g.userData.floats) {
      this.g.position.y = this.baseY + (1 - p) * 0.4;
      this.g.scale.setScalar(Math.max(0.01, 1 - p));
    } else {
      this.g.rotation.z = p * Math.PI / 2;
      this.g.position.y = this.baseY + Math.sin(p * Math.PI) * 0.2 - p * 0.3;
    }
    if (p >= 1 && !this._sank) this._sank = true;
  }
}
