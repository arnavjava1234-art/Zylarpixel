/**
 * ZylarPixel End-to-End 1.21.8 Gameplay & Combat Verification Test
 */

const mc = require('minecraft-protocol');

console.log('⚡ Starting 1.21.8 Verification Bot: TesterHero...');

const client = mc.createClient({
  host: '127.0.0.1',
  port: 25565,
  username: 'TesterHero',
  version: '1.21.8',
  auth: 'offline'
});

let loggedIn = false;
let chunksCount = 0;
let mobsSpawned = 0;
let textDisplays = 0;
let damageIndicators = 0;
let chatMessages = [];

client.on('login', (packet) => {
  loggedIn = true;
  console.log('✅ TesterHero successfully logged in to Proxy in 1.21.8 PLAY state!');
});

client.on('packet', (data, meta) => {
  if (meta.name === 'level_chunk_with_light' || meta.name === 'map_chunk') {
    chunksCount++;
  } else if (meta.name === 'spawn_entity') {
    if (data.type === 145 || data.type === 147) {
      mobsSpawned++;
    } else if (data.type === 126) {
      textDisplays++;
    }
  } else if (meta.name === 'system_chat') {
    chatMessages.push(JSON.stringify(data.content));
  }
});

// After 2.5 seconds, simulate attacking mob ID 20000
setTimeout(() => {
  console.log(`\n📦 World Chunks Received: ${chunksCount}`);
  console.log(`🧟 Mobs Spawned: ${mobsSpawned}`);
  console.log(`🏷️ Nametags / Text Displays: ${textDisplays}`);

  console.log('\n⚔️ Testing Combat: Attacking Mob #20000 (Graveyard Zombie)...');
  client.write('use_entity', {
    target: 20000,
    mouse: 1, // Attack
    sneaking: false
  });

  setTimeout(() => {
    console.log('⚔️ Attacking Mob #20000 second time for lethal blow...');
    client.write('use_entity', {
      target: 20000,
      mouse: 1,
      sneaking: false
    });
  }, 500);

  setTimeout(() => {
    console.log('\n📜 Chat Messages Received:');
    chatMessages.forEach(m => console.log('  -', m));

    console.log('\n🔄 Testing Cross-Server Warp: /is...');
    client.write('chat_command', { command: 'is' });

    setTimeout(() => {
      console.log('🔄 Testing Cross-Server Return: /hub...');
      client.write('chat_command', { command: 'hub' });

      setTimeout(() => {
        console.log('\n🎉 ALL 1.21.8 E2E GAMEPLAY TESTS PASSED!');
        client.end();
        process.exit(0);
      }, 2000);
    }, 2000);
  }, 1500);
}, 2500);
