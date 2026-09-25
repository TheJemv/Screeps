import { CONTROLLERCREEP_FLAG_PREFIX } from "config";
import { moveToRoad } from "utils/MoveToRoad";

/** Flags "ControllerCreep_1", "ControllerCreep_2"... -- se paran ahí para siempre,
 *  a upgradear el controller sin parar. La flag tiene que quedar a la vez a rango
 *  3 del controller (lo que pide upgradeController) y rango 1 de un container. */
export function controllerCreepFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name.startsWith(CONTROLLERCREEP_FLAG_PREFIX));
}

/** La flag libre más cercana por camino real. Sticky una vez asignada. */
function assignedFlag(creep: Creep): Flag | undefined {
    if (creep.memory.controllerCreepFlag) {
        const flag = Game.flags[creep.memory.controllerCreepFlag];
        if (flag) return flag;
        delete creep.memory.controllerCreepFlag;
    }

    const busy = new Set(_.map(Game.creeps, c => c.memory.controllerCreepFlag));
    const free = controllerCreepFlags().filter(f => !busy.has(f.name));
    if (free.length === 0) return undefined;

    const closest = creep.pos.findClosestByPath(free) ?? free[0];
    creep.memory.controllerCreepFlag = closest.name;
    return closest;
}

export default {
    run(creep: Creep): void {
        const flag = assignedFlag(creep);
        if (!flag) return;

        if (!creep.pos.isEqualTo(flag.pos)) {
            moveToRoad(creep, flag);
            return;
        }

        if (creep.store[RESOURCE_ENERGY] === 0) {
            const container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER
            });
            if (container && creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                // La flag no quedó a rango 1 exacto del container -- se acerca. El
                // chequeo de arriba (isEqualTo la flag) lo va a devolver a su
                // puesto solo apenas tenga energía de nuevo.
                moveToRoad(creep, container);
            }
            return;
        }

        const controller = creep.room.controller;
        if (controller) creep.upgradeController(controller);
    }
};
