/**
 * Verification test for the 3 Crop Guardian & Dropped Item fixes:
 * 1. Anti-void drop protection in tickDroppedItems()
 * 2. 1.21.1 SlotComponent serialization in distributeItem()
 * 3. Dynamic 1.19.2 vs 1.21.1 itemDef resolution in spawnDroppedItem()
 */

const assert = require('assert');
const mc = require('minecraft-protocol');
import { ZylarServer } from './src/core/ZylarServer';
import { handleHubCropHarvest, FULLY_GROWN_CROP_STATES } from './src/world/cropGuardian';
import { players } from './src/players/playerManager';
import { mcData1192, mcData1211 } from './src/world/worldManager';

console.log('🧪 ========================================================');
console.log('🧪  STARTING CROP GUARDIAN & DROPPED ITEM VERIFICATION');
console.log('🧪 ========================================================');

const ser119 = mc.createSerializer({ state: 'play', isServer: true, version: '1.19.2' });
const ser121 = mc.createSerializer({ state: 'play', isServer: true, version: '1.21.1' });

// Create a server instance
const server = new ZylarServer({
  serverId: 'hub',
  serverName: 'Guardian Test Server',
  port: 25579,
  gamemode: 2,
  pvp: false,
  allowBlockBreaking: false,
  allowBlockPlacement: false,
  scoreboardLocation: 'Village',
  worldType: 'hub',
  spawnPoint: { x: 45.5, y: 70.0, z: -135.5 }
});

// ---------------------------------------------------------
// TEST 1: Full Inventory Drop Protection (Anti-Void)
// ---------------------------------------------------------
console.log('\n--- TEST 1: Full Inventory Drop Protection (Anti-Void) ---');

const mockP119: any = {
  entityId: 1001,
  username: 'Farmer119',
  x: 45.5,
  y: 70.0,
  z: -135.5,
  is119: true,
  inventory: new Map(),
  client: {
    write: (name: string, data: any) => {}
  }
};

players.set('Farmer119', mockP119);

// Fill all candidate slots (36..43 and 9..35) with stone
for (let s = 36; s <= 43; s++) {
  mockP119.inventory.set(s, { slot: s, name: 'stone', itemId: 1, count: 64 });
}
for (let s = 9; s <= 35; s++) {
  mockP119.inventory.set(s, { slot: s, name: 'stone', itemId: 1, count: 64 });
}

// Spawn a dropped wheat item right at player feet
server.spawnDroppedItem('wheat', 5, 45.0, 70.0, -135.0);
assert.strictEqual(server.droppedItems.size, 1, 'Dropped item should be registered');
const [dropEntityId, dropItem] = Array.from(server.droppedItems.entries())[0];

// Make spawnTime old enough to be picked up
dropItem.spawnTime = Date.now() - 1000;

// Tick dropped items
(server as any).tickDroppedItems();

// With full inventory, the item must NOT be picked up or deleted!
assert.strictEqual(server.droppedItems.size, 1, 'Full inventory must NOT void or delete dropped item');
assert.strictEqual(dropItem.count, 5, 'Dropped item count must remain unchanged');
console.log('✅ 1.1 Full inventory correctly leaves dropped item untouched on ground (0% voiding)');

// Free up one slot in hotbar (slot 36)
mockP119.inventory.delete(36);

// Tick dropped items again
(server as any).tickDroppedItems();

// Now the item should be picked up into slot 36
assert.strictEqual(server.droppedItems.size, 0, 'Dropped item should now be consumed');
assert(mockP119.inventory.has(36), 'Slot 36 should now contain the wheat');
assert.strictEqual(mockP119.inventory.get(36).count, 5, 'Slot 36 should have count 5');
console.log('✅ 1.2 After slot freed, dropped item successfully picked up into freed slot');

// ---------------------------------------------------------
// TEST 2: Partial Pickup Stacking
// ---------------------------------------------------------
console.log('\n--- TEST 2: Partial Pickup Stacking ---');

// Put 60 wheat in slot 36 (only space for 4 more)
mockP119.inventory.set(36, { slot: 36, name: 'wheat', itemId: 772, count: 60 });
// Fill all other slots with stone
for (let s = 37; s <= 43; s++) {
  mockP119.inventory.set(s, { slot: s, name: 'stone', itemId: 1, count: 64 });
}
for (let s = 9; s <= 35; s++) {
  mockP119.inventory.set(s, { slot: s, name: 'stone', itemId: 1, count: 64 });
}

// Spawn 10 wheat on the ground
server.spawnDroppedItem('wheat', 10, 45.0, 70.0, -135.0);
const [partialEntityId, partialItem] = Array.from(server.droppedItems.entries())[0];
partialItem.spawnTime = Date.now() - 1000;

// Tick dropped items
(server as any).tickDroppedItems();

// Slot 36 should now have 64 wheat
assert.strictEqual(mockP119.inventory.get(36).count, 64, 'Slot 36 must be topped off to 64');
// 6 wheat should remain on the ground
assert.strictEqual(server.droppedItems.size, 1, 'Remaining wheat must stay on ground');
assert.strictEqual(partialItem.count, 6, 'Remaining ground wheat count must be 6 (10 - 4)');
console.log('✅ 2.1 Partial pickup tops off existing stack and leaves remainder on ground');

server.droppedItems.clear();
players.clear();

// ---------------------------------------------------------
// TEST 3: 1.21.1 SlotComponent Serialization in distributeItem()
// ---------------------------------------------------------
console.log('\n--- TEST 3: 1.21.1 SlotComponent Serialization ---');

const captured121Slots: any[] = [];
const mockP121: any = {
  entityId: 1002,
  username: 'Farmer121',
  x: 45.5,
  y: 70.0,
  z: -135.5,
  is119: false,
  inventory: new Map(),
  client: {
    write: (name: string, data: any) => {
      if (name === 'set_slot') {
        captured121Slots.push(data);
      }
    }
  }
};

players.set('Farmer121', mockP121);

// Harvest a hub crop (carrot outside the wheat minion exclusion zone)
handleHubCropHarvest(server, mockP121, 44, 70, -135, 'carrots');
const harvestEntry = Array.from(server.droppedItems.entries())[0];
if (harvestEntry && harvestEntry[1]) harvestEntry[1].spawnTime = Date.now() - 1000;
(server as any).tickDroppedItems();

assert(captured121Slots.length > 0, 'set_slot packets must be sent to 1.21.1 client');

// Test that EVERY captured set_slot packet serializes under 1.21.1 protocol with 0 errors!
for (const pkt of captured121Slots) {
  assert.doesNotThrow(() => {
    const buf = ser121.createPacketBuffer({
      name: 'set_slot',
      params: pkt
    });
    assert(buf.length > 0, 'Packet buffer must have non-zero length');
  }, `Packet ${JSON.stringify(pkt)} must serialize under 1.21.1`);
}

console.log(`✅ 3.1 All ${captured121Slots.length} set_slot packets serialized under 1.21.1 protocol without error`);

// ---------------------------------------------------------
// TEST 4: Dynamic Item ID Resolution in spawnDroppedItem()
// ---------------------------------------------------------
console.log('\n--- TEST 4: Dynamic Item ID Resolution (1.19.2 vs 1.21.1) ---');

let meta119: any = null;
let meta121: any = null;

const observer119: any = {
  entityId: 2001,
  username: 'Obs119',
  is119: true,
  client: {
    write: (name: string, data: any) => {
      if (name === 'entity_metadata') meta119 = data;
    }
  }
};

const observer121: any = {
  entityId: 2002,
  username: 'Obs121',
  is119: false,
  client: {
    write: (name: string, data: any) => {
      if (name === 'entity_metadata') meta121 = data;
    }
  }
};

players.set('Obs119', observer119);
players.set('Obs121', observer121);

server.spawnDroppedItem('wheat', 3, 10.0, 65.0, 10.0);

assert(meta119 !== null, 'Observer 1.19 must receive entity_metadata');
assert(meta121 !== null, 'Observer 1.21 must receive entity_metadata');

// Check 1.19 item ID for wheat
const wheat119Id = mcData1192.itemsByName['wheat'].id; // 772
assert.strictEqual(meta119.metadata[0].value.itemId, wheat119Id, '1.19 observer must receive 1.19 wheat ID');
assert.strictEqual(meta119.metadata[0].type, 6, '1.19 observer metadata type must be 6');

// Check 1.21 item ID for wheat
const wheat121Id = mcData1211.itemsByName['wheat'].id; // 854
assert.strictEqual(meta121.metadata[0].value.itemId, wheat121Id, '1.21 observer must receive 1.21 wheat ID');
assert.strictEqual(meta121.metadata[0].type, 'item_stack', '1.21 observer metadata type must be item_stack');

// Verify that both packets serialize cleanly!
const buf119 = ser119.createPacketBuffer({ name: 'entity_metadata', params: meta119 });
const buf121 = ser121.createPacketBuffer({ name: 'entity_metadata', params: meta121 });

assert(buf119.length > 0, '1.19 metadata must serialize');
assert(buf121.length > 0, '1.21 metadata must serialize');

console.log(`✅ 4.1 1.19.2 observer received itemId: ${wheat119Id} (serialized len: ${buf119.length})`);
console.log(`✅ 4.2 1.21.1 observer received itemId: ${wheat121Id} (serialized len: ${buf121.length})`);

// ---------------------------------------------------------
// TEST 5: Guardian Armor Stand Skull Texture (1.21.1 Profile Component)
// ---------------------------------------------------------
console.log('\n--- TEST 5: Guardian Armor Stand Skull Texture (1.21.1 Profile Component) ---');
import { spawnCropGuardian } from './src/world/cropGuardian';

let equipment121: any = null;
const client121Equip: any = {
  protocolVersion: 767,
  version: '1.21.1',
  write: (name: string, data: any) => {
    if (name === 'entity_equipment') equipment121 = data;
  }
};

spawnCropGuardian(client121Equip, false, (deg: number) => Math.floor((deg % 360) * 256 / 360));
assert(equipment121 !== null, 'Guardian equipment packet must be sent');
const headSlot121 = equipment121.equipments.find((e: any) => e.slot === 5);
assert(headSlot121, 'Head slot (5) must be equipped');
assert.strictEqual(headSlot121.item.addedComponentCount, 1, 'Profile component must be added');
assert.strictEqual(headSlot121.item.components[0].type, 'profile', 'Component type must be profile');
const profileTextures = headSlot121.item.components[0].data.properties.find((p: any) => p.name === 'textures');
assert(profileTextures && profileTextures.value.length > 0, 'Profile texture string must be present');

const equipBuf = ser121.createPacketBuffer({ name: 'entity_equipment', params: equipment121 });
assert(equipBuf.length > 0, 'Equipment packet must serialize cleanly');
console.log(`✅ 5.1 1.21.1 Guardian head equipped with authentic profile skull component (serialized len: ${equipBuf.length})`);

// ---------------------------------------------------------
// TEST 6: Ground Drops Do NOT Stack Into Custom SkyBlock Items
// ---------------------------------------------------------
console.log('\n--- TEST 6: Ground Drops Anti-Corruption Check ---');

// Put 1 Enchanted Wheat (custom SkyBlock item with material wheat) in slot 36
mockP119.inventory.clear();
mockP119.inventory.set(36, {
  slot: 36,
  name: 'wheat',
  itemId: 772,
  count: 1,
  nbtData: {
    type: 'compound',
    name: '',
    value: {
      ExtraAttributes: {
        type: 'compound',
        value: {
          id: { type: 'string', value: 'ENCHANTED_WHEAT' }
        }
      }
    }
  }
});
// Slot 37 is an empty slot
server.droppedItems.clear();
server.spawnDroppedItem('wheat', 3, 45.0, 70.0, -135.0);
const [dropEid, groundWheat] = Array.from(server.droppedItems.entries())[0];
groundWheat.spawnTime = Date.now() - 1000;

players.clear();
players.set('Farmer119', mockP119);
(server as any).tickDroppedItems();

// Slot 36 (Enchanted Wheat) must remain count: 1 and NOT be stacked with raw vanilla drops!
assert.strictEqual(mockP119.inventory.get(36).count, 1, 'Enchanted Wheat count must not be incremented');
assert.strictEqual(mockP119.inventory.get(37).count, 3, 'Raw wheat must be placed into next empty slot (37)');
console.log('✅ 6.1 Raw ground drops safely bypass custom SkyBlock items and use empty slots');

// ---------------------------------------------------------
// TEST 7: Dropped Item spawn_entity fields (objectData & velocity)
// ---------------------------------------------------------
console.log('\n--- TEST 7: Dropped Item spawn_entity objectData & velocity ---');
let capturedSpawnEntity: any = null;
const observerSpawn: any = {
  entityId: 3001,
  is119: true,
  client: {
    write: (name: string, data: any) => {
      if (name === 'spawn_entity') capturedSpawnEntity = data;
    }
  }
};
players.clear();
players.set('Obs', observerSpawn);
server.spawnDroppedItem('wheat', 1, 0, 70, 0);
assert(capturedSpawnEntity !== null, 'spawn_entity must be sent');
assert.strictEqual(capturedSpawnEntity.objectData, 1, 'objectData must be 1 for Item entity');
assert.strictEqual(capturedSpawnEntity.velocityY, 1000, 'velocityY must be 1000 for pop bounce');
const spawnBuf = ser119.createPacketBuffer({ name: 'spawn_entity', params: capturedSpawnEntity });
assert(spawnBuf.length > 0, 'spawn_entity packet must serialize');
console.log('✅ 7.1 Dropped item spawn_entity correctly provides objectData: 1 and upward pop velocity');

// ---------------------------------------------------------
// TEST 8: giveNetherStar 1.21.1 and 1.19.2 Serialization
// ---------------------------------------------------------
console.log('\n--- TEST 8: giveNetherStar 1.21.1 Serialization ---');
import { giveNetherStar } from './src/gui/skyblockMenu';
let starPacket119: any = null;
let starPacket121: any = null;

const starClient119: any = {
  protocolVersion: 760,
  version: '1.19.2',
  write: (name: string, data: any) => { if (name === 'set_slot') starPacket119 = data; }
};
const starClient121: any = {
  protocolVersion: 767,
  version: '1.21.1',
  write: (name: string, data: any) => { if (name === 'set_slot') starPacket121 = data; }
};

giveNetherStar(starClient119);
giveNetherStar(starClient121);

assert(starPacket119 !== null, '1.19 Nether star packet must be generated');
assert(starPacket121 !== null, '1.21 Nether star packet must be generated');

const starBuf119 = ser119.createPacketBuffer({ name: 'set_slot', params: starPacket119 });
const starBuf121 = ser121.createPacketBuffer({ name: 'set_slot', params: starPacket121 });

assert(starBuf119.length > 0, '1.19 Nether star must serialize');
assert(starBuf121.length > 0, '1.21 Nether star must serialize');
console.log(`✅ 8.1 Nether Star serialized cleanly for both 1.19.2 (${starBuf119.length} bytes) and 1.21.1 (${starBuf121.length} bytes)`);

// ---------------------------------------------------------
// TEST 9: /boost Command Execution
// ---------------------------------------------------------
console.log('\n--- TEST 9: /boost Command Execution ---');
import { handleCommand } from './src/commands/commandHandler';
const testPlayerSession: any = {
  client: { write: () => {} },
  username: 'BoosterBot',
  entityId: 999,
  is119: true,
  stats: { speed: 100, farmingFortune: 0 }
};

handleCommand(testPlayerSession, '/boost 150');
assert.strictEqual(testPlayerSession.stats.farmingFortune, 150, 'Farming Fortune must increase by 150');
assert.strictEqual(testPlayerSession.stats.speed, 150, 'Speed must increase by 50');
console.log(`✅ 9.1 /boost successfully granted +150 Farming Fortune (Total: ${testPlayerSession.stats.farmingFortune}) and +50 Speed (Total: ${testPlayerSession.stats.speed})`);

console.log('\n🎉 ========================================================');
console.log('🎉 ALL 9 TESTS PASSED! CROP GUARDIAN & DROPS FULLY VERIFIED');
console.log('🎉 ========================================================');
process.exit(0);
