import { LinkKeeperCreep } from "../types";

/** Lado A (sin storage cerca): alimenta el link desde los containers que
 * tenga a rango 1. */
function feedLink(creep: LinkKeeperCreep, link: StructureLink): void {
    if (creep.store[RESOURCE_ENERGY] > 0) {
        if (link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.transfer(link, RESOURCE_ENERGY);
        }
        return;
    }

    const container = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s): s is StructureContainer =>
            s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    })[0];

    if (container) creep.withdraw(container, RESOURCE_ENERGY);
}

/** Lado B (con storage cerca): drena el link hacia un container a rango 1
 * primero, storage como respaldo. */
function drainLink(creep: LinkKeeperCreep, link: StructureLink, storage: StructureStorage): void {
    if (creep.store[RESOURCE_ENERGY] === 0) {
        if (link.store[RESOURCE_ENERGY] > 0) creep.withdraw(link, RESOURCE_ENERGY);
        return;
    }

    const container = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s): s is StructureContainer =>
            s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    })[0];

    if (container) {
        creep.transfer(container, RESOURCE_ENERGY);
    } else if (storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        creep.transfer(storage, RESOURCE_ENERGY);
    }
}

/** Se para en su flag y, desde ahí, decide solo qué lado del link es según
 * lo que tenga alrededor -- storage a rango 1 = lado B (drena), si no =
 * lado A (alimenta). Nunca se mueve de ahí una vez que llega. */
export function keepLink(creep: LinkKeeperCreep): void {
    const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
        filter: (s): s is StructureLink => s.structureType === STRUCTURE_LINK
    })[0];

    if (!link) return; // todavía no hay link construido en esta posición

    const storage = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
        filter: (s): s is StructureStorage => s.structureType === STRUCTURE_STORAGE
    })[0];

    if (storage) {
        drainLink(creep, link, storage);
    } else {
        feedLink(creep, link);
    }
}
