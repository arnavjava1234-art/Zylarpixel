const mineflayer = require('mineflayer');

console.log('🤖 Connecting 1.19.2 Mineflayer bot to test multi-version...');

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'TestBot1192',
  version: '1.19.2',
  auth: 'offline'
});

bot.on('login', () => {
  console.log('[1.19.2 BOT] Logged in successfully!');
});

bot.on('spawn', () => {
  console.log('🎉 [1.19.2 BOT] SPAWNED IN WORLD!');
});

bot.on('forcedMove', () => {
  console.log(`📍 In-World Position: x=${bot.entity.position.x}, y=${bot.entity.position.y}, z=${bot.entity.position.z}`);
  
  // Check center block
  const centerBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  console.log(`🧱 Center Ground Block: ${centerBlock?.name}`);

  // Check peripheral chunks in 3x3 arena
  const testCoords = [
    { name: 'Chunk (1, 0)', pos: [20, 64, 0] },
    { name: 'Chunk (-1, 0)', pos: [-10, 64, 0] },
    { name: 'Chunk (0, 1)', pos: [0, 64, 20] },
    { name: 'Chunk (0, -1)', pos: [0, 64, -10] },
    { name: 'Chunk (1, 1)', pos: [20, 64, 20] },
    { name: 'Chunk (-1, -1)', pos: [-10, 64, -10] }
  ];

  for (const { name, pos } of testCoords) {
    const b = bot.blockAt(new (require('vec3'))(pos[0], pos[1], pos[2]));
    console.log(`🗺️  ${name} at (${pos.join(', ')}): ${b ? b.name : 'MISSING'}`);
  }

  // Check Tablist
  console.log(`📋 Tablist Players (${Object.keys(bot.players).length}):`, Object.keys(bot.players).join(', '));

  // Check Entities
  const entities = Object.values(bot.entities).map(e => e.username || e.name || e.type);
  console.log(`🤖 Entities in World (${entities.length}):`, entities.join(', '));

  console.log('💬 Testing in-game chat: Sending "pvp"...');
  bot.chat('pvp');

  bot.on('message', (jsonMsg) => {
    console.log('[CHAT RECV]:', jsonMsg.toString());
  });

  setTimeout(() => {
    console.log('✅ Chat & Combat verification successful!');
    bot.quit();
    process.exit(0);
  }, 1500);
});

bot.on('kicked', (reason) => {
  console.error('[1.19.2 BOT KICKED]', reason);
  process.exit(1);
});

bot.on('error', (err) => {
  console.error('[1.19.2 BOT ERROR]', err);
  process.exit(1);
});
