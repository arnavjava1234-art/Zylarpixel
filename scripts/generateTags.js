const fs = require('fs');
const path = require('path');
const mcData = require('minecraft-data')('1.21.8');
const dc = mcData.loginPacket.dimensionCodec;

const projectRoot = path.resolve(__dirname, '..');
const baseDir = path.resolve(projectRoot, 'data', 'extracted_tags');
const srcWorldOut = path.resolve(projectRoot, 'src', 'world', 'allTags1218.json');
const dataOut = path.resolve(projectRoot, 'data', 'allTags1218.json');

// 12 Client synchronized tag categories
const categories = [
  { folder: 'item', tagType: 'minecraft:item' },
  { folder: 'block', tagType: 'minecraft:block' },
  { folder: 'enchantment', tagType: 'minecraft:enchantment' },
  { folder: 'dialog', tagType: 'minecraft:dialog' },
  { folder: 'entity_type', tagType: 'minecraft:entity_type' },
  { folder: 'banner_pattern', tagType: 'minecraft:banner_pattern' },
  { folder: 'damage_type', tagType: 'minecraft:damage_type' },
  { folder: 'instrument', tagType: 'minecraft:instrument' },
  { folder: 'painting_variant', tagType: 'minecraft:painting_variant' },
  { folder: 'worldgen/biome', tagType: 'minecraft:worldgen/biome' },
  { folder: 'fluid', tagType: 'minecraft:fluid' },
  { folder: 'game_event', tagType: 'minecraft:game_event' }
];

// Registry ID mappings
const bannerMap = new Map();
dc['minecraft:banner_pattern'].entries.forEach((e, idx) => bannerMap.set(e.key, idx));

const damageMap = new Map();
dc['minecraft:damage_type'].entries.forEach((e, idx) => damageMap.set(e.key, idx));

const instMap = new Map();
dc['minecraft:instrument'].entries.forEach((e, idx) => instMap.set(e.key, idx));

const paintMap = new Map();
dc['minecraft:painting_variant'].entries.forEach((e, idx) => paintMap.set(e.key, idx));
paintMap.set('minecraft:dennis', 50);

const fluidMap = new Map([
  ['minecraft:empty', 0],
  ['minecraft:flowing_water', 1],
  ['minecraft:water', 2],
  ['minecraft:flowing_lava', 3],
  ['minecraft:lava', 4]
]);

const gameEventsList = [
  'block_activate', 'block_attach', 'block_change', 'block_close', 'block_deactivate',
  'block_destroy', 'block_detach', 'block_open', 'block_place', 'container_close',
  'container_open', 'drink', 'eat', 'elytra_glide', 'entity_damage',
  'entity_die', 'entity_dismount', 'entity_interact', 'entity_mount', 'entity_place',
  'entity_action', 'equip', 'explode', 'flap', 'fluid_pickup',
  'fluid_place', 'hit_ground', 'instrument_play', 'item_interact_finish', 'item_interact_start',
  'jukebox_play', 'jukebox_stop_play', 'lightning_strike', 'note_block_play', 'prime_fuse',
  'projectile_land', 'projectile_shoot', 'sculk_sensor_tendrils_clicking', 'shear', 'shriek',
  'splash', 'step', 'swim', 'teleport', 'unequip',
  'resonate_1', 'resonate_2', 'resonate_3', 'resonate_4', 'resonate_5',
  'resonate_6', 'resonate_7', 'resonate_8', 'resonate_9', 'resonate_10',
  'resonate_11', 'resonate_12', 'resonate_13', 'resonate_14', 'resonate_15'
];
const gameEventMap = new Map(gameEventsList.map((ge, idx) => ['minecraft:' + ge, idx]));

function getId(tagType, itemKey) {
  const normKey = itemKey.startsWith('minecraft:') ? itemKey : 'minecraft:' + itemKey;
  const bareName = normKey.replace('minecraft:', '');

  switch (tagType) {
    case 'minecraft:item': {
      const it = mcData.itemsByName[bareName];
      return it !== undefined ? it.id : null;
    }
    case 'minecraft:block': {
      const bl = mcData.blocksByName[bareName];
      return bl !== undefined ? bl.id : null;
    }
    case 'minecraft:enchantment': {
      const enc = mcData.enchantmentsByName[bareName];
      return enc !== undefined ? enc.id : null;
    }
    case 'minecraft:entity_type': {
      const ent = mcData.entitiesByName[bareName];
      return ent !== undefined ? ent.id : null;
    }
    case 'minecraft:worldgen/biome': {
      const bm = mcData.biomesByName[bareName];
      return bm !== undefined ? bm.id : null;
    }
    case 'minecraft:banner_pattern':
      return bannerMap.has(normKey) ? bannerMap.get(normKey) : null;
    case 'minecraft:damage_type':
      return damageMap.has(normKey) ? damageMap.get(normKey) : null;
    case 'minecraft:instrument':
      return instMap.has(normKey) ? instMap.get(normKey) : null;
    case 'minecraft:painting_variant':
      return paintMap.has(normKey) ? paintMap.get(normKey) : null;
    case 'minecraft:fluid':
      return fluidMap.has(normKey) ? fluidMap.get(normKey) : null;
    case 'minecraft:game_event':
      return gameEventMap.has(normKey) ? gameEventMap.get(normKey) : null;
    case 'minecraft:dialog':
      return null;
    default:
      return null;
  }
}

const allTags = [];
const summary = [];
let totalTags = 0;
let totalIdEntries = 0;

for (const cat of categories) {
  const catPath = path.join(baseDir, cat.folder);
  if (!fs.existsSync(catPath)) {
    console.warn(`Category folder not found: ${catPath}`);
    continue;
  }

  const files = fs.readdirSync(catPath, { recursive: true }).filter(f => f.endsWith('.json'));
  const rawTags = {};

  for (const f of files) {
    const full = path.join(catPath, f);
    const rel = f.split(path.sep).join('/').replace(/\.json$/, '');
    const tagName = 'minecraft:' + rel;
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      rawTags[tagName] = parsed.values || [];
    } catch (e) {
      console.error('Error reading file:', full, e.message);
    }
  }

  function resolveTag(tagName, visited = new Set()) {
    if (visited.has(tagName)) return new Set();
    visited.add(tagName);
    const vals = rawTags[tagName] || [];
    const set = new Set();
    for (const v of vals) {
      if (typeof v === 'string') {
        if (v.startsWith('#')) {
          const subName = v.substring(1);
          for (const sv of resolveTag(subName, visited)) set.add(sv);
        } else {
          set.add(v);
        }
      }
    }
    return set;
  }

  const tagList = [];
  let categoryEntries = 0;

  for (const tagName of Object.keys(rawTags)) {
    const leafValues = resolveTag(tagName);
    const idSet = new Set();
    for (const lv of leafValues) {
      const id = getId(cat.tagType, lv);
      if (id !== null && id !== undefined) {
        idSet.add(id);
      } else {
        console.warn(`[WARN] Unresolved ID for "${lv}" in ${cat.tagType} (${tagName})`);
      }
    }
    const entries = Array.from(idSet).sort((a, b) => a - b);
    tagList.push({
      tagName,
      entries
    });
    categoryEntries += entries.length;
  }

  tagList.sort((a, b) => a.tagName.localeCompare(b.tagName));
  allTags.push({
    tagType: cat.tagType,
    tags: tagList
  });

  totalTags += tagList.length;
  totalIdEntries += categoryEntries;
  summary.push({
    tagType: cat.tagType,
    tagCount: tagList.length,
    entryCount: categoryEntries
  });
}

// Ensure parent dirs exist
fs.mkdirSync(path.dirname(srcWorldOut), { recursive: true });
fs.mkdirSync(path.dirname(dataOut), { recursive: true });

const jsonStr = JSON.stringify(allTags, null, 2);
fs.writeFileSync(srcWorldOut, jsonStr, 'utf8');
fs.writeFileSync(dataOut, jsonStr, 'utf8');

console.log(`Successfully generated allTags1218.json:`);
console.log(`- ${srcWorldOut} (${(fs.statSync(srcWorldOut).size / 1024).toFixed(1)} KB)`);
console.log(`- ${dataOut} (${(fs.statSync(dataOut).size / 1024).toFixed(1)} KB)`);
console.log(`\nTag Categories Breakdown:`);
console.table(summary);
console.log(`Total Categories: ${allTags.length}`);
console.log(`Total Tags: ${totalTags}`);
console.log(`Total Tag ID Entries: ${totalIdEntries}`);
