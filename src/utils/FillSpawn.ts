import { FILL_SPAWN_RANGE } from "config";

// Busca el spawn/extension con espacio libre más cercano al container asignado
// del creep (su base fija dentro de la sala -- no su posición actual, que va
// cambiando) -- entre empatados en distancia, el más vacío. Nunca busca más
// allá de FILL_SPAWN_RANGE de esa base: prefiere no rellenar nada antes que
// cruzar la sala hasta el clúster de otro container. Si no hay nada (cerca, o
// en general), devuelve null.
export function findSpawnStorage(creep: Creep): StructureSpawn | StructureExtension | null {
    const container = creep.memory.containerId ? Game.getObjectById(creep.memory.containerId) : null;
    const anchor = container ? container.pos : creep.pos;

    const targets = creep.room.find(FIND_MY_STRUCTURES).filter(
        (s): s is StructureSpawn | StructureExtension =>
            (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            anchor.getRangeTo(s) <= FILL_SPAWN_RANGE
    );

    const ordenados = targets.sort((a, b) => {
        const porDistancia = anchor.getRangeTo(a) - anchor.getRangeTo(b);
        if (porDistancia !== 0) return porDistancia;
        return a.store[RESOURCE_ENERGY] - b.store[RESOURCE_ENERGY];
    });

    return ordenados.length > 0 ? ordenados[0] : null;
}

// Energía actual guardada entre el spawn y todas sus extensions en la sala.
// (Screeps ya suma esto nativamente en room.energyAvailable, así que solo lo exponemos con un nombre claro.)
export function getSpawnEnergyAvailable(spawn: StructureSpawn): number {
    return spawn.room.energyAvailable;
}

// Capacidad máxima combinada del spawn y todas sus extensions en la sala.
export function getSpawnEnergyCapacity(spawn: StructureSpawn): number {
    return spawn.room.energyCapacityAvailable;
}
