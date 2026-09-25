// Un portal NO cuenta como salida normal para Game.map.findRoute/moveTo --
// si el único camino a un room es cruzando uno, el pathfinder normal nunca lo
// va a encontrar solo. Este archivo busca manualmente un portal visible que
// sirva de puente hacia el room objetivo, para poder mandar al creep ahí como
// primer paso (el teletransporte pasa solo al pisarlo).

function destinationRoomOf(portal: StructurePortal): string | undefined {
    const dest = portal.destination;
    if ('roomName' in dest) return dest.roomName; // mismo shard
    return undefined; // inter-shard -- no lo manejamos, no podemos seguir controlando al creep del otro lado
}

/** Busca un portal, visible ahora mismo, que sirva de puente entre
 * fromRoomName y toRoomName: el portal tiene que ser alcanzable por salidas
 * normales desde fromRoomName, y su destino tiene que poder llegar a
 * toRoomName (directo, o por salidas normales desde ahí). */
export function findPortalTowards(fromRoomName: string, toRoomName: string): StructurePortal | undefined {
    for (const roomName in Game.rooms) {
        if (roomName !== fromRoomName && Game.map.findRoute(fromRoomName, roomName) === ERR_NO_PATH) {
            continue;
        }

        const portals = Game.rooms[roomName].find(FIND_STRUCTURES, {
            filter: (s): s is StructurePortal => s.structureType === STRUCTURE_PORTAL
        });

        for (const portal of portals) {
            const destRoom = destinationRoomOf(portal);
            if (!destRoom) continue;

            if (destRoom === toRoomName || Game.map.findRoute(destRoom, toRoomName) !== ERR_NO_PATH) {
                return portal;
            }
        }
    }

    return undefined;
}

/** ¿Se puede llegar a toRoomName desde fromRoomName, por salidas normales o
 * cruzando un portal conocido? */
export function isReachable(fromRoomName: string, toRoomName: string): boolean {
    if (fromRoomName === toRoomName) return true;
    if (Game.map.findRoute(fromRoomName, toRoomName) !== ERR_NO_PATH) return true;
    return Boolean(findPortalTowards(fromRoomName, toRoomName));
}
