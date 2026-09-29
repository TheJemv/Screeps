// src/utils/AdvancedMove/managers/RouteManager.ts
//
// Decide a qué rooms puede entrar un path ANTES de llamar a PathFinder. Sin
// esto, PathFinder explora rooms que no llevan a ningún lado y quema CPU.
//
// Si no hay ruta por salidas normales, prueba cruzando un portal visible (usa
// utils/PortalRoute, el mismo criterio que isReachable() del Builder): el
// primer tramo del viaje es caminar HASTA el portal, el teletransporte pasa
// solo al pisarlo y en el siguiente tick se recalcula del otro lado.

import { ADVANCED_MOVE_CONFIG } from "../config";
import { describeRoom } from "../utils/position";
import { findPortalTowards } from "../../PortalRoute";

export interface Goal {
    pos: RoomPosition;
    range: number;
    /** Rooms permitidos para PathFinder. undefined = viaje dentro del mismo room. */
    rooms?: Set<string>;
    /** Portal que se va a pisar a propósito (se habilita solo ese en la CostMatrix). */
    portal?: RoomPosition;
}

interface CachedRoute {
    rooms: string[] | null;
    tick: number;
}

const routes = new Map<string, CachedRoute>();

export default class RouteManager {
    /** Traduce el destino final al objetivo concreto de este tramo del viaje. null = inalcanzable. */
    public static resolveGoal(from: RoomPosition, dest: RoomPosition, range: number): Goal | null {
        if (from.roomName === dest.roomName) return { pos: dest, range };

        const rooms = this.findRoute(from.roomName, dest.roomName);
        if (rooms) return { pos: dest, range, rooms: new Set(rooms) };

        const portal = findPortalTowards(from.roomName, dest.roomName);
        if (!portal) return null;

        const toPortal = this.findRoute(from.roomName, portal.pos.roomName);
        if (!toPortal) return null;

        return { pos: portal.pos, range: 0, rooms: new Set(toPortal), portal: portal.pos };
    }

    /** Rooms de la ruta (incluye origen y destino), o null si no hay ruta por salidas normales. */
    public static findRoute(from: string, to: string): string[] | null {
        if (from === to) return [from];

        const key = `${from}>${to}`;
        const cached = routes.get(key);
        if (cached && Game.time - cached.tick < ADVANCED_MOVE_CONFIG.CACHE.ROUTE_TTL) return cached.rooms;

        const result = Game.map.findRoute(from, to, {
            routeCallback: (roomName: string) => this.roomCost(roomName, from, to)
        });

        const rooms = result === ERR_NO_PATH ? null : [from, ...result.map(step => step.room)];
        routes.set(key, { rooms, tick: Game.time });
        return rooms;
    }

    /** Siempre finito: desalienta rooms peligrosos pero nunca deja sin ruta si es el único camino. */
    private static roomCost(roomName: string, from: string, to: string): number {
        const cost = ADVANCED_MOVE_CONFIG.ROOM_COST;
        if (roomName === from || roomName === to) return cost.DEFAULT;

        const controller = Game.rooms[roomName]?.controller;
        const owner = controller?.owner?.username;
        if (owner && !controller?.my && !(Memory.allies ?? []).includes(owner)) return cost.HOSTILE;

        const info = describeRoom(roomName);
        if (info.highway) return cost.HIGHWAY;
        if (info.sourceKeeper) return cost.SOURCE_KEEPER;
        return cost.DEFAULT;
    }
}
