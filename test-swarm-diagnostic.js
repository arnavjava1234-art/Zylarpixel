const mc = require('minecraft-protocol');

console.log('Testing 25 bots connection through Proxy...');
const bots = [];

async function main() {
  for (let i = 1; i <= 25; i++) {
    const username = `Diag_${String(i).padStart(3, '0')}`;
    const client = mc.createClient({
      host: '127.0.0.1',
      port: 25565,
      username,
      version: '1.21.8',
      auth: 'offline'
    });

    client.on('login', () => {
      console.log(`✅ ${username} logged in!`);
    });

    client.on('kick_disconnect', (data) => {
      console.warn(`⚠️ ${username} received kick_disconnect:`, JSON.stringify(data));
    });

    client.on('error', (err) => {
      console.error(`❌ ${username} error:`, err.message);
    });

    client.on('end', () => {
      // Disconnect
    });

    bots.push(client);
    await new Promise(r => setTimeout(r, 120));
  }

  console.log('All 25 bots launched! Waiting 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('Disconnecting bots...');
  for (const b of bots) {
    try { b.end(); } catch(_) {}
  }
  console.log('Done!');
  process.exit(0);
}

main().catch(console.error);
