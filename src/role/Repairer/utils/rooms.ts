import { MINER_FLAG_PREFIX } from "config";
import { getHostileCreeps } from "utils/Attack";
import { REPAIRER_CONFIG } from "../config";

// Se calcula una vez por tick y lo comparten todos los repairers.
let cacheTick = -1;
const remotesByHome = new Map<string, string[]>();

/**
 * Rooms remotos donde un repairer de `home` puede trabajar: los que tienen
 * bandera Miner_, están cerca de casa, se ven y son seguros. Fuera de casa,
 * SOLO a estos rooms puede ir (antes cualquier room le servía).
 */
export function workableRemotes(home: string): string[] {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        remotesByHome.clear();
    }

    let remotes = remotesByHome.get(home);
    if (!remotes) {
        const rooms = new Set<string>();

        for (const name in Game.flags) {
            if (!name.startsWith(MINER_FLAG_PREFIX)) continue;

            const roomName = Game.flags[name].pos.roomName;
            if (roomName === home || rooms.has(roomName)) continue;
            if (Game.map.getRoomLinearDistance(home, roomName) > REPAIRER_CONFIG.REMOTE_MAX_DISTANCE) continue;
            if (isSafe(roomName)) rooms.add(roomName);
        }

        remotes = Array.from(rooms);
        remotesByHome.set(home, remotes);
    }

    return remotes;
}

/** Se ve, no es de otro jugador y no hay enemigos armados (invaders, source keepers...). */
function isSafe(roomName: string): boolean {
    const room = Game.rooms[roomName];
    if (!room) return false;
    if (room.controller && room.controller.owner && !room.controller.my) return false;

    return !getHostileCreeps(room).some(
        (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
    );
}
