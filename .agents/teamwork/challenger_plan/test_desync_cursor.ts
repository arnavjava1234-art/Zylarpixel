// Empirical Test of Inventory Desync & Cursor Zeroing Scenarios
console.log('=== TEST: Inventory Desync & Cursor Zeroing Scenarios ===');

interface Packet {
  name: string;
  params: any;
}

function simulateClickHandling(scenario: 'EMPTY_SLOT' | 'UNSELLABLE_ITEM' | 'VALID_SELL', planFix: boolean) {
  const sentPackets: Packet[] = [];
  const client = {
    write: (name: string, params: any) => {
      sentPackets.push({ name, params });
    }
  };

  const clickedSlot = 54;
  const invSlot = 9;

  if (!planFix) {
    // Current PLAN.md Step 3 & Step 4 logic
    if (scenario === 'EMPTY_SLOT') {
      // Step 3 in PLAN.md:
      // "Send set_slot(clickedSlot, { present: false })"
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
      // NOTICE: No cursor zeroing (-1, -1), no window 0 resync, no 1.8.9 transaction NACK!
    } else if (scenario === 'UNSELLABLE_ITEM') {
      // Step 4 in PLAN.md:
      // "Resync slot with set_slot"
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: true, itemId: 276 } });
      // NOTICE: No cursor zeroing (-1, -1), no window 0 resync, no 1.8.9 transaction NACK!
    } else if (scenario === 'VALID_SELL') {
      // Step 6 in PLAN.md:
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
      client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: false } });
      client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
      client.write('transaction', { accepted: true });
    }
  } else {
    // Robust 3-way synchronization for ALL paths (including rejection paths)
    if (scenario === 'EMPTY_SLOT') {
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
      client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: false } });
      client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
      client.write('transaction', { accepted: false });
    } else if (scenario === 'UNSELLABLE_ITEM') {
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: true, itemId: 276 } });
      client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: true, itemId: 276 } });
      client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
      client.write('transaction', { accepted: false });
    } else if (scenario === 'VALID_SELL') {
      client.write('set_slot', { windowId: 16, slot: clickedSlot, item: { present: false } });
      client.write('set_slot', { windowId: 0, slot: invSlot, item: { present: false } });
      client.write('set_slot', { windowId: -1, slot: -1, item: { present: false } });
      client.write('transaction', { accepted: true });
    }
  }

  const cursorZeroed = sentPackets.some(p => p.name === 'set_slot' && p.params.windowId === -1 && p.params.slot === -1);
  const survivalInvResynced = sentPackets.some(p => p.name === 'set_slot' && p.params.windowId === 0);
  const transactionConfirmed = sentPackets.some(p => p.name === 'transaction');

  return {
    scenario,
    planFix,
    packetsSent: sentPackets.length,
    cursorZeroed,
    survivalInvResynced,
    transactionConfirmed,
    ghostItemVulnerability: !cursorZeroed
  };
}

console.log('Evaluating PLAN.md current implementation:');
console.log('  Scenario 1 (EMPTY_SLOT):', simulateClickHandling('EMPTY_SLOT', false));
console.log('  Scenario 2 (UNSELLABLE_ITEM):', simulateClickHandling('UNSELLABLE_ITEM', false));
console.log('  Scenario 3 (VALID_SELL):', simulateClickHandling('VALID_SELL', false));

console.log('\nEvaluating Proposed Robust Implementation:');
console.log('  Scenario 1 (EMPTY_SLOT):', simulateClickHandling('EMPTY_SLOT', true));
console.log('  Scenario 2 (UNSELLABLE_ITEM):', simulateClickHandling('UNSELLABLE_ITEM', true));
console.log('  Scenario 3 (VALID_SELL):', simulateClickHandling('VALID_SELL', true));
