// Calcula el body de un RemoteHauler a medida para la mina que le toca: lo
// justo para mover toda su producción dentro de su propio ciclo de regen
// (300 ticks) yendo y viniendo, más un 10% de margen -- ni de más (desperdicia
// spawn) ni de menos (se acumula y desborda, que es el problema que veníamos
// viendo).

const SAFETY_MARGIN = 1.10;

/** Producción sostenida de un source en energía/tick: 3000/300 si el room
 * está reservado o es tuyo, 1500/300 si no. */
function sourceProductionRate(room: Room): number {
    const reservedOrOwned = Boolean(room.controller && (room.controller.my || room.controller.reservation));
    const capacity = reservedOrOwned ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY;
    return capacity / ENERGY_REGEN_TIME;
}

/** Ida + vuelta en ticks -- PathFinder real (no una estimación a ojo).
 * Asume 1 tile/tick, que es lo que da un body con proporción 2 CARRY : 1
 * MOVE en road cargado. */
function roundTripTicks(from: RoomPosition, to: RoomPosition): number {
    const result = PathFinder.search(from, { pos: to, range: 1 }, { plainCost: 2, swampCost: 10 });
    return result.path.length * 2;
}

/** Body a medida: CARRY suficiente para cubrir la producción del ciclo
 * completo de ida y vuelta (+10% de margen), y MOVE en proporción 1:2 para
 * no perder velocidad en road cargado. Si no entra en un solo creep (tope de
 * 50 partes), devuelve el más grande posible en esa misma proporción en vez
 * de fallar el spawn. */
export function remoteHaulerBodyFor(spawnPos: RoomPosition, targetPos: RoomPosition, targetRoom: Room): BodyPartConstant[] {
    const rate = sourceProductionRate(targetRoom);
    const tripTicks = roundTripTicks(spawnPos, targetPos);
    const neededCapacity = rate * tripTicks * SAFETY_MARGIN;

    let carryParts = Math.max(1, Math.ceil(neededCapacity / CARRY_CAPACITY));
    let moveParts = Math.max(1, Math.ceil(carryParts / 2));

    if (carryParts + moveParts > MAX_CREEP_SIZE) {
        moveParts = Math.floor(MAX_CREEP_SIZE / 3);
        carryParts = MAX_CREEP_SIZE - moveParts;
    }

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < carryParts; i++) body.push(CARRY);
    for (let i = 0; i < moveParts; i++) body.push(MOVE);
    return body;
}
