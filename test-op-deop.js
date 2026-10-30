const mineflayer = require('mineflayer');

console.log('🧪 Starting 2-Bot /op and /deop Live Automated Test...');

function createTestBot(username) {
  return mineflayer.createBot({
    host: '127.0.0.1',
    port: 25565,
    username,
    version: '1.19.2',
    auth: 'offline'
  });
}

const botOwner = createTestBot('ARNAVJAVA');
const botTarget = createTestBot('RandomPlayer123');

const chatLogs = {
  ARNAVJAVA: [],
  RandomPlayer123: []
};

botOwner.on('message', (jsonMsg) => {
  const text = jsonMsg.toString();
  console.log('[CHAT ARNAVJAVA]:', text);
  chatLogs.ARNAVJAVA.push(text);
});

botTarget.on('message', (jsonMsg) => {
  const text = jsonMsg.toString();
  console.log('[CHAT RandomPlayer123]:', text);
  chatLogs.RandomPlayer123.push(text);
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('⏳ Waiting for both bots to connect and spawn...');
  await Promise.all([
    new Promise(res => botOwner.once('spawn', res)),
    new Promise(res => botTarget.once('spawn', res))
  ]);
  console.log('✅ Both bots spawned successfully!');
  await sleep(1000);

  // 1. Test Tab Completion for ARNAVJAVA
  console.log('\n--- TEST 1: Tab Completion on /op and /deop ---');
  try {
    const opMatches = await botOwner.tabComplete('/op ');
    console.log('Matches for "/op ":', opMatches);
    const hasTargetInOp = opMatches.some(m => (typeof m === 'string' ? m : m.match || '').toLowerCase().includes('randomplayer123'));
    console.log('RandomPlayer123 in /op tab suggestions?', hasTargetInOp ? '✅ YES' : '❌ NO');

    const deopMatches = await botOwner.tabComplete('/deop ');
    console.log('Matches for "/deop ":', deopMatches);
    const hasTargetInDeop = deopMatches.some(m => (typeof m === 'string' ? m : m.match || '').toLowerCase().includes('randomplayer123'));
    console.log('RandomPlayer123 in /deop tab suggestions?', hasTargetInDeop ? '✅ YES' : '❌ NO');
  } catch (err) {
    console.log('Tab complete error:', err.message);
  }

  // 2. Test Self /deop and /op
  console.log('\n--- TEST 2: Self /deop and /op by Owner ---');
  botOwner.chat('/deop');
  await sleep(600);
  const selfDeopMsg = chatLogs.ARNAVJAVA[chatLogs.ARNAVJAVA.length - 1] || '';
  console.log('Self /deop result:', selfDeopMsg);

  botOwner.chat('/op');
  await sleep(600);
  const selfOpMsg = chatLogs.ARNAVJAVA[chatLogs.ARNAVJAVA.length - 1] || '';
  console.log('Self /op result:', selfOpMsg);

  // 3. Test Unauthorized OP attempts by RandomPlayer123
  console.log('\n--- TEST 3: Unauthorized OP by Non-OP Player ---');
  botTarget.chat('/op');
  await sleep(600);
  const unauthSelfOp = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Unauthorized self /op result:', unauthSelfOp);

  botTarget.chat('/op RandomPlayer123');
  await sleep(600);
  const unauthTargetOp = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Unauthorized target /op result:', unauthTargetOp);

  // 4. Test Owner Granting OP to RandomPlayer123
  console.log('\n--- TEST 4: Owner Grants OP to RandomPlayer123 (/op RandomPlayer123) ---');
  botOwner.chat('/op RandomPlayer123');
  await sleep(800);
  const ownerGrantMsg = chatLogs.ARNAVJAVA[chatLogs.ARNAVJAVA.length - 1] || '';
  const targetRecvMsg = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Owner notification:', ownerGrantMsg);
  console.log('Target notification:', targetRecvMsg);

  // 5. Test Owner Protection (RandomPlayer123 tries to /deop ARNAVJAVA)
  console.log('\n--- TEST 5: Owner Protection (RandomPlayer123 attempts /deop ARNAVJAVA) ---');
  botTarget.chat('/deop ARNAVJAVA');
  await sleep(600);
  const protectMsg = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Owner protection result:', protectMsg);

  // 6. Test Owner Revoking OP from RandomPlayer123
  console.log('\n--- TEST 6: Owner Revokes OP from RandomPlayer123 (/deop RandomPlayer123) ---');
  botOwner.chat('/deop RandomPlayer123');
  await sleep(800);
  const ownerRevokeMsg = chatLogs.ARNAVJAVA[chatLogs.ARNAVJAVA.length - 1] || '';
  const targetRevokedMsg = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Owner notification:', ownerRevokeMsg);
  console.log('Target notification:', targetRevokedMsg);

  // 7. Verify RandomPlayer123 no longer has OP permissions (/admin)
  console.log('\n--- TEST 7: Target Denied Admin Access ---');
  botTarget.chat('/admin');
  await sleep(600);
  const adminDeniedMsg = chatLogs.RandomPlayer123[chatLogs.RandomPlayer123.length - 1] || '';
  console.log('Admin check result:', adminDeniedMsg);

  console.log('\n🎉 ALL TESTS COMPLETED!');
  botOwner.quit();
  botTarget.quit();
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  botOwner.quit();
  botTarget.quit();
  process.exit(1);
});
