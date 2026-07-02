// ============ AUDIO — procedural SFX + generative CELTIC music engine ============
// The music is composed live in WebAudio: a low pipes drone, harp arpeggios,
// a flute lead with vibrato + grace-note ornaments over dorian/pentatonic modes,
// and a bodhrán that enters when swords come out. Every zone, dungeon, boss and
// the arena get their own key, tempo and darkness. No audio files needed.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.sfxVol = 0.5;
    this.musicVol = 0.35;
    this._mood = 'meadow';
    this._combat = false;
    this._boss = false;
    this._beatTimer = null;
    this._beat = 0;
    this._phrase = [];
    this._phraseIdx = 0;
  }

  _ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
      // gentle lo-fi: soft lowpass on music for warmth
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
      this.droneBus = this.ctx.createGain(); this.droneBus.gain.value = 0; this.droneBus.connect(this.musicBus);
      this.drumBus = this.ctx.createGain(); this.drumBus.gain.value = 0; this.drumBus.connect(this.musicBus);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  unlock() { this._ensure(); if (this.musicOn && !this._beatTimer) this.music(this._mood); }

  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (this.sfxBus) this.sfxBus.gain.value = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
  }

  // =================== SFX (unchanged voice, procedural) ===================
  _osc(type, f0, f1, dur, vol = 0.3, delay = 0, bus = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.2, lp = 2000, delay = 0, bus = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    src.start(t);
  }

  play(id) {
    if (!this.enabled) return;
    this._ensure();
    switch (id) {
      case 'swing': this._noise(0.12, 0.25, 1200); this._osc('square', 220, 90, 0.1, 0.12); break;
      case 'cast': this._osc('sine', 500, 900, 0.25, 0.15); this._osc('sine', 750, 1200, 0.3, 0.08, 0.05); break;
      case 'hit': this._noise(0.08, 0.3, 900); this._osc('triangle', 160, 60, 0.12, 0.2); break;
      case 'dash': this._noise(0.2, 0.2, 3000); this._osc('sine', 300, 700, 0.2, 0.1); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, f, 0.35, 0.2, i * 0.09)); break;
      case 'quest': this._osc('triangle', 587, 587, 0.2, 0.18); this._osc('triangle', 880, 880, 0.3, 0.15, 0.12); break;
      case 'questdone': [659, 784, 988].forEach((f, i) => this._osc('triangle', f, f, 0.3, 0.18, i * 0.1)); break;
      case 'loot': this._osc('triangle', 700, 1100, 0.18, 0.15); this._osc('triangle', 1100, 1500, 0.2, 0.1, 0.08); break;
      case 'equip': this._noise(0.1, 0.2, 2500); this._osc('square', 180, 140, 0.1, 0.08); break;
      case 'howl': this._osc('sawtooth', 300, 500, 0.9, 0.12); this._osc('sawtooth', 295, 490, 0.9, 0.1, 0.05); break;
      case 'moan': this._osc('sawtooth', 120, 70, 1.0, 0.12); break;
      case 'die': this._osc('sawtooth', 200, 40, 0.6, 0.2); this._noise(0.4, 0.15, 500); break;
      case 'boss': this._osc('sawtooth', 80, 55, 1.4, 0.3); this._noise(1, 0.2, 300); break;
      case 'seam': [220, 330, 440, 660, 880].forEach((f, i) => this._osc('sine', f, f * 1.01, 1.6, 0.12, i * 0.15)); break;
      case 'glitch': for (let i = 0; i < 6; i++) this._osc('square', 200 + Math.random() * 2000, 100 + Math.random() * 1500, 0.06, 0.08, i * 0.04); break;
      case 'dungeon': this._osc('sine', 110, 55, 2, 0.25); this._noise(1.5, 0.1, 400); break;
      case 'encounter': this._osc('triangle', 440, 554, 0.4, 0.12); break;
      case 'death': this._osc('sawtooth', 150, 30, 2, 0.25); break;
      case 'pvp': [392, 523, 659].forEach((f, i) => this._osc('square', f, f, 0.25, 0.1, i * 0.08)); break;
      case 'ui': this._osc('sine', 800, 950, 0.06, 0.08); break;
    }
  }

  // =================== CELTIC MUSIC ENGINE ===================
  // Moods: root (Hz), mode intervals (semitones), tempo (BPM of 6/8 eighth notes),
  // darkness 0..1 (drives timbre + register), harp pattern, drone strength.
  static MOODS = {
    meadow:  { root: 293.66, mode: [0, 2, 3, 5, 7, 9, 10], tempo: 116, dark: 0.1, drone: 0.5, harp: true },   // D dorian — green hills
    dirge:   { root: 220.00, mode: [0, 2, 3, 5, 7, 8, 10], tempo: 84,  dark: 0.6, drone: 0.8, harp: true },   // A aeolian — mourning city
    storm:   { root: 164.81, mode: [0, 2, 3, 5, 7, 8, 10], tempo: 96,  dark: 0.8, drone: 1.0, harp: false },  // E aeolian — the mountain
    dungeon: { root: 146.83, mode: [0, 1, 3, 5, 7, 8, 10], tempo: 72,  dark: 0.9, drone: 1.0, harp: false },  // D phrygian — under stone
    glitch:  { root: 174.61, mode: [0, 3, 5, 6, 7, 10],    tempo: 100, dark: 1.0, drone: 0.9, harp: false },  // blues-tinged wrongness
    arena:   { root: 196.00, mode: [0, 2, 3, 5, 7, 9, 10], tempo: 132, dark: 0.5, drone: 0.7, harp: true },   // G dorian — the duel jig
  };

  music(mood) {
    this._mood = mood;
    if (!this.ctx || !this.musicOn) return;
    this._stopMusic();
    const M = GameAudio.MOODS[mood] || GameAudio.MOODS.meadow;
    this._M = M;
    // ---- drone: two detuned reeds + a fifth, like distant pipes ----
    this._droneNodes = [];
    const mkDrone = (f, vol, type = 'sawtooth') => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), flt = this.ctx.createBiquadFilter();
      o.type = type; o.frequency.value = f;
      flt.type = 'lowpass'; flt.frequency.value = 700 - M.dark * 300; flt.Q.value = 2;
      g.gain.value = vol;
      o.connect(flt); flt.connect(g); g.connect(this.droneBus);
      o.start();
      this._droneNodes.push(o);
      return o;
    };
    mkDrone(M.root / 2, 0.05);
    mkDrone(M.root / 2 * 1.005, 0.04);
    mkDrone(M.root / 2 * 1.498, 0.025);
    this.droneBus.gain.setTargetAtTime(0.7 * M.drone, this.ctx.currentTime, 2);

    // ---- beat scheduler: 6/8 feel ----
    this._beat = 0;
    this._phrase = [];
    const beatDur = 60 / M.tempo; // one eighth note
    this._beatTimer = setInterval(() => this._onBeat(beatDur), beatDur * 1000);
  }

  _scaleFreq(deg, octave = 0) {
    const M = this._M;
    const n = M.mode.length;
    const idx = ((deg % n) + n) % n;
    const oct = octave + Math.floor(deg / n);
    return M.root * Math.pow(2, (M.mode[idx] + 12 * oct) / 12);
  }

  // harp pluck: triangle, quick decay
  _pluck(freq, vol, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 1.2);
  }

  // flute: sine w/ vibrato LFO + soft attack; optional grace note ornament
  _flute(freq, dur, vol, delay = 0, grace = false) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator(), lfoG = this.ctx.createGain();
    o.type = 'sine';
    lfo.type = 'sine'; lfo.frequency.value = 5.5; lfoG.gain.value = freq * 0.007;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    if (grace) {
      o.frequency.setValueAtTime(freq * 1.122, t);        // grace note a tone above
      o.frequency.setValueAtTime(freq, t + 0.07);
    } else o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  // bodhrán: low thump (dum) + higher tak
  _drum(kind, vol, delay = 0) {
    if (kind === 'dum') { this._osc('sine', 90, 45, 0.18, vol, delay, this.drumBus); this._noise(0.05, vol * 0.4, 400, delay, this.drumBus); }
    else this._noise(0.06, vol, 1800, delay, this.drumBus);
  }

  _newPhrase() {
    // generate a celtic-feel phrase: random walk with leaps home to root/fifth
    const len = 12 + Math.floor(Math.random() * 12);
    const ph = [];
    let deg = [0, 2, 4][Math.floor(Math.random() * 3)];
    for (let i = 0; i < len; i++) {
      const r = Math.random();
      if (r < 0.35) deg += 1;
      else if (r < 0.6) deg -= 1;
      else if (r < 0.72) deg += 2;
      else if (r < 0.82) deg -= 2;
      else if (r < 0.9) deg = 4;   // fifth
      else deg = 0;                 // home
      deg = Math.max(-2, Math.min(9, deg));
      // rhythm in 6/8: mostly eighths, some dotted quarters
      const holdBeats = Math.random() < 0.2 ? 3 : Math.random() < 0.35 ? 2 : 1;
      ph.push({ deg, holdBeats, grace: Math.random() < 0.22 });
      i += holdBeats - 1;
    }
    // end phrases on root or fifth
    ph.push({ deg: Math.random() < 0.5 ? 0 : 4, holdBeats: 3, grace: false });
    return ph;
  }

  _onBeat(beatDur) {
    if (!this.ctx || !this.musicOn) return;
    const M = this._M;
    const b = this._beat++;
    const six = b % 6;

    // ---- drums (combat/arena only, 6/8 bodhrán) ----
    const drumsOn = this._combat || this._mood === 'arena' || this._boss;
    this.drumBus.gain.setTargetAtTime(drumsOn ? 0.9 : 0.0, this.ctx.currentTime, 0.8);
    if (drumsOn) {
      if (six === 0) this._drum('dum', 0.5);
      if (six === 3) this._drum('dum', 0.3);
      if (six === 2 || six === 5) this._drum('tak', 0.18);
      if (this._boss && six === 4) this._drum('tak', 0.25);
    }

    // ---- harp arpeggio on bar starts ----
    if (M.harp && six === 0 && Math.random() < 0.8) {
      const chordDegs = Math.random() < 0.5 ? [0, 2, 4] : [-2, 0, 2];
      chordDegs.forEach((d, i) => this._pluck(this._scaleFreq(d, 0), 0.10 - M.dark * 0.04, i * beatDur * 0.32));
    }
    // dark moods: sparse low bell instead
    if (!M.harp && six === 0 && Math.random() < 0.4) {
      this._pluck(this._scaleFreq(0, -1), 0.09);
    }

    // ---- flute melody: phrase machine ----
    if (this._phraseIdx >= this._phrase.length) {
      // rest between phrases (1–2 bars)
      if (this._restUntil == null) this._restUntil = b + 6 + Math.floor(Math.random() * 6);
      if (b >= this._restUntil) { this._phrase = this._newPhrase(); this._phraseIdx = 0; this._restUntil = null; }
      return;
    }
    if (this._noteHold > 0) { this._noteHold--; return; }
    const note = this._phrase[this._phraseIdx++];
    this._noteHold = note.holdBeats - 1;
    const oct = this._combat || this._boss ? 1 : 1; // melody an octave up
    const vol = 0.11 - M.dark * 0.03 + (this._boss ? 0.03 : 0);
    this._flute(this._scaleFreq(note.deg, oct), beatDur * note.holdBeats * 0.95, vol, 0, note.grace);
  }

  // called by the game when combat state changes
  setCombat(on) {
    if (this._combat === on) return;
    this._combat = on;
  }
  setBoss(on) {
    if (this._boss === on) return;
    this._boss = on;
  }

  _stopMusic() {
    if (this._beatTimer) { clearInterval(this._beatTimer); this._beatTimer = null; }
    if (this._droneNodes) { for (const o of this._droneNodes) { try { o.stop(); } catch { } } }
    this._droneNodes = [];
    if (this.droneBus) this.droneBus.gain.value = 0;
    this._phrase = []; this._phraseIdx = 0; this._noteHold = 0; this._restUntil = null;
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (!on) this._stopMusic();
    else if (this.ctx) this.music(this._mood);
  }
}
