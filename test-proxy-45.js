const mc = require('minecraft-protocol');
console.log('Testing 45s connection to Master Proxy 25565...');
const client = mc.createClient({ host: '127.0.0.1', port: 25565, username: 'TestProxy45', version: '1.21.8', auth: 'offline' });
let kaCount = 0;
let inLimbo = false;
let limboReason = '';

client.on('packet', (data, meta) => {
  if (meta.name === 'keep_alive') {
    kaCount++;
    console.log(`[${kaCount}] RECV keep_alive from proxy:`, data);
  }
  if (meta.name === 'system_chat') {
    const raw = JSON.stringify(data.content || '');
    if (raw.includes('Limbo') || raw.includes('restarting')) {
      inLimbo = true;
      limboReason = raw;
      console.warn('⚠️ [WARNING] Transferred to Limbo:', raw);
    }
  }
});
client.on('end', r => console.log('Client ended:', r));
client.on('error', e => console.log('Client error:', e.message));

setTimeout(() => {
  console.log(`45 SECONDS COMPLETED! Total keep_alives: ${kaCount}, In Limbo: ${inLimbo}`);
  client.end();
  process.exit(inLimbo ? 1 : 0);
}, 45000);
