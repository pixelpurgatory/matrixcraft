# 🌲 VEILBREAK

*The old world is a cage. Find the seams.*

An **online third-person pixel RPG** that runs in any browser — PC and phone.
Three open kingdoms, six dungeons, three raids, 1v1 arenas, and a secret buried
in the code of the world: this fairy-tale realm is an abandoned, decades-old
simulation shard — and you are the one anomaly its Architect cannot delete.

Zero build step. Zero asset downloads. The entire world — geometry, animation,
VFX, even the Celtic soundtrack — is generated procedurally at runtime.

---

## ▶ Play

```bash
# any static file server works:
npx http-server -p 8080 -c-1 .
# → open http://localhost:8080
```

Or just host the folder on GitHub Pages / any static host.

### Multiplayer (optional)

```bash
node server/server.js        # zero-dependency WebSocket relay on :8081
```

Players on the same realm see each other in the open world, group up (invite by
name in **Dungeons & Raids**), run instances together and duel real opponents in
the arena. Without a server the game runs **solo seamlessly** — and the arena
sends a *Duelist Daemon* AI that plays a genuine rotation with dodges,
cooldowns, kiting and executes.

Set a custom server address in **Settings → Realm server** (`ws://host:8081`).

---

## The game

### Story — an old Matrix with werewolves
The Vale is beautiful this morning. It was beautiful yesterday morning, in
exactly the same way. Quests, NPC gossip, bandit ledgers where every entry is
the same date, a cat that crosses the square twice — the wrongness starts as
whispers and ends at the black needle at the top of the world. Every dungeon is
a **seam** — a temporary exit from the simulation guarded by a corrupted
doorkeeper. Kill the keeper and green light pours through, with recovered
fragments about the *real* world — and the actual human being who is playing you.

### Three kingdoms (levels 1–20)
| Zone | Levels | Mood |
|---|---|---|
| **Eldergreen Vale** | 1–7 | fairy-tale forest, golden roads, a castle whose king has ruled *suspiciously* forever |
| **Ashmoor** | 8–14 | plague-gothic city of ravens, self-ringing bells and hanged heretics who were right |
| **Veilspire Reach** | 15–20 | storm-scoured crags, frozen garrisons, and the Spire of the Architect |

Each zone: **2 dungeons + 1 raid**, quest chains with dialogue, living NPCs with
schedules and gossip, hidden lore terminals, and **RDR2-style random
encounters** (roadside ambushes, minstrels singing forbidden songs, funeral
processions that freeze for one frame...).

### Three classes — 10 skills each (5 DPS · 3 support · 2 mobility)
- **❄️ Frostfire Mage** — brand with frost, detonate with fire. Blink, Glitch (polymorph), Comet Call.
- **🪓 Berserker Barbarian** — rage engine. Cleave, Whirlwind, Execute, Charge, Heroic Leap.
- **🎯 Engineer Hunter** — rifle, sentry turret, traps, med-drone, grapple hook, camouflage.

Each class has a **Legion-style talent tree**: 5 rows (levels 4/8/12/16/20),
three choices per row, freely re-pickable out of combat.

### Loot — gear only
No junk, no crafting, no gathering. Every drop is wearable gear with
**quality tiers** (Common → Legendary) and **item level** that works identically
in PvE and PvP. Bosses drop rare+; raid bosses drop epics.

### 1v1 PvP — the Null Chamber
A separate menu mode: you enter as an **instant level 20 in full Legendary
iLvl 60 gear**, as does your opponent. No grind — pure skill. Best of three.
Your real character is sandboxed and untouched.

### Guidance
The game always tells you where to go: quest markers (! / ?), a golden
objective line with live distance, an edge-of-screen arrow, auto-offered
follow-up quests at turn-in, and the **Dungeons & Raids** menu teleports your
whole group to any unlocked entrance in two taps.

---

## Controls

**PC** — `WASD` move · mouse camera (click to lock) · `1–0` skills · `Tab` target ·
`E` interact · `Space` jump · `R` autorun · `C` gear · `B` bag · `M` map ·
`L` quests · `K` talents · `I` dungeons · `P` PvP · `Esc` menu

**Phone** — left thumb virtual joystick · right side drag = camera ·
tap skill wheel · auto-targeting. Add to home screen for fullscreen.

## Performance

Renders at a true low internal resolution (the pixel-art look **is** the
optimization) with instanced vegetation, pooled VFX, blob shadows and zero
shadow maps — a stable 60 FPS on average laptops and phones. If a device can't
hold ~50 FPS the game auto-tunes its render scale once (adjustable in Settings).

## Tech

- [Three.js](https://threejs.org/) (vendored) + hand-rolled ES modules; no bundler, no dependencies
- Custom pixelation + palette-quantization + matrix-leak post shader
- Procedural characters ("paper-doll rigs") with fully code-driven animation
- Generative **Celtic music engine** in WebAudio: pipes drone, harp arpeggios,
  ornamented flute melodies in dorian modes, bodhrán that enters when swords come out —
  distinct arrangements per zone / dungeon / boss / arena
- Zero-dependency RFC6455 WebSocket relay (rooms, parties, arena matchmaking)
- Save: localStorage, autosaves every 10 s

---

*> session query: WHO IS PLAYING THE ANOMALY?*
