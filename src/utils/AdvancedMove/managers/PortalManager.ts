// src/utils/AdvancedMove/managers/PortalManager.ts
//
// El motor teletransporta a CUALQUIER creep que termine el tick parado sobre
// un portal, se haya movido o no (engine: processor/intents/creeps/tick.js).
// Al cruzar, el creep aparece sobre el portal gemelo del otro lado. Si su rol
// no lo mueve ese tick (ej: el Builder ya queda en rango y solo llama
// build()), el portal lo devuelve... y así para siempre: ping-pong.
//
// Una vez por tick, este manager baja de los portales a los creeps de
// AdvancedMove que NO quieren cruzar, a una casilla vecina que los deje lo
// más cerca posible de su destino. El build()/repair() del rol sigue
// funcionando ese mismo tick (las acciones usan la posición de inicio del tick).

import { ALL_DIRECTIONS, chebyshev, isExit, packXY, stepTile } from "../utils/position";
import { ADVANCED_MOVE_CONFIG } from "../config";
import CostMatrixManager from "./CostMatrixManager";
import RouteManager from "./RouteManager";
import TrafficManager from "./TrafficManager";
import { TravelMemory } from "../types";

interface PortalCache {
    tick: number;
    /** Casilla -> room destino del portal (undefined = inter-shard). */
    tiles: Map<number, string | undefined>;
}

/** Penalización para las casillas que quedan fuera de rango del destino. */
const OUT_OF_RANGE = 100;
/** Cada cuántos ticks se repite el aviso de un creep atrapado en un portal. */
const WARN_EVERY = 20;

const portalsByRoom = new Map<string, PortalCache>();
const lastWarning = new Map<string, number>();

export default class PortalManager {
    /** Revisa a todos los creeps de AdvancedMove. Llamar una vez por tick. */
    public static guard(): void {
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const state = creep.memory.travel;
            if (!state || creep.spawning || creep.fatigue > 0) continue;

            const portals = this.portalsIn(creep.pos.roomName);
            if (portals.size === 0 || !portals.has(packXY(creep.pos.x, creep.pos.y))) continue;
            if (this.wantsToCross(creep, state)) continue;

            if (!this.stepOff(creep, state)) this.warnTrapped(creep);
        }
    }

    /**
     * ¿Está parado sobre un portal que SÍ lo lleva hacia su destino? (no hay
     * ruta normal desde acá y el otro lado sí llega). Entonces solo hay que
     * esperar el teletransporte, sin mover ni buscar camino.
     */
    public static wantsToCross(creep: Creep, state: TravelMemory): boolean {
        const portals = this.portalsIn(creep.pos.roomName);
        const xy = packXY(creep.pos.x, creep.pos.y);
        if (!portals.has(xy)) return false;

        const target = portals.get(xy);
        if (!target || state.dRoom === creep.pos.roomName) return false;
        if (RouteManager.findRoute(creep.pos.roomName, state.dRoom)) return false; // se llega caminando

        return target === state.dRoom || RouteManager.findRoute(target, state.dRoom) !== null;
    }

    /**
     * Baja al creep del portal a la casilla vecina más conveniente (la más
     * cerca de su destino). Si está ocupada por otro creep mío, usa las reglas
     * del tráfico: si ese creep ya se mueve, va en camino o se puede empujar,
     * le hace lugar. Antes solo servían casillas vacías: con varios builders
     * trabajando alrededor de una obra pegada al portal, el que llegaba no
     * tenía dónde bajarse y rebotaba para siempre.
     */
    public static stepOff(creep: Creep, state: TravelMemory): boolean {
        const room = creep.pos.roomName;
        const sameRoom = state.dRoom === room;
        const candidates: { dir: DirectionConstant; x: number; y: number; score: number }[] = [];

        for (const dir of ALL_DIRECTIONS) {
            const tile = stepTile(creep.pos.x, creep.pos.y, dir);
            if (!tile || isExit(tile.x, tile.y)) continue;
            // isWalkable descarta portales (valen 255 en la CostMatrix) y estructuras.
            if (!CostMatrixManager.isWalkable(room, tile.x, tile.y)) continue;

            let score = 0;
            if (sameRoom) {
                const dist = chebyshev(tile.x, tile.y, state.dx, state.dy);
                score = dist + (dist > state.range ? OUT_OF_RANGE : 0);
            }
            candidates.push({ dir, x: tile.x, y: tile.y, score });
        }

        candidates.sort((a, b) => a.score - b.score);

        for (const { dir, x, y } of candidates) {
            if (TrafficManager.tryEnter(creep, x, y)) return TrafficManager.issue(creep, dir);
        }
        return false;
    }

    /** Aviso en consola (como mucho cada WARN_EVERY ticks por creep): quedó sobre un portal sin poder bajarse. */
    private static warnTrapped(creep: Creep): void {
        const last = lastWarning.get(creep.name);
        if (last !== undefined && Game.time - last < WARN_EVERY) return;
        lastWarning.set(creep.name, Game.time);

        console.log(
            `[AdvancedMove] ${creep.name} está sobre un portal en ${creep.pos.toString()} y no puede bajarse: ` +
                `todas las casillas de alrededor son muro, portal, estructura o creeps que no se pueden mover.`
        );
    }

    /** Casillas con portal del room (cacheadas; los portales casi nunca cambian). */
    private static portalsIn(roomName: string): Map<number, string | undefined> {
        const cached = portalsByRoom.get(roomName);
        if (cached && Game.time - cached.tick < ADVANCED_MOVE_CONFIG.CACHE.PORTAL_TTL) return cached.tiles;

        const tiles = new Map<number, string | undefined>();
        const room = Game.rooms[roomName];
        if (!room) return cached ? cached.tiles : tiles;

        const portals = room.find(FIND_STRUCTURES, {
            filter: (s): s is StructurePortal => s.structureType === STRUCTURE_PORTAL
        });
        for (const portal of portals) {
            const dest = portal.destination;
            // Mismo criterio que utils/PortalRoute: inter-shard no se maneja.
            tiles.set(packXY(portal.pos.x, portal.pos.y), "roomName" in dest ? dest.roomName : undefined);
        }

        portalsByRoom.set(roomName, { tick: Game.time, tiles });
        return tiles;
    }
}
