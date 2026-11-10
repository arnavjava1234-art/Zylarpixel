const mc = require('minecraft-protocol');
const assert = require('assert');

async function testTagsProtocol() {
  console.log('🧪 Starting Minecraft 1.21.8 Tags Protocol Test...\n');

  // Test Case 1: Explicit options.tags
  console.log('--- Test 1: Explicit options.tags ---');
  const sampleTags = [
    {
      tagType: 'minecraft:item',
      tags: [
        { tagName: 'minecraft:swords', entries: [100, 101, 102] },
        { tagName: 'minecraft:enchantable/sword', entries: [100, 101, 102] }
      ]
    },
    {
      tagType: 'minecraft:enchantment',
      tags: [
        { tagName: 'minecraft:exclusive_set/armor', entries: [1, 2, 3, 4] }
      ]
    },
    {
      tagType: 'minecraft:dialog',
      tags: [
        { tagName: 'minecraft:pause_screen_additions', entries: [] },
        { tagName: 'minecraft:quick_actions', entries: [] }
      ]
    }
  ];

  const server1 = mc.createServer({
    'online-mode': false,
    encryption: false,
    host: '127.0.0.1',
    port: 25591,
    version: '1.21.8',
    maxPlayers: 10,
    tags: sampleTags
  });

  await new Promise((resolve, reject) => {
    let tagsReceived = false;
    let joined = false;

    server1.on('listening', () => {
      console.log('Server 1 listening on 25591');

      const client = mc.createClient({
        host: '127.0.0.1',
        port: 25591,
        username: 'TestBot1',
        version: '1.21.8',
        auth: 'offline'
      });

      client.on('tags', (packet) => {
        console.log('✅ Client received "tags" packet in configuration phase!');
        console.log(`   Tag types received count: ${packet.tags.length}`);
        assert.strictEqual(packet.tags.length, 3, 'Expected 3 tag types');
        assert.strictEqual(packet.tags[0].tagType, 'minecraft:item');
        assert.strictEqual(packet.tags[0].tags[0].tagName, 'minecraft:swords');
        assert.deepStrictEqual(packet.tags[0].tags[0].entries, [100, 101, 102]);
        tagsReceived = true;
      });

      client.on('error', (err) => {
        console.error('Client error:', err);
        reject(err);
      });

      server1.on('playerJoin', (player) => {
        console.log('✅ Server emitted playerJoin for client:', player.username);
        joined = true;
        client.socket.destroy();
        server1.close();
        setTimeout(() => {
          assert(tagsReceived, 'Tags packet must have been received');
          assert(joined, 'Player must have completed configuration');
          console.log('✅ Test 1 Passed!\n');
          resolve();
        }, 100);
      });
    });
  });

  // Test Case 2: Default tags (fallback when options.tags is undefined)
  console.log('--- Test 2: Fallback when options.tags is omitted ---');
  const server2 = mc.createServer({
    'online-mode': false,
    encryption: false,
    host: '127.0.0.1',
    port: 25592,
    version: '1.21.8',
    maxPlayers: 10
  });

  await new Promise((resolve, reject) => {
    let tagsReceived = false;
    let joined = false;

    server2.on('listening', () => {
      console.log('Server 2 listening on 25592');

      const client = mc.createClient({
        host: '127.0.0.1',
        port: 25592,
        username: 'TestBot2',
        version: '1.21.8',
        auth: 'offline'
      });

      client.on('tags', (packet) => {
        console.log('✅ Client received "tags" packet with fallback/loaded tags!');
        console.log(`   Tag types count: ${packet.tags.length}`);
        assert(Array.isArray(packet.tags), 'Tags must be an array');
        tagsReceived = true;
      });

      client.on('error', (err) => {
        console.error('Client error:', err);
        reject(err);
      });

      server2.on('playerJoin', (player) => {
        console.log('✅ Server emitted playerJoin for client:', player.username);
        joined = true;
        client.socket.destroy();
        server2.close();
        setTimeout(() => {
          assert(tagsReceived, 'Tags packet must have been received');
          assert(joined, 'Player must have completed configuration');
          console.log('✅ Test 2 Passed!\n');
          resolve();
        }, 100);
      });
    });
  });

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! The Minecraft 1.21.8 tags packet patch is fully verified.');
  process.exit(0);
}

testTagsProtocol().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
