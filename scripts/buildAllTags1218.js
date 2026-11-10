const fs = require('fs');
const path = require('path');
const mcData = require('minecraft-data')('1.21.8');

const base = path.resolve(__dirname, '../data/extracted_tags');
const outFile = path.resolve(__dirname, '../data/allTags1218.json');

// 1. Build lookup tables for ID resolution
const itemLookup = {};
for (const item of mcData.itemsArray) {
  itemLookup['minecraft:' + item.name] = item.id;
  itemLookup[item.name] = item.id;
}

const blockLookup = {};
for (const block of mcData.blocksArray) {
  blockLookup['minecraft:' + block.name] = block.id;
  blockLookup[block.name] = block.id;
}

const entityLookup = {};
for (const ent of mcData.entitiesArray) {
  entityLookup['minecraft:' + ent.name] = ent.id;
  entityLookup[ent.name] = ent.id;
}

const enchantmentLookup = {};
if (mcData.enchantmentsArray) {
  for (const enc of mcData.enchantmentsArray) {
    enchantmentLookup['minecraft:' + enc.name] = enc.id;
    enchantmentLookup[enc.name] = enc.id;
  }
}

// Dimension codec dynamic registries lookup
const dc = mcData.loginPacket.dimensionCodec;
function makeCodecLookup(regName) {
  const map = {};
  const reg = dc[regName];
  if (reg && Array.isArray(reg.entries)) {
    reg.entries.forEach((entry, idx) => {
      const key = entry.key.startsWith('minecraft:') ? entry.key : 'minecraft:' + entry.key;
      map[key] = idx;
      map[key.replace('minecraft:', '')] = idx;
    });
  }
  return map;
}

const bannerPatternLookup = makeCodecLookup('minecraft:banner_pattern');
const damageTypeLookup = makeCodecLookup('minecraft:damage_type');
const instrumentLookup = makeCodecLookup('minecraft:instrument');
const paintingLookup = makeCodecLookup('minecraft:painting_variant');
// Ensure dennis is at index 50
if (paintingLookup['minecraft:dennis'] === undefined) {
  paintingLookup['minecraft:dennis'] = 50;
  paintingLookup['dennis'] = 50;
}

const biomeLookup = {};
for (const b of mcData.biomesArray) {
  biomeLookup['minecraft:' + b.name] = b.id;
  biomeLookup[b.name] = b.id;
}

const fluidLookup = {
  'minecraft:empty': 0,
  'empty': 0,
  'minecraft:flowing_water': 1,
  'flowing_water': 1,
  'minecraft:water': 2,
  'water': 2,
  'minecraft:flowing_lava': 3,
  'flowing_lava': 3,
  'minecraft:lava': 4,
  'lava': 4
};

// Map each tag type to its lookup resolver
function resolveValueToId(tagType, val) {
  if (tagType === 'minecraft:item') return itemLookup[val];
  if (tagType === 'minecraft:block') return blockLookup[val];
  if (tagType === 'minecraft:entity_type') return entityLookup[val];
  if (tagType === 'minecraft:enchantment') return enchantmentLookup[val];
  if (tagType === 'minecraft:banner_pattern') return bannerPatternLookup[val];
  if (tagType === 'minecraft:damage_type') return damageTypeLookup[val];
  if (tagType === 'minecraft:instrument') return instrumentLookup[val];
  if (tagType === 'minecraft:painting_variant') return paintingLookup[val];
  if (tagType === 'minecraft:worldgen/biome') return biomeLookup[val];
  if (tagType === 'minecraft:fluid') return fluidLookup[val];
  return undefined;
}

// 2. Read all extracted tag files
function getAllFiles(dir) {
  let res = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) res = res.concat(getAllFiles(full));
    else if (item.name.endsWith('.json')) res.push(full);
  }
  return res;
}

const allTagFiles = getAllFiles(base);
console.log(`Found ${allTagFiles.length} extracted tag JSON files.`);

// Organize raw tags by tagType -> tagName -> values
const rawTagsByType = {};

for (const file of allTagFiles) {
  const rel = path.relative(base, file).replace(/\\/g, '/');
  const parts = rel.split('/');
  let tagType, tagSubPath;
  if (parts[0] === 'worldgen') {
    tagType = 'minecraft:worldgen/' + parts[1];
    tagSubPath = parts.slice(2).join('/').replace(/\.json$/, '');
  } else {
    tagType = 'minecraft:' + parts[0];
    tagSubPath = parts.slice(1).join('/').replace(/\.json$/, '');
  }
  const tagName = 'minecraft:' + tagSubPath;
  if (!rawTagsByType[tagType]) rawTagsByType[tagType] = {};
  try {
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    rawTagsByType[tagType][tagName] = content.values || [];
  } catch (err) {
    console.error('Error parsing', file, err.message);
  }
}

// Ensure dialog tags are defined
if (!rawTagsByType['minecraft:dialog']) rawTagsByType['minecraft:dialog'] = {};
rawTagsByType['minecraft:dialog']['minecraft:pause_screen_additions'] = [];
rawTagsByType['minecraft:dialog']['minecraft:quick_actions'] = [];

// Recursive tag resolution
function resolveTagValues(tagType, tagName, visited = new Set()) {
  if (visited.has(tagName)) return new Set();
  visited.add(tagName);
  const rawVals = rawTagsByType[tagType]?.[tagName] || [];
  const result = new Set();

  for (const val of rawVals) {
    if (typeof val === 'string' && val.startsWith('#')) {
      const refTag = val.startsWith('#minecraft:') ? val.substring(1) : 'minecraft:' + val.substring(1);
      const sub = resolveTagValues(tagType, refTag, visited);
      for (const s of sub) result.add(s);
    } else if (typeof val === 'string') {
      result.add(val.startsWith('minecraft:') ? val : 'minecraft:' + val);
    } else if (val && typeof val === 'object' && val.id) {
      result.add(val.id.startsWith('minecraft:') ? val.id : 'minecraft:' + val.id);
    }
  }
  return result;
}

// Build final packet_tags structure:
// array of { tagType: string, tags: [ { tagName: string, entries: number[] } ] }
const finalPacketTags = [];

for (const tagType of Object.keys(rawTagsByType).sort()) {
  const tagsList = [];
  const tagsMap = rawTagsByType[tagType];

  for (const tagName of Object.keys(tagsMap).sort()) {
    const leafValues = resolveTagValues(tagType, tagName);
    const numericEntries = [];

    for (const val of leafValues) {
      const id = resolveValueToId(tagType, val);
      if (id !== undefined && !numericEntries.includes(id)) {
        numericEntries.push(id);
      }
    }

    numericEntries.sort((a, b) => a - b);
    tagsList.push({
      tagName,
      entries: numericEntries
    });
  }

  finalPacketTags.push({
    tagType,
    tags: tagsList
  });
}

console.log(`\nCompiled ${finalPacketTags.length} tag categories:`);
for (const cat of finalPacketTags) {
  const totalEntries = cat.tags.reduce((sum, t) => sum + t.entries.length, 0);
  console.log(` - ${cat.tagType.padEnd(35)}: ${cat.tags.length} tags (${totalEntries} total entries)`);
}

fs.writeFileSync(outFile, JSON.stringify(finalPacketTags, null, 2), 'utf8');
console.log(`\n✅ Saved comprehensive tag database to: ${outFile}`);
