import { MINER_FLAG_PREFIX } from "config";
import { moveToRoad } from "utils/MoveToRoad";
// import trySpawn from "utils/TrySpawn";

/** Flags "Miner_1", "Miner_2"... las que haya puestas -- una por posición de minado. */
export function minerFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name.startsWith(MINER_FLAG_PREFIX));
}

function assignedFlag(creep: Creep): Flag | undefined {
    if (creep.memory.minerFlag) {
        const flag = Game.flags[creep.memory.minerFlag];
        if (flag) return flag;
        delete creep.memory.minerFlag;
    }

    const busy = new Set(_.map(Game.creeps, c => c.memory.minerFlag));
    const free = minerFlags().filter(f => !busy.has(f.name));
    if (free.length === 0) return undefined;

    const closest = creep.pos.findClosestByPath(free) ?? free[0];
    creep.memory.minerFlag = closest.name;
    return closest;
}

export default {
    run(creep: Creep): void {
        const flag = assignedFlag(creep);
        if (!flag) return;

        // Ir hacia su flag -- puede cruzar de sala -- y quedarse ahí para siempre.
        if (!creep.pos.isEqualTo(flag.pos)) {
            moveToRoad(creep, flag);
            return;
        }

        //  Si tiene Carry...
        if (_.some(creep.body, { type: CARRY })) {
            if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
                creep.memory.working = false;
                creep.say('🔄 harvest'); // Opcional: muestra un globo de texto
            }

            if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
                creep.memory.working = true;
                creep.say('🚧 work');
            }

            if (creep.memory.working) {
                const siteOnPos = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)
                    .find(s => s.structureType === STRUCTURE_CONTAINER);

                if (siteOnPos) {
                    creep.build(siteOnPos);
                    return;
                }

                const container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: { structureType: STRUCTURE_CONTAINER }
                }) ;

                if (container && creep.pos.getRangeTo(container) <= 2) {
                    creep.transfer(container, RESOURCE_ENERGY);
                    return;
                }

                const site = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES, {
                    filter: { structureType: STRUCTURE_CONTAINER }
                });

                if (site) {
                    creep.build(site);
                    return;
                }

                // No hay container ni construction site cerca: lo crea en su
                // propia flag para no depender de que alguien lo ponga a mano.
                // Se construye recién el próximo tick (siteOnPos lo va a encontrar).
                creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
                return;

            } else {
                // --- MODO RECOLECCIÓN: Minar hasta llenarse al 100% (Esos 10 ticks seguidos) ---
                const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
                if (!source) return;

                creep.harvest(source);
            }
        }

        //  Si no tiene Carry...
        if (!_.some(creep.body, { type: CARRY })) {
            const source = flag.pos.findClosestByPath(FIND_SOURCES);
            if(!source) return

            const harvestResult = creep.harvest(source);
            if (harvestResult === ERR_NOT_IN_RANGE) {
                console.log("Error en el miner, no llega el source...")
            }
        }
    }
}
