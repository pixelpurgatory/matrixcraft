// ============ LOOT — gear-only drops with quality & item level ============
// No junk, no crafting mats. Every drop is wearable gear. Quality weights shift
// upward for dungeon/raid bosses. iLvl tracks content: mobs ≈ level*3, bosses fixed.
import { QUALITIES, GEAR_SLOTS, SLOT_ICONS } from './data_classes.js';
import { GEAR_NAMES, GEAR_PREFIX, GEAR_SUFFIX, GEAR_FLAVOR } from './data_world.js';
import { Balance } from './combat.js';

let itemId = 1;

function pickQuality(bonus = 0) {
  // bonus shifts weight toward higher tiers (bosses)
  const w = QUALITIES.map((q, i) => q.weight * (1 + bonus * i));
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < QUALITIES.length; i++) { r -= w[i]; if (r <= 0) return QUALITIES[i]; }
  return QUALITIES[0];
}

export function generateItem(opts = {}) {
  // opts: ilvl, classId, qualityBonus, minQuality, slot
  const ilvl = Math.max(3, Math.round(opts.ilvl || 6));
  let q = pickQuality(opts.qualityBonus || 0);
  if (opts.minQuality) {
    const minIdx = QUALITIES.findIndex(x => x.id === opts.minQuality);
    if (QUALITIES.indexOf(q) < minIdx) q = QUALITIES[minIdx];
  }
  const slot = opts.slot || GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)];
  const nameKey = slot === 'weapon' ? `weapon_${opts.classId || 'barbarian'}` : slot;
  const bases = GEAR_NAMES[nameKey] || GEAR_NAMES.chest;
  const base = bases[Math.floor(Math.random() * bases.length)];
  const pre = GEAR_PREFIX[q.id][Math.floor(Math.random() * GEAR_PREFIX[q.id].length)];
  const suf = Math.random() < 0.7 ? ' ' + GEAR_SUFFIX[q.id][Math.floor(Math.random() * GEAR_SUFFIX[q.id].length)] : '';
  const weaponMult = slot === 'weapon' ? 1.6 : 1;
  const item = {
    id: 'i' + itemId++,
    name: `${pre} ${base}${suf}`,
    slot, ilvl, quality: q.id, qcolor: q.color,
    icon: SLOT_ICONS[slot],
    power: Math.round(Balance.itemPower(ilvl, q.mult) * weaponMult),
    stam: Balance.itemStam(ilvl, q.mult),
    crit: (q.id === 'rare' || q.id === 'epic') ? Math.round(ilvl * 0.05) : q.id === 'legendary' ? Math.round(ilvl * 0.09) : 0,
  };
  if (q.id === 'epic' || q.id === 'legendary')
    item.flavor = GEAR_FLAVOR[Math.floor(Math.random() * GEAR_FLAVOR.length)];
  return item;
}

// full best-in-slot set for PvP arena mode
export function bisSet(classId) {
  const gear = {};
  for (const slot of GEAR_SLOTS) {
    gear[slot] = generateItem({ ilvl: 60, classId, minQuality: 'legendary', slot });
  }
  return gear;
}

export function rollMobLoot(mob, player) {
  const drops = [];
  const chance = mob.isBoss ? 1 : 0.25;
  if (Math.random() < chance) {
    drops.push(generateItem({
      ilvl: mob.lootIlvl || mob.level * 3,
      classId: player.classId,
      qualityBonus: mob.isBoss ? 3 : 0,
      minQuality: mob.isBoss ? 'rare' : undefined,
    }));
    if (mob.isBoss && mob.raidBoss) {
      drops.push(generateItem({ ilvl: mob.lootIlvl, classId: player.classId, qualityBonus: 5, minQuality: 'epic' }));
    }
  }
  return drops;
}

export function compareText(item, current) {
  if (!current) return '<span class="tt-stat">(empty slot — equip it!)</span>';
  const dp = item.power - current.power, ds = item.stam - current.stam;
  const f = (v) => v > 0 ? `<span style="color:#4dff77">+${v}</span>` : v < 0 ? `<span style="color:#ff6655">${v}</span>` : '±0';
  return `vs equipped: ${f(dp)} Power, ${f(ds)} Stamina`;
}
