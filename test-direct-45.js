const mc = require('minecraft-protocol');
console.log('Testing 45s direct connection to Hub 25566...');
const client = mc.createClient({ host: '127.0.0.1', port: 25566, username: 'TestDirect45', version: '1.21.8', auth: 'offline' });
let kaCount = 0;
client.on('packet', (data, meta) => {
  if (meta.name === 'keep_alive') {
    kaCount++;
    console.log(`[${kaCount}] RECV keep_alive:`, data);
  }
});
client.on('end', r => console.log('Client ended:', r));
client.on('error', e => console.log('Client error:', e.message));

setTimeout(() => {
  console.log('45 SECONDS COMPLETED! Total keep_alives: ' + kaCount);
  client.end();
  process.exit(0);
}, 45000);
