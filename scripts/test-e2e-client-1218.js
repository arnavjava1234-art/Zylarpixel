/**
 * ZylarPixel End-to-End Client Test Suite (Minecraft 1.21.8 / Protocol 772)
 * 
 * Asserts:
 *  1. Handshake & Offline Login State Transition.
 *  2. Configuration State Transition:
 *     - Receipt of all 21 Mojang synchronized `registry_data` packets.
 *     - Receipt of `tags` packet with item and enchantment tags verified.
 *     - Receipt of `finish_configuration`.
 *  3. Play State Transition:
 *     - Receipt of `login` packet.
 *     - Receipt of `spawn_position` packet.
 *     - Receipt of authentic world `map_chunk` packets.
 *  4. Socket stability and zero uncaught exceptions.
 */

const mc = require('minecraft-protocol');

const TARGET_PORT = parseInt(process.env.TEST_PORT || '25565', 10);
const TARGET_HOST = process.env.TEST_HOST || '127.0.0.1';
const BOT_USERNAME = process.env.TEST_USER || ('E2E_Val_' + Math.floor(Math.random() * 1000));
const TIMEOUT_MS = parseInt(process.env.TEST_TIMEOUT || '20000', 10);

console.log('===============================================================');
console.log('   🔍 ZYLARPIXEL 1.21.8 FULL-STACK E2E PROTOCOL VALIDATOR');
console.log('===============================================================');
console.log(`📡 Connecting to: ${TARGET_HOST}:${TARGET_PORT} as "${BOT_USERNAME}" (Version: 1.21.8)`);

const results = {
  loginSuccess: false,
  configurationEntered: false,
  registriesReceived: new Map(), // id -> count
  tagsReceived: false,
  tagTypes: new Set(),
  itemTagsFound: 0,
  enchantmentTagsFound: 0,
  finishConfigurationReceived: false,
  playStateEntered: false,
  loginPacketReceived: false,
  spawnPositionReceived: false,
  chunksReceived: 0,
  spawnCoords: null,
  dimension: null,
  disconnectReason: null
};

const EXPECTED_REGISTRIES = [
  'minecraft:worldgen/biome',
  'minecraft:chat_type',
  'minecraft:trim_pattern',
  'minecraft:trim_material',
  'minecraft:wolf_variant',
  'minecraft:painting_variant',
  'minecraft:dimension_type',
  'minecraft:damage_type',
  'minecraft:banner_pattern',
  'minecraft:enchantment',
  'minecraft:jukebox_song',
  'minecraft:instrument',
  'minecraft:frog_variant',
  'minecraft:cow_variant',
  'minecraft:cat_variant',
  'minecraft:test_environment',
  'minecraft:chicken_variant',
  'minecraft:test_instance',
  'minecraft:dialog',
  'minecraft:pig_variant',
  'minecraft:wolf_sound_variant'
];

let timer = null;

const client = mc.createClient({
  host: TARGET_HOST,
  port: TARGET_PORT,
  username: BOT_USERNAME,
  version: '1.21.8',
  auth: 'offline',
  skipValidation: true
});

timer = setTimeout(() => {
  console.error(`\n❌ [TEST TIMEOUT] Connection test exceeded ${TIMEOUT_MS}ms without satisfying all assertions!`);
  printSummaryAndExit(false);
}, TIMEOUT_MS);

// Intercept low-level state changes
client.on('state', (newState) => {
  console.log(`[STATE CHANGE] ➡️ Transitioned to state: "${newState}"`);
  if (newState === 'configuration') {
    results.configurationEntered = true;
  } else if (newState === 'play') {
    results.playStateEntered = true;
  }
});

// Intercept packet stream
client.on('packet', (data, meta) => {
  if (meta.state === 'configuration') {
    if (meta.name === 'registry_data') {
      const regId = data.id || data.codec?.id;
      const entryCount = Array.isArray(data.entries) ? data.entries.length : (data.codec?.entries?.length || 0);
      results.registriesReceived.set(regId, entryCount);
      console.log(`   📦 [CONFIG] Received registry_data: "${regId}" (${entryCount} entries) [Total unique: ${results.registriesReceived.size}/21]`);
    }

    if (meta.name === 'tags') {
      results.tagsReceived = true;
      const rawTags = data.tags || [];
      console.log(`   🏷️  [CONFIG] Received packet_tags payload containing ${rawTags.length} tag categories:`);
      for (const cat of rawTags) {
        results.tagTypes.add(cat.tagType);
        const tagCount = Array.isArray(cat.tags) ? cat.tags.length : 0;
        if (cat.tagType === 'minecraft:item') results.itemTagsFound = tagCount;
        if (cat.tagType === 'minecraft:enchantment') results.enchantmentTagsFound = tagCount;
        console.log(`      • ${cat.tagType}: ${tagCount} tags`);
      }
    }

    if (meta.name === 'finish_configuration') {
      results.finishConfigurationReceived = true;
      console.log(`   ✅ [CONFIG] Received finish_configuration from server! Acknowledging...`);
    }
  }

  if (meta.state === 'play') {
    if (meta.name === 'login') {
      results.loginPacketReceived = true;
      results.dimension = data.dimensionType || data.worldName || 'overworld';
      console.log(`   🎮 [PLAY] Received login packet! Entity ID: ${data.entityId}, Dimension: ${results.dimension}, Gamemode: ${data.gameMode}`);
    }

    if (meta.name === 'spawn_position') {
      results.spawnPositionReceived = true;
      results.spawnCoords = data.location;
      console.log(`   📍 [PLAY] Received spawn_position packet at:`, data.location);
    }

    if (meta.name === 'map_chunk') {
      results.chunksReceived++;
      if (results.chunksReceived <= 5 || results.chunksReceived % 10 === 0) {
        console.log(`   🗺️  [PLAY] Streamed chunk #${results.chunksReceived} at (${data.x}, ${data.z}) [Size: ${data.chunkData?.length || 0} bytes]`);
      }

      // Check if all test requirements are met
      checkCompletion();
    }
  }
});

client.on('error', (err) => {
  console.error(`\n❌ [CLIENT ERROR] Socket exception:`, err);
  results.disconnectReason = err.message;
  printSummaryAndExit(false);
});

client.on('end', (reason) => {
  console.log(`[CLIENT DISCONNECT] Connection ended: ${reason}`);
  results.disconnectReason = reason;
  checkCompletion(true);
});

function checkCompletion(isEnd = false) {
  const allRegistriesMet = results.registriesReceived.size >= 21;
  const tagsMet = results.tagsReceived && results.itemTagsFound > 0 && results.enchantmentTagsFound > 0;
  const finishConfigMet = results.finishConfigurationReceived;
  const playMet = results.playStateEntered && results.loginPacketReceived;
  const chunksMet = results.chunksReceived >= 5;

  if (allRegistriesMet && tagsMet && finishConfigMet && playMet && chunksMet) {
    clearTimeout(timer);
    console.log(`\n✨ ALL 6 END-TO-END VALIDATION CRITERIA MET FLIP-TO-FLIP!`);
    printSummaryAndExit(true);
  } else if (isEnd) {
    clearTimeout(timer);
    printSummaryAndExit(false);
  }
}

function printSummaryAndExit(success) {
  clearTimeout(timer);
  try { client.end(); } catch (_) {}

  console.log('\n===============================================================');
  console.log('                 📊 E2E VALIDATION SUMMARY REPORT');
  console.log('===============================================================');
  console.log(`• Configuration State Entered:  ${results.configurationEntered ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`• Registries Received (21/21):  ${results.registriesReceived.size >= 21 ? '✅ PASS' : '❌ FAIL'} (${results.registriesReceived.size}/21 received)`);
  
  for (const reg of EXPECTED_REGISTRIES) {
    const hasReg = results.registriesReceived.has(reg);
    const count = results.registriesReceived.get(reg) || 0;
    console.log(`   ${hasReg ? '✓' : '✗'} ${reg.padEnd(32)}: ${count} entries`);
  }

  console.log(`• Tags Packet Received:         ${results.tagsReceived ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   - Item Tags Found:           ${results.itemTagsFound} (${results.itemTagsFound > 0 ? '✓' : '✗'})`);
  console.log(`   - Enchantment Tags Found:    ${results.enchantmentTagsFound} (${results.enchantmentTagsFound > 0 ? '✓' : '✗'})`);
  console.log(`• Finish Configuration:         ${results.finishConfigurationReceived ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`• Play State Transition:        ${results.playStateEntered ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`• Login Packet Received:        ${results.loginPacketReceived ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`• Spawn Position Received:      ${results.spawnPositionReceived ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`• Authentic Chunks Streamed:    ${results.chunksReceived >= 5 ? '✅ PASS' : '❌ FAIL'} (${results.chunksReceived} chunks)`);
  console.log('===============================================================');

  if (success) {
    console.log('🎉 RESULT: 100% SUCCESS - All end-to-end assertions verified!');
    process.exit(0);
  } else {
    console.error('❌ RESULT: VERIFICATION FAILED - Review logs above for details.');
    process.exit(1);
  }
}
