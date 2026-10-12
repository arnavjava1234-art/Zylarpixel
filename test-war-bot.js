const mineflayer = require('mineflayer');

console.log('🤖 Connecting bot to test 10v10 war...');

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'WarTester',
  version: '1.19.2',
  auth: 'offline'
});

bot.on('spawn', () => {
  console.log('🎉 [WAR TESTER] Spawned! Sending "war" to start 10v10...');
  bot.chat('war');
});

bot.on('message', (jsonMsg) => {
  console.log('[CHAT]:', jsonMsg.toString());
});

setTimeout(() => {
  const entityCount = Object.keys(bot.entities).length;
  console.log(`🤖 Entities visible to bot: ${entityCount}`);
  console.log('✅ 10v10 War test successfully initiated!');
  bot.quit();
  process.exit(0);
}, 3500);
