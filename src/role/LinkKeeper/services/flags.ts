import { LINKKEEPER_FLAG_PREFIX } from "config";
import { LinkKeeperCreep } from "../types";

/** Flags "LinkKeeper_1", "LinkKeeper_2"... una por posición de atención de un
 * link (junto al link + lo que tenga al lado). */
export function linkKeeperFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name.startsWith(LINKKEEPER_FLAG_PREFIX));
}

/** A qué flag va este creep: sticky, balanceando por cuántos ya tiene cada una asignados. */
export function assignedFlag(creep: LinkKeeperCreep): Flag | undefined {
    if (creep.memory.linkKeeperFlag) {
        const flag = Game.flags[creep.memory.linkKeeperFlag];
        if (flag) return flag;
        delete creep.memory.linkKeeperFlag;
    }

    const taken = new Set(_.map(Game.creeps, (c: Creep) => c.memory.linkKeeperFlag));
    const free = linkKeeperFlags().filter(f => !taken.has(f.name));
    if (free.length === 0) return undefined;

    const closest = creep.pos.findClosestByPath(free) ?? free[0];
    creep.memory.linkKeeperFlag = closest.name;
    return closest;
}
