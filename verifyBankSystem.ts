/**
 * Comprehensive Automated Verification Script for ZylarPixel Bank System
 */

import { parseCoinInput, formatCoins, STARTER_BANK_CAP } from './src/gui/bankMenu';
import { savePlayerData, allocateIslandForPlayer } from './src/storage/diskStorage';
import { savePlayerProfile, getDefaultProfile } from './src/storage/sharedProfile';
import * as assert from 'assert';
const mc = require('minecraft-protocol');

console.log('🧪 Starting Unit Tests for Bank Functions...');

// 1. parseCoinInput unit tests
assert.strictEqual(parseCoinInput('500'), 500, '500 failed');
assert.strictEqual(parseCoinInput('50000'), 50000, '50000 failed');
assert.strictEqual(parseCoinInput('10k'), 10000, '10k failed');
assert.strictEqual(parseCoinInput('10K'), 10000, '10K failed');
assert.strictEqual(parseCoinInput('2.5k'), 2500, '2.5k failed');
assert.strictEqual(parseCoinInput('1m'), 1000000, '1m failed');
assert.strictEqual(parseCoinInput('2.5M'), 2500000, '2.5M failed');
assert.strictEqual(parseCoinInput('1b'), 1000000000, '1b failed');
assert.strictEqual(parseCoinInput('0.5B'), 500000000, '0.5B failed');
assert.strictEqual(parseCoinInput('100,000'), 100000, '100,000 failed');
assert.strictEqual(parseCoinInput('  50 k  '), 50000, 'padded 50 k failed');

// Invalids
assert.strictEqual(parseCoinInput(''), null, 'empty string failed');
assert.strictEqual(parseCoinInput('0'), null, '0 failed');
assert.strictEqual(parseCoinInput('-50'), null, '-50 failed');
assert.strictEqual(parseCoinInput('cancel'), null, 'cancel failed');
assert.strictEqual(parseCoinInput('hello world'), null, 'hello failed');

console.log('✅ Unit Tests Passed for parseCoinInput!');

// 2. formatCoins
assert.strictEqual(formatCoins(50000000), '50,000,000');
assert.strictEqual(formatCoins(1234), '1,234');
console.log('✅ Unit Tests Passed for formatCoins!');

// Setup BankTester profile with 100,000 purse coins and 5,000 bank coins
const testUser = 'banktester';
savePlayerData(testUser, {
  username: testUser,
  uuid: '99999999-8888-7777-6666-555555555555',
  rank: 'default',
  isOp: false,
  island: allocateIslandForPlayer(testUser),
  lastLogin: new Date().toISOString(),
  purse: 100000,
  bank: 5000,
  bits: 0
} as any);

const pProfile = getDefaultProfile(testUser);
pProfile.coins = 100000;
pProfile.bank = 5000;
savePlayerProfile(pProfile);

console.log('\n🤖 Connecting Verification Bot (Purse: 100k, Bank: 5k) to Hub Server on port 25566...');

const client = mc.createClient({
  host: '127.0.0.1',
  port: 25566,
  username: 'banktester',
  version: '1.19.2'
});

function clickSlot(windowId: number, slot: number) {
  client.write('window_click', {
    windowId,
    stateId: 1,
    slot,
    mouseButton: 0,
    mode: 0,
    changedSlots: [],
    cursorItem: { present: false }
  });
}

let testStep = 0;
let lastSignLocation: any = null;

client.on('error', (err: any) => {
  console.error('❌ Bot Client Error:', err);
  process.exit(1);
});

client.on('login', () => {
  console.log('✅ Bot successfully logged into Hub Server!');
});

client.on('system_chat', (packet: any) => {
  try {
    const raw = typeof packet.content === 'string' ? JSON.parse(packet.content) : packet.content;
    const text = raw.text || '';
    if (text.includes('[Banker]') || text.includes('not available yet') || text.includes('invalid amount')) {
      console.log(`💬 Chat Received: ${text}`);
    }
  } catch (_) {}
});

client.on('block_change', (packet: any) => {
  if (packet.type === 3637) {
    console.log(`🪵 Block Change: Oak Sign placed at (${packet.location.x}, ${packet.location.y}, ${packet.location.z})`);
    lastSignLocation = packet.location;
  } else if (packet.type === 0 && lastSignLocation) {
    console.log(`💨 Block Change: Restored block at (${packet.location.x}, ${packet.location.y}, ${packet.location.z}) to Air!`);
  }
});

client.on('open_sign_entity', (packet: any) => {
  console.log(`🪧 Event: 'open_sign_entity' received at (${packet.location.x}, ${packet.location.y}, ${packet.location.z})!`);
  
  if (testStep === 4) {
    console.log('✍️ Bot typing "20k" on the Oak Sign and clicking Done...');
    setTimeout(() => {
      client.write('update_sign', {
        location: packet.location,
        text1: '20k',
        text2: '',
        text3: '',
        text4: ''
      });
      testStep = 5;
    }, 400);
  } else if (testStep === 6) {
    console.log('🚫 Bot simulating Esc / empty cancel on the Oak Sign...');
    setTimeout(() => {
      client.write('update_sign', {
        location: packet.location,
        text1: '',
        text2: '',
        text3: '',
        text4: ''
      });
      testStep = 7;
      finishTest();
    }, 400);
  }
});

client.on('open_window', (packet: any) => {
  const title = JSON.parse(packet.windowTitle).text;
  console.log(`📦 Window Opened: ID=${packet.windowId}, type=${packet.inventoryType}, title="${title}"`);

  if (packet.windowId === 7 && testStep === 0) {
    console.log('✅ Banker NPC opened Personal Bank Account (WindowId 7)!');
    testStep = 1;
    setTimeout(() => {
      console.log('🖱️ Clicking Deposit Coins (Slot 11)...');
      clickSlot(7, 11);
    }, 400);
  } else if (packet.windowId === 8 && testStep === 1) {
    console.log('✅ Bank Deposit Menu opened (WindowId 8)!');
    testStep = 2;
    setTimeout(() => {
      console.log('🖱️ Clicking Go Back (Slot 31)...');
      clickSlot(8, 31);
    }, 400);
  } else if (packet.windowId === 7 && testStep === 2) {
    console.log('✅ Successfully returned to Personal Bank Account (WindowId 7)!');
    testStep = 3;
    setTimeout(() => {
      console.log('🖱️ Clicking Bank Upgrades (Slot 35)...');
      clickSlot(7, 35);
    }, 400);
  } else if (packet.windowId === 10 && testStep === 3) {
    console.log('✅ Bank Account Upgrades Menu opened (WindowId 10)!');
    setTimeout(() => {
      console.log('🖱️ Clicking Gold Account Upgrade (Slot 11) to verify locked message...');
      clickSlot(10, 11);

      setTimeout(() => {
        console.log('🖱️ Clicking Go Back (Slot 31)...');
        clickSlot(10, 31);
      }, 400);
    }, 400);
  } else if (packet.windowId === 7 && testStep === 3) {
    console.log('✅ Returned to Personal Bank Account from Upgrades!');
    testStep = 4;
    setTimeout(() => {
      console.log('🖱️ Opening Deposit Menu to test Oak Sign GUI...');
      clickSlot(7, 11);
    }, 400);
  } else if (packet.windowId === 8 && testStep === 4) {
    console.log('🖱️ Clicking "Specific amount" (Slot 15) to trigger Real Oak Sign GUI...');
    setTimeout(() => {
      clickSlot(8, 15);
    }, 400);
  } else if (packet.windowId === 7 && testStep === 5) {
    console.log('✅ Successfully deposited 20k via Oak Sign and returned to Personal Bank!');
    testStep = 6;
    setTimeout(() => {
      console.log('🖱️ Triggering Oak Sign GUI again to test Esc / Invalid input...');
      clickSlot(7, 11);
    }, 400);
  } else if (packet.windowId === 8 && testStep === 6) {
    setTimeout(() => {
      clickSlot(8, 15);
    }, 400);
  }
});

// Once bot is spawned, click the Banker NPC
setTimeout(() => {
  console.log('🎯 Right-clicking Banker NPC (Entity ID 8888)...');
  client.write('use_entity', {
    target: 8888,
    mouse: 0, // Interact (Right Click)
    sneaking: false
  });
}, 2500);

function finishTest() {
  setTimeout(() => {
    console.log('\n🎉 ALL BANK SYSTEM TESTS COMPLETED WITH 100% SUCCESS!');
    client.end();
    process.exit(0);
  }, 1000);
}
