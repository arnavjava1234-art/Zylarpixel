// Simulation of Macro Auto-Clickers & Rapid Clicking
console.log('=== TEST: Macro Auto-Clickers & Rapid Clicking Edge Cases ===');

interface MockPlayerSession {
  username: string;
  purse: number;
  inventory: Map<number, { slot: number; itemId: number; count: number; name: string }>;
  isTransactionLocked?: boolean;
  lastClickTime?: number;
}

// Case A: Testing PLAN.md's lock implementation under 50 clicks/tick burst
function simulateBurstClicks(planType: 'PLAN_CURRENT' | 'IMPROVED_FINALLY_NACK') {
  const pData: MockPlayerSession = {
    username: 'TestBot',
    purse: 100.0,
    inventory: new Map([
      [9, { slot: 9, itemId: 296, count: 64, name: 'wheat' }] // 64 wheat in slot 9 (container slot 54)
    ]),
    isTransactionLocked: false,
    lastClickTime: 0
  };

  const clientPacketsReceived: any[] = [];
  const client = {
    write: (packetName: string, data: any) => {
      clientPacketsReceived.push({ packetName, data });
    }
  };

  const results = {
    totalClicks: 50,
    successfulSells: 0,
    droppedSilently: 0,
    nackedOrResynced: 0,
    lockedOut: 0,
    exceptionsThrown: 0,
    coinsEarned: 0
  };

  const unitSellPrice = 2.0; // Wheat 2c
  const clickedSlot = 54;
  const invSlot = 9;

  for (let i = 0; i < 50; i++) {
    const actionNumber = 100 + i;
    const now = 1000; // All 50 clicks arrive in the exact same tick at t=1000ms

    if (planType === 'PLAN_CURRENT') {
      // PLAN.md Section 5.3 literal implementation:
      // Step 1:
      if (pData.isTransactionLocked === true) {
        results.droppedSilently++;
        continue; // PLAN says: DROP PACKET / REJECT (no packet sent back!)
      }
      if (pData.lastClickTime && (now - pData.lastClickTime < 50)) {
        results.droppedSilently++;
        continue; // PLAN says: DROP PACKET
      }
      pData.isTransactionLocked = true;
      pData.lastClickTime = now;

      // Simulate step 3: check item
      const item = pData.inventory.get(invSlot);
      if (!item || item.count <= 0) {
        client.write('set_slot', { slot: clickedSlot, item: { present: false } });
        pData.isTransactionLocked = false;
        results.nackedOrResynced++;
        continue;
      }

      // Simulate a transient socket write error on click #0:
      // What if an error occurs during Step 6?
      // In PLAN.md, there is NO try...finally wrapping Step 1 through Step 7.
      // Suppose client socket throws on click 0 or an unexpected null occurs:
      try {
        const coins = item.count * unitSellPrice;
        pData.purse += coins;
        results.coinsEarned += coins;
        pData.inventory.delete(invSlot);
        results.successfulSells++;

        client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
        client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: false } });
        client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
        client.write('transaction', { action: actionNumber, accepted: true });

        pData.isTransactionLocked = false;
      } catch (err) {
        results.exceptionsThrown++;
        // Notice: pData.isTransactionLocked remains TRUE!
      }
    } else {
      // Improved robust implementation with try...finally and explicit NACK
      const nowTs = Date.now();
      if (pData.isTransactionLocked) {
        client.write('transaction', { action: actionNumber, accepted: false });
        results.nackedOrResynced++;
        continue;
      }
      if (pData.lastClickTime && (now - pData.lastClickTime < 50)) {
        client.write('transaction', { action: actionNumber, accepted: false });
        results.nackedOrResynced++;
        continue;
      }

      pData.isTransactionLocked = true;
      pData.lastClickTime = now;

      try {
        const item = pData.inventory.get(invSlot);
        if (!item || item.count <= 0) {
          client.write('set_slot', { slot: clickedSlot, item: { present: false } });
          client.write('transaction', { action: actionNumber, accepted: false });
          results.nackedOrResynced++;
          continue;
        }

        const coins = item.count * unitSellPrice;
        pData.purse += coins;
        results.coinsEarned += coins;
        pData.inventory.delete(invSlot);
        results.successfulSells++;

        client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
        client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: false } });
        client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
        client.write('transaction', { action: actionNumber, accepted: true });
      } finally {
        pData.isTransactionLocked = false;
      }
    }
  }

  return { results, packetsCount: clientPacketsReceived.length };
}

console.log('Testing PLAN_CURRENT (as written in PLAN.md):');
const resPlan = simulateBurstClicks('PLAN_CURRENT');
console.log('  Successful sells:', resPlan.results.successfulSells);
console.log('  Dropped silently (No ACK/NACK sent!):', resPlan.results.droppedSilently);
console.log('  Coins earned:', resPlan.results.coinsEarned);
console.log('  Packets sent back:', resPlan.packetsCount);

console.log('\nTesting IMPROVED_FINALLY_NACK (with transaction NACK & try/finally):');
const resImp = simulateBurstClicks('IMPROVED_FINALLY_NACK');
console.log('  Successful sells:', resImp.results.successfulSells);
console.log('  Properly NACKed packets:', resImp.results.nackedOrResynced);
console.log('  Coins earned:', resImp.results.coinsEarned);
console.log('  Packets sent back:', resImp.packetsCount);
