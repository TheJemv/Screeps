import { REPAIRER_CONFIG } from "../config";
import { RepairerCreep } from "../types";

/**
 * De pasada: mientras camina con energía, repara la road (o container) que
 * pisa si bajó de PASSING_BELOW. repair() y move() van en el mismo tick, así
 * que no cuesta tiempo y ahorra viajes después.
 */
export function repairPassing(creep: RepairerCreep): void {
    if (creep.store[RESOURCE_ENERGY] === 0) return;

    const worn = creep.pos.lookFor(LOOK_STRUCTURES).find(
        (s) =>
            (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) &&
            s.hits < s.hitsMax * REPAIRER_CONFIG.PASSING_BELOW
    );

    if (worn) creep.repair(worn);
}
