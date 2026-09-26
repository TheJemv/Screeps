import { LinkOperatorMemory } from "role/Link/types";
import moveToSharedSpot from "./utils/moveToSharedSpot";

export default {
    run(creep: Creep): void {
        const mem = creep.memory as LinkOperatorMemory;
        const link = Game.getObjectById<StructureLink>(mem.linkId);

        if (!link) return;

        // ---------------------------------------------------------
        // LÓGICA DEL RECEPTOR (Storage)
        // ---------------------------------------------------------
        if (mem.linkType === 'receiver') {
            const storage = creep.room.storage;

            if (!storage) return;
            if (!moveToSharedSpot(creep, link, storage)) return;

            if (creep.store.getFreeCapacity() === 0) {
                creep.transfer(storage, RESOURCE_ENERGY);
            } else if (link.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.withdraw(link, RESOURCE_ENERGY);
            } else if (creep.store.getUsedCapacity() > 0) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
        } else if (mem.linkType === 'sender') {
            // ---------------------------------------------------------
            // LÓGICA DEL EMISOR (Contenedores en las Minas)
            // ---------------------------------------------------------

            const containers = link.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });

            if (containers.length === 0) return;
            containers.sort((a, b) =>
                b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY)
            );


            const container = containers[0]
            if (!moveToSharedSpot(creep, link, container)) return;

            if (creep.store.getFreeCapacity() === 0) {
                creep.transfer(link, RESOURCE_ENERGY);
            } else if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.withdraw(container, RESOURCE_ENERGY);
            } else if (creep.store.getUsedCapacity() > 0) {
                creep.transfer(link, RESOURCE_ENERGY);
            }
        }
    }
}
