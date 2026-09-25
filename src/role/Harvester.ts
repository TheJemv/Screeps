import { findSpawnStorage } from "utils/FillSpawn";
import trySpawn from "utils/TrySpawn";

/** Para llamar a mano desde la consola: spawnHarvester(). Usa trySpawn -- ya
 *  chequea que haya energía y loguea el resultado, no hace falta escribir
 *  spawnCreep a mano cada vez. */
export function spawnHarvester(): void {
    trySpawn(Game.spawns.Spawn1, "Harvester", [WORK, CARRY, MOVE]);
}

// Rol de emergencia: no depende de flags, containers ni ningún otro rol -- solo
// busca la fuente más cercana y lleva energía directo al spawn/extensions.
// Como mucho un Harvester por fuente, para no pisarse entre varios.
function pickSource(creep: Creep): Source | null {
    const busy = new Set(
        _.map(Game.creeps, c => (c.memory.role === "harvester" ? c.memory.sourceId : undefined))
    );
    const free = creep.room.find(FIND_SOURCES_ACTIVE).filter(s => !busy.has(s.id));
    return creep.pos.findClosestByPath(free);
}

export default {
    run(creep: Creep): void {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.sourceId;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            const target = findSpawnStorage(creep);
            if (!target) return;
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
            return;
        }

        if (creep.memory.sourceId === undefined) {
            const picked = pickSource(creep);
            creep.memory.sourceId = picked ? picked.id : "";
        }

        if (!creep.memory.sourceId) return;
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { delete creep.memory.sourceId; return; }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
};
