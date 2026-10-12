/**
 * ZylarBot - Lightweight Mineflayer Test Bot
 * Connects to ZylarPixel on 127.0.0.1:25565 to test multiplayer and /visit
 */

const mineflayer = require('mineflayer');

function createBot() {
  console.log('🤖 Connecting ZylarBot to ZylarPixel (127.0.0.1:25565)...');

  const bot = mineflayer.createBot({
    host: '127.0.0.1',
    port: 25565,
    username: 'ZylarBot',
    version: '1.19.2',
    auth: 'offline'
  });

  bot.on('login', () => {
    console.log('🤖 [BOT] ZylarBot logged in successfully!');
  });

  bot.on('spawn', () => {
    console.log(`🤖 [BOT] ZylarBot spawned at coordinates: (${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)})`);
  });

  bot.on('message', (jsonMsg) => {
    const str = jsonMsg.toString();
    if (str.trim()) {
      console.log(`🤖 [BOT MSG] ${str}`);
    }
  });

  bot.on('kicked', (reason) => {
    console.log('🤖 [BOT] Kicked from server:', reason);
  });

  bot.on('error', (err) => {
    console.error('🤖 [BOT ERROR]:', err.message);
  });

  bot.on('end', () => {
    console.log('🤖 [BOT] Connection ended. Reconnecting in 3 seconds...');
    setTimeout(createBot, 3000);
  });
}

createBot();
