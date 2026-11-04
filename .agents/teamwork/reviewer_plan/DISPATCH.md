# Reviewer Dispatch: Architectural Plan & Rubric Evaluation

## Objective
Perform an objective, rigorous architectural review and agent-as-judge evaluation of the master architectural plan for the authentic Hypixel SkyBlock Farm Merchant NPC & Shop GUI with Click-to-Sell mechanics.

## Strict NCC Constraint
Under NO circumstances may you modify, create, or delete any source code files (under `src/`, `dist/`, etc.). This review evaluates architectural documentation only.

## Target Document to Review
`C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\orchestrator\PLAN.md`

## Reference Documents
1. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol\handoff.md`
3. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_economy_gui\handoff.md`
4. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture\handoff.md`

## Evaluation Rubric
1. **Authenticity & Completeness (Score 1-10)**:
   - Hub coordinates (X: 63.5, Y: 71.0, Z: -114.5), orientation, skin textures, dual holograms ("§e§lFARM MERCHANT" and "§e§lCLICK").
   - 54-slot chest GUI layout, exact pricing for all 13 agricultural commodities, Slot 48 Hopper, Slot 49 Barrier.
   - Daily 640 buy limit logic and UTC midnight rollover.
2. **Protocol & Networking Fidelity (Score 1-10)**:
   - Packet flow for spawning (1.19.2 & 1.21.1 protocols), teams packet for nametag suppression, 20 TPS voxel raycast head tracking.
   - Window click packet interception, slot mapping ($\text{loc} = \text{invSlot} + 45$), Nether Star protection on slot 89.
3. **Transaction Integrity & Desync Prevention (Score 1-10)**:
   - 3-way `set_slot` sync, transaction confirmation (ACK/NACK), atomic per-player locks against rapid clicking/macro exploits.
   - Instant purse update, scoreboard synchronization.
4. **Integration Feasibility & Architectural Cleanliness (Score 1-10)**:
   - Compatibility with existing patterns in `src/npc/bankerNpc.ts`, `src/gui/craftingTableMenu.ts`, `src/core/ZylarServer.ts`.
5. **Strict NCC Compliance**:
   - Zero modifications to source files in the repo.

## Output
Write your comprehensive review and verdict (APPROVE / REQUEST_CHANGES) to `.agents/teamwork/reviewer_plan/handoff.md`.
