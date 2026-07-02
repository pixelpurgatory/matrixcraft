// ============ MAIN — boot, title, character creation, game loop ============
import { THREE } from './engine.js';
import { Game } from './game.js';
import { Input, IS_TOUCH } from './input.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { CLASSES, XP_TABLE } from './data_classes.js';
import { INTRO_TEXT } from './data_quests.js';

window.XP_TABLE = XP_TABLE; // used by HUD xp bar

// ---------------- boot screen matrix rain ----------------
function startRain() {
  const cv = document.getElementById('boot-rain');
  const ctx = cv.getContext('2d');
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
  fit(); addEventListener('resize', fit);
  const cols = () => Math.floor(cv.width / 16);
  let drops = new Array(cols()).fill(0).map(() => Math.random() * -50);
  const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789VEILBREAK';
  const timer = setInterval(() => {
    ctx.fillStyle = 'rgba(2,4,3,0.12)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '14px monospace';
    if (drops.length !== cols()) drops = new Array(cols()).fill(0).map(() => Math.random() * -50);
    for (let i = 0; i < drops.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillStyle = Math.random() < 0.08 ? '#b0ffcf' : '#1f9f56';
      ctx.fillText(ch, i * 16, drops[i] * 16);
      if (drops[i] * 16 > cv.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }, 50);
  return () => { clearInterval(timer); };
}

// ---------------- title / character creation ----------------
function showTitle(game, onDone) {
  const boot = document.getElementById('boot');
  const status = document.getElementById('boot-status');
  const inner = boot.querySelector('.boot-inner');
  const hasSave = game.hasSave();
  status.remove();
  const menu = document.createElement('div');
  menu.style.cssText = 'margin-top:40px;display:flex;flex-direction:column;gap:10px;align-items:center';
  menu.innerHTML = `
    ${hasSave ? '<button class="btn" id="bt-continue" style="min-width:260px;font-size:15px">▶ CONTINUE THE DREAM</button>' : ''}
    <button class="btn ${hasSave ? '' : 'green'}" id="bt-new" style="min-width:260px;font-size:15px">✦ NEW DREAMER</button>
    <div class="tt-type" style="color:#5a7a68;font-size:11px;margin-top:8px;max-width:340px;text-align:center">
      an online third-person RPG · 3 kingdoms · 6 dungeons · 3 raids · 1v1 arenas<br>
      ${IS_TOUCH ? 'left thumb = move · right thumb = camera · tap skills' : 'WASD + mouse · 1–0 skills · E interact · Tab target'}</div>`;
  inner.appendChild(menu);

  document.getElementById('bt-new')?.addEventListener('click', () => {
    menu.remove();
    showClassSelect(inner, (classId, name) => onDone('new', classId, name));
  });
  document.getElementById('bt-continue')?.addEventListener('click', () => onDone('load'));
}

function showClassSelect(inner, cb) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:28px;max-width:640px';
  wrap.innerHTML = `
    <input id="cc-name" maxlength="16" placeholder="name your dreamer…" value=""
      style="background:#0a0d0b;border:1px solid var(--line);border-radius:4px;color:var(--txt);padding:10px;width:min(80vw,300px);text-align:center;font-size:14px">
    <div class="class-pick" style="margin-top:16px">
      ${Object.values(CLASSES).map(c => `
        <div class="class-card" data-c="${c.id}">
          <div class="cc-ico">${c.icon}</div><h4>${c.name}</h4><p>${c.desc}</p>
        </div>`).join('')}
    </div>
    <button class="btn green" id="cc-go" style="width:100%;margin-top:14px;font-size:15px" disabled>WAKE UP</button>`;
  inner.appendChild(wrap);
  let pick = null;
  wrap.querySelectorAll('.class-card').forEach(el => el.addEventListener('click', () => {
    pick = el.dataset.c;
    wrap.querySelectorAll('.class-card').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
    wrap.querySelector('#cc-go').disabled = false;
  }));
  wrap.querySelector('#cc-go').addEventListener('click', () => {
    if (!pick) return;
    const name = wrap.querySelector('#cc-name').value.trim() || 'The Anomaly';
    cb(pick, name);
  });
}

function showIntro(onDone) {
  const boot = document.getElementById('boot');
  boot.querySelector('.boot-inner').innerHTML = `<div id="intro" style="font-family:'Courier New',monospace;color:var(--green);
    font-size:min(3.8vw,16px);line-height:1.9;text-align:center;white-space:pre-wrap;max-width:600px;min-height:50vh"></div>
    <button class="btn green" id="intro-skip" style="margin-top:20px">begin ➤</button>`;
  const el = document.getElementById('intro');
  let li = 0, timer = setInterval(() => {
    if (li >= INTRO_TEXT.length) { clearInterval(timer); return; }
    el.textContent += INTRO_TEXT[li++] + '\n';
  }, 700);
  document.getElementById('intro-skip').addEventListener('click', () => { clearInterval(timer); onDone(); });
}

// ---------------- extra fixed DOM (death screen, glitch overlay) ----------------
function buildOverlays() {
  const d = document.createElement('div');
  d.id = 'deathveil';
  d.innerHTML = `<h2>DE-RENDERED</h2><div id="death-cause" class="tt-type" style="color:#c88">…</div>
    <div style="color:#9a8878;font-size:12px">the simulation is reloading you</div>`;
  document.body.appendChild(d);
  const g = document.createElement('canvas');
  g.id = 'glitch';
  document.body.appendChild(g);
  const pop = document.createElement('div');
  pop.id = 'lore-pop';
  pop.innerHTML = `<h4>RECOVERED FRAGMENT</h4><div class="lore-txt"></div><button class="btn green">[ jack out ]</button>`;
  document.body.appendChild(pop);
  // glitch canvas: green noise bars drawn when flashed
  const ctx = g.getContext('2d');
  const draw = () => {
    if (g.classList.contains('on')) {
      g.width = innerWidth / 3; g.height = innerHeight / 3;
      ctx.clearRect(0, 0, g.width, g.height);
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(57,255,136,${Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * g.width, Math.random() * g.height, Math.random() * 120, 2 + Math.random() * 6);
      }
    }
    requestAnimationFrame(draw);
  };
  draw();
}

// ---------------- click-to-target ----------------
function setupClickTarget(game, input) {
  const ray = new THREE.Raycaster();
  input.on('canvasclick', () => {
    if (input.uiOpen || !game.player) return;
    ray.setFromCamera(new THREE.Vector2(0, 0), game.engine.camera);
    let best = null, bd = 1e9;
    for (const m of game.mobs) {
      if (!m.alive) continue;
      const p = m.pos.clone(); p.y += 1;
      const d = ray.ray.distanceToPoint(p);
      const dist = game.player.distTo(m);
      if (d < 1.6 && dist < 45 && dist < bd) { bd = dist; best = m; }
    }
    if (best) game.setTarget(best);
  });
}

// ---------------- boot ----------------
const stopRain = startRain();
buildOverlays();

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.game = game; // console/debug handle
const input = new Input();
game.ui = new UI(game, input);
game.settingsApplied = game.saveSettings();

showTitle(game, (mode, classId, name) => {
  const start = () => {
    document.getElementById('boot').style.display = 'none';
    stopRain();
    document.getElementById('hud').classList.remove('hidden');
    if (IS_TOUCH) { document.getElementById('touch-ui').classList.remove('hidden'); document.body.classList.add('touch'); }
    if (mode === 'new') game.newGame(classId, name);
    else game.loadGame(game.readSave());
    game.hud = new HUD(game, input);
    game.hud.renderFrames(); game.hud.renderXp(); game.hud.renderTracker();
    setupClickTarget(game, input);
    game.audio.unlock();
    // guidance nudges at the very start
    if (mode === 'new') {
      game.schedule(2, () => game.log('◆ Follow the golden arrow — Elder Maren in the village has your first task.'));
      game.schedule(6, () => game.log(IS_TOUCH ? 'Left thumb moves you. Right side of the screen turns the camera.' : 'Click the world to lock the mouse. WASD to move, 1–0 for skills, E to interact.'));
    }
    // autosave
    setInterval(() => game.save(), 10000);
    addEventListener('beforeunload', () => game.save());
  };
  if (mode === 'new') showIntro(start);
  else start();
});

// ---------------- main loop (fixed-ish step, 60fps target) ----------------
let last = performance.now();
let fpsAccum = 0, fpsN = 0, autoTuned = false;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.player) { game.engine.render(now / 1000, 0.05, 0); return; }
  // hit-stop: the world freezes for a few frames on heavy impacts
  if (game.hitStopT > 0) { game.hitStopT -= dt; dt *= 0.06; }

  const look = input.poll();
  game.player.update(dt, input, game.cam.yaw);
  game.update(dt);
  game.cam.update(dt, look, game.player.pos, (p) => game.groundY(p));
  game.hud?.update(dt);

  // auto quality: if we can't hold ~50fps for a while, chunk up the pixels once
  fpsAccum += dt; fpsN++;
  if (fpsAccum > 5) {
    const fps = fpsN / fpsAccum;
    fpsAccum = 0; fpsN = 0;
    if (!autoTuned && fps < 48 && game.settings.pixelScale < 4.6) {
      autoTuned = true;
      game.settings.pixelScale = 4.6;
      game.saveSettings();
      game.log('Auto-tuned render scale for smoother FPS (change it in Settings).');
    }
  }
}
requestAnimationFrame(loop);
