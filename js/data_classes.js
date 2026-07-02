// ============ CLASSES, SKILLS, TALENTS ============
// Skill kinds: dps | support | mobility
// target: enemy | self | ground | party
// Skills scale off `power` (from gear) and level. Damage fn receives (caster, rank ctx).

export const CLASSES = {
  mage: {
    id: 'mage', name: 'Frostfire Mage', icon: '❄️', color: 0x6fb7ff,
    desc: 'A duelist of opposing elements. Brands enemies with frost, detonates them with fire. Fragile, surgical, devastating.',
    armorType: 'cloth', resource: 'mana', resourceColor: '#3b6fc2',
    baseHp: 90, hpPerLvl: 22, baseRes: 100, resRegen: 4.5,
    weapon: 'staff', ranged: true, attackRange: 26,
    skills: [
      { id: 'frostfire_bolt', name: 'Frostfire Bolt', icon: '🔮', kind: 'dps', target: 'enemy', range: 26,
        cast: 1.4, cd: 0, cost: 12, dmg: c => 14 + c.power * 1.05,
        fx: { proj: 'frostfire', color: 0x88ccff },
        applies: { id: 'brand', name: 'Elemental Brand', icon: '🌡️', dur: 8, maxStacks: 3 },
        desc: 'Hurl a bolt of fused frost and flame. Applies Elemental Brand (stacks 3), slowing the target 10% per stack.' },
      { id: 'ember_nova', name: 'Ember Nova', icon: '💥', kind: 'dps', target: 'enemy', range: 26,
        cast: 0, cd: 6, cost: 20, dmg: c => 10 + c.power * 0.8, aoe: 6,
        consumes: 'brand', consumeBonus: 0.55,
        fx: { burst: 0xff7733 },
        desc: 'Detonate the air around your target for area damage. Consumes Elemental Brand stacks: +55% damage per stack.' },
      { id: 'icicle_barrage', name: 'Icicle Barrage', icon: '🧊', kind: 'dps', target: 'enemy', range: 26,
        cast: 0, cd: 9, cost: 18, dmg: c => 7 + c.power * 0.5, hits: 3, hitInterval: 0.28,
        fx: { proj: 'icicle', color: 0xbfeaff },
        applies: { id: 'brand', name: 'Elemental Brand', icon: '🌡️', dur: 8, maxStacks: 3 },
        desc: 'Launch 3 icicles in rapid succession. Each applies Elemental Brand.' },
      { id: 'pyroclasm', name: 'Pyroclasm', icon: '☄️', kind: 'dps', target: 'enemy', range: 26,
        cast: 2.2, cd: 12, cost: 30, dmg: c => 34 + c.power * 2.1,
        fx: { proj: 'fireball', color: 0xff5522 }, critBonusVsBrand: 0.35,
        desc: 'A slow, colossal orb of liquid fire. +35% crit chance against Branded targets.' },
      { id: 'comet_call', name: 'Comet Call', icon: '🌠', kind: 'dps', target: 'ground', range: 24,
        cast: 0.8, cd: 20, cost: 38, dmg: c => 28 + c.power * 1.6, aoe: 7, delay: 1.1,
        fx: { comet: true },
        desc: 'Call a comet down on the marked ground. Massive area damage after a short delay.' },
      { id: 'frost_ward', name: 'Frost Ward', icon: '🛡️', kind: 'support', target: 'self',
        cast: 0, cd: 18, cost: 25, shield: c => 30 + c.power * 1.8, shieldDur: 8,
        fx: { aura: 0x88ccff },
        desc: 'Sheathe yourself in living ice, absorbing damage for 8s.' },
      { id: 'time_anchor', name: 'Time Anchor', icon: '⏳', kind: 'support', target: 'self',
        cast: 0, cd: 30, heal: c => 9 + c.power * 0.55, hot: true, hotDur: 5,
        fx: { aura: 0xd0b0ff },
        desc: 'Pull your body backward through the simulation’s memory, rapidly restoring health over 5s. The world flickers when you do.' },
      { id: 'glitch_lamb', name: 'Glitch', icon: '🐑', kind: 'support', target: 'enemy', range: 22,
        cast: 1.2, cd: 24, cost: 20, cc: 'poly', ccDur: 4,
        fx: { burst: 0x39ff88 },
        desc: 'Corrupt an enemy’s render thread, forcing their model to load as a harmless code-lamb for 4s. Damage breaks the effect.' },
      { id: 'blink', name: 'Blink', icon: '✨', kind: 'mobility', target: 'self',
        cast: 0, cd: 12, dash: 12, teleport: true,
        fx: { burst: 0x88ccff },
        desc: 'Deallocate. Reallocate 12 meters forward. The oldest trick the Veil never patched.' },
      { id: 'frost_glide', name: 'Frost Glide', icon: '🌀', kind: 'mobility', target: 'self',
        cast: 0, cd: 16, speedBuff: 0.5, speedDur: 4,
        fx: { aura: 0xbfeaff },
        desc: 'Skate on a ribbon of ice, +50% movement speed for 4s.' },
    ],
    talents: [
      { lvl: 4, choices: [
        { id: 'ignition', name: 'Ignition', icon: '🔥', desc: 'Ember Nova cooldown reduced by 2s.' },
        { id: 'deepfreeze', name: 'Deep Freeze', icon: '❄️', desc: 'Elemental Brand slows 15% per stack (was 10%).' },
        { id: 'clarity', name: 'Clarity of Frost', icon: '💠', desc: 'Frostfire Bolt costs 40% less mana.' } ] },
      { lvl: 8, choices: [
        { id: 'twin_comet', name: 'Twin Comet', icon: '🌠', desc: 'Comet Call drops a second, smaller comet (50% damage).' },
        { id: 'living_ward', name: 'Living Ward', icon: '🛡️', desc: 'Frost Ward also heals 30% of the damage it absorbs.' },
        { id: 'quick_learner', name: 'Quick Learner', icon: '📗', desc: '+10% experience gained. The simulation notices you noticing it.' } ] },
      { lvl: 12, choices: [
        { id: 'overburn', name: 'Overburn', icon: '☄️', desc: 'Pyroclasm leaves a burn dealing 30% of its damage over 6s.' },
        { id: 'shatter', name: 'Shatter', icon: '🧊', desc: 'Icicle Barrage fires 4 icicles instead of 3.' },
        { id: 'anchor_mastery', name: 'Anchor Mastery', icon: '⏳', desc: 'Time Anchor cooldown reduced by 10s.' } ] },
      { lvl: 16, choices: [
        { id: 'double_blink', name: 'Fork Process', icon: '✨', desc: 'Blink has 2 charges.' },
        { id: 'cryo_armor', name: 'Cryo Armor', icon: '🥶', desc: 'Melee attackers are slowed 30% for 3s.' },
        { id: 'mana_font', name: 'Mana Font', icon: '🔷', desc: '+50% mana regeneration.' } ] },
      { lvl: 20, choices: [
        { id: 'cataclysm', name: 'Cataclysm Protocol', icon: '🌋', desc: 'Ember Nova at 3 Brand stacks also stuns for 1.5s.' },
        { id: 'permafrost', name: 'Permafrost', icon: '🗻', desc: 'All frost damage +15%.' },
        { id: 'wildfire', name: 'Wildfire', icon: '🔥', desc: 'All fire damage +15%.' } ] },
    ],
  },

  barbarian: {
    id: 'barbarian', name: 'Berserker Barbarian', icon: '🪓', color: 0xff6b4a,
    desc: 'A wall of scarred muscle that answers the world’s injustice in kind. Builds Rage with every blow and spends it in avalanches.',
    armorType: 'plate', resource: 'rage', resourceColor: '#c23b34',
    baseHp: 150, hpPerLvl: 34, baseRes: 100, resRegen: -2, // rage decays out of combat
    weapon: 'axe', ranged: false, attackRange: 3.2,
    skills: [
      { id: 'cleave', name: 'Cleave', icon: '🪓', kind: 'dps', target: 'enemy', range: 3.5,
        cast: 0, cd: 0, cost: 0, gain: 12, dmg: c => 12 + c.power * 0.9, aoe: 3,
        fx: { swing: 0xffbb88 },
        desc: 'A wide arc that strikes all enemies in front of you. Generates 12 Rage.' },
      { id: 'skullsplitter', name: 'Skullsplitter', icon: '💢', kind: 'dps', target: 'enemy', range: 3.5,
        cast: 0, cd: 4, cost: 30, dmg: c => 30 + c.power * 1.9,
        fx: { swing: 0xff4422 },
        desc: 'An overhead blow that remembers every wrong done to you. Heavy single-target damage.' },
      { id: 'whirlwind', name: 'Whirlwind', icon: '🌪️', kind: 'dps', target: 'self',
        cast: 0, cd: 8, cost: 25, dmg: c => 11 + c.power * 0.7, aoe: 5, hits: 3, hitInterval: 0.3,
        fx: { spin: true },
        desc: 'Become the storm. Spin 3 times, damaging everything within 5m.' },
      { id: 'rampage', name: 'Rampage', icon: '🩸', kind: 'dps', target: 'enemy', range: 3.5,
        cast: 0, cd: 10, cost: 20, dmg: c => 10 + c.power * 0.6,
        dot: { dmg: c => 4 + c.power * 0.35, ticks: 5, interval: 1 },
        fx: { swing: 0xcc2222 },
        desc: 'Open an artery. The target bleeds for heavy damage over 5s.' },
      { id: 'execute', name: 'Execute', icon: '⚔️', kind: 'dps', target: 'enemy', range: 3.5,
        cast: 0, cd: 6, cost: 15, dmg: c => 22 + c.power * 1.4, executeBelow: 0.3, executeMult: 2.2,
        fx: { swing: 0xffffff },
        desc: 'Attempt to end it. Deals 220% damage to enemies below 30% health.' },
      { id: 'war_cry', name: 'War Cry', icon: '📯', kind: 'support', target: 'party',
        cast: 0, cd: 25, buff: { stat: 'dmg', amt: 0.15, dur: 10 },
        fx: { nova: 0xffcc44 },
        desc: 'A roar that reminds your party they are still alive. Party deals +15% damage for 10s.' },
      { id: 'bloodthirst', name: 'Bloodthirst', icon: '🧛', kind: 'support', target: 'self',
        cast: 0, cd: 20, buff: { stat: 'lifesteal', amt: 0.35, dur: 8 },
        fx: { aura: 0xcc2222 },
        desc: 'For 8s, your strikes return 35% of damage dealt as health.' },
      { id: 'unbreakable', name: 'Unbreakable', icon: '🗿', kind: 'support', target: 'self',
        cast: 0, cd: 30, buff: { stat: 'dr', amt: 0.5, dur: 6 },
        fx: { aura: 0xaaaaaa },
        desc: 'Plant your feet. 50% damage reduction for 6s. The world hits you and you do not move.' },
      { id: 'heroic_leap', name: 'Heroic Leap', icon: '🦘', kind: 'mobility', target: 'ground', range: 16,
        cast: 0, cd: 15, leap: 16, dmg: c => 8 + c.power * 0.5, aoe: 4,
        fx: { slam: 0xffaa66 },
        desc: 'Leap to the target ground, cracking it on impact for area damage.' },
      { id: 'charge', name: 'Charge', icon: '🐗', kind: 'mobility', target: 'enemy', range: 20,
        cast: 0, cd: 12, chargeTo: true, gain: 20, stunDur: 1,
        fx: { trail: 0xffbb88 },
        desc: 'Rush a distant enemy, stunning them for 1s and generating 20 Rage.' },
    ],
    talents: [
      { lvl: 4, choices: [
        { id: 'seething', name: 'Seething', icon: '💢', desc: 'Cleave generates 16 Rage (was 12).' },
        { id: 'crusher', name: 'Crusher', icon: '🔨', desc: 'Skullsplitter damage +20%.' },
        { id: 'thick_hide', name: 'Thick Hide', icon: '🛡️', desc: '+8% maximum health.' } ] },
      { lvl: 8, choices: [
        { id: 'bladestorm', name: 'Bladestorm', icon: '🌪️', desc: 'Whirlwind spins 4 times (was 3).' },
        { id: 'open_veins', name: 'Open Veins', icon: '🩸', desc: 'Rampage bleed ticks 7 times (was 5).' },
        { id: 'warlord', name: 'Warlord', icon: '📯', desc: 'War Cry also grants party +10% movement speed.' } ] },
      { lvl: 12, choices: [
        { id: 'executioner', name: 'Executioner', icon: '⚔️', desc: 'Execute threshold raised to 40% health.' },
        { id: 'vampiric', name: 'Vampiric Rage', icon: '🧛', desc: 'Bloodthirst lasts 12s (was 8s).' },
        { id: 'juggernaut', name: 'Juggernaut', icon: '🐗', desc: 'Charge cooldown reduced by 4s.' } ] },
      { lvl: 16, choices: [
        { id: 'shockwave', name: 'Shockwave', icon: '💥', desc: 'Heroic Leap stuns enemies it damages for 1.5s.' },
        { id: 'iron_will', name: 'Iron Will', icon: '🗿', desc: 'Unbreakable also clears movement-impairing effects.' },
        { id: 'battle_trance', name: 'Battle Trance', icon: '🧠', desc: 'Rage no longer decays out of combat.' } ] },
      { lvl: 20, choices: [
        { id: 'avatar', name: 'Avatar of Wrath', icon: '👹', desc: 'War Cry also grants YOU +25% damage (total +40%).' },
        { id: 'deathwish', name: 'Death Wish', icon: '💀', desc: '+20% damage while below 50% health.' },
        { id: 'colossus', name: 'Colossus', icon: '🗻', desc: '+15% maximum health and Unbreakable lasts 8s.' } ] },
    ],
  },

  hunter: {
    id: 'hunter', name: 'Engineer Hunter', icon: '🎯', color: 0x7fd66a,
    desc: 'A tinkerer who noticed the world’s machines obey rules the priests can’t explain. Rifles, turrets, traps — and questions.',
    armorType: 'mail', resource: 'energy', resourceColor: '#d6b53a',
    baseHp: 115, hpPerLvl: 27, baseRes: 100, resRegen: 10,
    weapon: 'rifle', ranged: true, attackRange: 30,
    skills: [
      { id: 'rifle_shot', name: 'Rifle Shot', icon: '🔫', kind: 'dps', target: 'enemy', range: 30,
        cast: 0, cd: 0, cost: 15, dmg: c => 11 + c.power * 0.85,
        fx: { proj: 'bullet', color: 0xffee88 },
        desc: 'A crack of powder and a lesson in ballistics. Reliable single-target damage.' },
      { id: 'explosive_round', name: 'Explosive Round', icon: '🧨', kind: 'dps', target: 'enemy', range: 30,
        cast: 0, cd: 7, cost: 30, dmg: c => 20 + c.power * 1.3, aoe: 5,
        fx: { proj: 'rocket', color: 0xff8833 },
        desc: 'A shell packed with alchemical powder. Explodes on impact for area damage.' },
      { id: 'turret', name: 'Sentry Turret', icon: '🤖', kind: 'dps', target: 'ground', range: 12,
        cast: 0, cd: 22, cost: 35, summonTurret: { dur: 12, dmg: c => 5 + c.power * 0.4, interval: 0.9, range: 24 },
        fx: { build: true },
        desc: 'Deploy a clockwork sentry for 12s. It picks its own targets. It never misses. You built it — but you don’t fully understand why it works.' },
      { id: 'shrapnel_trap', name: 'Shrapnel Trap', icon: '🕸️', kind: 'dps', target: 'ground', range: 14,
        cast: 0, cd: 14, cost: 20, trap: { dmg: c => 18 + c.power * 1.1, aoe: 4, rootDur: 2, armTime: 0.8, life: 20 },
        fx: { build: true },
        desc: 'Plant a hidden trap. Explodes when an enemy steps close, damaging and rooting them for 2s.' },
      { id: 'deadeye_volley', name: 'Deadeye Volley', icon: '🏹', kind: 'dps', target: 'enemy', range: 30,
        cast: 1.6, cd: 16, cost: 40, dmg: c => 9 + c.power * 0.62, hits: 5, hitInterval: 0.16,
        fx: { proj: 'bullet', color: 0xffffaa },
        desc: 'Empty the cylinder. Five shots, each one placed exactly where physics says it must go.' },
      { id: 'med_drone', name: 'Med-Drone', icon: '🚁', kind: 'support', target: 'self',
        cast: 0, cd: 24, heal: c => 8 + c.power * 0.5, hot: true, hotDur: 8, droneVisual: true,
        fx: { aura: 0x7fd66a },
        desc: 'Release a whirring drone that stitches wounds with silk and salve, healing over 8s.' },
      { id: 'camo_field', name: 'Camouflage Field', icon: '🌫️', kind: 'support', target: 'self',
        cast: 0, cd: 28, stealth: 5,
        fx: { aura: 0x9999bb },
        desc: 'Bend light around yourself for 5s. Enemies lose you; the world seems to forget you were rendered at all.' },
      { id: 'overclock', name: 'Overclock', icon: '⚙️', kind: 'support', target: 'self',
        cast: 0, cd: 30, buff: { stat: 'haste', amt: 0.3, dur: 8 },
        fx: { aura: 0xd6b53a },
        desc: 'Push your gear past its rated tolerances. +30% attack and cast speed for 8s.' },
      { id: 'grapple', name: 'Grapple Hook', icon: '🪝', kind: 'mobility', target: 'ground', range: 18,
        cast: 0, cd: 14, grappleTo: true,
        fx: { line: 0xccaa66 },
        desc: 'Fire a hook and reel yourself to the target point at breakneck speed.' },
      { id: 'booster_dash', name: 'Booster Dash', icon: '💨', kind: 'mobility', target: 'self',
        cast: 0, cd: 10, dash: 9,
        fx: { trail: 0xd6b53a },
        desc: 'A hip-mounted steam booster hurls you backward-facing-forward, 9 meters in a blink.' },
    ],
    talents: [
      { lvl: 4, choices: [
        { id: 'rifled_barrel', name: 'Rifled Barrel', icon: '🔫', desc: 'Rifle Shot damage +20%.' },
        { id: 'bigger_boom', name: 'Bigger Boom', icon: '🧨', desc: 'Explosive Round radius +2m.' },
        { id: 'field_rations', name: 'Field Rations', icon: '🍖', desc: '+15% energy regeneration.' } ] },
      { lvl: 8, choices: [
        { id: 'twin_sentry', name: 'Twin Coils', icon: '🤖', desc: 'Sentry Turret fires 25% faster.' },
        { id: 'barbed_shrapnel', name: 'Barbed Shrapnel', icon: '🕸️', desc: 'Shrapnel Trap roots for 3.5s (was 2s).' },
        { id: 'sprinter', name: 'Sprinter', icon: '👟', desc: '+8% movement speed, always.' } ] },
      { lvl: 12, choices: [
        { id: 'headhunter', name: 'Headhunter', icon: '🎯', desc: 'Deadeye Volley fires 7 shots (was 5).' },
        { id: 'combat_medic', name: 'Combat Medic', icon: '🚁', desc: 'Med-Drone also heals nearby party members for 50%.' },
        { id: 'silent_running', name: 'Silent Running', icon: '🌫️', desc: 'Camouflage lasts 8s and +30% speed while hidden.' } ] },
      { lvl: 16, choices: [
        { id: 'double_hook', name: 'Double Hook', icon: '🪝', desc: 'Grapple Hook has 2 charges.' },
        { id: 'high_voltage', name: 'High Voltage', icon: '⚡', desc: 'Overclock lasts 12s (was 8s).' },
        { id: 'ambusher', name: 'Ambusher', icon: '🗡️', desc: 'Attacks from Camouflage deal +60% damage.' } ] },
      { lvl: 20, choices: [
        { id: 'artillery', name: 'Artillery Doctrine', icon: '💣', desc: 'Explosive Round damage +30% and cooldown -2s.' },
        { id: 'war_machine', name: 'War Machine', icon: '🤖', desc: 'Sentry Turret lasts 18s (was 12s).' },
        { id: 'apex', name: 'Apex Predator', icon: '🦅', desc: '+10% critical strike chance.' } ] },
    ],
  },
};

export const XP_TABLE = (() => {
  // xp to go from level L to L+1; cap 20
  const t = [0];
  for (let l = 1; l <= 20; l++) t[l] = Math.round(80 * Math.pow(l, 1.55));
  return t;
})();

export const MAX_LEVEL = 20;

export const QUALITIES = [
  { id: 'common',    name: 'Common',    color: '#ffffff', mult: 1.0,  weight: 46 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#1eff00', mult: 1.18, weight: 32 },
  { id: 'rare',      name: 'Rare',      color: '#0070dd', mult: 1.42, weight: 15 },
  { id: 'epic',      name: 'Epic',      color: '#a335ee', mult: 1.75, weight: 6 },
  { id: 'legendary', name: 'Legendary', color: '#ff8000', mult: 2.2,  weight: 1 },
];

export const GEAR_SLOTS = ['head', 'shoulders', 'chest', 'legs', 'boots', 'hands', 'ring1', 'ring2', 'trinket', 'weapon'];
export const SLOT_ICONS = { head: '🪖', shoulders: '🦾', chest: '🎽', legs: '👖', boots: '🥾', hands: '🧤', ring1: '💍', ring2: '💍', trinket: '🧿', weapon: '⚔️' };
export const SLOT_NAMES = { head: 'Head', shoulders: 'Shoulders', chest: 'Chest', legs: 'Legs', boots: 'Boots', hands: 'Hands', ring1: 'Ring', ring2: 'Ring', trinket: 'Trinket', weapon: 'Weapon' };
