# Platoon War System (`src/war/`)

This module implements an advanced, large-scale tactical military system driven by coordinated **6-unit Platoons**. Designed for heavy sieges, this formation scales up firepower and survivability by combining heavy frontline infantry, ranged fire support, and dedicated medical treatment, all while strictly adhering to the **"Scorched Earth"** doctrine.

---

## 1. Platoon Composition (The 6-Unit Assault Force)

Each operational platoon acts as a unified strike team consisting of **6 specialized roles** linked by a shared squad identifier (`squadId`, such as *Alpha*, *Beta*).

| Role / Sub-role | Code Name | Quantity | Body Configuration | Approximate Energy Cost | Primary Tactical Function |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Main Tank (Leader)** | `Leader` | **1** | `[5xTOUGH, 10xATTACK, 15xMOVE]` | 1,600 | Absorbs initial tower aggro, determines platoon pathfinding, and executes priority target demolition. |
| **Assault Tanks** | `Escort` | **2** | `[5xTOUGH, 10xATTACK, 15xMOVE]` | 1,600 | Flank the main leader, multiply melee structural damage, and split defensive firing focus. |
| **Ranged Artillery** | `Ranged` | **2** | `[10xRANGED_ATTACK, 10xMOVE]` | 1,500 | Provide ranged suppression (Range 3) against enemy defenders and harass infrastructure safely from behind the frontline. |
| **Chief Medic** | `Follower` | **1** | `[12xHEAL, 12xMOVE]` | 3,600 (Scalable) | Anchors to the main group, scanning and dynamically healing the most critically injured platoon member each tick. |

---

## 2. File Architecture and Responsibilities

*   **`index.ts`**: Global supervisor. Scans owned rooms to trigger platoon spawning and groups military units by `squadId` for coordinated execution.
*   **`types.ts`**: Holds strict memory interfaces (`WarCreepMemory`, `WarMemory`) and extends the global Screeps `Memory` type definition.
*   **`managers/WarSpawn.ts`**: Manages recruitment and implements the **Anti-Casualty Protocol (Anti-Trickle of Death)**. If *any* member of an active 6-unit platoon falls in battle, the system flags the squad as compromised, automatically advances to the next squad letter (e.g., *Alpha* to *Beta*), and begins producing a completely fresh platoon safely inside the home base.
*   **`managers/SquadManager.ts`**: Oversees platoon-wide state machines, ensuring tactical cohesion and grouping validation before allowing assaults.
*   **`roles/Melee.ts`, `roles/Ranged.ts`, & `roles/Healer.ts`**: Individual unit intelligence profiles defining combat behavior, positioning, and target acquisition.
*   **`utils/Targeting.ts`**: The tactical radar filtering targets based on economic priority (mines, storage) and immediate self-defense.
*   **`utils/CombatMove.ts`**: Controls cluster movement, formation spacing, and siege *breaching* logic.

---

## 3. Flag-Based Command System

Platoon operations are fully managed via map flags:

1.  **`Save` Flag**:
    *   **Purpose:** Home base garrison and defensive patrol.
    *   **Behavior:** When idle, the platoon maintains formation within a 15-tile radius of this flag, intercepting invaders without abandoning home territory.
2.  **`Attack_[SquadId]` Flag** (e.g., `Attack_Alpha`):
    *   **Purpose:** Hostile territory invasion directive.
    *   **Behavior:** When placed inside an enemy room, the 6 units regroup into tight formation and advance to execute economic destruction. Removing the flag commands an immediate abort and return-to-base protocol.

---

## 4. Attack Priorities ("Scorched Earth")

Inside hostile rooms, platoons prioritize economic collapse over trivial engagements:

*   **Priority 0 (Opportunity Fire):** If enemy hostiles enter weapon range during transit, units engage immediately without breaking primary forward movement vectors.
*   **Priority 1 (Mining Infrastructure):** Structure containers situated within 2 tiles of enemy *Sources*, effectively halting resource generation.
*   **Priority 2 (Central Economy):** The enemy base's main `Storage` facility.
*   **Priority 3 (Military & Production Nodes):** Defending `Tower`, `Extension`, and `Spawn` installations.
*   **Breaching Protocol:** If defensive `Wall` or `Rampart` barriers obstruct pathfinding toward high-priority assets, the melee core concentrates attacks to batter down the barrier directly.
