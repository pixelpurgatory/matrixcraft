// ============ CLASSES, SKILLS, TALENTS ============
// Skill kinds: dps | support | mobility
// target: enemy | self | ground | party
// Skills scale off `power` (from gear) and level. Damage fn receives (caster, rank ctx).

export const CLASSES = {
  mage: {
    id: 'mage', name: 'Frostfire Mage', icon: '\u2744\ufe0f', color: 0x6fb7ff,
    desc: 'A duelist of opposing elements. Scorches the world with fire, freezes it with frost. Fragile, surgical, devastating.',
    armorType: 'cloth', resource: 'mana', resourceColor: '#3b6fc2',
    baseHp: 110, hpPerLvl: 26, baseRes: 100, resRegen: 6,
    weapon: 'staff', ranged: true, attackRange: 28,
    skills: [
      { id: 'auto_attack', name: 'Attack', icon: '\u2694\ufe0f', kind: 'dps', target: 'enemy', range: 28,
        autoToggle: true, cast: 0, cd: 0, cost: 0,
        dmg: c => 5 + c.power * 0.4,
        desc: 'Toggle auto-attack: your staff lashes the target with arcane bolts every 1.6s. Starts automatically when you cast any spell.' },
      { id: 'fireball', name: 'Fireball', icon: '\ud83d\udd25', kind: 'dps', target: 'enemy', range: 28,
        cast: 1.8, cd: 0, cost: 18,
        dmg: c => 22 + c.power * 1.35,
        dot: { dmg: c => 3 + c.power * 0.18, ticks: 3, interval: 1 },
        fx: { proj: 'fireball', color: 0xff6622 },
        desc: 'Hurl a roaring sphere of flame. Explodes on impact and leaves the target burning for 3s.' },
      { id: 'frost_nova', name: 'Frost Nova', icon: '\u2744\ufe0f', kind: 'dps', target: 'self',
        cast: 0, cd: 8, cost: 24,
        dmg: c => 10 + c.power * 0.55,
        nova: { radius: 7, rootDur: 3 },
        fx: { color: 0x9fdfff },
        desc: 'Blast a ring of ice from your body: damages all enemies within 7m and freezes them in place for 3s.' },
      { id: 'rain_of_fire', name: 'Rain of Fire', icon: '\u2604\ufe0f', kind: 'dps', target: 'ground', range: 26,
        cast: 0, cd: 12, cost: 40,
        dmg: c => 8 + c.power * 0.5,
        rain: { radius: 5.5, waves: 6, interval: 0.5, delay: 0.6 },
        fx: { color: 0xff8833 },
        desc: 'Mark the ground under your target: for 3s, meteors hammer the area, striking every enemy inside with each wave.' },
    ],
    talents: [],
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
