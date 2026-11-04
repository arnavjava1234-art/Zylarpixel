# Architecture & Click-to-Sell Explorer Dispatch

## Objective
Investigate the codebase (packet pipeline, window click listeners, inventory transaction confirmation, network architecture, and event handling) to design the Click-to-Sell mechanics and client-server desync prevention architecture.

## Strict NCC Constraint
Under NO circumstances may you create, modify, or delete any source code files (in `src/`, `dist/`, etc.). This is a pure technical investigation and architectural planning task.

## Key Focus Areas
1. Window Click Packet Interception:
   - Minecraft 1.8.9 protocol `window_click` packet structure (windowId, slot, button, mode, actionNumber, item).
   - Distinguishing top container clicks (slots 0-53) from player inventory clicks (slots 54-89) in a 54-slot chest container.
2. Click-to-Sell Mechanics:
   - Validating clicked item stack against sellable items (commodity check, non-sellable items check like SkyBlock menu nether star, armor, tools).
   - Sell price calculation (unit price * count).
   - Instant stack removal from player inventory slot and instant purse balance update.
   - Slot 48 "Sell Item" Hopper interaction (sell inventory option, sell single item).
3. Client-Server Inventory Desync Prevention:
   - Window Transaction Confirmation packets (`confirm_transaction` / `transaction` packet accept/reject).
   - Window Set Slot packets (`set_slot`) to force client inventory state synchronization.
   - Race conditions & rapid clicking protection (atomic per-player transaction lock / debounce queue).
   - Anti-duplication mechanisms (verifying item stack server-side before crediting coins; reject transaction if client item doesn't match server state).
4. System Integration & Multi-Server Architecture:
   - How `bankerNpc.ts` or similar services integrate with the server lifecycle.
   - Clean modular architecture for `src/npc/farmMerchantNpc.ts` and `src/gui/farmMerchantGui.ts`.
   - Event bus / message bus / state synchronization across the server.

## Output
Write your comprehensive analysis and findings to `.agents/teamwork/explorer_architecture/handoff.md`.
