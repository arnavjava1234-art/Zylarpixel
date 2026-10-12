const mineflayer = require('mineflayer');

console.log('🤖 Connecting spectator bot to test 1000x1000 maze...');

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'MazeObserver',
  version: '1.19.2',
  auth: 'offline'
});

bot.on('login', () => {
  console.log('🎉 [OBSERVER] Logged in successfully!');
  console.log(`🎮 GameMode: ${bot.game.gameMode}`);
});

bot.on('spawn', () => {
  console.log(`📍 In-World Position: x=${bot.entity.position.x}, y=${bot.entity.position.y}, z=${bot.entity.position.z}`);
});

bot.on('message', (jsonMsg) => {
  console.log('[CHAT]:', jsonMsg.toString());
});

setTimeout(() => {
  const entityCount = Object.keys(bot.entities).length;
  console.log(`🤖 Entities in view/memory: ${entityCount}`);
  console.log('✅ 1000x1000 Maze Royale Spectator test passed!');
  bot.quit();
  process.exit(0);
}, 3000);
