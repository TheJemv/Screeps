// src/war/managers/RouteManager.ts
//
// Por qué rooms pasar para llegar al objetivo, con portales.
//
// Game.map.findRoute no conoce los portales. Si el camino normal no existe (o un
// portal ahorra al menos PORTAL_MIN_SAVING rooms), la ruta es: caminar hasta el
// room del portal, pisarlo, y seguir desde el room destino. Los portales vistos se
// guardan en Memory.war.portals, así se siguen usando aunque se pierda la visión.
import { WAR_CONFIG } from "../config";
import { PortalInfo } from "../types";
import { sideTowards } from "../utils/geometry";
import { isAlly } from "../utils/combat";
import { warMemory } from "../utils/memory";

const { MOVE } = WAR_CONFIG;

/** Un salto de la ruta: al room `room`, por el borde o por un portal del room anterior. */
export type Hop = { room: string; via: "exit"; side: number } | { room: string; via: "portal"; portals: PortalInfo[] };

interface CachedRoute {
    tick: number;
    rooms: string[] | null;
}

const exitRoutes = new Map<string, CachedRoute>();
const fullRoutes = new Map<string, { tick: number; hops: Hop[] | null }>();
let lastScan = -Infinity;

export default class RouteManager {
    /** Saltos de `from` a `to` (vacío si ya está). null = no hay forma conocida. */
    public static route(from: string, to: string): Hop[] | null {
        if (from === to) return [];
        const key = `${from}>${to}`;
        const cached = fullRoutes.get(key);
        if (cached && Game.time - cached.tick < MOVE.ROUTE_TTL) return cached.hops;

        const hops = this.compute(from, to);
        fullRoutes.set(key, { tick: Game.time, hops });
        return hops;
    }

    public static nextHop(from: string, to: string): Hop | null {
        const hops = this.route(from, to);
        return hops && hops.length > 0 ? hops[0] : null;
    }

    /** Rooms por salidas normales (incluye origen y destino), o null. */
    public static exitRoute(from: string, to: string): string[] | null {
        if (from === to) return [from];
        const key = `${from}>${to}`;
        const cached = exitRoutes.get(key);
        if (cached && Game.time - cached.tick < MOVE.ROUTE_TTL) return cached.rooms;

        const result = Game.map.findRoute(from, to, { routeCallback: room => this.roomCost(room, from, to) });
        const rooms = result === ERR_NO_PATH ? null : [from, ...result.map(step => step.room)];
        exitRoutes.set(key, { tick: Game.time, rooms });
        return rooms;
    }

    /** Portales recordados de un room, agrupados por destino. */
    public static portalsTo(room: string, dest: string): PortalInfo[] {
        return (warMemory().portals[room]?.list ?? []).filter(p => p.d === dest);
    }

    /** Guarda los portales de los rooms visibles (cada PORTAL_SCAN_TICKS). */
    public static scanPortals(): void {
        if (Game.time - lastScan < MOVE.PORTAL_SCAN_TICKS) return;
        lastScan = Game.time;

        const mem = warMemory();
        for (const name in Game.rooms) {
            const list: PortalInfo[] = [];
            const portals = Game.rooms[name].find(FIND_STRUCTURES, {
                filter: (s): s is StructurePortal => s.structureType === STRUCTURE_PORTAL
            });
            for (const portal of portals) {
                const dest = portal.destination;
                // Inter-shard no se maneja: del otro lado no controlamos a nadie.
                if (!("roomName" in dest)) continue;
                list.push({ x: portal.pos.x, y: portal.pos.y, d: dest.roomName, dx: dest.x, dy: dest.y });
            }
            if (list.length > 0) mem.portals[name] = { t: Game.time, list };
            else delete mem.portals[name];
        }

        // Olvida portales viejos (los portales al azar se desintegran).
        for (const name in mem.portals) {
            if (Game.time - mem.portals[name].t > MOVE.ROUTE_TTL * 20) delete mem.portals[name];
        }
    }

    // -----------------------------------------------------------------------

    private static compute(from: string, to: string): Hop[] | null {
        const exits = this.exitRoute(from, to);
        let best: Hop[] | null = exits ? this.exitHops(exits) : null;
        let bestLength = best ? best.length : Infinity;

        const known = warMemory().portals;
        for (const portalRoom in known) {
            const byDest = new Map<string, PortalInfo[]>();
            for (const p of known[portalRoom].list) byDest.set(p.d, [...(byDest.get(p.d) ?? []), p]);

            const toPortal = this.exitRoute(from, portalRoom);
            if (!toPortal) continue;

            for (const [dest, portals] of byDest) {
                if (dest === portalRoom) continue;
                const after = this.exitRoute(dest, to);
                if (!after) continue;

                const length = toPortal.length - 1 + 1 + (after.length - 1);
                if (length + MOVE.PORTAL_MIN_SAVING > bestLength && best) continue;

                best = [...this.exitHops(toPortal), { room: dest, via: "portal", portals }, ...this.exitHops(after)];
                bestLength = length;
            }
        }
        return best;
    }

    private static exitHops(rooms: string[]): Hop[] {
        const hops: Hop[] = [];
        for (let i = 1; i < rooms.length; i++) {
            const side = sideTowards(rooms[i - 1], rooms[i]);
            if (side === undefined) return hops;
            hops.push({ room: rooms[i], via: "exit", side });
        }
        return hops;
    }

    /** Siempre finito: desalienta rooms con dueño enemigo, SK y highways pero no los prohíbe. */
    private static roomCost(room: string, from: string, to: string): number {
        if (room === from || room === to) return 1;

        const controller = Game.rooms[room]?.controller;
        const owner = controller?.owner?.username;
        if (owner && !controller?.my && !isAlly(owner)) return 8;

        const match = /^[WE](\d+)[NS](\d+)$/.exec(room);
        if (match) {
            const h = Number(match[1]) % 10;
            const v = Number(match[2]) % 10;
            if (h === 0 || v === 0) return 1; // highway: sin dueño y sin muros de base
            if (h >= 4 && h <= 6 && v >= 4 && v <= 6 && !(h === 5 && v === 5)) return 4; // Source Keepers
        }
        return 2;
    }
}
