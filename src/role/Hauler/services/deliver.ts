
import { shouldFillControllerContainer } from "./reservations";
import { getControllerContainer } from "utils/GetControllerContainer";
import { HaulerCreep } from "../types";
import { collectEnergy } from "./collect";
import { moveToRoad } from "utils/MoveToRoad";
import { parkHauler } from "./parking";

/** Espacio libre real de un spawn/extension, restando lo que otros Hauler ya
 * comprometidos a este mismo target llevan encima. Sin esto, como .store no
 * se actualiza hasta el tick siguiente (transfer es un intent, no un cambio
 * inmediato), varios Hauler deciden en el mismo tick que la MISMA extension
 * tiene espacio libre y van todos -- recién se enteran que ya se llenó
 * cuando llegan. */
function getAvailableDeliveryCapacity(structure: StructureSpawn | StructureExtension, currentCreep: Creep): number {
    const freeCapacity = structure.store.getFreeCapacity(RESOURCE_ENERGY);

    const reserved = _.sum(
        _.filter(Game.creeps, (c: Creep) =>
            c.id !== currentCreep.id &&
            c.memory.deliverTargetId === structure.id
        ),
        (c: Creep) => c.store[RESOURCE_ENERGY]
    );

    return freeCapacity - reserved;
}

export function deliverEnergy(creep: HaulerCreep): void {
    // ------------------------------------------------------------------------
    // PRIORIDAD 1: Spawns y Extensions (SUPERVIVENCIA BASE)
    // ------------------------------------------------------------------------
    if (creep.memory.deliverTargetId) {
        const target = Game.getObjectById<StructureSpawn | StructureExtension>(creep.memory.deliverTargetId);

        if (target && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, target, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
            }
            return;
        }
        delete creep.memory.deliverTargetId;
    }

    const spawnTarget = creep.pos.findClosestByPath(creep.room.find(FIND_STRUCTURES, {
        filter: (s: AnyStructure): s is StructureSpawn | StructureExtension => {
            const isEnergyStructure =
                s.structureType === STRUCTURE_EXTENSION ||
                s.structureType === STRUCTURE_SPAWN;
            return isEnergyStructure && getAvailableDeliveryCapacity(s, creep) > 0;
        }
    }));

    if (spawnTarget) {
        creep.memory.deliverTargetId = spawnTarget.id;
        if (creep.transfer(spawnTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, spawnTarget, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
        }
        return;
    }

    // ------------------------------------------------------------------------
    // PRIORIDAD 2: Contenedor del Controller (Modo Histéresis)
    // ------------------------------------------------------------------------
    const controllerContainer = getControllerContainer(creep.room);
    if (controllerContainer && shouldFillControllerContainer(creep.room, controllerContainer)) {
        if (creep.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, controllerContainer, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
        }
        return;
    }

    // ------------------------------------------------------------------------
    // PRIORIDAD 3: Trabajadores Cercanos (Upgraders / Builders adyacentes)
    // ------------------------------------------------------------------------
    const nearbyWorker = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: (c) =>
            (c.memory.role === 'upgrader' || c.memory.role === 'builder') &&
            c.store.getFreeCapacity(RESOURCE_ENERGY) >= 50
    })[0];

    if (nearbyWorker) {
        creep.transfer(nearbyWorker, RESOURCE_ENERGY);
        return;
    }

    // ------------------------------------------------------------------------
    // PRIORIDAD 4: Torres (Defensa y Reparaciones)
    // ------------------------------------------------------------------------
    const towerTarget = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (s): s is StructureTower =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) >= 100
    });

    if (towerTarget) {
        if (creep.transfer(towerTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, towerTarget, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
        }
        return;
    }

    // ------------------------------------------------------------------------
    // PRIORIDAD 5: Storage (Almacén Global)
    // ------------------------------------------------------------------------
    if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, creep.room.storage, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
        }
        return;
    }

    // ------------------------------------------------------------------------
    // SIN TAREAS ACTIVAS: Ir al estacionamiento
    // ------------------------------------------------------------------------
    parkHauler(creep, () => collectEnergy(creep));
}
