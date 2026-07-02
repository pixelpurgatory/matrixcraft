// ============ NET — multiplayer client (graceful solo fallback) ============
// Connects to the relay server if reachable; otherwise the game runs solo and
// the arena provides an AI challenger. Remote players are rendered as real
// class models with interpolation and name plates.
import { THREE } from './engine.js';
import { buildPlayerModel, blobShadow, Animator } from './entities.js';
import { CLASSES } from './data_classes.js';

function plateTexture(name, cls) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 40;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 22px Verdana'; ctx.textAlign = 'center';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#8ad0ff';
  ctx.fillText(`${name}`, 128, 27);
  return new THREE.CanvasTexture(cv);
}

class RemotePlayer {
  constructor(game, info) {
    this.game = game;
    this.id = info.id;
    this.name = info.name;
    this.cls = info.cls || 'mage';
    this.level = info.level || 1;
    this.group = buildPlayerModel(this.cls);
    this.group.add(blobShadow());
    this.anim = new Animator(this.group);
    const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: plateTexture(this.name, this.cls), depthTest: false, transparent: true }));
    plate.scale.set(2.6, 0.4, 1);
    plate.position.y = 2.5;
    this.group.add(plate);
    game.scene.add(this.group);
    this.targetPos = new THREE.Vector3();
    this.targetFacing = 0;
    this.moving = false;
    this.hp = 100; this.maxHp = 100;
    this.inMyParty = false;
    if (info.s) this.applyState(info.s);
    else this.group.position.set(0, 0, 45);
  }

  applyState(s) {
    if (!s) return;
    this.targetPos.set(s.p[0], s.p[1], s.p[2]);
    this.targetFacing = s.f;
    this.moving = !!s.m;
    this.hp = s.hp; this.maxHp = s.mh; this.level = s.lvl || this.level;
    if (this.group.position.distanceTo(this.targetPos) > 25) this.group.position.copy(this.targetPos);
    if (s.anim && s.anim !== 'idle' && s.anim !== 'walk') this.anim.play(s.anim);
  }

  update(dt) {
    // interpolate toward the last known state
    this.group.position.lerp(this.targetPos, Math.min(1, dt * 10));
    let d = this.targetFacing - this.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.group.rotation.y += d * Math.min(1, dt * 10);
    this.anim.baseY = this.game.groundY(this.group.position);
    this.anim.update(dt, this.moving);
  }

  destroy() { this.game.scene.remove(this.group); }
}

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.remotes = new Map();
    this.party = [];       // infos from server
    this.pendingInvite = null;
    this.onArenaMatch = null;
    this._sendTimer = 0;
    this._tried = false;
  }

  serverUrl() {
    const saved = localStorage.getItem('vb_server');
    if (saved) return saved;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.hostname || 'localhost'}:8081`;
  }

  connect() {
    if (this._tried) return;
    this._tried = true;
    try {
      this.ws = new WebSocket(this.serverUrl());
    } catch { this.game.log('🌐 Solo mode — no realm server reachable. (Settings → Server to set one.)'); return; }
    const timeout = setTimeout(() => { if (!this.connected) { try { this.ws.close(); } catch { } } }, 4000);
    this.ws.onopen = () => {
      clearTimeout(timeout);
      this.connected = true;
      const p = this.game.player;
      this.send({ t: 'hello', name: p.name, cls: p.classId, level: p.level, zone: this.game.zoneId });
      this.game.log('🌐 Connected to the realm. Other dreamers may appear.');
    };
    this.ws.onmessage = (e) => this._onMsg(JSON.parse(e.data));
    this.ws.onclose = () => {
      if (this.connected) this.game.log('🌐 Realm connection lost — continuing solo.');
      this.connected = false;
      for (const r of this.remotes.values()) r.destroy();
      this.remotes.clear();
    };
    this.ws.onerror = () => { };
  }

  send(obj) { if (this.connected) try { this.ws.send(JSON.stringify(obj)); } catch { } }

  _onMsg(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome':
        this.id = m.id;
        for (const p of m.peers) this._addRemote(p);
        break;
      case 'peers':
        for (const r of this.remotes.values()) r.destroy();
        this.remotes.clear();
        for (const p of m.peers) this._addRemote(p);
        break;
      case 'join': this._addRemote(m.p); g.log(`${m.p.name} appears in the world.`); break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) { r.destroy(); this.remotes.delete(m.id); }
        break;
      }
      case 'state': this.remotes.get(m.id)?.applyState(m.s); break;
      case 'chat': g.log(`💬 ${m.from}: ${m.msg}`); break;
      case 'sys': g.log(`🌐 ${m.msg}`); break;
      case 'inviteFrom':
        this.pendingInvite = m;
        g.log(`🤝 ${m.from} invites you to a group! Open the Dungeons menu to accept.`);
        g.ui?.notifyInvite(m);
        break;
      case 'party':
        this.party = m.members.filter(x => x.id !== this.id);
        for (const r of this.remotes.values()) r.inMyParty = this.party.some(p => p.id === r.id);
        g.hud?.renderParty();
        break;
      case 'arenaMatch':
        this.onArenaMatch?.(m.opponent);
        break;
      case 'hitPvp':
        g.arena?.onRemoteHit(m);
        break;
      case 'cast': {
        const r = this.remotes.get(m.id);
        if (r) r.anim.play('cast');
        break;
      }
    }
  }

  _addRemote(info) {
    if (info.id === this.id || this.remotes.has(info.id)) return;
    this.remotes.set(info.id, new RemotePlayer(this.game, info));
  }

  update(dt) {
    const g = this.game;
    for (const r of this.remotes.values()) r.update(dt);
    this._sendTimer -= dt;
    if (this.connected && this._sendTimer <= 0 && g.player) {
      this._sendTimer = 0.1; // 10 Hz
      const p = g.player;
      this.send({ t: 'state', s: {
        p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)],
        f: +p.facing.toFixed(2),
        m: p.anim.state === 'walk' || undefined,
        anim: ['attack', 'cast', 'spin', 'death'].includes(p.anim.state) ? p.anim.state : undefined,
        hp: Math.round(p.hp), mh: p.maxHp, lvl: p.level,
      } });
    }
  }
}
