export default function(creep: Creep, targetA: Structure, targetB: Structure): boolean {
    if (creep.pos.isNearTo(targetA) && creep.pos.isNearTo(targetB)) {
        return true;
    }

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = targetA.pos.x + dx;
            const y = targetA.pos.y + dy;
            const pos = new RoomPosition(x, y, targetA.room.name);

            if (pos.isNearTo(targetB)) {
                if (Game.map.getRoomTerrain(pos.roomName).get(x, y) === TERRAIN_MASK_WALL) continue;

                // Filtro 2: No puede haber otro creep ahí (excepto nosotros mismos)
                const creeps = pos.lookFor(LOOK_CREEPS);
                if (creeps.length > 0 && creeps[0].name !== creep.name) continue;

                // ¡Encontramos el lugar perfecto! Nos movemos hacia allá.
                creep.moveTo(pos, { visualizePathStyle: { stroke: '#00ffff' } });
                return false; // Todavía estamos en camino
            }
        }
    }
    return false;
}
