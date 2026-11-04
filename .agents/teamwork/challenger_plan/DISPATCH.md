# Challenger & Adversarial Stress-Tester Dispatch

## Objective
Perform an adversarial stress-test and vulnerability audit of the Farm Merchant NPC & Shop GUI architectural plan, specifically probing edge cases, race conditions, macro clicking, inventory desyncs, daily cap roll-overs, and anti-duplication mechanisms.

## Strict NCC Constraint
Under NO circumstances may you modify, create, or delete any source code files (under `src/`, `dist/`, etc.). This audit evaluates architectural documentation only.

## Target Document to Audit
`C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\orchestrator\PLAN.md`

## Reference Documents
1. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol\handoff.md`
3. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_economy_gui\handoff.md`
4. `C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture\handoff.md`

## Edge Cases to Stress-Test
1. **Macro Auto-Clickers & Rapid Clicking**:
   - What happens if a client sends 50 `window_click` packets in 1 tick?
   - Does `isTransactionLocked` properly prevent double-spending or duplicate coin crediting?
2. **Client-Server Inventory Desync Scenarios**:
   - What happens if a player clicks an empty slot, or an item that was already dropped or moved?
   - How does the 3-way `set_slot` sync handle dropped or dragged stacks?
   - Is cursor slot (`windowId: -1, slot: -1`) guaranteed to be zeroed?
3. **Daily Limit Roll-Over & Cross-Server Sync**:
   - What happens if a player is in the GUI when UTC midnight strikes?
   - What happens if a player transfers between Hub and Private Islands via proxy?
   - What happens on partial stack purchases (e.g. buying 64 when remaining allowance is 5)?
4. **Item Forgery & Unsellable Items Protection**:
   - Can a player sell the Nether Star in slot 89?
   - Can a player sell Rogue Swords, armor, or special custom items?
   - Does the server rely on client packet data or server memory?
5. **NPC Packet Flooding & Line-of-Sight Glitches**:
   - Can players blind the NPC or cause server lag through rapid head tracking?
   - Does 20 TPS raycasting have proper caching or occluding block checks?

## Output
Write your comprehensive adversarial challenge report and final verdict (APPROVE / REQUEST_CHANGES) to `.agents/teamwork/challenger_plan/handoff.md`.
