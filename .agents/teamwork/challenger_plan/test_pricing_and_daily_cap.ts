// Empirical Analysis of Commodity Pricing, Rounding, Arbitrage & Daily Limit Caps
console.log('=== TEST: Pricing, Arbitrage & Daily Limit Caps ===');

interface Commodity {
  id: string;
  slot: number;
  mcName: string;
  bundleQty: number;
  bundleBuyPrice: number;
  unitSellPrice: number;
}

const COMMODITIES: Commodity[] = [
  { id: 'WHEAT', slot: 10, mcName: 'wheat', bundleQty: 3, bundleBuyPrice: 7, unitSellPrice: 2.0 },
  { id: 'CARROT_ITEM', slot: 11, mcName: 'carrot', bundleQty: 3, bundleBuyPrice: 7, unitSellPrice: 1.0 },
  { id: 'POTATO_ITEM', slot: 12, mcName: 'potato', bundleQty: 3, bundleBuyPrice: 7, unitSellPrice: 1.0 },
  { id: 'MELON', slot: 13, mcName: 'melon_slice', bundleQty: 10, bundleBuyPrice: 10, unitSellPrice: 0.2 },
  { id: 'SUGAR_CANE', slot: 14, mcName: 'sugar_cane', bundleQty: 3, bundleBuyPrice: 15, unitSellPrice: 1.33333333 },
  { id: 'PUMPKIN', slot: 15, mcName: 'pumpkin', bundleQty: 1, bundleBuyPrice: 8, unitSellPrice: 10.0 }, // NOTE!
  { id: 'INK_SACK:3', slot: 16, mcName: 'cocoa_beans', bundleQty: 3, bundleBuyPrice: 7, unitSellPrice: 1.0 },
  { id: 'RED_MUSHROOM', slot: 19, mcName: 'red_mushroom', bundleQty: 1, bundleBuyPrice: 12, unitSellPrice: 10.0 },
  { id: 'BROWN_MUSHROOM', slot: 20, mcName: 'brown_mushroom', bundleQty: 1, bundleBuyPrice: 12, unitSellPrice: 10.0 },
  { id: 'SAND', slot: 21, mcName: 'sand', bundleQty: 2, bundleBuyPrice: 8, unitSellPrice: 1.0 },
  { id: 'CACTUS', slot: 22, mcName: 'cactus', bundleQty: 1, bundleBuyPrice: 10, unitSellPrice: 4.0 },
  { id: 'ENCHANTED_BONE_MEAL', slot: 23, mcName: 'bone_meal', bundleQty: 1, bundleBuyPrice: 6, unitSellPrice: 1.0 },
  { id: 'ROOKIE_HOE', slot: 24, mcName: 'wooden_hoe', bundleQty: 1, bundleBuyPrice: 10, unitSellPrice: 3.0 }
];

console.log('\n--- 1. ARBITRAGE & REVERSE MARGIN AUDIT ---');
for (const c of COMMODITIES) {
  const unitBuyPrice = c.bundleBuyPrice / c.bundleQty;
  const unitSellPrice = c.unitSellPrice;
  const margin = unitSellPrice - unitBuyPrice;
  if (margin > 0) {
    console.error(`🚨 CRITICAL ARBITRAGE VULNERABILITY DETECTED on ${c.id}:`);
    console.error(`   Unit Buy: ${unitBuyPrice.toFixed(3)}c | Unit Sell: ${unitSellPrice.toFixed(3)}c`);
    console.error(`   Direct profit per item: +${margin.toFixed(3)}c!`);
    const dailyProfit = margin * 640;
    console.error(`   Daily free coin injection per player: +${dailyProfit.toFixed(2)} coins!`);
  } else {
    console.log(`✓ ${c.id}: Buy ${unitBuyPrice.toFixed(3)}c, Sell ${unitSellPrice.toFixed(3)}c (Margin: ${margin.toFixed(3)}c)`);
  }
}

console.log('\n--- 2. FRACTIONAL COIN ROUNDING & DIVISIBILITY AUDIT ---');
for (const c of COMMODITIES) {
  // Test purchasing 1, 2, 3, 5, 10, 64 items
  const testQtys = [1, 2, 3, 5, 64];
  for (const qty of testQtys) {
    const rawCost = (qty / c.bundleQty) * c.bundleBuyPrice;
    const roundedCost = Math.round(rawCost * 100) / 100;
    const rawSell = qty * c.unitSellPrice;
    const roundedSell = Math.round(rawSell * 100) / 100;

    // Check if buying and selling yields unexpected rounding discrepancies
    if (c.bundleQty > 1 && qty % c.bundleQty !== 0) {
      console.log(`[Fractional] ${c.id} x${qty}: Raw Buy ${rawCost.toFixed(4)}c -> Rounded ${roundedCost}c | Sell ${roundedSell}c`);
    }
  }
}

console.log('\n--- 3. PARTIAL PURCHASE LIMIT & TRIPLE CONSTRAINT SIMULATION ---');
function simulatePurchase(
  commodity: Commodity,
  requestedQty: number,
  purseCoins: number,
  dailyPurchased: number,
  dailyCap: number = 640
) {
  const remainingAllowance = Math.max(0, dailyCap - dailyPurchased);
  const unitBuyCost = commodity.bundleBuyPrice / commodity.bundleQty;

  // Max affordable
  const maxAffordable = Math.floor(purseCoins / unitBuyCost);

  // Triple cap: requested vs allowance vs affordable
  const actualQty = Math.min(requestedQty, remainingAllowance, maxAffordable);
  const totalCost = Math.round(actualQty * unitBuyCost * 100) / 100;

  return {
    requestedQty,
    remainingAllowance,
    maxAffordable,
    actualQty,
    totalCost,
    newPurse: Math.round((purseCoins - totalCost) * 100) / 100,
    newDailyPurchased: dailyPurchased + actualQty
  };
}

// Case: Player wants full stack of 64 Wheat, has 635 already bought today (5 left)
const wheat = COMMODITIES.find(c => c.id === 'WHEAT')!;
const p1 = simulatePurchase(wheat, 64, 1000.0, 635);
console.log('Case A (Cap Truncation): Requested 64, 5 remaining allowance:');
console.log(`  Purchased: ${p1.actualQty} wheat for ${p1.totalCost} coins. Remaining allowance after: ${640 - p1.newDailyPurchased}`);

// Case: Player wants 64 Wheat, has allowance, but only 10.0 coins in purse
const p2 = simulatePurchase(wheat, 64, 10.0, 0);
console.log('Case B (Purse Truncation): Requested 64, 10 coins in purse:');
console.log(`  Purchased: ${p2.actualQty} wheat for ${p2.totalCost} coins. Leftover purse: ${p2.newPurse} coins`);

// Case: Player has 0 allowance left
const p3 = simulatePurchase(wheat, 3, 1000.0, 640);
console.log('Case C (Exhausted Allowance): Requested 3, 0 remaining:');
console.log(`  Purchased: ${p3.actualQty} wheat. Cost: ${p3.totalCost}`);
