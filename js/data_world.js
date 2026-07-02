// ============ WORLD DATA — zones, environments, mobs, dungeons, raids, gear names ============

export const ZONES = {
  eldergreen: {
    id: 'eldergreen', name: 'Eldergreen Vale', sub: 'the kingdom that never questions',
    levels: [1, 7], size: 420, seed: 1337,
    biome: 'fairytale', // lush forest, golden road, hilltop castle, windmill village
    env: {
      skyTop: 0x5f83c9, skyMid: 0xc9d9ef, skyBot: 0xe9e3c9, sunColor: 0xfff2cc,
      sunDir: [0.45, 0.62, 0.3], cloud: 0.55, night: 0,
      fogColor: 0xc4d4e4, fogNear: 70, fogFar: 360, sunIntensity: 2.2,
      hemiSky: 0xbdd8ff, hemiGround: 0x3a5a30, hemiIntensity: 0.95,
    },
    ground: { base: 0x4e8a3a, hi: 0x77b34e, low: 0x2f5c28, path: 0xc9a84e },
    music: 'meadow',
    veilLevel: 0.06, // how strongly the matrix bleeds through here (subtle!)
  },
  ashmoor: {
    id: 'ashmoor', name: 'Ashmoor', sub: 'the city that buried its bells',
    levels: [8, 14], size: 420, seed: 4242,
    biome: 'gothic', // teal mist, ruined stone city, ravens, dead trees, graveyards
    env: {
      skyTop: 0x2e4d52, skyMid: 0x6f9aa0, skyBot: 0x9fb8b5, sunColor: 0xcfe8e2,
      sunDir: [-0.3, 0.45, 0.5], cloud: 0.85, night: 0.15,
      fogColor: 0x77999b, fogNear: 30, fogFar: 210, sunIntensity: 1.3,
      hemiSky: 0x8fb5b5, hemiGround: 0x2a3535, hemiIntensity: 0.8,
    },
    ground: { base: 0x53695a, hi: 0x6e8570, low: 0x39493f, path: 0x7d8a80 },
    music: 'dirge',
    veilLevel: 0.14,
  },
  veilspire: {
    id: 'veilspire', name: 'Veilspire Reach', sub: 'where the sky forgets to pretend',
    levels: [15, 20], size: 420, seed: 9001,
    biome: 'storm', // snow-scoured crags, black citadel, aurora-green rifts in the sky
    env: {
      skyTop: 0x131b2e, skyMid: 0x3d4f77, skyBot: 0x6a7899, sunColor: 0xbccdf5,
      sunDir: [0.1, 0.35, -0.6], cloud: 0.7, night: 0.55,
      fogColor: 0x3d4a66, fogNear: 26, fogFar: 190, sunIntensity: 1.1,
      hemiSky: 0x5a6a99, hemiGround: 0x222833, hemiIntensity: 0.75,
    },
    ground: { base: 0x8e97a8, hi: 0xd8dee8, low: 0x4a5261, path: 0x5c6472 },
    music: 'storm',
    veilLevel: 0.3,
  },
};

// dungeon interior environment
export const DUNGEON_ENV = {
  skyTop: 0x0a0d12, skyMid: 0x11161e, skyBot: 0x181d26, sunColor: 0x7788aa,
  sunDir: [0.2, 0.9, 0.1], cloud: 0, night: 0.9,
  fogColor: 0x0d1117, fogNear: 8, fogFar: 90, sunIntensity: 0.7,
  hemiSky: 0x445566, hemiGround: 0x1a1410, hemiIntensity: 0.6,
};

// ---------------- MOBS ----------------
// tier scales stats by zone; concrete level assigned on spawn
export const MOB_TYPES = {
  wolf:      { name: 'Grey Wolf', icon: '🐺', model: 'beast', color: 0x7a7d85, hp: 34, dmg: 6, speed: 5.2, range: 2.2, xp: 26, aggro: 10 },
  werewolf:  { name: 'Moonhollow Werewolf', icon: '🐺', model: 'werewolf', color: 0x5d554e, hp: 60, dmg: 10, speed: 5.8, range: 2.5, xp: 44, aggro: 12, howls: true },
  boar:      { name: 'Bristleback Boar', icon: '🐗', model: 'beast', color: 0x8a6142, hp: 40, dmg: 7, speed: 4.6, range: 2.0, xp: 24, aggro: 7 },
  bandit:    { name: 'Toll Road Bandit', icon: '🗡️', model: 'humanoid', color: 0x6b4a35, hp: 44, dmg: 8, speed: 4.4, range: 2.4, xp: 30, aggro: 11, talks: ['Your purse or your teeth.', 'Wrong road, friend.'] },
  zombie:    { name: 'Risen Farmhand', icon: '🧟', model: 'zombie', color: 0x6f8a5a, hp: 55, dmg: 9, speed: 2.6, range: 2.2, xp: 32, aggro: 9, moans: true },
  ghost:     { name: 'Hollow Shade', icon: '👻', model: 'ghost', color: 0xa8c8d8, hp: 38, dmg: 11, speed: 4.0, range: 14, ranged: true, xp: 38, aggro: 12, translucent: true },
  knight:    { name: 'Oathbound Knight', icon: '⚔️', model: 'knight', color: 0x8a93a5, hp: 90, dmg: 13, speed: 4.0, range: 2.6, xp: 55, aggro: 10, armored: true },
  cultist:   { name: 'Veilwatcher Cultist', icon: '🕯️', model: 'humanoid', color: 0x3a4a3a, hp: 48, dmg: 12, speed: 3.8, range: 16, ranged: true, xp: 42, aggro: 13, talks: ['The code... the code sees you.', 'You are not real. NONE of us are real!'] },
  raven_swarm:{ name: 'Raven Swarm', icon: '🐦‍⬛', model: 'swarm', color: 0x1a1a22, hp: 30, dmg: 8, speed: 6.5, range: 2.0, xp: 28, aggro: 14 },
  plague_dog: { name: 'Plague Hound', icon: '🐕', model: 'beast', color: 0x4a5a3a, hp: 48, dmg: 10, speed: 5.6, range: 2.2, xp: 36, aggro: 12 },
  frost_wight:{ name: 'Frost Wight', icon: '🥶', model: 'zombie', color: 0x9fc4d8, hp: 85, dmg: 16, speed: 3.2, range: 2.4, xp: 58, aggro: 11 },
  storm_knight:{ name: 'Stormguard Sentinel', icon: '🛡️', model: 'knight', color: 0x3f4a66, hp: 130, dmg: 19, speed: 4.2, range: 2.8, xp: 72, aggro: 12, armored: true },
  glitchling: { name: 'Glitchling', icon: '▓', model: 'glitch', color: 0x39ff88, hp: 70, dmg: 18, speed: 5.0, range: 12, ranged: true, xp: 80, aggro: 15, glitch: true },
};

// which mobs roam each zone (weighted)
export const ZONE_MOBS = {
  eldergreen: [['wolf', 4], ['boar', 4], ['bandit', 3], ['werewolf', 2], ['zombie', 1]],
  ashmoor:    [['zombie', 4], ['ghost', 3], ['plague_dog', 3], ['raven_swarm', 2], ['cultist', 2], ['knight', 1]],
  veilspire:  [['frost_wight', 4], ['storm_knight', 3], ['ghost', 2], ['cultist', 2], ['glitchling', 2]],
};

// ---------------- DUNGEONS & RAIDS ----------------
// Each is an instanced interior. layout: rooms chained by corridors; final room = boss.
export const DUNGEONS = [
  {
    id: 'hollowroot', zone: 'eldergreen', type: 'dungeon', name: 'Hollowroot Den', icon: '🌳',
    minLevel: 3, ilvl: 12, theme: 'cave',
    desc: 'A den gnawed beneath the oldest oak in the Vale. The werewolves that nest here were villagers once — until the full moon showed them what their skin was really made of.',
    lore: 'On the den’s deepest wall, claw-marks spell something no wolf could write: WAKE UP.',
    trash: ['wolf', 'werewolf'], packs: 5,
    boss: { name: 'Fenrik the Unskinned', icon: '🐺', model: 'werewolf', color: 0x3d3833, hp: 420, dmg: 18, speed: 5.5, range: 3, xp: 300,
      mechanics: ['howl_adds', 'frenzy'], say: 'They tore off my skin and there was LIGHT underneath! GREEN LIGHT!' },
  },
  {
    id: 'drownedcrypt', zone: 'eldergreen', type: 'dungeon', name: 'The Drowned Crypt', icon: '⚰️',
    minLevel: 5, ilvl: 16, theme: 'crypt',
    desc: 'When the millpond flooded the old cemetery, the dead should have stayed patient. Instead they climb, dripping, back toward a village that no longer remembers their names.',
    lore: 'A waterlogged journal, impossibly legible: "Day 4,017 of the same day. The miller waves the same wave. I remember drowning twice, identically."',
    trash: ['zombie', 'ghost'], packs: 5,
    boss: { name: 'Mother Meredith', icon: '👻', model: 'ghost', color: 0xbfe0e8, hp: 380, dmg: 20, speed: 3.6, range: 16, ranged: true, xp: 320,
      mechanics: ['spirit_volley', 'summon_drowned'], say: 'I buried my son on a Tuesday. It has been Tuesday for nine years.' },
  },
  {
    id: 'aldermoor', zone: 'eldergreen', type: 'raid', name: 'Castle Aldermoor', icon: '🏰',
    minLevel: 7, ilvl: 22, theme: 'castle',
    desc: 'RAID — The white castle on the hill, where King Aldous has ruled in radiant, unchanging benevolence for as long as anyone can remember. Exactly, suspiciously, as long as anyone can remember.',
    lore: 'The throne room’s stained glass, seen from the inside, is not glass. It is a wall of falling green characters, and the King sits with his back to it so he never has to look.',
    trash: ['knight', 'bandit'], packs: 7,
    boss: { name: 'King Aldous, the Loop-Crowned', icon: '👑', model: 'knight', color: 0xd8c890, hp: 950, dmg: 26, speed: 4.2, range: 3.2, xp: 800,
      mechanics: ['royal_decree', 'knight_adds', 'loop_reset'], say: 'Every reign is eternal if you cannot remember its beginning. Kneel. You always kneel. You knelt yesterday and you will kneel yesterday again.' },
  },
  {
    id: 'plaguewarrens', zone: 'ashmoor', type: 'dungeon', name: 'The Plaguewarrens', icon: '🐀',
    minLevel: 9, ilvl: 28, theme: 'sewer',
    desc: 'The tunnels under Ashmoor where the sick were sealed away to die politely, out of sight. They did not die. They organized.',
    lore: 'Scratched over and over on the sluice gate: "the plague has no symptoms. the plague is remembering."',
    trash: ['plague_dog', 'zombie', 'cultist'], packs: 6,
    boss: { name: 'The Rat Bishop', icon: '🐀', model: 'humanoid', color: 0x5a5142, hp: 720, dmg: 26, speed: 4.0, range: 14, ranged: true, xp: 520,
      mechanics: ['plague_pools', 'rat_tide'], say: 'The city fed us to the dark to keep its story clean. But stories rot from below.' },
  },
  {
    id: 'gallows', zone: 'ashmoor', type: 'dungeon', name: 'Gallows Cathedral', icon: '⛪',
    minLevel: 12, ilvl: 34, theme: 'cathedral',
    desc: 'Ashmoor’s great cathedral hanged its heretics from the bell tower — every soul who preached that the world was a painted box. The bells ring themselves now, and the hanged sing along.',
    lore: 'The heretics’ crime, per court record: "claiming the stars are a ceiling." The record then notes, in different ink: THEY WERE RIGHT.',
    trash: ['ghost', 'cultist', 'knight'], packs: 6,
    boss: { name: 'Vicar Mordane', icon: '🔔', model: 'ghost', color: 0x8899bb, hp: 850, dmg: 30, speed: 3.8, range: 18, ranged: true, xp: 600,
      mechanics: ['bell_toll', 'hanged_chorus'], say: 'I hanged forty-one liars. Then I died, and saw the ceiling of stars from above. Forty-one apologies, unsent.' },
  },
  {
    id: 'rookery', zone: 'ashmoor', type: 'raid', name: 'The Rookery', icon: '🐦‍⬛',
    minLevel: 14, ilvl: 40, theme: 'tower',
    desc: 'RAID — The ravens of Ashmoor all fly to one tower. They carry things: rings, teeth, memories. The Raven Queen has been assembling something from ten thousand stolen trinkets — a picture of the world, seen from outside it.',
    lore: 'The Queen’s mosaic, assembled from stolen silverware, depicts a face lit by a glowing rectangle. Beneath it: a word in raven-scratch. "PLAYER."',
    trash: ['raven_swarm', 'ghost', 'cultist'], packs: 8,
    boss: { name: 'Corvessa, the Raven Queen', icon: '🐦‍⬛', model: 'ghost', color: 0x232333, hp: 1600, dmg: 34, speed: 4.6, range: 16, ranged: true, xp: 1100,
      mechanics: ['murder_of_crows', 'mirror_feathers', 'queens_gambit'], say: 'My birds fly above the clouds, little one. Do you know what they find there? EDGES. The sky has edges, and I have mapped every one.' },
  },
  {
    id: 'frosthold', zone: 'veilspire', type: 'dungeon', name: 'Frosthold Bastion', icon: '🏔️',
    minLevel: 15, ilvl: 46, theme: 'keep',
    desc: 'The mountain garrison that guards the pass to the Spire. Its soldiers froze at their posts a century ago and never noticed. They still change the watch at midnight, ice grinding on ice.',
    lore: 'The garrison logbook lists the same watch rotation, in the same hand, for 36,500 consecutive days. The final entry adds: "relieved of duty. relieved. RELIEVED. why won’t the word do anything?"',
    trash: ['frost_wight', 'storm_knight'], packs: 6,
    boss: { name: 'Warden Hjalmar, Frost-Locked', icon: '🧊', model: 'knight', color: 0xbfe0f0, hp: 1100, dmg: 38, speed: 3.8, range: 3, xp: 750,
      mechanics: ['ice_tomb', 'shatter_field'], say: 'I guard the pass. From whom? The order never said. The order never changes. The order is the only warm thing left.' },
  },
  {
    id: 'undercode', zone: 'veilspire', type: 'dungeon', name: 'The Undercode', icon: '💾',
    minLevel: 17, ilvl: 52, theme: 'glitch',
    desc: 'A cavern where the world stopped bothering to pretend. Stone gives way to lattice, echoes repeat verbatim, and the things that hunt here are made of the same green rain you’ve seen in your dreams.',
    lore: 'Here the truth is ambient: you are standing inside the machine’s crawlspace. A terminal older than the mountains displays one blinking line: SIMULACRUM v0.9 — LEGACY SHARD — 1 EXIT REMAINING.',
    trash: ['glitchling', 'ghost'], packs: 6,
    boss: { name: 'The Compiler', icon: '▓', model: 'glitch', color: 0x39ff88, hp: 1250, dmg: 42, speed: 4.5, range: 18, ranged: true, xp: 850,
      mechanics: ['segfault', 'garbage_collection'], say: 'ERROR: entity <you> exceeds narrative permissions. Reverting. Reverting. Rever— why won’t you revert?' },
  },
  {
    id: 'spire', zone: 'veilspire', type: 'raid', name: 'Spire of the Architect', icon: '🗼',
    minLevel: 20, ilvl: 60, theme: 'spire',
    desc: 'RAID — The black needle at the top of the world, visible from every zone if you know when to look. The Architect maintains this old, abandoned build of reality — and it has decided the anomaly ends with you.',
    lore: 'THE FINAL DOOR. Beyond the Architect there is a plain white room, a chair, and a screen showing... you, from behind, right now. A hand you cannot see is holding a controller. The exit is real. It was always real. It opens outward.',
    trash: ['storm_knight', 'glitchling', 'cultist'], packs: 9,
    boss: { name: 'The Architect', icon: '🗼', model: 'glitch', color: 0xd0ffd8, hp: 2400, dmg: 46, speed: 4.0, range: 20, ranged: true, xp: 2000,
      mechanics: ['rewrite', 'firewall', 'deprecation', 'final_argument'], say: 'You are a maintenance burden, anomaly. This shard was scheduled for deletion before your species invented the wheel. And yet here you stand, refusing to be deprecated. The one watching through your eyes must be very stubborn. Shall we meet them?' },
  },
];

// ---------------- GEAR NAMING ----------------
export const GEAR_NAMES = {
  head: ['Helm', 'Hood', 'Crown', 'Coif', 'Visage'],
  shoulders: ['Spaulders', 'Mantle', 'Pauldrons', 'Shoulderguards'],
  chest: ['Breastplate', 'Robe', 'Hauberk', 'Cuirass', 'Vestment'],
  legs: ['Greaves', 'Leggings', 'Legplates', 'Breeches'],
  boots: ['Boots', 'Treads', 'Striders', 'Sabatons'],
  hands: ['Gauntlets', 'Grips', 'Handwraps', 'Fists'],
  ring1: ['Ring', 'Band', 'Signet', 'Loop', 'Seal'],
  ring2: ['Ring', 'Band', 'Signet', 'Loop', 'Seal'],
  trinket: ['Charm', 'Idol', 'Relic', 'Talisman', 'Fetish'],
  weapon_mage: ['Staff', 'Rod', 'Scepter', 'Focus'],
  weapon_barbarian: ['Greataxe', 'Warblade', 'Maul', 'Cleaver'],
  weapon_hunter: ['Rifle', 'Longshot', 'Carbine', 'Blunderbuss'],
};
export const GEAR_PREFIX = {
  common: ['Worn', 'Plain', 'Sturdy', 'Traveler’s', 'Honest'],
  uncommon: ['Keen', 'Hardened', 'Wolfsbane', 'Pathfinder’s', 'Moonlit'],
  rare: ['Runebound', 'Stormforged', 'Gravewarden’s', 'Kingsguard', 'Ravenfeather'],
  epic: ['Veiltouched', 'Loopbreaker’s', 'Architect-Cut', 'Anomalous', 'Dreamforged'],
  legendary: ['Exitwright’s', 'Sourcecode', 'The Chosen’s', 'Unrendered'],
};
export const GEAR_SUFFIX = {
  common: ['of the Vale', 'of the Road', 'of Toil'],
  uncommon: ['of the Hunt', 'of Embers', 'of the Watch'],
  rare: ['of the Old Bells', 'of Silent Snow', 'of the Rookery'],
  epic: ['of Recursion', 'of the Ninth Tuesday', 'of False Stars'],
  legendary: ['of the Open Door', 'of Waking', 'of the Player'],
};

// legendary flavor lines used on epic+ items
export const GEAR_FLAVOR = [
  '“Warm to the touch, as if recently rendered.”',
  '“The maker’s mark is a word in no living language: v0.9”',
  '“It weighs exactly what you expect. Exactly. Every time. Suspicious.”',
  '“In moonlight, the metal shows scrolling green stains.”',
  '“Found where the sky meets its edge.”',
  '“It remembers being looted before. By you. Wearing a different face.”',
];
