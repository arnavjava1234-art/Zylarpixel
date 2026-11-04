# Economy, GUI & Inventory Explorer Dispatch

## Objective
Investigate the codebase (GUI systems, inventory management, economy/purse systems, item registry, pricing models) to formulate an exact, authentic specification for the Farm Merchant Shop GUI and transaction mechanics.

## Strict NCC Constraint
Under NO circumstances may you create, modify, or delete any source code files (in `src/`, `dist/`, etc.). This is a pure technical investigation and architectural planning task.

## Key Focus Areas
1. Shop GUI Container & Layout: 54-slot chest interface titled "Farm Merchant". Exact slot layout (rows 0-5), filler panes, border panes.
2. 13 Agricultural Commodities: Slot positions, display items, lore, buy/sell prices, item IDs/damage values/NBT:
   - Wheat (3 for 7c buy / 6c sell)
   - Carrot (3 for 7c buy / 3c sell)
   - Potato (3 for 7c buy / 3c sell)
   - Melon Slice (10 for 10c buy / 2c sell)
   - Sugar Cane (3 for 15c buy / 4c sell)
   - Pumpkin (1 for 8c buy / 10c sell)
   - Cocoa Beans (3 for 7c buy / 3c sell)
   - Red Mushroom (1 for 12c buy / 10c sell)
   - Brown Mushroom (1 for 12c buy / 10c sell)
   - Sand (2 for 8c buy / 2c sell)
   - Cactus (1 for 10c buy / 4c sell)
   - Enchanted Bone Meal (1 for 6c buy / 1c sell)
   - Rookie Hoe (1 for 10c buy / 3c sell)
3. Special Utility Slots:
   - Slot 48: "Sell Item" Hopper (description, lore, interaction behavior)
   - Slot 49: Close Barrier (icon, red barrier, click to close)
4. Daily Buy Limits:
   - 640 items cap per commodity per day.
   - Storage schema (in-memory per session vs persistent profile/Redis).
   - Reset behavior (daily UTC midnight rollover vs rolling 24h window).
5. Purchase Flow:
   - Left click / right click / shift click behaviors.
   - Coin deduction from purse, inventory capacity checks, partial fills, error messages/sounds.

## Output
Write your comprehensive analysis and findings to `.agents/teamwork/explorer_economy_gui/handoff.md`.
