import { UPGRADER_FLAG_PREFIX } from "config";
import { moveToRoad } from "utils/MoveToRoad";

/** Flags "Upgrader_1", "Upgrader_2"... marcan dónde se para cada uno -- ya no upgradea
 *  el controller, es un abastecedor fijo de spawn/extensions cerca de su container. */
export function upgraderFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name.startsWith(UPGRADER_FLAG_PREFIX));
}

/** La flag libre más cercana por camino real (puede cruzar de sala). Sticky una vez asignada. */
function assignedFlag(creep: Creep): Flag | undefined {
    if (creep.memory.upgraderFlag) {
        const flag = Game.flags[creep.memory.upgraderFlag];
        if (flag) return flag;
        delete creep.memory.upgraderFlag;
    }

    const busy = new Set(_.map(Game.creeps, c => c.memory.upgraderFlag));
    const free = upgraderFlags().filter(f => !busy.has(f.name));
    if (free.length === 0) return undefined;

    const closest = creep.pos.findClosestByPath(free) ?? free[0];
    creep.memory.upgraderFlag = closest.name;
    return closest;
}

export default {
    run(creep: Creep): void {
        const flag = assignedFlag(creep);
        if (!flag) return;

        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            let target: AnyStoreStructure | null = null;
            if (creep.memory.targetId) {
                target = Game.getObjectById(creep.memory.targetId as Id<AnyStoreStructure>);
                if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    delete creep.memory.targetId;
                    target = null;
                }
            }

            const MAX_DISTANCE = 20
            if (!target) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => {
                        const isEnergyStructure = s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN;
                        if (isEnergyStructure) {
                            const hasSpace =  (s as AnyStoreStructure).store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                            const isWithinRange = creep.pos.getRangeTo(s) <= MAX_DISTANCE;

                            return hasSpace && isWithinRange;
                        }
                        return false;
                    }
                }) as AnyStoreStructure | null;

                if (target) {
                    creep.memory.targetId = target.id; // Lo memorizamos
                }
            }

            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToRoad(creep, target);
                } else {
                    delete creep.memory.targetId;
                }
                return;
            }

            // Nada que rellenar por ahora -- esperar cerca de su flag.
            if (!creep.pos.isEqualTo(flag.pos)) moveToRoad(creep, flag);
            return;
        } else {
            const container = flag.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
            });

            if (container && creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, container);
            }

            if (!container) {
                const droppedEnergy = flag.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0
                })

                if (droppedEnergy && creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
                    moveToRoad(creep, droppedEnergy);
                }
            }
        }
    }
};
