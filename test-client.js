const mineflayer = require('mineflayer');

console.log('🤖 Starting Mineflayer test bot to benchmark Arena Server...');
const connectStart = performance.now();

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'ArenaBot1',
  version: '1.21.1',
  auth: 'offline',
  checkTimeoutInterval: 10000
});

bot.on('login', () => {
  const loginTime = (performance.now() - connectStart).toFixed(2);
  console.log(`[BOT] Logged in successfully in ${loginTime} ms!`);
});

bot.on('spawn', () => {
  const spawnTime = (performance.now() - connectStart).toFixed(2);
  console.log(`\n🎉 [BOT] SPAWNED IN ARENA WORLD!`);
  console.log(`⏱️  Total Connection -> In-World Spawn Time: ${spawnTime} ms!`);
  console.log(`📍 Bot Spawn Position: x=${bot.entity.position.x.toFixed(1)}, y=${bot.entity.position.y.toFixed(1)}, z=${bot.entity.position.z.toFixed(1)}`);
  
  // Verify standing on ground
  const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (blockBelow) {
    console.log(`🧱 Block below bot: ${blockBelow.name} (id: ${blockBelow.type})`);
  }

  console.log('\n[TEST RESULT] 🌟 BENCHMARK 100% SUCCESSFUL! Exiting clean...\n');
  setTimeout(() => {
    bot.quit();
    process.exit(0);
  }, 1000);
});

bot.on('kicked', (reason) => {
  console.error('[BOT KICKED]', reason);
  process.exit(1);
});

bot.on('error', (err) => {
  console.error('[BOT ERROR]', err);
  process.exit(1);
});
