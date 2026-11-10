import * as mc from 'minecraft-protocol';
import { sanitizedDimensionCodec1218 } from '../src/world/worldManager';
import { tagRegistryManager } from '../src/world/tagRegistryManager';

const TEST_PORT = 25593;

console.log('🧪 Starting Multi-Version 1.21.8 & 1.21.11 Registry Compatibility Test...');
console.log(`Total registries in codec: ${Object.keys(sanitizedDimensionCodec1218).length}`);
console.log(`Has zombie_nautilus_variant: ${'minecraft:zombie_nautilus_variant' in sanitizedDimensionCodec1218}`);

const server = (mc as any).createServer({
  'online-mode': false,
  encryption: false,
  host: '127.0.0.1',
  port: TEST_PORT,
  version: '1.21.8',
  maxPlayers: 10,
  registryCodec: sanitizedDimensionCodec1218,
  tags: tagRegistryManager.getTagPacketData()
});

server.on('playerJoin', (client: any) => {
  console.log(`[SERVER] Player joined: ${client.username} [Protocol: ${client.protocolVersion}, Version: ${client.version}]`);
  client.write('login', {
    entityId: 1001,
    isHardcore: false,
    worldNames: ['minecraft:overworld'],
    maxPlayers: 10,
    viewDistance: 8,
    simulationDistance: 8,
    reducedDebugInfo: false,
    enableRespawnScreen: true,
    doLimitedCrafting: false,
    dimensionType: 'minecraft:overworld',
    worldName: 'minecraft:overworld',
    hashedSeed: [0, 0],
    gameMode: 0,
    isFlat: true
  });
});

let testPassed = false;

server.on('listening', () => {
  console.log(`[SERVER] Test server listening on ${TEST_PORT}`);

  const client = mc.createClient({
    host: '127.0.0.1',
    port: TEST_PORT,
    username: 'OptiFine1218Bot',
    version: '1.21.8',
    auth: 'offline',
    skipValidation: true
  });

  const receivedRegistries: string[] = [];
  let receivedTags = false;
  let receivedFinishConfig = false;
  let playEntered = false;

  client.on('packet', (data: any, meta: any) => {
    if (meta.state === 'configuration') {
      if (meta.name === 'registry_data') {
        const regId = data.id || data.codec?.id;
        receivedRegistries.push(regId);
      }
      if (meta.name === 'tags') {
        receivedTags = true;
      }
      if (meta.name === 'finish_configuration') {
        receivedFinishConfig = true;
      }
    }
    if (meta.state === 'play' && meta.name === 'login') {
      playEntered = true;
      console.log('✅ Client successfully entered Play state!');
      console.log(`   Total registries received by 1.21.8 client: ${receivedRegistries.length}`);
      console.log(`   zombie_nautilus_variant received: ${receivedRegistries.includes('minecraft:zombie_nautilus_variant')}`);
      console.log(`   Tags received: ${receivedTags}`);
      console.log(`   Finish configuration received: ${receivedFinishConfig}`);

      if (
        receivedRegistries.includes('minecraft:zombie_nautilus_variant') &&
        receivedTags &&
        receivedFinishConfig &&
        playEntered
      ) {
        testPassed = true;
        console.log('\n🎉 SUCCESS: 1.21.8 client safely received and tolerated minecraft:zombie_nautilus_variant without rejection!');
        cleanupAndExit(0);
      } else {
        console.error('❌ Missing expected state transitions');
        cleanupAndExit(1);
      }
    }
  });

  client.on('error', (err: any) => {
    console.error('❌ Client error:', err);
    cleanupAndExit(1);
  });

  setTimeout(() => {
    if (!testPassed) {
      console.error('❌ Test timed out!');
      cleanupAndExit(1);
    }
  }, 10000);

  function cleanupAndExit(code: number) {
    try { client.end(); } catch (_) {}
    try { server.close(); } catch (_) {}
    setTimeout(() => process.exit(code), 500);
  }
});
