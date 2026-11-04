Discuss the plan with many agents NCC: Formulate a comprehensive architectural plan and technical discussion for the authentic Hypixel SkyBlock Farm Merchant NPC and Shop GUI with Click-to-Sell mechanics in the Hub World, strictly making no code changes.

Working directory: C:\Users\Wing\.gemini\antigravity\scratch\arena-server
Integrity mode: [OPEN: Which integrity restrictions apply?]

## Requirements

### R1. Multi-Agent Architectural Plan and Technical Discussion
Conduct an in-depth architectural discussion across multiple specialized agent perspectives and produce a comprehensive technical specification for the Farm Merchant NPC and Shop GUI in the Hub World. The plan must detail:
- NPC entity spawning and lifecycle using player entity packets, official skin texture, floating nametag holograms ("§e§lFARM MERCHANT" and "§e§lCLICK"), and 3D line-of-sight head tracking at coordinates X: 63.5, Y: 71.0, Z: -114.5.
- Shop GUI design: 54-slot chest interface titled "Farm Merchant", exact layout and buy/sell pricing for all 13 commodities (Wheat, Carrot, Potato, Melon Slice, Sugar Cane, Pumpkin, Cocoa Beans, Red Mushroom, Brown Mushroom, Sand, Cactus, Enchanted Bone Meal, Rookie Hoe), daily buy limit tracking (640 per commodity per day), Slot 48 Sell Item hopper, and Slot 49 close barrier.
- Click-to-Sell mechanics: handling player inventory window click packets to sell clicked item stacks directly for purse coins.
- Integration patterns compatible with the existing `src/npc/bankerNpc.ts` architecture and multi-server setup (Hub 25566, Proxy 25565, Islands 25567).
[OPEN: How should the plan and discussion be formatted/delivered?]

### R2. Strict No Code Changes (NCC) Constraint
Under no circumstances may any code files be modified, added, or deleted in the codebase (no changes to `src/`, `dist/`, or server configuration). The output is strictly limited to planning and architectural documentation.

## Acceptance Criteria

### Architectural Completeness
- [ ] Plan specifies verified coordinates (X: 63.5, Y: 71.0, Z: -114.5), orientation, skin texture payload, and nametags matching authentic Hypixel SkyBlock.
- [ ] Plan specifies the complete 54-slot chest layout, pricing table for all 13 commodities, daily 640 limit logic, Slot 48 hopper, and Slot 49 barrier.
- [ ] Plan details the packet flow for Click-to-Sell inventory transactions, purse balance updates, and desync prevention.
- [ ] Multi-agent discussion evaluates architecture trade-offs, packet edge cases, and consistency with `bankerNpc.ts`.

### Constraint Adherence
- [ ] Zero source code files modified or created in `src/` or runtime directories.
- [ ] [OPEN: What verification and review rubric should the agents follow?]
