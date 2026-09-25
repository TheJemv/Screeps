import { CLAIM_FLAG_NAME, CLAIM_FLAG_PREFIX } from "config";
import { ClaimCreep } from "../types";

/** Flags "Claim" o "Claim_1", "Claim_2"... las que haya puestas. */
export function claimFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name === CLAIM_FLAG_NAME || f.name.startsWith(CLAIM_FLAG_PREFIX));
}

/** A qué flag va este creep: sticky, balanceando por cuántos ya tiene cada una asignados. */
export function assignedFlag(creep: ClaimCreep): Flag | undefined {
    const flags = claimFlags();
    if (flags.length === 0) return undefined;

    let flagName = creep.memory.claimFlag;
    if (flagName && !Game.flags[flagName]) flagName = undefined;

    if (!flagName) {
        let mejor = flags[0];
        let menorConteo = Infinity;
        for (const f of flags) {
            const asignados = _.filter(Game.creeps, c => c.memory.role === "claim" && c.memory.claimFlag === f.name).length;
            if (asignados < menorConteo) {
                menorConteo = asignados;
                mejor = f;
            }
        }
        flagName = mejor.name;
    }
    creep.memory.claimFlag = flagName;
    return Game.flags[flagName];
}
