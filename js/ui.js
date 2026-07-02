// ============ UI — windows: menu, gear, bag, map, quests, talents, dungeons, pvp, settings ============
import { Events } from './combat.js';
import { CLASSES, GEAR_SLOTS, SLOT_NAMES, SLOT_ICONS, XP_TABLE, QUALITIES } from './data_classes.js';
import { ZONES, DUNGEONS } from './data_world.js';
import { QUESTS, LORE_FRAGMENTS } from './data_quests.js';
import { compareText } from './loot.js';
import { DEFAULT_BINDS, IS_TOUCH } from './input.js';

const WINDOWS = ['character', 'bag', 'map', 'quests', 'talents', 'dungeons', 'pvp', 'settings', 'menu', 'dialogue'];

export class UI {
  constructor(game, input) {
    this.game = game;
    this.input = input;
    this.root = document.getElementById('ui-root');
    this.open = null;
    this.tooltip = this._mkTooltip();
    this._bindKeys();
    Events.on('bag', () => { if (this.open === 'bag') this.renderBag(); if (this.open === 'character') this.renderCharacter(); });
    Events.on('stats', () => { if (this.open === 'character') this.renderCharacter(); });
    Events.on('quests', () => { if (this.open === 'quests') this.renderQuests(); });
    Events.on('level', () => { if (this.open === 'talents') this.renderTalents(); });
  }

  _mkTooltip() {
    const t = document.createElement('div');
    t.id = 'tooltip';
    document.body.appendChild(t);
    return t;
  }

  _bindKeys() {
    const map = { character: 'character', bag: 'bag', map: 'map', quests: 'quests', talents: 'talents', dungeons: 'dungeons', pvp: 'pvp', menu: 'menu' };
    for (const [action, win] of Object.entries(map)) this.input.on(action, () => this.toggle(win));
    this.input.on('interact', () => this.game.doInteract());
    this.input.on('target', () => this.game.player?.selectTarget());
    this.input.on('jump', () => this.game.player?.jump());
    for (let i = 0; i < 10; i++) this.input.on('skill' + (i + 1), () => this.game.player?.useSkill(i));
    this.input.on('zoom', (d) => this.game.cam.zoom(d));
    this.input.on('canvasclick', () => this.game.audio.unlock());
    document.getElementById('lore-pop').addEventListener('click', (e) => {
      if (e.target.classList.contains('btn')) document.getElementById('lore-pop').style.display = 'none';
    });
  }

  toggle(win) {
    this.game.audio.play('ui');
    if (this.open === win) { this.close(); return; }
    this.openWindow(win);
  }

  close() {
    this.root.innerHTML = '';
    this.open = null;
    this.input.uiOpen = false;
    this.hideTooltip();
  }

  openWindow(win) {
    this.close();
    this.open = win;
    this.input.uiOpen = true;
    this.input.releasePointer();
    const w = document.createElement('div');
    w.className = 'window panel';
    w.id = 'win-' + win;
    this.root.appendChild(w);
    const titles = {
      character: '🧍 GEAR & CHARACTER', bag: '🎒 BAG', map: '🗺️ WORLD MAP', quests: '📜 QUEST LOG',
      talents: '🌳 TALENTS', dungeons: '⚔️ DUNGEONS & RAIDS', pvp: '🏆 PVP — THE NULL CHAMBER',
      settings: '⚙️ SETTINGS', menu: 'VEILBREAK', dialogue: '',
    };
    w.innerHTML = `<div class="panel-title"><span>${titles[win]}</span><span class="x">✕</span></div><div class="panel-body"></div>`;
    w.querySelector('.x').addEventListener('click', () => this.close());
    const render = {
      character: () => this.renderCharacter(), bag: () => this.renderBag(), map: () => this.renderMap(),
      quests: () => this.renderQuests(), talents: () => this.renderTalents(), dungeons: () => this.renderDungeons(),
      pvp: () => this.renderPvp(), settings: () => this.renderSettings(), menu: () => this.renderMenu(),
    }[win];
    render?.();
  }

  body() { return this.root.querySelector('.panel-body'); }

  // ---------------- tooltips ----------------
  showItemTooltip(item, ev, compare = null) {
    const t = this.tooltip;
    t.innerHTML = `
      <div class="tt-name q-${item.quality}">${item.name}</div>
      <div class="tt-type">${SLOT_NAMES[item.slot]} · iLvl ${item.ilvl} · <span class="q-${item.quality}">${item.quality}</span></div>
      <div class="tt-stat">+${item.power} Power</div>
      <div class="tt-stat">+${item.stam} Stamina</div>
      ${item.crit ? `<div class="tt-stat">+${item.crit}% Critical Strike</div>` : ''}
      ${compare !== null ? `<div style="margin-top:6px;font-size:11px">${compareText(item, compare)}</div>` : ''}
      ${item.flavor ? `<div class="tt-flavor">${item.flavor}</div>` : ''}`;
    this._placeTooltip(ev);
  }

  showSkillTooltip(skill, ev) {
    const p = this.game.player;
    const kindTag = { dps: '⚔ Damage', support: '✚ Support', mobility: '👟 Mobility' }[skill.kind];
    let stats = [];
    if (skill.cost) stats.push(`${skill.cost} ${p.cls.resource}`);
    if (skill.gain) stats.push(`generates ${skill.gain} ${p.cls.resource}`);
    if (skill.cast) stats.push(`${skill.cast}s cast`); else stats.push('instant');
    if (skill.cd) stats.push(`${skill.cd}s cooldown`);
    if (skill.range) stats.push(`${skill.range}m range`);
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:var(--gold)">${skill.icon} ${skill.name}</div>
      <div class="tt-type">${kindTag} · ${stats.join(' · ')}</div>
      <div style="margin-top:6px">${skill.desc}</div>`;
    this._placeTooltip(ev);
  }

  _placeTooltip(ev) {
    const t = this.tooltip;
    t.style.display = 'block';
    const x = Math.min(innerWidth - 290, (ev?.clientX ?? 40) + 14);
    const y = Math.max(10, Math.min(innerHeight - t.offsetHeight - 10, (ev?.clientY ?? 40) - 40));
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }

  hideTooltip() { this.tooltip.style.display = 'none'; }

  // ---------------- CHARACTER / GEAR ----------------
  renderCharacter() {
    const p = this.game.player, b = this.body();
    const half = ['head', 'shoulders', 'chest', 'legs', 'boots'];
    const half2 = ['hands', 'ring1', 'ring2', 'trinket', 'weapon'];
    const slotHtml = (slot) => {
      const it = p.gear[slot];
      return `<div class="slot ${it ? 'q-' + it.quality : ''}" data-slot="${slot}">
        ${it ? it.icon : `<span class="slot-label">${SLOT_NAMES[slot]}</span>`}
        ${it ? `<span class="ilvl">${it.ilvl}</span>` : ''}</div>`;
    };
    b.innerHTML = `
      <div class="gear-layout">
        <div class="gear-col">${half.map(slotHtml).join('')}</div>
        <div class="gear-stats">
          <div style="font-size:15px;color:var(--gold)">${p.name}</div>
          <div class="tt-type">Level ${p.level} ${p.cls.name}</div>
          <hr style="border-color:var(--line);margin:8px 0">
          <div>❤️ Health: <b>${p.maxHp}</b></div>
          <div>⚡ Power: <b>${p.power}</b></div>
          <div>🎯 Crit: <b>${(5 + (p.gearCrit || 0)).toFixed(0)}%</b></div>
          <div>🛡️ Avg iLvl: <b>${p.avgIlvl}</b></div>
          <hr style="border-color:var(--line);margin:8px 0">
          <div class="tt-type">Kills: ${p.kills} · Deaths: ${p.deaths}</div>
          <div class="tt-type">Veil-sight: <span style="color:var(--green)">${Math.round(p.veilSight * 100)}%</span></div>
          <div class="tt-type">Lore fragments: ${p.loreFound.length}/${LORE_FRAGMENTS.length}</div>
        </div>
        <div class="gear-col">${half2.map(slotHtml).join('')}</div>
      </div>`;
    b.querySelectorAll('.slot').forEach(el => {
      const slot = el.dataset.slot;
      const it = p.gear[slot];
      if (it) {
        el.addEventListener('mouseenter', (e) => this.showItemTooltip(it, e));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('click', (e) => this.showItemTooltip(it, e));
      }
    });
  }

  // ---------------- BAG ----------------
  renderBag() {
    const p = this.game.player, b = this.body();
    if (!p.bag.length) {
      b.innerHTML = `<div class="tt-type" style="text-align:center;padding:30px">Your bag is empty.<br><br>
        Every drop in this world is <b>gear</b> — no vendor trash, no rat tails.<br>Go take something from someone who deserves it.</div>`;
      return;
    }
    b.innerHTML = `<div class="tt-type" style="margin-bottom:10px">Tap an item to <b>equip</b> it. Long-press / right-click to destroy. ${p.bag.length} item(s).</div>
      <div class="bag-grid">${p.bag.map((it, i) => `
        <div class="slot q-${it.quality}" data-i="${i}">${it.icon}<span class="ilvl">${it.ilvl}</span></div>`).join('')}</div>`;
    b.querySelectorAll('.slot').forEach(el => {
      const it = p.bag[+el.dataset.i];
      el.addEventListener('mouseenter', (e) => this.showItemTooltip(it, e, p.gear[it.slot] || null));
      el.addEventListener('mouseleave', () => this.hideTooltip());
      el.addEventListener('click', () => { p.equip(it); this.renderBag(); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        p.bag = p.bag.filter(x => x !== it);
        this.game.log(`Destroyed ${it.name}.`);
        this.renderBag();
      });
    });
  }

  // ---------------- MAP ----------------
  renderMap() {
    const g = this.game, b = this.body();
    b.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        ${Object.values(ZONES).map(z => `<button class="btn small ${g.zoneId === z.id ? 'green' : ''}" data-z="${z.id}"
          ${g.unlockedZones.includes(z.id) ? '' : 'disabled'}>
          ${z.name} ${g.unlockedZones.includes(z.id) ? `(${z.levels[0]}–${z.levels[1]})` : '🔒'}</button>`).join('')}
      </div>
      <div id="mapwrap"><canvas id="mapcanvas" width="512" height="512"></canvas></div>
      <div class="map-legend">
        <span style="color:#fff">● you</span><span style="color:#ffd100">● quest</span>
        <span style="color:#39ff88">● dungeon seam</span><span style="color:#7fd0ff">● npc</span>
        <span style="color:#a06a5a">● hostiles</span><span style="color:#8ad0ff">● dreamers</span>
      </div>
      <div class="tt-type" style="margin-top:8px">Click a region button to travel (story unlocks required). ${ZONES[g.zoneId].sub}.</div>`;
    b.querySelectorAll('button[data-z]').forEach(btn => btn.addEventListener('click', () => {
      const z = btn.dataset.z;
      if (z !== g.zoneId) { g.travelTo(z); this.close(); }
    }));
    this._drawWorldMap();
  }

  _drawWorldMap() {
    const g = this.game;
    const cv = document.getElementById('mapcanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const S = 512, half = g.world.size / 2;
    const Z = ZONES[g.zoneId];
    const toMap = (x, z) => [S / 2 + x / half * S / 2 * 0.94, S / 2 + z / half * S / 2 * 0.94];
    // terrain shading from height samples
    const img = ctx.createImageData(S, S);
    const gc = { fairytale: [58, 92, 44], gothic: [62, 74, 66], storm: [70, 78, 92] }[Z.biome];
    for (let py = 0; py < S; py += 2) for (let px = 0; px < S; px += 2) {
      const wx = (px / S - 0.5) * g.world.size / 0.94, wz = (py / S - 0.5) * g.world.size / 0.94;
      const h = g.world.groundH(wx, wz);
      const shade = Math.min(1.6, 0.7 + h / 22);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const idx = ((py + dy) * S + px + dx) * 4;
        img.data[idx] = gc[0] * shade; img.data[idx + 1] = gc[1] * shade; img.data[idx + 2] = gc[2] * shade; img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // landmarks
    ctx.font = '11px Verdana'; ctx.textAlign = 'center';
    for (const [k, lm] of Object.entries(g.world.landmarks)) {
      const [mx, my] = toMap(lm.x, lm.z);
      if (k.startsWith('dg_')) {
        const D = DUNGEONS.find(d => d.id === k.slice(3));
        ctx.fillStyle = '#39ff88';
        ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillText((D?.type === 'raid' ? '☠ ' : '') + (D?.name || ''), mx, my - 7);
      } else if (['village', 'camp', 'castle'].includes(k)) {
        ctx.fillStyle = '#e8c86a';
        ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillText(k === 'village' ? 'Hub' : k === 'castle' ? '' : 'Camp', mx, my - 7);
      }
    }
    // guidance
    const guide = g.guidance();
    if (guide?.pos) {
      const [mx, my] = toMap(guide.pos.x, guide.pos.z);
      ctx.strokeStyle = '#ffd100'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 8 + Math.sin(Date.now() / 300) * 2, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffd100'; ctx.fillText('◆ ' + guide.label.slice(0, 40), Math.max(80, Math.min(S - 80, mx)), Math.min(S - 6, my + 22));
    }
    // player
    const [px, py] = toMap(g.player.pos.x, g.player.pos.z);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(g.player.facing) * 10, py + Math.cos(g.player.facing) * 10); ctx.stroke();
  }

  // ---------------- QUESTS ----------------
  renderQuests() {
    const g = this.game, b = this.body();
    const active = Object.keys(g.quests.active).map(id => QUESTS.find(q => q.id === id)).filter(Boolean);
    const done = QUESTS.filter(q => g.quests.isCompleted(q.id));
    if (!active.length && !done.length) {
      b.innerHTML = '<div class="tt-type" style="padding:20px;text-align:center">No quests yet. Villagers with a golden <b style="color:#ffd100">!</b> have work for you.</div>';
      return;
    }
    b.innerHTML = `
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          ${active.map(q => this._questItem(q, false)).join('') || '<div class="tt-type">Nothing active.</div>'}
          ${done.length ? `<div class="tt-type" style="margin:10px 0 4px">COMPLETED (${done.length}/${QUESTS.length})</div>` : ''}
          ${done.map(q => `<div class="qlist-item" style="opacity:.55"><span class="qi-name">✓ ${q.name}</span></div>`).join('')}
        </div>
        <div class="q-detail" style="flex:1.4;min-width:240px" id="q-detail">
          <div class="tt-type">Select a quest to read it.</div>
        </div>
      </div>`;
    b.querySelectorAll('.qlist-item[data-q]').forEach(el => el.addEventListener('click', () => {
      b.querySelectorAll('.qlist-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      this._questDetail(QUESTS.find(q => q.id === el.dataset.q));
    }));
    if (active[0]) { this._questDetail(active[0]); b.querySelector(`[data-q="${active[0].id}"]`)?.classList.add('active'); }
  }

  _questItem(q) {
    const st = this.game.quests.active[q.id];
    return `<div class="qlist-item" data-q="${q.id}">
      <div class="qi-name">${st?.done ? '✅ ' : ''}${q.name}</div>
      <div class="qi-zone">${ZONES[q.zone].name} · level ${q.level}</div></div>`;
  }

  _questDetail(q) {
    const el = document.getElementById('q-detail');
    if (!el || !q) return;
    const st = this.game.quests.active[q.id];
    el.innerHTML = `
      <h3>${q.name}</h3>
      <p>${q.text}</p>
      ${q.objectives.map((o, i) => {
        const need = o.count || 1, have = st ? Math.min(st.progress[i], need) : 0;
        return `<div class="q-obj ${have >= need ? 'done' : ''}">• ${o.label}${need > 1 ? ` — ${have}/${need}` : ''}</div>`;
      }).join('')}
      <p class="tt-type" style="margin-top:10px">Reward: ${q.reward.xp} XP${q.reward.gear ? ' + gear' : ''} · Turn in: ${this.game.npcName(q.turnin)}</p>`;
  }

  // ---------------- TALENTS ----------------
  renderTalents() {
    const p = this.game.player, b = this.body();
    b.innerHTML = `
      <div class="tt-type" style="margin-bottom:10px">${p.cls.name} — one choice per row, unlocked at levels 4/8/12/16/20.
      Choices are free to swap out of combat (tap another talent).</div>
      ${p.cls.talents.map(row => `
        <div class="talent-row">
          <div class="row-lvl">Lv ${row.lvl}</div>
          ${row.choices.map(c => {
            const locked = p.level < row.lvl;
            const picked = p.talents[row.lvl] === c.id;
            return `<div class="talent ${locked ? 'locked' : 'avail'} ${picked ? 'picked' : ''}" data-row="${row.lvl}" data-id="${c.id}"
              title="${c.name}">${c.icon}</div>`;
          }).join('')}
        </div>`).join('')}`;
    b.querySelectorAll('.talent').forEach(el => {
      const row = +el.dataset.row, id = el.dataset.id;
      const c = p.cls.talents.find(r => r.lvl === row).choices.find(x => x.id === id);
      el.addEventListener('mouseenter', (e) => {
        this.tooltip.innerHTML = `<div class="tt-name" style="color:var(--gold)">${c.icon} ${c.name}</div>
          <div style="margin-top:4px">${c.desc}</div>${p.level < row ? `<div class="tt-type" style="margin-top:4px">Unlocks at level ${row}</div>` : ''}`;
        this._placeTooltip(e);
      });
      el.addEventListener('mouseleave', () => this.hideTooltip());
      el.addEventListener('click', (e) => {
        if (p.level < row) return;
        if (p.inCombat > this.game.time) { this.game.log('Cannot change talents in combat.'); return; }
        p.talents[row] = id;
        p.runner.talents = p.talents;
        p.recalcStats();
        this.game.audio.play('quest');
        this.renderTalents();
      });
    });
  }

  // ---------------- DUNGEONS & RAIDS ----------------
  renderDungeons() {
    const g = this.game, b = this.body();
    const inv = g.net.pendingInvite;
    b.innerHTML = `
      ${inv ? `<div class="dg-card" style="border-color:var(--gold)"><div class="dg-ico">🤝</div><div style="flex:1">
        <h4>${inv.from} invites you to a group!</h4>
        <button class="btn small green" id="inv-acc">Accept</button> <button class="btn small" id="inv-dec">Decline</button></div></div>` : ''}
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
        <input id="inv-name" placeholder="invite player by name…" style="background:#0a0d0b;border:1px solid var(--line);
          border-radius:4px;color:var(--txt);padding:8px;flex:1;min-width:140px">
        <button class="btn small" id="inv-send">🤝 Invite to group</button>
        ${g.net.party.length ? `<button class="btn small danger" id="party-leave">Leave group (${g.net.party.length + 1})</button>` : ''}
        <span class="tt-type">${g.net.connected ? '🌐 online' : '📴 solo — groups need the realm server'}</span>
      </div>
      ${DUNGEONS.map(d => {
        const locked = g.player.level < d.minLevel;
        const zoneLocked = !g.unlockedZones.includes(d.zone);
        return `<div class="dg-card">
          <div class="dg-ico">${d.icon}</div>
          <div style="flex:1">
            <h4>${d.name}<span class="dg-type ${d.type}">${d.type.toUpperCase()}</span></h4>
            <div class="dg-meta">${ZONES[d.zone].name} · requires level ${d.minLevel} · loot iLvl ~${d.ilvl} · boss: ${d.boss.name}</div>
            <p>${d.desc}</p>
            <button class="btn small ${locked || zoneLocked ? '' : 'green'}" data-tp="${d.id}" ${locked || zoneLocked ? 'disabled' : ''}>
              ${zoneLocked ? '🔒 region sealed' : locked ? `🔒 level ${d.minLevel}` : '✨ Teleport group to entrance'}</button>
          </div></div>`;
      }).join('')}`;
    b.querySelectorAll('[data-tp]').forEach(btn => btn.addEventListener('click', () => {
      g.teleportGroupToDungeon(btn.dataset.tp);
      this.close();
    }));
    b.querySelector('#inv-send')?.addEventListener('click', () => {
      const name = b.querySelector('#inv-name').value.trim();
      if (name) g.net.send({ t: 'invite', name });
      if (!g.net.connected) g.log('No realm connection — run server/server.js and set its address in Settings.');
    });
    b.querySelector('#inv-acc')?.addEventListener('click', () => {
      g.net.send({ t: 'inviteAccept', fromId: inv.fromId });
      g.net.pendingInvite = null;
      this.renderDungeons();
    });
    b.querySelector('#inv-dec')?.addEventListener('click', () => { g.net.pendingInvite = null; this.renderDungeons(); });
    b.querySelector('#party-leave')?.addEventListener('click', () => { g.net.send({ t: 'leaveParty' }); this.close(); });
  }

  notifyInvite() { if (this.open === 'dungeons') this.renderDungeons(); }

  // ---------------- PVP ----------------
  openPvp() { this.openWindow('pvp'); }

  renderPvp() {
    const g = this.game, b = this.body();
    b.innerHTML = `
      <div class="pvp-hero">
        <h2>⚔ 1 v 1 ⚔</h2>
        <p>A separate mode outside your character's story. You enter as a <b>level 20</b> champion in
        <span class="q-legendary">full Legendary iLvl 60 gear</span> — so does your opponent.<br>
        No grind. No gear gap. Only reads, dodges, cooldowns and nerve.<br>
        <span style="color:var(--green)">Best of 3.</span> Online opponents when the realm finds one — otherwise a Duelist Daemon answers.</p>
      </div>
      <div class="class-pick">
        ${Object.values(CLASSES).map(c => `
          <div class="class-card ${g.player.classId === c.id ? 'sel' : ''}" data-c="${c.id}">
            <div class="cc-ico">${c.icon}</div><h4>${c.name}</h4><p>${c.desc}</p>
          </div>`).join('')}
      </div>
      <button class="btn wide green" id="pvp-go" style="font-size:16px;padding:14px">ENTER THE NULL CHAMBER</button>
      <p class="tt-type" style="text-align:center;margin-top:8px">Your real character, gear and progress are untouched — this is a sandboxed copy.</p>`;
    let pick = g.player.classId;
    b.querySelectorAll('.class-card').forEach(el => el.addEventListener('click', () => {
      pick = el.dataset.c;
      b.querySelectorAll('.class-card').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
    }));
    b.querySelector('#pvp-go').addEventListener('click', () => {
      this.close();
      g.arena.enter(pick);
    });
  }

  // ---------------- SETTINGS ----------------
  renderSettings() {
    const g = this.game, s = g.settings, b = this.body();
    b.innerHTML = `
      <div class="set-row"><span>Render quality (pixel size)</span>
        <select id="set-px">
          <option value="2.2" ${s.pixelScale === 2.2 ? 'selected' : ''}>HD (2.2×) — textured detail</option>
          <option value="3.4" ${s.pixelScale === 3.4 ? 'selected' : ''}>Classic pixel (3.4×)</option>
          <option value="4.6" ${s.pixelScale === 4.6 ? 'selected' : ''}>Chunky retro (4.6×) — fastest</option>
        </select></div>
      <div class="set-row"><span>SFX volume</span><input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
      <div class="set-row"><span>Music volume</span><input type="range" id="set-mus" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="set-row"><span>Celtic music</span><button class="btn small" id="set-muson">${g.audio.musicOn ? 'ON' : 'OFF'}</button></div>
      <div class="set-row"><span>Objective guide (arrow + hints)</span><button class="btn small" id="set-guide">${s.showGuide ? 'ON' : 'OFF'}</button></div>
      <div class="set-row"><span>Realm server (WebSocket)</span>
        <input id="set-server" placeholder="ws://host:8081" value="${localStorage.getItem('vb_server') || ''}"
          style="background:#0a0d0b;border:1px solid var(--line);border-radius:4px;color:var(--txt);padding:5px;width:180px"></div>
      ${IS_TOUCH ? '' : `<div class="tt-type" style="margin-top:14px">KEY BINDINGS</div>
      <div class="keybind-grid">
        ${[['Move', 'W A S D / arrows'], ['Jump', 'Space'], ['Autorun', 'R'], ['Skills', '1 – 0'], ['Target', 'Tab'],
          ['Interact', 'E'], ['Gear', 'C'], ['Bag', 'B'], ['Map', 'M'], ['Quests', 'L'], ['Talents', 'K'],
          ['Dungeons & Raids', 'I'], ['PvP', 'P'], ['Camera', 'mouse / right-drag'], ['Zoom', 'wheel'], ['Menu', 'Esc']]
          .map(([a, k]) => `<span>${a}</span><span class="kb">${k}</span>`).join('')}
      </div>`}`;
    b.querySelector('#set-px').addEventListener('change', (e) => { s.pixelScale = +e.target.value; g.saveSettings(); });
    b.querySelector('#set-sfx').addEventListener('input', (e) => { s.sfx = +e.target.value; g.saveSettings(); });
    b.querySelector('#set-mus').addEventListener('input', (e) => { s.music = +e.target.value; g.saveSettings(); });
    b.querySelector('#set-muson').addEventListener('click', (e) => {
      g.audio.setMusicOn(!g.audio.musicOn);
      e.target.textContent = g.audio.musicOn ? 'ON' : 'OFF';
    });
    b.querySelector('#set-guide').addEventListener('click', (e) => {
      s.showGuide = !s.showGuide; g.saveSettings();
      e.target.textContent = s.showGuide ? 'ON' : 'OFF';
      if (!s.showGuide) { document.getElementById('guide').innerHTML = ''; document.getElementById('guide-arrow').style.display = 'none'; }
    });
    b.querySelector('#set-server').addEventListener('change', (e) => {
      localStorage.setItem('vb_server', e.target.value.trim());
      g.log('Server saved. Reload the page to reconnect.');
    });
  }

  // ---------------- MAIN MENU ----------------
  renderMenu() {
    const g = this.game, b = this.body();
    b.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;align-items:center;padding:10px">
        <div class="menu-list">
          <button class="btn" id="m-resume">▶ Resume</button>
          <button class="btn" id="m-settings">⚙️ Settings</button>
          <button class="btn" id="m-pvp">🏆 PvP Arena</button>
          <button class="btn" id="m-dg">⚔️ Dungeons & Raids</button>
          <button class="btn danger" id="m-wipe">💀 Abandon character (new game)</button>
        </div>
        <div class="tt-type" style="text-align:center;margin-top:8px">
          VEILBREAK · Shard 9 · progress auto-saves<br>
          ${g.net.connected ? '🌐 realm connected' : '📴 solo mode'}</div>
      </div>`;
    b.querySelector('#m-resume').addEventListener('click', () => this.close());
    b.querySelector('#m-settings').addEventListener('click', () => this.openWindow('settings'));
    b.querySelector('#m-pvp').addEventListener('click', () => this.openWindow('pvp'));
    b.querySelector('#m-dg').addEventListener('click', () => this.openWindow('dungeons'));
    b.querySelector('#m-wipe').addEventListener('click', () => {
      if (confirm('Abandon this dreamer and start over? Your save will be erased.')) {
        g.wipeSave();
        location.reload();
      }
    });
  }

  // ---------------- DIALOGUE ----------------
  openDialogue(npc) {
    const g = this.game;
    g.quests.onTalk(npc.def.id);
    this.close();
    this.open = 'dialogue';
    this.input.uiOpen = true;
    const w = document.createElement('div');
    w.className = 'panel';
    w.id = 'dialogue';
    this.root.appendChild(w);
    this._dialogueNpc = npc;
    this._renderDialogueRoot(npc, w);
  }

  _renderDialogueRoot(npc, w) {
    const g = this.game;
    const turnins = g.quests.turninsFor(npc.def.id);
    const avail = g.quests.availableFrom(npc.def.id);
    const greet = npc.def.ambient?.[0] || '...';
    // auto-flow: if there's exactly one thing to do, do it immediately
    if (turnins.length) { this._renderTurnin(npc, w, turnins[0]); return; }
    if (avail.length) { this._renderOffer(npc, w, avail[0]); return; }
    w.innerHTML = `
      <div class="panel-body">
        <div class="dlg-name">${npc.def.icon} ${npc.name}</div>
        <div class="dlg-text">${greet}</div>
        <div class="dlg-opts">
          <div class="dlg-opt" data-x="bye">Farewell.</div>
        </div>
      </div>`;
    w.querySelector('[data-x="bye"]').addEventListener('click', () => this.close());
  }

  _renderOffer(npc, w, q) {
    const g = this.game;
    w.innerHTML = `
      <div class="panel-body">
        <div class="dlg-name">${npc.def.icon} ${npc.name} — <span style="color:#ffd100">${q.name}</span></div>
        <div class="dlg-text">${q.text}</div>
        <div class="dlg-opts">
          <div class="dlg-opt" data-x="accept"><span class="tag q">!</span>I'll do it. <span class="tt-type">(${q.reward.xp} XP${q.reward.gear ? ' + gear' : ''})</span></div>
          <div class="dlg-opt" data-x="bye">Not now.</div>
        </div>
      </div>`;
    w.querySelector('[data-x="accept"]').addEventListener('click', () => {
      g.quests.accept(q);
      this.close();
    });
    w.querySelector('[data-x="bye"]').addEventListener('click', () => this.close());
  }

  _renderTurnin(npc, w, q) {
    const g = this.game;
    w.innerHTML = `
      <div class="panel-body">
        <div class="dlg-name">${npc.def.icon} ${npc.name} — <span style="color:var(--green)">${q.name} ✓</span></div>
        <div class="dlg-text">${q.done}</div>
        <div class="dlg-opts">
          <div class="dlg-opt" data-x="complete"><span class="tag">?</span>Complete quest <span class="tt-type">(+${q.reward.xp} XP${q.reward.gear ? ' + gear' : ''})</span></div>
        </div>
      </div>`;
    w.querySelector('[data-x="complete"]').addEventListener('click', () => {
      g.quests.turnIn(q);
      // AUTO-FLOW: immediately offer the next quest from this NPC (or point elsewhere)
      const next = g.quests.availableFrom(npc.def.id);
      if (next.length) { this._renderOffer(npc, w, next[0]); return; }
      const nextTurnin = g.quests.turninsFor(npc.def.id);
      if (nextTurnin.length) { this._renderTurnin(npc, w, nextTurnin[0]); return; }
      this.close();
      const guide = g.guidance();
      if (guide) g.log(`◆ Next: ${guide.label}`);
    });
  }
}
