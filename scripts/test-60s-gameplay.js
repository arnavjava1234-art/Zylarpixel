const mc = require('minecraft-protocol');

const PROXY_PORT = 25565;
const PROXY_HOST = '127.0.0.1';
const BOT_NAME = 'ArnavE2E_60s';

console.log('===============================================================');
console.log('   🚀 ZYLARPIXEL 60-SECOND FULL-STACK LIVE PLAYTHROUGH TEST');
console.log('===============================================================');
console.log(`Connecting to Master Proxy ${PROXY_HOST}:${PROXY_PORT} as ${BOT_NAME}...`);

const startTime = Date.now();
let keepAlivesAnswered = 0;
let positionPacketsSent = 0;
let chunksReceived = 0;
let entityTeleportsReceived = 0;
let wentToLimbo = false;
let limboReason = '';
let isEnded = false;

const client = mc.createClient({
  host: PROXY_HOST,
  port: PROXY_PORT,
  username: BOT_NAME,
  version: '1.21.8',
  auth: 'offline',
  skipValidation: true
});

client.on('connect', () => {
  console.log('✅ TCP Socket connected to Proxy!');
});

client.on('state', (state) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️ [${elapsed}s] State transition: ${state}`);
});

client.on('packet', (data, meta) => {
  if (meta.name === 'keep_alive') {
    keepAlivesAnswered++;
    try {
      client.write('keep_alive', { keepAliveId: data.keepAliveId });
    } catch (e) {
      console.error('Error writing keep_alive reply:', e.message);
    }
  }

  if (meta.name === 'map_chunk') {
    chunksReceived++;
  }

  if (meta.name === 'entity_teleport') {
    entityTeleportsReceived++;
  }

  if (meta.name === 'system_chat') {
    const raw = JSON.stringify(data.content);
    if (raw.includes('Limbo') || raw.includes('restarting')) {
      wentToLimbo = true;
      limboReason = raw;
      console.warn(`⚠️ [WARNING] Detected Limbo notification: ${raw}`);
    }
  }
});

let walkInterval = null;
let statusInterval = null;

client.on('state', (state) => {
  if (state === 'play') {
    console.log('🎮 Successfully transitioned into PLAY state on Hub server!');

    let curX = -2.5;
    let curY = 71.0;
    let curZ = -66.5;
    let dir = 1;

    // Simulate player walking around Hub spawn
    walkInterval = setInterval(() => {
      if (isEnded) return;
      curX += 0.2 * dir;
      if (curX > 5.0) dir = -1;
      if (curX < -15.0) dir = 1;

      positionPacketsSent++;
      try {
        client.write('position', {
          x: curX,
          y: curY,
          z: curZ,
          flags: { onGround: true, hasHorizontalCollision: false }
        });
      } catch (_) {}
    }, 200);

    // Heartbeat log every 5s
    statusInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`📊 [${elapsed}s/60s] Healthy! | Chunks: ${chunksReceived} | Walk packets: ${positionPacketsSent} | KeepAlives: ${keepAlivesAnswered} | Entity teleports: ${entityTeleportsReceived} | In Limbo: ${wentToLimbo ? 'YES (FAIL)' : 'NO (GOOD)'}`);
    }, 5000);
  }
});

client.on('error', (err) => {
  console.error('❌ Client error occurred:', err);
  cleanupAndExit(false, `Client Error: ${err.message}`);
});

client.on('end', (reason) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (elapsed < 58.0) {
    console.error(`❌ Connection DROPPED prematurely at ${elapsed}s! Reason: ${reason}`);
    cleanupAndExit(false, `Premature disconnect at ${elapsed}s: ${reason}`);
  } else {
    console.log(`🔌 Connection closed cleanly at ${elapsed}s.`);
  }
});

// Run for a full 60 seconds!
setTimeout(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🏁 60 SECONDS COMPLETED! (Exact time: ${elapsed}s)`);
  
  if (wentToLimbo) {
    cleanupAndExit(false, `Player was redirected to Limbo! (${limboReason})`);
  } else if (chunksReceived < 5) {
    cleanupAndExit(false, `Too few chunks received: ${chunksReceived}`);
  } else {
    cleanupAndExit(true, 'Full 60s uninterrupted session on Hub server!');
  }
}, 60000);

function cleanupAndExit(success, message) {
  isEnded = true;
  if (walkInterval) clearInterval(walkInterval);
  if (statusInterval) clearInterval(statusInterval);
  try { client.end(); } catch (_) {}

  console.log('===============================================================');
  console.log(`• Final Verdict: ${success ? '✅ PASS - 100% STABLE' : '❌ FAIL'}`);
  console.log(`• Message: ${message}`);
  console.log(`• Total chunks received: ${chunksReceived}`);
  console.log(`• Total movement packets: ${positionPacketsSent}`);
  console.log(`• Total keep_alives answered: ${keepAlivesAnswered}`);
  console.log(`• Went to Limbo: ${wentToLimbo}`);
  console.log('===============================================================');

  process.exit(success ? 0 : 1);
}
