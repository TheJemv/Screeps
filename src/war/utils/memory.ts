// src/war/utils/memory.ts
import { WarMemory } from "../types";

/** Memory.war con la forma nueva (migra la del sistema anterior: currentSquadIndex / squadDeployed). */
export function warMemory(): WarMemory {
    const raw = Memory.war as Partial<WarMemory> & { currentSquadIndex?: number } | undefined;
    if (raw && raw.squads && raw.safeMode && raw.portals && raw.intel && raw.nextName !== undefined) return raw as WarMemory;

    const migrated: WarMemory = {
        squads: raw?.squads ?? {},
        nextName: raw?.nextName ?? raw?.currentSquadIndex ?? 0,
        safeMode: raw?.safeMode ?? {},
        portals: raw?.portals ?? {},
        intel: raw?.intel ?? {}
    };
    Memory.war = migrated;
    return migrated;
}
