// src/utils/AdvancedMove/managers/PathManager.ts
//
// Calcula el camino EXACTO (casilla por casilla) con PathFinder y lo
// serializa como string de direcciones para guardarlo en Memory.
//
// Los paths se calculan IGNORANDO a los creeps propios: el camino ideal sigue
// siendo el ideal aunque haya alguien parado; los choques los resuelve el
// TrafficManager tick a tick (swap, empujar, rodear). Solo cuando el creep
// lleva ticks atascado se recalcula penalizando a los creeps cercanos, con un
// costo que crece con el atasco (esquive progresivo, nunca 255).
//
// Con roads paralelas hay una segunda pasada para ir por el carril de la
// derecha (ver LaneManager). Al final se "alisa" el camino: entre casillas
// que cuestan lo mismo, la que lo deja más recto (sin zigzags).

import LaneManager, { LanePlan } from "./LaneManager";
import { directionBetween, isExit, mirrorOf } from "../utils/position";
import { ADVANCED_MOVE_CONFIG } from "../config";
import CostMatrixManager from "./CostMatrixManager";
import RouteManager from "./RouteManager";
import { TravelOptions } from "../types";
import { terrainCostsFor } from "../utils/body";

export interface PathResult {
    /** Direcciones (1-8) serializadas; vacío si no hay camino. */
    path: string;
    /** Casilla donde arranca `path` (puede ser el espejo si el creep está en un exit). */
    origin: RoomPosition;
    incomplete: boolean;
}

const MAX_CREEP_COST = 250;
/** Vueltas del alisado (cada una puede habilitar la siguiente). */
const SMOOTH_PASSES = 3;
/** PathFinder limita heuristicWeight a [1, 9] (driver/lib/path-finder.js). */
const MAX_HEURISTIC_WEIGHT = 9;

export default class PathManager {
    public static search(
        creep: Creep,
        dest: RoomPosition,
        range: number,
        opts: TravelOptions,
        stuck: number,
        /** Desde dónde buscar (por defecto, donde está el creep). */
        origin: RoomPosition = creep.pos,
        /** Carril de la derecha (false = solo el largo del camino importa, ej: stepsTo). */
        lanes = true
    ): PathResult | null {
        const goal = RouteManager.resolveGoal(origin, dest, range);
        if (!goal) return null;

        const costs = terrainCostsFor(creep);
        const roomCount = goal.rooms ? goal.rooms.size : 1;
        const cfg = ADVANCED_MOVE_CONFIG.PATH;
        const plainCost = opts.plainCost !== undefined ? opts.plainCost * cfg.ROAD_COST : costs.plain;
        const swampCost = opts.swampCost !== undefined ? opts.swampCost * cfg.ROAD_COST : costs.swamp;

        const run = (roomLimit: number, allowed: Set<string> | undefined, exitsBlocked: boolean, lanePlan?: LanePlan) => {
            const matrices = new Map<string, CostMatrix | boolean>();
            const found = PathFinder.search(
                origin,
                { pos: goal.pos, range: goal.range },
                {
                    plainCost,
                    swampCost,
                    // La heurística del motor es distancia * peso: con peso <= costo de una road
                    // nunca sobreestima y A* devuelve el camino óptimo (el default 1.2 no).
                    // En la pasada de carriles la road más barata es el carril con descuento.
                    heuristicWeight: Math.min(
                        MAX_HEURISTIC_WEIGHT,
                        cfg.ROAD_COST - (lanePlan ? ADVANCED_MOVE_CONFIG.LANES.RIGHT_LANE_BONUS : 0)
                    ),
                    maxRooms: roomLimit,
                    maxOps:
                        opts.maxOps ??
                        (roomLimit === 1 ? cfg.SINGLE_ROOM_OPS : Math.min(cfg.MAX_OPS, cfg.OPS_PER_ROOM * roomLimit)),
                    roomCallback: roomName => {
                        const matrix = this.roomMatrix(
                            roomName,
                            creep,
                            allowed,
                            goal.portal,
                            stuck,
                            opts,
                            exitsBlocked,
                            lanePlan
                        );
                        matrices.set(roomName, matrix);
                        return matrix;
                    }
                }
            );
            return { found, matrices };
        };

        const maxRooms = opts.maxRooms ?? roomCount;
        let avoidExits = !goal.rooms && maxRooms === 1;
        const first = run(maxRooms, goal.rooms, avoidExits);
        let result = first.found;
        // Matrices de la búsqueda elegida: el alisado usa los mismos costos.
        let used = first.matrices;

        // La búsqueda dentro del room es exhaustiva (SINGLE_ROOM_OPS): si falló, de
        // verdad no hay camino adentro (room partido por muros) y el único rodea
        // por un room vecino. Antes de eso nunca se sale del room.
        if (result.incomplete && !goal.rooms && opts.maxRooms === undefined) {
            const retry = run(cfg.SAME_ROOM_RETRY_MAX_ROOMS, undefined, false);
            if (!retry.found.incomplete) {
                result = retry.found;
                used = retry.matrices;
                avoidExits = false;
            }
        }

        // Pasada 2: el mismo viaje, por el carril de la derecha. Solo si el
        // camino pisa un carril equivocado, y sin salir de los rooms que ya usa.
        const plan = lanes && !result.incomplete ? LaneManager.plan(origin, result.path, plainCost) : undefined;
        if (plan) {
            const inLane = run(plan.rooms.size, plan.rooms, avoidExits, plan);
            if (!inLane.found.incomplete) {
                result = inLane.found;
                used = inLane.matrices;
            }
        }

        const path = this.smooth(origin, result.path, (roomName, x, y) =>
            this.stepCost(used, roomName, x, y, plainCost, swampCost)
        );

        if (ADVANCED_MOVE_CONFIG.DEBUG && result.incomplete) {
            console.log(
                `[AdvancedMove] path incompleto ${creep.name} ${origin.toString()} -> ${dest.toString()} (ops=${result.ops})`
            );
        }

        return { ...this.serialize(origin, path), incomplete: result.incomplete };
    }

    /**
     * Quita zigzags que no cuestan nada: PathFinder elige al azar entre
     * casillas del mismo costo (ej: dos carriles), y a veces sube y baja. Si una
     * casilla del camino se puede cambiar por otra vecina de las dos de al lado,
     * que cueste lo mismo o menos y deje el camino más derecho, se cambia. El
     * largo no cambia y nunca se elige una casilla más cara.
     */
    private static smooth(
        origin: RoomPosition,
        path: RoomPosition[],
        costOf: (roomName: string, x: number, y: number) => number
    ): RoomPosition[] {
        const points = [origin, ...path];

        for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
            let changed = false;

            // Ni el origen ni el destino se tocan.
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const here = points[i];
                const next = points[i + 1];
                if (prev.roomName !== here.roomName || next.roomName !== here.roomName) continue;
                if (isExit(here.x, here.y)) continue;

                let bestTurn = turnAt(prev, here, next);
                if (bestTurn === 0) continue;

                const hereCost = costOf(here.roomName, here.x, here.y);
                let best: RoomPosition | undefined;

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const x = prev.x + dx;
                        const y = prev.y + dy;
                        if ((dx === 0 && dy === 0) || (x === here.x && y === here.y)) continue;
                        if (Math.max(Math.abs(x - next.x), Math.abs(y - next.y)) !== 1) continue;
                        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                        if (costOf(here.roomName, x, y) > hereCost) continue;

                        const candidate = new RoomPosition(x, y, here.roomName);
                        const turn = turnAt(prev, candidate, next);
                        if (turn < bestTurn) {
                            bestTurn = turn;
                            best = candidate;
                        }
                    }
                }

                if (best) {
                    points[i] = best;
                    changed = true;
                }
            }

            if (!changed) break;
        }

        return points.slice(1);
    }

    /** Costo de pisar (x, y) con las matrices que usó la búsqueda. Infinity si no se puede. */
    private static stepCost(
        matrices: Map<string, CostMatrix | boolean>,
        roomName: string,
        x: number,
        y: number,
        plainCost: number,
        swampCost: number
    ): number {
        const matrix = matrices.get(roomName);
        if (!matrix || matrix === true) return Infinity;

        const value = matrix.get(x, y);
        if (value >= 255) return Infinity;
        if (value > 0) return value;

        const terrain = CostMatrixManager.terrain(roomName).get(x, y);
        if (terrain % 2 === 1) return Infinity; // muro
        return terrain === TERRAIN_MASK_SWAMP ? swampCost : plainCost;
    }

    /**
     * Posiciones de PathFinder -> string de direcciones.
     * En un cruce de borde PathFinder da (49,y,A) y luego (0,y,B): ese salto no
     * es un move, lo hace el motor solo, así que no ocupa carácter.
     */
    public static serialize(start: RoomPosition, positions: RoomPosition[]): { path: string; origin: RoomPosition } {
        let origin = start;
        let prevX = start.x;
        let prevY = start.y;
        let prevRoom = start.roomName;
        let path = "";

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];

            if (pos.roomName !== prevRoom) {
                const entry = mirrorOf(prevX, prevY, prevRoom);
                if (!entry || entry.roomName !== pos.roomName) break; // salto imposible: cortamos acá

                // El creep ya está parado en un exit: el motor lo cruza solo,
                // así que el path empieza del otro lado.
                if (i === 0) origin = new RoomPosition(entry.x, entry.y, entry.roomName);

                // Por si PathFinder salteara la casilla de entrada del room nuevo.
                if (entry.x !== pos.x || entry.y !== pos.y) {
                    path += directionBetween(entry.x, entry.y, pos.x, pos.y);
                }
            } else {
                path += directionBetween(prevX, prevY, pos.x, pos.y);
            }

            prevX = pos.x;
            prevY = pos.y;
            prevRoom = pos.roomName;
        }

        return { path, origin };
    }

    private static roomMatrix(
        roomName: string,
        creep: Creep,
        allowed: Set<string> | undefined,
        portal: RoomPosition | undefined,
        stuck: number,
        opts: TravelOptions,
        avoidExits: boolean,
        plan: LanePlan | undefined
    ): CostMatrix | boolean {
        if (allowed && !allowed.has(roomName)) return false;

        const base = avoidExits ? CostMatrixManager.getWithoutExits(roomName) : CostMatrixManager.get(roomName);
        const room = Game.rooms[roomName];

        const hostiles = room ? room.find(FIND_HOSTILE_CREEPS) : [];
        const hostilePowerCreeps = room ? room.find(FIND_HOSTILE_POWER_CREEPS) : [];
        const avoidCreeps = stuck >= ADVANCED_MOVE_CONFIG.STUCK.REPATH_AFTER && roomName === creep.pos.roomName;
        const openPortal = portal !== undefined && portal.roomName === roomName;
        const lanes = plan ? plan.extra.get(roomName) : undefined;

        // Camino rápido: la matriz compartida tal cual, sin clonar.
        if (
            !hostiles.length &&
            !hostilePowerCreeps.length &&
            !avoidCreeps &&
            !openPortal &&
            !lanes &&
            !opts.costCallback
        ) {
            return base;
        }

        const matrix = base.clone();

        // Los creeps enemigos no hacen swap ni se dejan empujar.
        for (const hostile of hostiles) matrix.set(hostile.pos.x, hostile.pos.y, 255);
        for (const hostile of hostilePowerCreeps) matrix.set(hostile.pos.x, hostile.pos.y, 255);

        if (openPortal && portal) matrix.set(portal.x, portal.y, ADVANCED_MOVE_CONFIG.PATH.ROAD_COST);

        if (avoidCreeps && room) this.penalizeNearbyCreeps(matrix, room, creep, stuck);

        // Recargos (y descuentos) de carril, solo sobre roads que nadie más tocó (creeps, portal).
        if (lanes) {
            const road = ADVANCED_MOVE_CONFIG.PATH.ROAD_COST;
            for (const [xy, extra] of lanes) {
                const x = Math.floor(xy / 50);
                const y = xy % 50;
                if (matrix.get(x, y) === road) matrix.set(x, y, road + extra);
            }
        }

        if (opts.costCallback) {
            const custom = opts.costCallback(roomName, matrix);
            if (custom) return custom;
        }

        return matrix;
    }

    /** Esquive progresivo: cuanto más atascado, más caro pisar a los creeps de alrededor. */
    private static penalizeNearbyCreeps(matrix: CostMatrix, room: Room, creep: Creep, stuck: number): void {
        const { CREEP_COST_PER_TICK, CREEP_AVOID_RADIUS } = ADVANCED_MOVE_CONFIG.STUCK;
        const penalty = Math.min(MAX_CREEP_COST, stuck * CREEP_COST_PER_TICK * ADVANCED_MOVE_CONFIG.PATH.ROAD_COST);

        const blockers: (Creep | PowerCreep)[] = [
            ...room.find(FIND_MY_CREEPS),
            ...room.find(FIND_MY_POWER_CREEPS)
        ];

        for (const other of blockers) {
            if (other.id === creep.id || !creep.pos.inRangeTo(other.pos, CREEP_AVOID_RADIUS)) continue;

            const current = matrix.get(other.pos.x, other.pos.y);
            if (current < penalty) matrix.set(other.pos.x, other.pos.y, penalty);
        }
    }
}

/** Cuánto gira el camino en `here` (octavos de 45°, 0 = sigue derecho). */
function turnAt(prev: RoomPosition, here: RoomPosition, next: RoomPosition): number {
    const a = directionBetween(prev.x, prev.y, here.x, here.y);
    const b = directionBetween(here.x, here.y, next.x, next.y);
    const diff = (((b - a) % 8) + 8) % 8;
    return Math.min(diff, 8 - diff);
}
