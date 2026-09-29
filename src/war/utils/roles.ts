// src/war/utils/roles.ts
import type { SquadRole, WarCreep } from "../types";

/** Rol del creep, traduciendo los nombres del sistema anterior. */
export function roleOf(creep: WarCreep): SquadRole {
    const role = creep.memory.squadRole;
    if (role === "Escort") return "Tank";
    if (role === "Follower") return "Healer";
    return role;
}
