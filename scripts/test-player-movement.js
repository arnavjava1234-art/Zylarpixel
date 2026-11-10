/**
 * Movement & Crop Guardian Teleport Stress Test
 * Simulates a player walking across the Hub directly into the Crop Guardian / Farm Merchant tracking zone.
 * Asserts:
 *  - Player walks around Hub coordinates (-2.5, 71, -66.5) -> (-45, 70, -60).
 *  - Intercepts incoming `entity_teleport` packets from the server.
 *  - Verifies server stability and no socket closure / protocol errors.
 */

const mc = require('minecraft-protocol');

const TARGET_PORT = parseInt(process.env.TEST_PORT || '25565', 10);
const TARGET_HOST = process.env.TEST_HOST || '127.0.0.1';
const BOT_USERNAME = 'MoveTester_' + Math.floor(Math.random() * 1000);

console.log(`🏃 Starting Player Movement & Entity Teleport Test on ${TARGET_HOST}:${TARGET_PORT}...`);

const client = mc.createClient({
  host: TARGET_HOST,
  port: TARGET_PORT,
  username: BOT_USERNAME,
  version: '1.21.8',
  auth: 'offline',
  skipValidation: true
});

let entityTeleportsReceived = 0;
let positionUpdatesSent = 0;
let moveInterval = null;

client.on('packet', (data, meta) => {
  if (meta.name === 'entity_teleport') {
    entityTeleportsReceived++;
    console.log(`   📡 Received entity_teleport for entityId=${data.entityId} at (${data.x.toFixed(2)}, ${data.y.toFixed(2)}, ${data.z.toFixed(2)}) flags=${JSON.stringify(data.flags)}`);
  }
});

client.on('state', (state) => {
  if (state === 'play') {
    console.log('   🎮 Joined play state! Initiating walking patrol toward Farm Merchant / Crop Guardian...');

    let curX = -2.5;
    let curY = 71.0;
    let curZ = -66.5;
    const destX = -45.0;
    const destZ = -60.0;

    moveInterval = setInterval(() => {
      // Step toward destination
      const stepX = (destX - curX) * 0.15;
      const stepZ = (destZ - curZ) * 0.15;

      curX += stepX;
      curZ += stepZ;
      positionUpdatesSent++;

      try {
        client.write('position', {
          x: curX,
          y: curY,
          z: curZ,
          onGround: true
        });
      } catch (err) {
        console.error('Failed writing position:', err);
      }

      if (positionUpdatesSent % 10 === 0) {
        console.log(`   🚶 Patrol step #${positionUpdatesSent}: Player at (${curX.toFixed(1)}, ${curY.toFixed(1)}, ${curZ.toFixed(1)})`);
      }

      if (positionUpdatesSent >= 40) {
        clearInterval(moveInterval);
        console.log(`\n🎉 MOVEMENT PATROL COMPLETED SUCCESSFULLY!`);
        console.log(`   • Total Position Packets Sent: ${positionUpdatesSent}`);
        console.log(`   • Total entity_teleport Packets Received: ${entityTeleportsReceived}`);
        client.end('Test Completed Cleanly');
        process.exit(0);
      }
    }, 100);
  }
});

client.on('error', (err) => {
  console.error('❌ Socket Error during movement test:', err);
  if (moveInterval) clearInterval(moveInterval);
  process.exit(1);
});

client.on('end', (reason) => {
  if (positionUpdatesSent < 40) {
    console.error('❌ Connection ended prematurely:', reason);
    if (moveInterval) clearInterval(moveInterval);
    process.exit(1);
  }
});
