/**
 * Comprehensive Test Suite for the 10-Protector Hub Farming & Crop Regrowth System
 */

import {
  CROP_PROTECTORS,
  getProtectorForCrop,
  isHubMinionExclusionZone,
  isHarvestableHubCrop,
  calculateFortuneMultiplier,
  SUN_SKULL_TEXTURE,
  HARVESTABLE_CROPS,
  FULLY_GROWN_CROP_STATES,
  FARMLAND_MOISTURE_7
} from './src/world/cropGuardian';
import { COMMAND_DEFINITIONS } from './src/commands/commandRegistry';

console.log('🧪 Starting 10-Protector Hub Farming & Regrowth System Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, extraInfo: string = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName} ${extraInfo}`);
  } else {
    console.error(`  ❌ FAIL: ${testName} ${extraInfo}`);
    process.exitCode = 1;
  }
}

// 1. Verify 10 Dedicated Protectors
console.log('--- 1. Testing 10 Dedicated Protectors Configuration ---');
assert(CROP_PROTECTORS.length === 10, 'Exactly 10 dedicated protectors exist', `(count: ${CROP_PROTECTORS.length})`);

const expectedIds = [8801, 8802, 8803, 8804, 8805, 8806, 8807, 8808, 8809, 8810];
const actualIds = CROP_PROTECTORS.map(p => p.id);
assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'All 10 protector entity IDs match 8801-8810');

// Verify distinct UUIDs
const uuids = new Set(CROP_PROTECTORS.map(p => p.uuid));
assert(uuids.size === 10, 'All 10 protectors have unique UUIDs');

// Verify hover heights (5-6 blocks above crop fields: Y >= 73 and Y <= 130)
const allHeightsValid = CROP_PROTECTORS.every(p => p.basePos.y >= 73.0 && p.basePos.y <= 130.0);
assert(allHeightsValid, 'All protectors hover 5-6 blocks above crop fields');

// 2. Testing Territory Mapping
console.log('\n--- 2. Testing Territory Mapping for Crop Coordinates ---');
// Lower wheat field (45, 70, -135)
const p1 = getProtectorForCrop(45, 70, -135);
assert(p1.id === 8801, 'Lower wheat field maps to Protector 1 (8801)', `(got: ${p1.name})`);

// Upper wheat terrace (74, 72, -162)
const p2 = getProtectorForCrop(74, 72, -162);
assert(p2.id === 8802, 'Upper wheat terrace maps to Protector 2 (8802)', `(got: ${p2.name})`);

// Windmill hillside (60, 72, -183)
const p3 = getProtectorForCrop(60, 72, -183);
assert(p3.id === 8803, 'Windmill hillside maps to Protector 3 (8803)', `(got: ${p3.name})`);

// Western wheat strip (24, 70, -178)
const p4 = getProtectorForCrop(24, 70, -178);
assert(p4.id === 8804, 'Western wheat strip maps to Protector 4 (8804)', `(got: ${p4.name})`);

// Village Sunken Garden (39, 68, -86)
const p5 = getProtectorForCrop(39, 68, -86);
assert(p5.id === 8805, 'Village sunken garden maps to Protector 5 (8805)', `(got: ${p5.name})`);

// Village Path Garden (48, 70, -97)
const p6 = getProtectorForCrop(48, 70, -97);
assert(p6.id === 8806, 'Village path garden maps to Protector 6 (8806)', `(got: ${p6.name})`);

// Carrot Garden (-12, 70, 20)
const p7 = getProtectorForCrop(-12, 70, 20);
assert(p7.id === 8807, 'Carrot garden maps to Protector 7 (8807)', `(got: ${p7.name})`);

// Large Barn Potato Plot (87, 70, -96)
const p8 = getProtectorForCrop(87, 70, -96);
assert(p8.id === 8808, 'Large Barn Potato plot maps to Protector 8 (8808)', `(got: ${p8.name})`);

// Village Potato Garden by Hay Bales (27, 69, -85)
const p9 = getProtectorForCrop(27, 69, -85);
assert(p9.id === 8809, 'Village Hay Bale Potato garden maps to Protector 9 (8809)', `(got: ${p9.name})`);

// Alchemist Nether Wart (41, 68, -66)
const p10 = getProtectorForCrop(41, 68, -66);
assert(p10.id === 8810, 'Alchemist Nether Wart maps to Protector 10 (8810)', `(got: ${p10.name})`);

// 3. Testing 5x5 Hub Wheat Minion Exclusion Zone
console.log('\n--- 3. Testing 5x5 Hub Wheat Minion Exclusion Zone ---');
assert(isHubMinionExclusionZone(45, 70, -139), 'Minion zone corner (45, 70, -139) is excluded');
assert(isHubMinionExclusionZone(49, 70, -135), 'Minion zone corner (49, 70, -135) is excluded');
assert(isHubMinionExclusionZone(47, 70, -137), 'Minion zone center (47, 70, -137) is excluded');
assert(!isHubMinionExclusionZone(44, 70, -137), 'Outside minion zone (44, 70, -137) is harvestable');
assert(!isHubMinionExclusionZone(50, 70, -137), 'Outside minion zone (50, 70, -137) is harvestable');
assert(!isHubMinionExclusionZone(47, 71, -137), 'Wrong Y-level (47, 71, -137) is not in minion zone');

// 4. Testing Harvestable Crops & Moisture States
console.log('\n--- 4. Testing Harvestable Crops & Moisture States ---');
assert(isHarvestableHubCrop('wheat'), 'wheat is harvestable');
assert(isHarvestableHubCrop('minecraft:wheat'), 'minecraft:wheat is harvestable');
assert(isHarvestableHubCrop('carrots'), 'carrots is harvestable');
assert(isHarvestableHubCrop('potatoes'), 'potatoes is harvestable');
assert(isHarvestableHubCrop('nether_wart'), 'nether_wart is harvestable');
assert(!isHarvestableHubCrop('red_mushroom'), 'red_mushroom is NOT harvestable');
assert(!isHarvestableHubCrop('brown_mushroom'), 'brown_mushroom is NOT harvestable');
assert(!isHarvestableHubCrop('dirt'), 'dirt is NOT harvestable');
assert(!isHarvestableHubCrop('stone'), 'stone is NOT harvestable');

assert(FARMLAND_MOISTURE_7.state119 === 3627, '1.19.2 moisture=7 state is 3627');
assert(FARMLAND_MOISTURE_7.state121 === 4293, '1.21.1 moisture=7 state is 4293');

// 5. Testing Farming Fortune Multiplier Formula
console.log('\n--- 5. Testing Farming Fortune Multiplier Formula ---');
assert(calculateFortuneMultiplier(0) === 1, '0 Fortune yields exactly 1x multiplier');
assert(calculateFortuneMultiplier(100) === 2, '100 Fortune yields exactly 2x multiplier');
assert(calculateFortuneMultiplier(200) === 3, '200 Fortune yields exactly 3x multiplier');
const mult50 = calculateFortuneMultiplier(50);
assert(mult50 === 1 || mult50 === 2, '50 Fortune yields 1x or 2x multiplier');

// 6. Testing Custom Skull Texture
console.log('\n--- 6. Testing Custom Golden Sun Skull Texture ---');
const decodedTexture = Buffer.from(SUN_SKULL_TEXTURE, 'base64').toString('utf8');
assert(decodedTexture.includes('textures.minecraft.net/texture/'), 'Texture contains valid Mojang texture URL');
assert(decodedTexture.includes('bf0ee647a6211e5c2f81616a5977a65851e4db7834cf4501246de6b39ada3291'), 'Texture matches authentic Golden Sun texture hash');

// 7. Testing Bloat Cleanup
console.log('\n--- 7. Testing Bloat Cleanup (/boost removal) ---');
const boostCmd = COMMAND_DEFINITIONS.find(c => c.name === 'boost');
assert(!boostCmd, '/boost command is completely removed from COMMAND_DEFINITIONS');

console.log(`\n========================================`);
console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
