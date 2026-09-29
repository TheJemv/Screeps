// src/guard/managers/RoomManager.ts
//
// Qué rooms son "casa" (donde viven los vigilantes) y cuáles se vigilan
// (reservas y remotos). Los vigilados quedan en Memory: si mueren los creeps
// que daban visión de una reserva, se sigue sabiendo que es nuestra.
import { GUARD_CONFIG } from "../config";
import { GuardMemory } from "../types";

let homesTick = -1;
let homesCache: string[] = [];
let username: string | undefined;

export function guardMemory(): GuardMemory {
    Memory.guard ??= { watched: {}, threats: {} };
    Memory.guard.watched ??= {};
    Memory.guard.threats ??= {};
    return Memory.guard;
}

export default class RoomManager {
    /** Home rooms: HOME_ROOMS del config, o todos mis rooms con spawn y RCL suficiente. */
    public static homes(): string[] {
        if (homesTick === Game.time) return homesCache;
        homesTick = Game.time;

        const fixed = GUARD_CONFIG.ROOMS.HOME_ROOMS;
        if (fixed.length > 0) {
            homesCache = fixed.filter(name => Game.rooms[name]?.controller?.my);
            return homesCache;
        }

        homesCache = [];
        for (const name in Game.rooms) {
            const controller = Game.rooms[name].controller;
            if (!controller || !controller.my || controller.level < GUARD_CONFIG.ROOMS.MIN_HOME_RCL) continue;
            if (Game.rooms[name].find(FIND_MY_SPAWNS).length === 0) continue;
            homesCache.push(name);
        }
        return homesCache;
    }

    /** Refresca los rooms vigilados (banderas + reservas/rooms míos que se ven) y olvida los viejos. */
    public static update(homes: string[]): void {
        const watched = guardMemory().watched;
        const prefixes = GUARD_CONFIG.ROOMS.WATCH_FLAG_PREFIXES;
        const me = this.username();

        for (const name in Game.flags) {
            if (!prefixes.some(prefix => name.startsWith(prefix))) continue;
            const roomName = Game.flags[name].pos.roomName;
            if (!homes.includes(roomName)) watched[roomName] = Game.time;
        }

        for (const name in Game.rooms) {
            if (homes.includes(name)) continue;
            const controller = Game.rooms[name].controller;
            if (!controller) continue;
            // Reservado por mí, o mío pero todavía sin ser home (recién claimeado).
            if (controller.my || (me && controller.reservation?.username === me)) watched[name] = Game.time;
        }

        for (const name in watched) {
            if (homes.includes(name) || Game.time - watched[name] > GUARD_CONFIG.ROOMS.WATCH_FORGET_TICKS) {
                delete watched[name];
            }
        }
    }

    public static isWatched(roomName: string): boolean {
        return guardMemory().watched[roomName] !== undefined;
    }

    /** El home más cercano (distancia lineal) a un room. */
    public static homeFor(roomName: string, homes: string[]): string | undefined {
        let best: string | undefined;
        let bestDistance = Infinity;
        for (const home of homes) {
            const distance = Game.map.getRoomLinearDistance(home, roomName);
            if (distance < bestDistance) {
                best = home;
                bestDistance = distance;
            }
        }
        return best;
    }

    /** Mi nombre de jugador (para reconocer mis reservas). */
    public static username(): string | undefined {
        if (username) return username;
        for (const name in Game.spawns) {
            username = Game.spawns[name].owner.username;
            return username;
        }
        for (const name in Game.creeps) {
            username = Game.creeps[name].owner.username;
            return username;
        }
        return undefined;
    }
}
