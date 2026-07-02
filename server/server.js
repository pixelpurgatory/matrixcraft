#!/usr/bin/env node
// ============ VEILBREAK relay server — rooms, parties, arena matchmaking ============
// Zero-dependency WebSocket server (implements RFC6455 directly — no npm install).
// Run: node server/server.js [port]     (default 8081)
// Clients connect with ws://host:8081 — see js/net.js for the protocol.
import { createServer } from 'http';
import { createHash, randomUUID } from 'crypto';

const PORT = process.env.PORT || process.argv[2] || 8081;
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------- minimal ws framing ----------
function acceptKey(key) { return createHash('sha1').update(key + MAGIC).digest('base64'); }

function decodeFrames(sock, onMsg, onClose) {
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) {
        const mask = buf.subarray(maskOff, maskOff + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
      }
      buf = buf.subarray(off + len);
      if (op === 8) { onClose(); sock.end(); return; }
      if (op === 9) { sock.write(encodeFrame(payload, 10)); continue; } // ping->pong
      if (op === 1 && fin) onMsg(payload.toString('utf8'));
    }
  });
  sock.on('close', onClose);
  sock.on('error', onClose);
}

function encodeFrame(data, op = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.from([0x80 | op, len]); }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

// ---------- game state ----------
const clients = new Map();   // id -> {sock, name, cls, level, room, party, state}
const parties = new Map();   // partyId -> {leader, members:Set}
let arenaQueue = [];         // [{id, cls}]

function send(c, obj) { try { c.sock.write(encodeFrame(JSON.stringify(obj))); } catch { } }
function roomBroadcast(room, obj, exceptId = null) {
  for (const [id, c] of clients) if (c.room === room && id !== exceptId) send(c, obj);
}

function leaveParty(c) {
  if (!c.party) return;
  const p = parties.get(c.party);
  if (p) {
    p.members.delete(c.id);
    for (const mid of p.members) { const m = clients.get(mid); if (m) send(m, { t: 'party', members: [...p.members].map(i => clients.get(i)?.info()).filter(Boolean) }); }
    if (p.members.size <= 1) {
      for (const mid of p.members) { const m = clients.get(mid); if (m) { m.party = null; send(m, { t: 'party', members: [] }); } }
      parties.delete(c.party);
    }
  }
  c.party = null;
}

function handleMsg(c, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  switch (m.t) {
    case 'hello': {
      c.name = String(m.name || 'Dreamer').slice(0, 20);
      c.cls = m.cls; c.level = m.level | 0;
      c.room = 'zone:' + (m.zone || 'eldergreen');
      send(c, { t: 'welcome', id: c.id, peers: [...clients.values()].filter(o => o !== c && o.room === c.room).map(o => o.info()) });
      roomBroadcast(c.room, { t: 'join', p: c.info() }, c.id);
      break;
    }
    case 'state': { // {pos:[x,y,z], f, anim, hp, maxHp, level, target}
      c.state = m.s; c.level = m.s?.level ?? c.level;
      roomBroadcast(c.room, { t: 'state', id: c.id, s: m.s }, c.id);
      break;
    }
    case 'zone': {
      roomBroadcast(c.room, { t: 'leave', id: c.id }, c.id);
      c.room = 'zone:' + m.zone;
      send(c, { t: 'peers', peers: [...clients.values()].filter(o => o !== c && o.room === c.room).map(o => o.info()) });
      roomBroadcast(c.room, { t: 'join', p: c.info() }, c.id);
      break;
    }
    case 'enterDungeon': {
      roomBroadcast(c.room, { t: 'leave', id: c.id }, c.id);
      c.room = 'dg:' + (c.party || c.id) + ':' + m.dg;
      send(c, { t: 'peers', peers: [...clients.values()].filter(o => o !== c && o.room === c.room).map(o => o.info()) });
      roomBroadcast(c.room, { t: 'join', p: c.info() }, c.id);
      break;
    }
    case 'exitDungeon': {
      roomBroadcast(c.room, { t: 'leave', id: c.id }, c.id);
      c.room = 'zone:' + (m.zone || 'eldergreen');
      send(c, { t: 'peers', peers: [...clients.values()].filter(o => o !== c && o.room === c.room).map(o => o.info()) });
      roomBroadcast(c.room, { t: 'join', p: c.info() }, c.id);
      break;
    }
    case 'chat': {
      roomBroadcast(c.room, { t: 'chat', from: c.name, msg: String(m.msg).slice(0, 200) });
      break;
    }
    case 'invite': { // invite by name
      const target = [...clients.values()].find(o => o.name.toLowerCase() === String(m.name).toLowerCase());
      if (!target) { send(c, { t: 'sys', msg: 'Player not found.' }); break; }
      send(target, { t: 'inviteFrom', from: c.name, fromId: c.id });
      break;
    }
    case 'inviteAccept': {
      const from = clients.get(m.fromId);
      if (!from) break;
      let pid = from.party;
      if (!pid) { pid = randomUUID(); parties.set(pid, { leader: from.id, members: new Set([from.id]) }); from.party = pid; }
      const p = parties.get(pid);
      if (p.members.size >= 10) { send(c, { t: 'sys', msg: 'Party is full.' }); break; }
      leaveParty(c);
      p.members.add(c.id); c.party = pid;
      for (const mid of p.members) { const mc = clients.get(mid); if (mc) send(mc, { t: 'party', members: [...p.members].map(i => clients.get(i)?.info()).filter(Boolean) }); }
      break;
    }
    case 'leaveParty': leaveParty(c); break;
    case 'arenaQueue': {
      arenaQueue = arenaQueue.filter(q => q.id !== c.id);
      arenaQueue.push({ id: c.id, cls: m.cls });
      if (arenaQueue.length >= 2) {
        const [a, b] = arenaQueue.splice(0, 2);
        const ca = clients.get(a.id), cb = clients.get(b.id);
        if (ca && cb) {
          const room = 'arena:' + randomUUID();
          for (const [x, y] of [[ca, cb], [cb, ca]]) {
            x.room = room;
            send(x, { t: 'arenaMatch', opponent: y.info() });
          }
        }
      } else send(c, { t: 'sys', msg: 'In arena queue... (an AI challenger steps in if no one comes)' });
      break;
    }
    case 'arenaLeave': arenaQueue = arenaQueue.filter(q => q.id !== c.id); break;
    case 'hitPvp': { // relayed damage in arena
      roomBroadcast(c.room, { t: 'hitPvp', from: c.id, dmg: m.dmg, skill: m.skill }, c.id);
      break;
    }
    case 'cast': { // cosmetic skill mirror
      roomBroadcast(c.room, { t: 'cast', id: c.id, skill: m.skill, target: m.target }, c.id);
      break;
    }
  }
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`VEILBREAK relay — ${clients.size} dreamers connected\n`);
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
  const c = {
    id: randomUUID().slice(0, 8), sock, name: '?', cls: 'mage', level: 1,
    room: null, party: null, state: null,
    info() { return { id: this.id, name: this.name, cls: this.cls, level: this.level, s: this.state }; },
  };
  clients.set(c.id, c);
  decodeFrames(sock, (msg) => handleMsg(c, msg), () => {
    if (!clients.has(c.id)) return;
    leaveParty(c);
    arenaQueue = arenaQueue.filter(q => q.id !== c.id);
    roomBroadcast(c.room, { t: 'leave', id: c.id }, c.id);
    clients.delete(c.id);
  });
});

server.listen(PORT, () => console.log(`VEILBREAK relay listening on :${PORT}`));
