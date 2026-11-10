const mc = require('minecraft-protocol');

console.log('===============================================================');
console.log('  Testing 60-Second Full Connection Stability on Port 25565');
console.log('===============================================================');

const startTime = Date.now();
const client = mc.createClient({
  host: '127.0.0.1',
  port: 25565,
  username: 'Subagent2_60s',
  version: '1.21.8',
  auth: 'offline'
});

let keepAlives = 0;
let movedToLimbo = false;
let limboDetails = '';
let disconnectedPrematurely = false;
let disconnectReason = '';

client.on('connect', () => {
  console.log('Connected to Master Proxy on 25565!');
});

client.on('state', (state) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] State: ${state}`);
});

client.on('packet', (data, meta) => {
  if (meta.name === 'keep_alive') {
    keepAlives++;
    if (keepAlives % 3 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Received keep_alive #${keepAlives}`);
    }
  }

  if (meta.name === 'system_chat') {
    const raw = JSON.stringify(data.content || '');
    if (raw.toLowerCase().includes('limbo') || raw.toLowerCase().includes('restarting')) {
      movedToLimbo = true;
      limboDetails = raw;
      console.warn('❌ [ERROR] Player transferred to Limbo:', raw);
    }
  }

  if (meta.name === 'set_title_text' || meta.name === 'set_title_subtitle') {
    const raw = JSON.stringify(data.text || '');
    if (raw.toLowerCase().includes('limbo')) {
      movedToLimbo = true;
      limboDetails = raw;
      console.warn('❌ [ERROR] Limbo Title detected:', raw);
    }
  }
});

// Periodic position updates to simulate active player
const moveInterval = setInterval(() => {
  if (client.state === 'play') {
    try {
      client.write('position', {
        x: -2.5 + Math.sin(Date.now() / 1000),
        y: 71.0,
        z: -66.5 + Math.cos(Date.now() / 1000),
        flags: { onGround: true, hasHorizontalCollision: false }
      });
    } catch (_) {}
  }
}, 500);

client.on('end', (reason) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  clearInterval(moveInterval);
  if (elapsed < 58.0) {
    disconnectedPrematurely = true;
    disconnectReason = `Disconnected prematurely at ${elapsed}s: ${reason}`;
    console.error('❌', disconnectReason);
  } else {
    console.log(`Connection ended cleanly at ${elapsed}s.`);
  }
});

client.on('error', (err) => {
  console.error('❌ Socket Error:', err.message);
});

setTimeout(() => {
  clearInterval(moveInterval);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('===============================================================');
  console.log(`Test Finished after ${elapsed}s!`);
  console.log(`• Keepalives received: ${keepAlives}`);
  console.log(`• Moved to Limbo: ${movedToLimbo}`);
  console.log(`• Premature Disconnect: ${disconnectedPrematurely}`);
  console.log('===============================================================');

  client.end();
  const passed = !movedToLimbo && !disconnectedPrematurely && keepAlives >= 10;
  console.log(`VERDICT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  process.exit(passed ? 0 : 1);
}, 60000);
