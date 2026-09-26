import { GetPowersBankRemotes } from "utils/GetPowerBank";
import { RemoteHaulerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

function isOnRoad(pos: RoomPosition): boolean {
    return pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_ROAD);
}

/** Casilla libre más cercana al contenedor asignado para estacionarse sin estorbar. */
function findParkingSpot(container: StructureContainer): RoomPosition | undefined {
    const terrain = container.room.getTerrain();
    let best: RoomPosition | undefined;
    let bestRange = Infinity;

    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = container.pos.x + dx;
            const y = container.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

            const pos = new RoomPosition(x, y, container.room.name);
            if (isOnRoad(pos)) continue;

            const range = Math.max(Math.abs(dx), Math.abs(dy));
            if (range < bestRange) {
                bestRange = range;
                best = pos;
            }
        }
    }

    return best;
}

/** Estacionarse cerca de SU contenedor asignado mientras el minero lo llena. */
function parkNearAssignedContainer(creep: RemoteHaulerCreep, container: StructureContainer): void {
    const rule = creep.pos.inRangeTo(container.pos, 2) && !creep.pos.isEqualTo(container.pos) && !isOnRoad(creep.pos)
    if (rule) {
        creep.say('💤 esperando');
        return;
    }

    const spot = findParkingSpot(container);
    if (spot) {
        moveToRoad(creep, spot, { range: 0, visualizePathStyle: { stroke: '#777777' } });
    }
}
/** Asignar un contenedor permanente al Hauler basándose en equilibrio o cercanía. */
function assignContainer(creep: RemoteHaulerCreep): StructureContainer | null {
    const remotes = GetPowersBankRemotes();
    if (remotes.length === 0) return null;

    // Buscamos el contenedor remoto más cercano que tenga menos haulers asignados
    // O simplemente el más cercano inicialmente
    const closest = creep.pos.findClosestByPath(remotes);
    if (closest) {
        creep.memory.targetContainerId = closest.id;
        return closest;
    }

    return remotes[0];
}

export function collectRemoteEnergy(creep: RemoteHaulerCreep): void {
    let container: StructureContainer | null = null;

    // 1. Si ya tiene un contenedor asignado permanentemente en memoria
    if (creep.memory.targetContainerId) {
        container = Game.getObjectById<StructureContainer>(creep.memory.targetContainerId);
    }

    // 2. Si no tiene asignación (es un hauler nuevo), se la asignamos ahora mismo
    if (!container) {
        container = assignContainer(creep);
    }

    // 3. Fallback: Si de plano no hay contenedores visibles ni en memoria (ej. sin visión)
    if (!container) {
        const fallbackFlag = Object.values(Game.flags).find(
            (f) => f.name.startsWith("Miner_") && f.pos.roomName !== creep.memory.homeRoom
        );
        if (fallbackFlag) {
            moveToRoad(creep, fallbackFlag, { range: 2 });
        }
        return;
    }

    // 4. Lógica de recolección con SU contenedor asignado
    if (container.store[RESOURCE_ENERGY] >= 50) {
        if (creep.pos.isEqualTo(container.pos)) {
            const spot = findParkingSpot(container);
            if (spot) {
                moveToRoad(creep, spot, { range: 0 });
            } else {
                creep.move(Math.ceil(Math.random() * 8) as DirectionConstant);
            }

            creep.withdraw(container, RESOURCE_ENERGY);
        } else if (!creep.pos.isNearTo(container)) {
            moveToRoad(creep, container, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        } else {
            creep.withdraw(container, RESOURCE_ENERGY);
        }

    } else {
        parkNearAssignedContainer(creep, container);
    }
}
