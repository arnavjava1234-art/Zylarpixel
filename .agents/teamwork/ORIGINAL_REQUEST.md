# Original User Request

## Initial Request — 2026-11-04T13:44:35Z

Discuss the plan with many agents NCC: Formulate a comprehensive architectural plan and technical discussion for the authentic Hypixel SkyBlock Farm Merchant NPC and Shop GUI with Click-to-Sell mechanics in the Hub World, strictly making no code changes.

Working directory: C:\Users\Wing\.gemini\antigravity\scratch\arena-server
Integrity mode: development

## Requirements

### R1. Multi-Agent Architectural Plan and Technical Discussion
Conduct an in-depth architectural discussion across multiple specialized agent perspectives and produce a comprehensive technical specification for the authentic Farm Merchant NPC and Shop GUI in the Hub World. The plan must detail:
- NPC entity lifecycle: Packet-level player entity spawning, official skin texture properties, dual floating holograms ("§e§lFARM MERCHANT" and "§e§lCLICK"), and 3D line-of-sight raycast head tracking at coordinates X: 63.5, Y: 71.0, Z: -114.5, consistent with existing patterns in `src/npc/bankerNpc.ts`.
- Shop GUI container and layout: 54-slot chest interface titled "Farm Merchant", exact slot mapping and item stack definitions for all 13 agricultural commodities, Slot 48 "Sell Item" Hopper, and Slot 49 Close Barrier.
- Economy and transaction mechanics: Unit buy pricing and NPC sell pricing for all commodities (Wheat: 3 for 7c buy / 6c sell; Carrot: 3 for 7c buy / 3c sell; Potato: 3 for 7c buy / 3c sell; Melon Slice: 10 for 10c buy / 2c sell; Sugar Cane: 3 for 15c buy / 4c sell; Pumpkin: 1 for 8c buy / 10c sell; Cocoa Beans: 3 for 7c buy / 3c sell; Red Mushroom: 1 for 12c buy / 10c sell; Brown Mushroom: 1 for 12c buy / 10c sell; Sand: 2 for 8c buy / 2c sell; Cactus: 1 for 10c buy / 4c sell; Enchanted Bone Meal: 1 for 6c buy / 1c sell; Rookie Hoe: 1 for 10c buy / 3c sell).
- Daily buy limits: Tracking mechanism for the daily 640-item cap per commodity and reset behavior.
- Click-to-Sell mechanics: Window click packet interception, validation of clicked inventory item stacks, instant conversion to purse coins, and client-server inventory desync prevention.

### R2. Strict No Code Changes (NCC) Constraint
Under no circumstances may any code files be modified, added, or deleted in the codebase (no changes to `src/`, `dist/`, or server entry points). The deliverable is strictly limited to architectural discussion and planning documentation.

## Acceptance Criteria

### Architectural Completeness
- [ ] Document specifies verified coordinates (X: 63.5, Y: 71.0, Z: -114.5), orientation, skin texture payload, and nametags matching authentic Hypixel SkyBlock.
- [ ] Document defines the complete 54-slot chest layout, pricing table for all 13 commodities, daily 640 limit logic, Slot 48 hopper, and Slot 49 barrier.
- [ ] Document details the packet flow for Click-to-Sell inventory transactions, purse balance updates, and desync prevention.
- [ ] Document provides an architectural design compatible with existing patterns in `src/npc/bankerNpc.ts` and the multi-server network architecture.

### Multi-Agent Review & Verification Rubric
- [ ] Independent agent-as-judge rubric evaluates the plan against authentic Hypixel SkyBlock mechanics, edge cases (inventory desyncs, rapid clicking, limit roll-overs), and architectural feasibility.
- [ ] Multi-agent perspectives (protocol/packets, economy/state, game loop) evaluate trade-offs and reach technical consensus.

### Constraint Adherence
- [ ] Zero source code files modified, added, or deleted across the entire repository (strict NCC compliance).
