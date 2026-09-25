import { GetPowerBankContainers } from "./GetPowerBank";

/**
 * Calcula la energía real disponible en un contenedor restando
 * la capacidad de carga de los creeps que ya van en camino hacia él.
 */
export function getAvailableEnergy(container: StructureContainer, currentCreep: Creep): number {
    const energyInStore = container.store[RESOURCE_ENERGY];

    // Busca cualquier creep (Hauler, Repairer, Builder, etc.) que tenga este contenedor reservado
    const reservedEnergy = _.sum(
        _.filter(Game.creeps, (c: Creep) =>
            c.id !== currentCreep.id &&
            c.memory.targetContainerId === container.id
        ),
        (c: Creep) => c.store.getFreeCapacity(RESOURCE_ENERGY)
    );

    return energyInStore - reservedEnergy;
}

/**
 * Intenta reservar y retirar energía de la lista de GetPowersBank
 */
export function withdrawFromPowerBank(
    creep: Creep,
    minEnergyAvailable = 100,
    allowOtherRooms = true
): boolean {
    // 1. Si ya tiene un objetivo reservado
    if (creep.memory.targetContainerId) {
        const container = Game.getObjectById<StructureContainer>(creep.memory.targetContainerId);

        if (container && container.store[RESOURCE_ENERGY] >= 50) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container); // O usar tu wrapper de movimiento
            }
            return true;
        } else {
            delete creep.memory.targetContainerId;
        }
    }

    // 2. Si no tiene, busca el contenedor minero con energía disponible
    const availableContainers = GetPowerBankContainers().filter(c => getAvailableEnergy(c, creep) >= minEnergyAvailable);

    if (availableContainers.length === 0) return false;

    // PRIORIDAD 1: contenedor en el room donde el creep está parado AHORA.
    // (ej: un Repairer que quedó lejos de casa reparando algo debería usar
    // la mina que tiene al lado en vez de ir a buscar en otro lado)
    const localContainers = availableContainers.filter(c => c.pos.roomName === creep.room.name);

    // PRIORIDAD 2: si no hay nada local, volver al room de origen (donde nació
    // el creep -- creep.memory.room, seteado por el Spawner).
    const homeContainers = creep.memory.room
        ? availableContainers.filter(c => c.pos.roomName === creep.memory.room)
        : [];

    // PRIORIDAD 3: último recurso, cualquier otro contenedor disponible del
    // imperio -- solo si el caller lo permite (Hauler NO: su trabajo es 100%
    // local, no tiene por qué cruzar rooms a buscar energía).
    const candidates = localContainers.length > 0
        ? localContainers
        : homeContainers.length > 0
            ? homeContainers
            : allowOtherRooms
                ? availableContainers
                : [];

    if (candidates.length === 0) return false;

    const closestContainer = creep.pos.findClosestByPath(candidates) || candidates[0];

    if (closestContainer) {
        creep.memory.targetContainerId = closestContainer.id;
        if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestContainer);
        }
        return true;
    }

    return false;
}
