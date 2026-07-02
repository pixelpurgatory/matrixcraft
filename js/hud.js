// ============ HUD — action bars, frames, tracker, guidance, minimap ============
import { THREE } from './engine.js';
import { Events } from './combat.js';
import { IS_TOUCH } from './input.js';
import { QUESTS } from './data_quests.js';

export class HUD {
  constructor(game, input) {
    this.game = game;
    this.input = input;
    this.root = document.getElementById('hud');
    this._build();
    this._bindEvents();
    this.guideBeacon = null;
  }

  _build() {
    this.root.innerHTML = `
      <div id="pframe" class="unitframe">
        <div class="uf-name"><span id="p-name">—</span><span class="lvl" id="p-lvl">1</span></div>
        <div class="bar hp"><div class="fill" id="p-hp"></div><div class="bar-txt" id="p-hp-t"></div></div>
        <div class="bar mana" id="p-res-bar"><div class="fill" id="p-res"></div><div class="bar-txt" id="p-res-t"></div></div>
      </div>
      <div id="tframe" class="unitframe" style="display:none">
        <div class="uf-name"><span id="t-name">—</span><span class="lvl" id="t-lvl"></span></div>
        <div class="bar hp"><div class="fill" id="t-hp"></div><div class="bar-txt" id="t-hp-t"></div></div>
      </div>
      <div id="bossframe" class="unitframe">
        <div class="uf-name"><span id="b-name">—</span><span id="b-icon">☠</span></div>
        <div class="bar hp"><div class="fill" id="b-hp"></div><div class="bar-txt" id="b-hp-t"></div></div>
      </div>
      <div id="buffs"></div>
      <div id="party"></div>
      <div id="minimap"><canvas width="128" height="128"></canvas><div class="mm-zone"></div></div>
      <div id="sysbuttons"></div>
      <div id="tracker"></div>
      <div id="guide" style="position:absolute;bottom:calc(88px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);
        text-align:center;color:#ffe9a8;font-size:12px;text-shadow:0 1px 3px #000;pointer-events:none;max-width:90vw"></div>
      <div id="guide-arrow" style="position:absolute;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;
        border-bottom:16px solid #ffd100;filter:drop-shadow(0 0 4px #000);display:none;pointer-events:none"></div>
      <div id="zonebanner"><div class="zb-name"></div><div class="zb-sub"></div></div>
      <div id="castbar"><div style="font-size:10px;color:var(--gold)" id="cast-name"></div>
        <div class="bar"><div class="fill" id="cast-fill"></div></div></div>
      <div id="arena-score"></div>
      <div id="xpbar"><div class="bar xp"><div class="fill" id="xp-fill"></div></div></div>
      <div id="actionbar"></div>
      <div id="interact"></div>
      <div id="gamelog"></div>
      <div id="floaters"></div>
    `;
    this._buildActionBar();
    this._buildSysButtons();
    if (IS_TOUCH) this._buildTouchButtons();
    this.mmCtx = this.root.querySelector('#minimap canvas').getContext('2d');
    document.getElementById('interact').addEventListener('click', () => this.game.doInteract());
  }

  _buildActionBar() {
    const bar = this.root.querySelector('#actionbar');
    bar.innerHTML = '';
    const p = this.game.player;
    if (!p) return;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    p.cls.skills.forEach((s, i) => {
      const b = document.createElement('div');
      b.className = 'abtn clickable';
      b.id = 'ab-' + i;
      b.innerHTML = `<span class="key">${keys[i]}</span><span class="icon">${s.icon}</span><div class="cd" style="display:none"></div>`;
      b.title = s.name;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); p.useSkill(i); });
      b.addEventListener('mouseenter', (e) => this.game.ui.showSkillTooltip(s, e));
      b.addEventListener('mouseleave', () => this.game.ui.hideTooltip());
      bar.appendChild(b);
    });
  }

  _buildSysButtons() {
    const sys = this.root.querySelector('#sysbuttons');
    const btns = [
      ['🧍', 'Gear (C)', () => this.game.ui.toggle('character')],
      ['🎒', 'Bag (B)', () => this.game.ui.toggle('bag')],
      ['🗺️', 'Map (M)', () => this.game.ui.toggle('map')],
      ['📜', 'Quests (L)', () => this.game.ui.toggle('quests')],
      ['🌳', 'Talents (K)', () => this.game.ui.toggle('talents')],
      ['⚔️', 'Dungeons & Raids (I)', () => this.game.ui.toggle('dungeons')],
      ['🏆', 'PvP Arena (P)', () => this.game.ui.toggle('pvp')],
      ['⚙️', 'Menu (Esc)', () => this.game.ui.toggle('menu')],
    ];
    for (const [ico, tip, fn] of btns) {
      const b = document.createElement('div');
      b.className = 'sysbtn clickable';
      b.textContent = ico;
      b.title = tip;
      b.addEventListener('click', fn);
      sys.appendChild(b);
    }
  }

  _buildTouchButtons() {
    const wrap = document.getElementById('touch-buttons');
    wrap.innerHTML = '';
    const p = this.game.player;
    if (!p) return;
    // order: big attack (skill 0), then others; jump; interact handled by prompt
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const i of order) {
      const s = p.cls.skills[i];
      const b = document.createElement('div');
      b.className = 'tbtn' + (i === 0 ? ' big' : '');
      b.id = 'tb-' + i;
      b.innerHTML = `${s.icon}<div class="cd" style="display:none"></div>`;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); p.useSkill(i); }, { passive: false });
      wrap.appendChild(b);
    }
    const jump = document.createElement('div');
    jump.className = 'tbtn';
    jump.textContent = '⤴';
    jump.addEventListener('touchstart', (e) => { e.preventDefault(); p.jump(); }, { passive: false });
    wrap.appendChild(jump);
    const tgt = document.createElement('div');
    tgt.className = 'tbtn';
    tgt.textContent = '🎯';
    tgt.addEventListener('touchstart', (e) => { e.preventDefault(); p.selectTarget(); }, { passive: false });
    wrap.appendChild(tgt);
  }

  rebuildForClass() { this._buildActionBar(); if (IS_TOUCH) this._buildTouchButtons(); }

  _bindEvents() {
    Events.on('hp', (a) => { if (a === this.game.player || a === this.game.target) this.renderFrames(); });
    Events.on('target', () => this.renderFrames());
    Events.on('xp', () => this.renderXp());
    Events.on('level', () => { this.renderFrames(); this.renderXp(); });
    Events.on('resource', () => this.renderFrames());
    Events.on('buffs', () => this.renderBuffs());
    Events.on('cast', (skill, dur) => {
      const cb = document.getElementById('castbar');
      cb.style.display = 'block';
      document.getElementById('cast-name').textContent = skill.name;
      this._castStart = this.game.time; this._castDur = dur;
    });
    Events.on('castend', () => { document.getElementById('castbar').style.display = 'none'; this._castStart = null; });
    Events.on('classswap', () => { this.rebuildForClass(); this.renderFrames(); this.renderXp(); });
    Events.on('quests', () => this.renderTracker());
    Events.on('arena', (st) => {
      const el = document.getElementById('arena-score');
      if (!st) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.textContent = `YOU ${st.score[0]} — ${st.score[1]} THEM   ·   round ${st.round}`;
    });
    Events.on('bossengage', () => this.renderFrames());
  }

  renderFrames() {
    const g = this.game, p = g.player;
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`; };
    const txt = (id, s) => { const el = document.getElementById(id); if (el) el.textContent = s; };
    txt('p-name', p.name); txt('p-lvl', 'Lv ' + p.level);
    set('p-hp', p.hp / p.maxHp); txt('p-hp-t', `${Math.ceil(p.hp)} / ${p.maxHp}${p.shield > 0 ? ' (+' + Math.round(p.shield) + ')' : ''}`);
    set('p-res', (p.resource ?? 0) / (p.maxResource || 100)); txt('p-res-t', `${Math.round(p.resource ?? 0)}`);
    document.getElementById('p-res-bar').querySelector('.fill').style.background = p.cls.resourceColor;
    const t = g.target;
    const tf = document.getElementById('tframe');
    if (t && t.alive) {
      tf.style.display = 'block';
      txt('t-name', `${t.icon} ${t.name}`); txt('t-lvl', t.isBoss ? '☠' : 'Lv ' + t.level);
      set('t-hp', t.hp / t.maxHp); txt('t-hp-t', `${Math.ceil(t.hp)} / ${t.maxHp}`);
    } else tf.style.display = 'none';
    // boss frame: any engaged boss
    const boss = g.mobs.find(m => m.isBoss && m.alive && m.state === 'chase');
    const bf = document.getElementById('bossframe');
    if (boss) {
      bf.style.display = 'block';
      txt('b-name', boss.name);
      set('b-hp', boss.hp / boss.maxHp); txt('b-hp-t', `${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    } else bf.style.display = 'none';
  }

  renderXp() {
    const p = this.game.player;
    if (!p) return;
    const need = p.level >= 20 ? 1 : (window.XP_TABLE?.[p.level] ?? 100);
    document.getElementById('xp-fill').style.transform = `scaleX(${p.level >= 20 ? 1 : Math.min(1, p.xp / need)})`;
  }

  renderBuffs() {
    const el = document.getElementById('buffs');
    const p = this.game.player;
    if (!el || !p) return;
    el.innerHTML = '';
    for (const b of p.buffs.slice(0, 10)) {
      const d = document.createElement('div');
      d.className = 'buff';
      d.title = b.name;
      const left = Math.max(0, b.until - this.game.time);
      d.innerHTML = `${b.icon || '✦'}${b.stacks > 1 ? `<span class="t">${b.stacks}</span>` : `<span class="t">${Math.ceil(left)}</span>`}`;
      el.appendChild(d);
    }
  }

  renderTracker() {
    const el = document.getElementById('tracker');
    const g = this.game;
    if (!el || !g.quests) return;
    const list = g.quests.trackedList();
    if (!list.length) { el.innerHTML = ''; return; }
    let h = '<h4>OBJECTIVES</h4>';
    for (const { q, st } of list) {
      h += `<div class="tq"><div class="tq-name">${q.name}</div>`;
      if (st.done) h += `<div class="tq-obj done">Return to ${g.npcName(q.turnin)}</div>`;
      else q.objectives.forEach((o, i) => {
        const need = o.count || 1, have = Math.min(st.progress[i], need);
        h += `<div class="tq-obj ${have >= need ? 'done' : ''}">${o.label}${need > 1 ? ` — ${have}/${need}` : ''}</div>`;
      });
      h += '</div>';
    }
    el.innerHTML = h;
  }

  renderParty() {
    const el = document.getElementById('party');
    const net = this.game.net;
    el.innerHTML = '';
    for (const m of net.party) {
      const r = net.remotes.get(m.id);
      const hp = r ? r.hp / (r.maxHp || 100) : 1;
      const d = document.createElement('div');
      d.className = 'pf';
      d.innerHTML = `<div>${m.name} <span style="color:var(--gold)">${m.level ?? ''}</span></div>
        <div class="bar hp"><div class="fill" style="transform:scaleX(${hp})"></div></div>`;
      el.appendChild(d);
    }
  }

  // per-frame updates (cooldowns, cast fill, interact, guidance, bubbles, minimap)
  update(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    const t = g.time;

    // cast bar fill
    if (this._castStart != null) {
      const f = Math.min(1, (t - this._castStart) / this._castDur);
      document.getElementById('cast-fill').style.transform = `scaleX(${f})`;
    }

    // cooldown sweeps (10 buttons, cheap DOM)
    p.cls.skills.forEach((s, i) => {
      const readyAt = p.runner.cooldowns[s.id] || 0;
      const left = readyAt - t;
      for (const id of ['ab-' + i, 'tb-' + i]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const cd = el.querySelector('.cd');
        const onGcd = t < p.runner.gcdUntil && s.kind !== 'mobility';
        if (left > 0) { cd.style.display = 'flex'; cd.textContent = left > 1 ? Math.ceil(left) : left.toFixed(1); el.classList.add('oncd'); }
        else { cd.style.display = 'none'; el.classList.remove('oncd'); }
        el.classList.toggle('no-res', !p.runner.canAfford(s));
        el.style.opacity = onGcd && left <= 0 ? 0.55 : 1;
      }
    });

    // buff timers refresh ~2Hz
    if (!this._buffT || t - this._buffT > 0.5) { this._buffT = t; this.renderBuffs(); if (g.net.party.length) this.renderParty(); }

    // interact prompt
    const it = g.nearestInteract();
    const ip = document.getElementById('interact');
    if (it) { ip.style.display = 'block'; ip.innerHTML = `<b>[E]</b> ${it.label}`; }
    else ip.style.display = 'none';

    // ---- guidance ----
    if (g.settings.showGuide) {
      const guide = g.guidance();
      const gl = document.getElementById('guide');
      const ga = document.getElementById('guide-arrow');
      if (guide) {
        let dist = '';
        if (guide.pos) {
          const d = Math.hypot(guide.pos.x - p.pos.x, guide.pos.z - p.pos.z);
          dist = ` — ${Math.round(d)}m`;
          // screen arrow
          const v = guide.pos.clone(); v.y = g.groundY(guide.pos) + 2;
          v.project(g.engine.camera);
          const onScreen = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.85;
          if (onScreen && d > 8) {
            ga.style.display = 'block';
            ga.style.left = ((v.x * 0.5 + 0.5) * innerWidth - 9) + 'px';
            ga.style.top = ((-v.y * 0.5 + 0.5) * innerHeight - 26 + Math.sin(t * 4) * 5) + 'px';
            ga.style.transform = 'rotate(180deg)';
          } else if (d > 8) {
            // edge arrow pointing toward it
            const ang = Math.atan2(guide.pos.x - p.pos.x, guide.pos.z - p.pos.z) - this.game.cam.yaw + Math.PI;
            const R = Math.min(innerWidth, innerHeight) * 0.38;
            ga.style.display = 'block';
            ga.style.left = (innerWidth / 2 + Math.sin(ang) * R - 9) + 'px';
            ga.style.top = (innerHeight / 2 - Math.cos(ang) * R - 8) + 'px';
            ga.style.transform = `rotate(${ang.toFixed(2)}rad)`;
          } else ga.style.display = 'none';
        } else ga.style.display = 'none';
        gl.innerHTML = `<span style="color:#ffd100">◆</span> ${guide.label}${dist}`;
      } else { gl.innerHTML = ''; ga.style.display = 'none'; }
    }

    // ---- speech bubbles (rendered as positioned floaters) ----
    // (bubbles list lives in game; render as DOM labels)
    let bubbleWrap = document.getElementById('bubbles');
    if (!bubbleWrap) {
      bubbleWrap = document.createElement('div');
      bubbleWrap.id = 'bubbles';
      bubbleWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      this.root.appendChild(bubbleWrap);
    }
    bubbleWrap.innerHTML = '';
    for (const b of g.bubbles) {
      const v = b.pos.clone(); v.y += 2.6;
      v.project(g.engine.camera);
      if (v.z > 1) continue;
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;transform:translate(-50%,-100%);max-width:220px;background:#0b0f0de8;
        border:1px solid var(--line);border-radius:6px;padding:5px 9px;font-size:11px;color:#e8e4d4;text-align:center;
        left:${(v.x * 0.5 + 0.5) * 100}%;top:${(-v.y * 0.5 + 0.5) * 100}%`;
      d.textContent = b.text;
      bubbleWrap.appendChild(d);
    }

    // ---- minimap (2 Hz) ----
    if ((!this._mmT || t - this._mmT > 0.5) && !g.inDungeon && !g.inArena) {
      this._mmT = t;
      this._drawMinimap();
    }
  }

  _drawMinimap() {
    const g = this.game, p = g.player, ctx = this.mmCtx;
    const S = 128, range = 90;
    ctx.fillStyle = '#0a120c'; ctx.fillRect(0, 0, S, S);
    const toMap = (x, z) => {
      // rotate by camera yaw so up = forward
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const cy = Math.cos(-g.cam.yaw + Math.PI), sy = Math.sin(-g.cam.yaw + Math.PI);
      const rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
      return [S / 2 + rx / range * S / 2, S / 2 + rz / range * S / 2];
    };
    // landmarks
    for (const [k, lm] of Object.entries(g.world.landmarks)) {
      const [mx, my] = toMap(lm.x, lm.z);
      if (mx < 2 || mx > S - 2 || my < 2 || my > S - 2) continue;
      ctx.fillStyle = k.startsWith('dg_') ? '#39ff88' : '#c8b060';
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    }
    // mobs
    for (const m of g.mobs) {
      if (!m.alive) continue;
      const [mx, my] = toMap(m.pos.x, m.pos.z);
      if (mx < 1 || mx > S - 1 || my < 1 || my > S - 1) continue;
      ctx.fillStyle = m.state === 'chase' ? '#ff5544' : '#a06a5a';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    // npcs
    for (const n of g.npcs) {
      const [mx, my] = toMap(n.pos.x, n.pos.z);
      if (mx < 1 || mx > S - 1 || my < 1 || my > S - 1) continue;
      ctx.fillStyle = n.marker.visible ? '#ffd100' : '#7fd0ff';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // remote players
    for (const r of g.net.remotes.values()) {
      const [mx, my] = toMap(r.group.position.x, r.group.position.z);
      if (mx > 1 && mx < S - 1 && my > 1 && my < S - 1) { ctx.fillStyle = '#8ad0ff'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3); }
    }
    // player
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 2.5, 0, 7); ctx.fill();
    this.root.querySelector('.mm-zone').textContent = g.inDungeon ? '' : (g.zoneId && g.world && g.zoneId in g.world ? '' : '');
    this.root.querySelector('.mm-zone').textContent = g.zoneId ? (g.zoneId.charAt(0).toUpperCase() + g.zoneId.slice(1)) : '';
  }
}
