// src/war/movement/Travel.ts
//
// Movimiento de UN creep suelto (propio de war, sin AdvancedMove). Se usa para
// llegar a su casilla de la formación, cruzar un borde o un portal, y el modo tren.
//
//   - Cruza rooms por la ruta de RouteManager (con portales).
//   - Dentro de un room nunca pisa una salida (lo sacaría del room).
//   - Parado en un borde con el paso siguiente del otro lado: no se mueve, el
//     motor lo pasa solo al final del tick.
//   - reuse = true guarda el camino (viajes largos); si no, se recalcula cada tick
//     esquivando creeps (distancias cortas dentro de la formación).
import { WAR_CONFIG } from "../config";
import type { WarCreep } from "../types";
import RouteManager from "../managers/RouteManager";
import { attackRoom } from "../utils/flags";
import RoomGrid from "./RoomGrid";
import { BLOCKED } from "./Grid";

export interface TravelOptions {
    range?: number;
    /** Casillas (del room del creep) que no se pisan: compañeros ya formados. */
    avoid?: Set<number>;
    /** Creeps que NO cuentan como obstáculo (compañeros que se están moviendo). */
    ignore?: Set<string>;
    /** Guarda el camino entre ticks (viajes largos). */
    reuse?: boolean;
    maxOps?: number;
    /** Solo caminos completos: si no llega, no se mueve (y avisa con noPath). */
    complete?: boolean;
    /** En el room atacado el camino puede atravesar estructuras enemigas (hay que romperlas). */
    breakables?: boolean;
}

export interface TravelResult {
    /** Dirección emitida este tick (undefined = no se movió). */
    dir?: DirectionConstant;
    /** No hay camino hasta el destino. */
    noPath?: boolean;
    /** El paso siguiente es una estructura enemiga: hay que romperla antes de seguir. */
    breach?: AnyStructure;
}

interface Goal {
    pos: RoomPosition;
    range: number;
}

interface CachedPath {
    key: string;
    /** Origen + camino de PathFinder. */
    steps: RoomPosition[];
    cursor: number;
    stuck: number;
}

const cache = new Map<string, CachedPath>();
let lastCleanup = 0;

/** Emite el paso de este tick. */
export function travel(creep: WarCreep, dest: RoomPosition, opts: TravelOptions = {}): TravelResult {
    const range = opts.range ?? 0;
    if (creep.pos.roomName === dest.roomName && creep.pos.getRangeTo(dest) <= range) {
        cache.delete(creep.name);
        return {};
    }
    if (creep.fatigue > 0 || creep.spawning) return {};

    const next = nextStep(creep, dest, range, opts);
    if (!next) return { noPath: true };
    // El paso siguiente está del otro lado del borde: el motor lo cruza solo.
    if (next.roomName !== creep.pos.roomName) return {};
    if (opts.breakables) {
        const breach = RoomGrid.breachAt(next.roomName, next.x, next.y);
        if (breach) return { breach };
    }

    const dir = creep.pos.getDirectionTo(next);
    return creep.move(dir) === OK ? { dir } : {};
}

function nextStep(creep: WarCreep, dest: RoomPosition, range: number, opts: TravelOptions): RoomPosition | undefined {
    cleanup();
    const key = `${dest.roomName}:${dest.x}:${dest.y}:${range}`;

    if (opts.reuse) {
        const cached = cache.get(creep.name);
        if (cached && cached.key === key) {
            const found = locate(cached, creep.pos);
            if (found >= 0) {
                cached.stuck = found === cached.cursor ? cached.stuck + 1 : 0;
                cached.cursor = found;
                if (cached.stuck < 2 && found + 1 < cached.steps.length) return cached.steps[found + 1];
            }
        }
    }

    const stuck = cache.get(creep.name)?.stuck ?? 0;
    const path = search(creep, dest, range, opts, !opts.reuse || stuck >= 2);
    if (!path || path.length === 0) {
        cache.delete(creep.name);
        return undefined;
    }

    if (opts.reuse) cache.set(creep.name, { key, steps: [creep.pos, ...path], cursor: 0, stuck: 0 });
    return path[0];
}

/** Índice del creep en el camino guardado (tolera el salto al cruzar un borde). */
function locate(cached: CachedPath, pos: RoomPosition): number {
    const from = Math.max(0, cached.cursor - 1);
    const to = Math.min(cached.steps.length - 1, cached.cursor + 3);
    for (let i = from; i <= to; i++) {
        const s = cached.steps[i];
        if (s.x === pos.x && s.y === pos.y && s.roomName === pos.roomName) return i;
    }
    return -1;
}

function search(creep: WarCreep, dest: RoomPosition, range: number, opts: TravelOptions, avoidCreeps: boolean): RoomPosition[] | null {
    const plan = resolve(creep.pos.roomName, dest, range);
    if (!plan) return null;

    // Un solo room: las salidas son 255 (pisarlas lo sacaría del room).
    const inside = plan.rooms.length === 1;
    const result = PathFinder.search(creep.pos, plan.goals, {
        maxRooms: plan.rooms.length,
        maxOps: opts.maxOps ?? (inside ? 1500 : 6000),
        plainCost: WAR_CONFIG.MOVE.COST_PLAIN,
        swampCost: WAR_CONFIG.MOVE.COST_SWAMP,
        roomCallback: roomName => {
            if (!plan.rooms.includes(roomName)) return false;
            let matrix = RoomGrid.travelMatrix(roomName, inside);
            const own = roomName === creep.pos.roomName;
            const portals = plan.portalTiles.filter(p => p.roomName === roomName);
            const breakables = opts.breakables && roomName === attackRoom() ? RoomGrid.breakables(roomName) : undefined;
            if (!own && portals.length === 0 && !breakables) return matrix;

            matrix = matrix.clone();
            for (const p of portals) matrix.set(p.x, p.y, WAR_CONFIG.MOVE.COST_PLAIN);
            if (breakables) {
                const tile = RoomGrid.tile(roomName);
                for (const i of breakables) matrix.set(i % 50, Math.floor(i / 50), tile[i]);
            }
            if (own) {
                for (const i of opts.avoid ?? []) matrix.set(i % 50, Math.floor(i / 50), BLOCKED);
                if (avoidCreeps) {
                    for (const [i, name] of RoomGrid.occupancy(roomName)) {
                        if (name !== creep.name && !opts.ignore?.has(name)) matrix.set(i % 50, Math.floor(i / 50), BLOCKED);
                    }
                }
            }
            return matrix;
        }
    });

    if (opts.complete && result.incomplete) return null;
    return result.path;
}

interface Plan {
    goals: Goal[];
    rooms: string[];
    /** Casillas de portal que se pueden pisar a propósito. */
    portalTiles: RoomPosition[];
}

/** Traduce el destino al objetivo concreto de este tramo (con portales). */
function resolve(from: string, dest: RoomPosition, range: number): Plan | null {
    if (from === dest.roomName) return { goals: [{ pos: dest, range }], rooms: [from], portalTiles: [] };

    const hops = RouteManager.route(from, dest.roomName);
    if (!hops) return null;

    const rooms = [from];
    for (const hop of hops) {
        if (hop.via === "exit") {
            rooms.push(hop.room);
            continue;
        }
        // El tramo termina pisando el portal (está en el último room de `rooms`).
        const portalRoom = rooms[rooms.length - 1];
        const tiles = hop.portals.map(p => new RoomPosition(p.x, p.y, portalRoom));
        return { goals: tiles.map(pos => ({ pos, range: 0 })), rooms, portalTiles: tiles };
    }
    return { goals: [{ pos: dest, range }], rooms, portalTiles: [] };
}

function cleanup(): void {
    if (Game.time - lastCleanup < 100) return;
    lastCleanup = Game.time;
    for (const name of cache.keys()) if (!Game.creeps[name]) cache.delete(name);
}

