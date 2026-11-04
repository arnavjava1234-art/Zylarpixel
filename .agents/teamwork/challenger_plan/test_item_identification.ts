// Empirical Test of Item Forgery, Nether Star Relocation & Enchanted Crop Liquidation
console.log('=== TEST: Item Forgery, Nether Star Relocation & Enchanted Crop Liquidation ===');

interface InventorySlot {
  slot: number;
  itemId: number;
  count: number;
  name: string;
  nbtData?: any;
}

// Mock items
const NETHER_STAR_ITEM: InventorySlot = {
  slot: 9, // Moved from 44 to 9!
  itemId: 399, // Nether Star
  count: 1,
  name: 'nether_star',
  nbtData: {
    type: 'compound',
    value: {
      ExtraAttributes: {
        type: 'compound',
        value: {
          id: { type: 'string', value: 'SKYBLOCK_MENU' }
        }
      },
      display: {
        type: 'compound',
        value: {
          Name: { type: 'string', value: '§aSkyBlock Menu §7(Right Click)' }
        }
      }
    }
  }
};

const ENCHANTED_PUMPKIN_ITEM: InventorySlot = {
  slot: 10,
  itemId: 86, // Pumpkin
  count: 1,
  name: 'pumpkin',
  nbtData: {
    type: 'compound',
    value: {
      ExtraAttributes: {
        type: 'compound',
        value: {
          id: { type: 'string', value: 'ENCHANTED_PUMPKIN' }
        }
      },
      display: {
        type: 'compound',
        value: {
          Name: { type: 'string', value: '§aEnchanted Pumpkin' }
        }
      }
    }
  }
};

const ROOKIE_HOE_MAXED: InventorySlot = {
  slot: 11,
  itemId: 290, // wooden_hoe
  count: 1,
  name: 'wooden_hoe',
  nbtData: {
    type: 'compound',
    value: {
      ExtraAttributes: {
        type: 'compound',
        value: {
          id: { type: 'string', value: 'ROOKIE_HOE' },
          farm_counter: { type: 'long', value: [0, 5000000] },
          enchantments: {
            type: 'compound',
            value: {
              harvesting: { type: 'int', value: 6 }
            }
          }
        }
      }
    }
  }
};

// Simulation of PLAN.md's Step 2 and Step 4 validation logic:
function evaluateSaleUnderPlanMd(clickedSlot: number, invSlot: number, serverItem: InventorySlot) {
  // Step 2: Nether Star & Slot Boundary Protection as written in PLAN.md:
  // "If clickedSlot === 89 (invSlot === 44) -> REJECT, play entity.villager.no, return"
  if (clickedSlot === 89) {
    return { status: 'REJECTED_SLOT_89', reason: 'Hardcoded slot 89 guard' };
  }

  // Step 3: Server-Authoritative Inventory Verification
  if (!serverItem || serverItem.count <= 0) {
    return { status: 'EMPTY_SLOT' };
  }

  // Step 4: Valuation & Commodity Whitelist Check as written in PLAN.md:
  // "Look up commodity unitSellPrice from pricing catalog"
  // If naive lookup maps by item name or material:
  const commodityPricing: Record<string, number> = {
    'wheat': 2.0,
    'pumpkin': 10.0,
    'wooden_hoe': 3.0
  };

  // Vulnerability Test 1: Nether Star moved to another slot
  if (serverItem.name === 'nether_star') {
    // If pricing catalog does not contain nether_star, it rejects it as unregistered
    const price = commodityPricing[serverItem.name];
    if (price === undefined) {
      return { status: 'REJECTED_UNREGISTERED', reason: 'Not in commodity pricing table' };
    }
  }

  // Vulnerability Test 2: Enchanted Pumpkin sold as regular pumpkin
  // If catalog matches on material name 'pumpkin' without inspecting ExtraAttributes:
  if (serverItem.name === 'pumpkin') {
    const isEnchanted = serverItem.nbtData?.value?.ExtraAttributes?.value?.id?.value === 'ENCHANTED_PUMPKIN';
    return {
      status: 'SOLD_AS_PUMPKIN',
      unitSellPrice: 10.0,
      isEnchanted,
      danger: isEnchanted ? 'CRITICAL: Enchanted Pumpkin liquidated for 10c instead of 1600c!' : 'NORMAL'
    };
  }

  // Vulnerability Test 3: Upgraded Rookie Hoe with millions of crops counter
  if (serverItem.name === 'wooden_hoe') {
    const hasEnchantsOrCounter = serverItem.nbtData?.value?.ExtraAttributes?.value?.farm_counter !== undefined;
    return {
      status: 'SOLD_AS_ROOKIE_HOE',
      unitSellPrice: 3.0,
      hasEnchantsOrCounter,
      danger: hasEnchantsOrCounter ? 'HIGH: Maxed customized Rookie Hoe liquidated for 3c!' : 'NORMAL'
    };
  }

  return { status: 'UNKNOWN' };
}

console.log('Test 1: Nether Star in Slot 54 (Player moved from 89):');
console.log(evaluateSaleUnderPlanMd(54, 9, NETHER_STAR_ITEM));

console.log('\nTest 2: Enchanted Pumpkin clicked in Slot 55:');
console.log(evaluateSaleUnderPlanMd(55, 10, ENCHANTED_PUMPKIN_ITEM));

console.log('\nTest 3: Maxed Rookie Hoe clicked in Slot 56:');
console.log(evaluateSaleUnderPlanMd(56, 11, ROOKIE_HOE_MAXED));
