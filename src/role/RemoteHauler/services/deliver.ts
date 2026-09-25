
import { RemoteHaulerCreep } from "../types";
import { getGeneralContainers } from "utils/GetGeneralContainers";
import { moveToRoad } from "utils/MoveToRoad";

export function deliverRemoteEnergy(creep: RemoteHaulerCreep): void {
    // Regresar a casa si sigue fuera
    if (creep.room.name !== creep.memory.homeRoom) {
        const homeSpawn = Game.spawns.Spawn1;
        if (homeSpawn) {
            moveToRoad(creep, homeSpawn, { range: 3 });
        }
        return;
    }

    // 1-3. Container general más cercano (ni el del controller ni un power
    // bank) -- si tiene espacio, depositar ahí.
    const nearestContainer = creep.pos.findClosestByPath(getGeneralContainers(creep.room));

    if (nearestContainer && nearestContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.transfer(nearestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, nearestContainer, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
        }
        return;
    }

    // 4. Container lleno (o no hay ninguno) -- al storage principal.
    if (creep.room.storage) {
        if (creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, creep.room.storage, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
            }
        } else {
            creep.say('🈵 lleno');
        }
        return;
    }

    creep.say('⚠️ Sin destino');
}
