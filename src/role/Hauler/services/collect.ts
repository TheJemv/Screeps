import { HaulerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";
import { getAvailableEnergy } from "utils/EnergyReservations";
import { getGeneralContainers } from "utils/GetGeneralContainers";
import { GetPowerBankContainers } from "utils/GetPowerBank";

export function collectEnergy(creep: HaulerCreep): void {
    const freeCap = creep.store.getFreeCapacity(RESOURCE_ENERGY);

    // 1. PUNTOS DE INTERÉS TRANSITORIOS: Tumbas y Ruinas (Prevenir decay)
    const wreck = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
        filter: (t) => t.store[RESOURCE_ENERGY] >= 50
    }) || creep.pos.findClosestByPath(FIND_RUINS, {
        filter: (r) => r.store[RESOURCE_ENERGY] >= 50
    });

    if (wreck) {
        if (creep.withdraw(wreck, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, wreck, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // 2. EXCLUSIÓN DE BANDERAS DE MINEROS PARA DROPPED ENERGY
    const minerFlagPositions = creep.room
        .find(FIND_FLAGS, { filter: (f) => f.name.startsWith("Miner_") })
        .map((f) => f.pos);

    const isOnMinerFlag = (pos: RoomPosition) =>
        minerFlagPositions.some((flagPos) => flagPos.isEqualTo(pos));

    // 3. PILAS GRANDES DE ENERGÍA TIRADA (Fuera de la casilla del minero)
    const minPileSize = Math.min(freeCap, 200);
    const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (d) =>
            d.resourceType === RESOURCE_ENERGY &&
            d.amount >= minPileSize &&
            !isOnMinerFlag(d.pos)
    });

    if (droppedEnergy) {
        if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, droppedEnergy, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // 4. CONTAINER MÁS CERCANO, sea power bank o genérico -- sin priorizar
    // tipo, junta los dos y agarra el que le quede más cerca (mismo criterio
    // que Builder). Solo del room actual -- el Hauler no cruza rooms, para
    // eso ya está el RemoteHauler.
    if (creep.memory.targetContainerId) {
        const target = Game.getObjectById<StructureContainer>(creep.memory.targetContainerId);

        if (target && target.store[RESOURCE_ENERGY] >= 50) {
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, target, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }
        delete creep.memory.targetContainerId;
    }

    const candidates = [
        ...getGeneralContainers(creep.room),
        ...GetPowerBankContainers().filter((c) => c.pos.roomName === creep.room.name)
    ].filter((c) => getAvailableEnergy(c, creep) >= 100);

    const closestContainer = creep.pos.findClosestByPath(candidates);

    if (closestContainer) {
        creep.memory.targetContainerId = closestContainer.id;
        if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, closestContainer, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // 5. RECOLECCIÓN RESIDUAL DE ENERGÍA TIRADA
    const anyDropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (d) =>
            d.resourceType === RESOURCE_ENERGY &&
            d.amount >= 30 &&
            !isOnMinerFlag(d.pos)
    });

    if (anyDropped) {
        if (creep.pickup(anyDropped) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, anyDropped, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // 6. RESPALDO FINAL: STORAGE
    // Si no hay nada en tumbas, suelo ni en minas, saca del Storage
    if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
        if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, creep.room.storage, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
}
