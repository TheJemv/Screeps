import { BuilderCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";
import { getAvailableEnergy } from "utils/EnergyReservations";
import { getGeneralContainers } from "utils/GetGeneralContainers";
import { GetPowersBank } from "utils/GetPowerBank";

// function closestContainerIn(creep: BuilderCreep, room: Room): StructureContainer | null {
//     const candidates = [
//         ...getGeneralContainers(room),
//         ...GetPowersBank().filter((c) => c.pos.roomName === room.name)
//     ].filter((c) => getAvailableEnergy(c, creep) >= 100);

//     return creep.pos.findClosestByPath(candidates);
// }

export function collectEnergy(creep: BuilderCreep): void {
    // const freeCap = creep.store.getFreeCapacity(RESOURCE_ENERGY);

    // 1. Tumbas y ruinas en el room actual
    // const wreck = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
    //     filter: (t) => t.store[RESOURCE_ENERGY] >= 50
    // }) || creep.pos.findClosestByPath(FIND_RUINS, {
    //     filter: (r) => r.store[RESOURCE_ENERGY] >= 50
    // });

    // if (wreck) {
    //     if (creep.withdraw(wreck, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    //         moveToRoad(creep, wreck, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
    //     }
    //     return;
    // }

    // // 2. Exclusión de casillas con banderas Miner_ para dropped energy
    // const minerFlagPositions = creep.room
    //     .find(FIND_FLAGS, { filter: (f) => f.name.startsWith("Miner_") })
    //     .map((f) => f.pos);

    // const isOnMinerFlag = (pos: RoomPosition) =>
    //     minerFlagPositions.some((flagPos) => flagPos.isEqualTo(pos));

    // 3. Recursos tirados en el room actual (Pilas grandes)
    // const minPileSize = Math.min(freeCap, 100);
    // const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    //     filter: (d) => d.resourceType === RESOURCE_ENERGY && d.amount >= minPileSize && !isOnMinerFlag(d.pos)
    // });

    // if (droppedEnergy) {
    //     if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
    //         moveToRoad(creep, droppedEnergy, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
    //     }
    //     return;
    // }

    // 4. CONTAINER MÁS CERCANO, sea normal o power bank -- sin priorizar tipo.
    // Los power banks se llenan de gente (mineros + haulers + repairer), así
    // que conviene ir al que le quede más cerca al builder en vez de siempre
    // pelear por el power bank. Primero en el room actual; si no hay nada ahí
    // (ej: power bank remoto que se secó y no hay containers sueltos en ese
    // room), cae al room de casa antes de resignarse.
    // if (creep.memory.targetContainerId) {
    //     const target = Game.getObjectById<StructureContainer>(creep.memory.targetContainerId);

    //     if (target && target.store[RESOURCE_ENERGY] >= 50) {
    //         if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    //             moveToRoad(creep, target, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
    //         }
    //         return;
    //     }
    //     delete creep.memory.targetContainerId;
    // }

    // let closestContainer = closestContainerIn(creep, creep.room);

    const homeRoom = creep.memory.room ? Game.rooms[creep.memory.room] : undefined;
    // if (!closestContainer && homeRoom && homeRoom.name !== creep.room.name) {
    //     closestContainer = closestContainerIn(creep, homeRoom);
    // }

    // if (closestContainer) {
    //     creep.memory.targetContainerId = closestContainer.id;
    //     if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    //         moveToRoad(creep, closestContainer, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
    //     }
    //     return;
    // }

    // 5. Storage -- el del room actual, o si no hay, el de casa.
    const storage = creep.room.storage;
    if (storage && storage.store[RESOURCE_ENERGY] > 0) {
        if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, storage, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // 6. Nada en ningún lado -- volver a casa en vez de quedarse congelado en
    // medio de la nada (ej: en un room remoto sin storage ni nada que agarrar).
    if (homeRoom && creep.room.name !== homeRoom.name) {
        moveToRoad(creep, Game.spawns.Spawn1, { range: 3 });
    }
}
