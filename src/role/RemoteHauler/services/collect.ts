import { GetPowersBankRemotes } from "utils/GetPowerBank"; // La que creamos sin controller
import { RemoteHaulerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

function isOnRoad(pos: RoomPosition): boolean {
    return pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_ROAD);
}

/** Casilla libre (sin pared, sin road) más cercana al container, para no estorbar el tráfico. */
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

/** Sin energía disponible todavía: esperar cerca del container, no lejos y sin pisar un road. */
function parkNearPowerBank(creep: RemoteHaulerCreep): void {
    const container = creep.pos.findClosestByPath(GetPowersBankRemotes());

    if (container) {
        if (creep.pos.inRangeTo(container.pos, 2) && !isOnRoad(creep.pos)) {
            creep.say('💤 esperando');
            return;
        }

        const spot = findParkingSpot(container);
        if (spot) {
            moveToRoad(creep, spot, { range: 0, visualizePathStyle: { stroke: '#777777' } });
        }
        return;
    }

    // Sin visión del room remoto ahora mismo (ej: el miner de ese lado murió o
    // todavía no llegó) -- GetPowersBankRemotes() no puede ver nada sin visión.
    // Viajar igual hacia la flag Miner_ (las flags se conocen sin visión) para
    // recuperarla al llegar, en vez de quedarse parado esperando algo que
    // nunca va a aparecer solo.
    const fallbackFlag = Object.values(Game.flags).find(
        (f) => f.name.startsWith("Miner_") && f.pos.roomName !== creep.memory.homeRoom
    );
    if (fallbackFlag) {
        moveToRoad(creep, fallbackFlag, { range: 2 });
    }
}

export function getAvailableEnergyRemote(container: StructureContainer, currentCreep: Creep): number {
    const energyInStore = container.store[RESOURCE_ENERGY];
    const reservedEnergy = _.sum(
        _.filter(Game.creeps, (c: Creep) =>
            c.id !== currentCreep.id &&
            c.memory.role === 'remoteHauler' && // Solo restamos lo que otros remote haulers apartaron
            c.memory.targetContainerId === container.id
        ),
        (c: Creep) => c.store.getFreeCapacity(RESOURCE_ENERGY)
    );
    return energyInStore - reservedEnergy;
}

export function collectRemoteEnergy(creep: RemoteHaulerCreep): void {
    // 1. Si ya tiene un objetivo reservado
    if (creep.memory.targetContainerId) {
        const container = Game.getObjectById<StructureContainer>(creep.memory.targetContainerId);

        if (container && container.store[RESOURCE_ENERGY] >= 50) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, container, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        } else {
            delete creep.memory.targetContainerId;
        }
    }

    // 2. Si no tiene, busca el contenedor minero remoto con energía disponible
    const availableContainers = GetPowersBankRemotes().filter(c => getAvailableEnergyRemote(c, creep) >= 100);

    if (availableContainers.length > 0) {
        const closestContainer = creep.pos.findClosestByPath(availableContainers);

        if (closestContainer) {
            creep.memory.targetContainerId = closestContainer.id;
            if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, closestContainer, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }
    }

    parkNearPowerBank(creep);
}
