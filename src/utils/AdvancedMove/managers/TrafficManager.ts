// src/utils/AdvancedMove/managers/TrafficManager.ts
//
// Tabla de reservas del tick: qué casilla pidió cada creep, quién espera qué
// casilla y quién está parado dónde. Cada creep que avanza consulta la tabla
// ANTES de moverse y resuelve el choque en el acto, sin necesitar un paso
// extra al final del loop:
//
//   casilla libre                     -> avanza
//   ocupante que ya pidió moverse     -> avanza (tren, o swap si viene a mi casilla)
//   ocupante esperando MI casilla     -> swap inmediato (mueve a los dos)
//   ocupante en viaje, aún sin turno  -> avanza (va a liberar la casilla)
//   ocupante quieto con ancla         -> lo EMPUJA a un costado, sin sacarlo
//                                        de rango de su tarea y prefiriendo
//                                        salir de la road
//   otro creep ya reservó la casilla,
//   o el ocupante no se puede mover   -> RODEO por una casilla lateral que
//                                        conecta con el paso siguiente (no
//                                        pierde distancia: cambio de carril);
//                                        si no hay, espera y suma atasco
//
// Con una sola road: los que van en sentido contrario hacen swap y el que
// trabaja parado en la road se corre al costado. Con 3-4 roads paralelas: el
// rodeo es un cambio de carril gratis.

import { ALL_DIRECTIONS, Tile, chebyshev, directionAt, directionBetween, isExit, packXY, stepTile } from "../utils/position";
import { Anchor, TravelMemory } from "../types";
import { ADVANCED_MOVE_CONFIG } from "../config";
import CostMatrixManager from "./CostMatrixManager";
import StateManager from "./StateManager";
import { isMoveHookInstalled } from "../utils/moveHook";
import { terrainCostsFor } from "../utils/body";

type Occupant = Creep | PowerCreep;
type TileMap<T> = Map<string, Map<number, T>>;

/** Por qué no se puede entrar a una casilla este tick. */
type Blocker = "none" | "claimed" | "busy" | "static";

interface Intent {
    room: string;
    xy: number;
}

interface TickTraffic {
    tick: number;
    /** Casilla -> creep que ya pidió entrar ahí este tick. */
    claims: TileMap<string>;
    /** Creep -> casilla que pidió. null = se mueve pero no sabemos a dónde (pull). */
    moves: Map<string, Intent | null>;
    /** Casilla -> creep que quería entrar ahí y se quedó esperando. */
    waiting: TileMap<string>;
    /** Creep que espera -> casilla que quería. */
    waitingBy: Map<string, Intent>;
    /** Casilla -> creep parado ahí al inicio del tick (índice lazy por room). */
    occupants: TileMap<Occupant>;
}

/** Puntaje de las casillas candidatas al empujar (menor = mejor). */
const SHOVE_SCORE = {
    /** Dejar libre la road es justo lo que queremos. */
    ROAD: 4,
    /** Ponerse en el próximo paso del que pasa lo volvería a trabar. */
    IN_THE_WAY: 8,
    /** El swap sirve, pero deja al empujado detrás, todavía sobre el camino. */
    SWAP: 2
};

let traffic: TickTraffic = createTraffic(-1);

export default class TrafficManager {
    /** Listener del hook de move: registra cualquier intent aceptado por el motor, de cualquier origen. */
    public static recordMove(creep: Creep, target: DirectionConstant | Creep): void {
        const t = this.current();

        const previous = t.moves.get(creep.name);
        if (previous && getIn(t.claims, previous.room, previous.xy) === creep.name) {
            deleteIn(t.claims, previous.room, previous.xy);
        }
        this.clearWaiting(creep.name);

        const tile = typeof target === "number" ? stepTile(creep.pos.x, creep.pos.y, target) : undefined;
        if (!tile) {
            t.moves.set(creep.name, null);
            return;
        }

        const intent = { room: creep.pos.roomName, xy: packXY(tile.x, tile.y) };
        t.moves.set(creep.name, intent);
        setIn(t.claims, intent.room, intent.xy, creep.name);
    }

    /** Emite un move y lo registra (aunque el hook no esté instalado). */
    public static issue(creep: Creep, dir: DirectionConstant): boolean {
        if (creep.move(dir) !== OK) return false;
        if (!isMoveHookInstalled()) this.recordMove(creep, dir);
        return true;
    }

    /**
     * Decide el paso de este tick de un creep que avanza por su path (parado
     * en el origen del path). Devuelve la dirección a usar (puede ser un rodeo,
     * y en ese caso reescribe el path) o undefined si le toca esperar.
     */
    public static negotiate(creep: Creep, state: TravelMemory): DirectionConstant | undefined {
        const dir = directionAt(state.path, 0);
        const target = stepTile(creep.pos.x, creep.pos.y, dir);
        if (!target) {
            state.path = ""; // path corrupto: se recalcula el próximo tick
            return undefined;
        }

        const after = this.tileAfter(target, state);
        const blocker = this.clear(creep, target, after);
        if (blocker === "none") return dir as DirectionConstant;

        const side = this.sidestep(creep, state, target, after, blocker);
        if (side !== undefined) return side;

        this.markWaiting(creep, target);
        return undefined;
    }

    /**
     * ¿Puede entrar este tick a (x, y)? Usa las mismas reglas que un paso
     * normal: si hay un creep mío que ya se mueve, va en camino o se puede
     * empujar, lo resuelve (y puede empujarlo de verdad). No emite el move
     * del que pide entrar.
     */
    public static tryEnter(creep: Creep, x: number, y: number): boolean {
        return this.clear(creep, { x, y }, undefined) === "none";
    }

    /** Un creep que ya llegó: si alguien necesita su casilla este tick, se corre sin salir de rango. */
    public static yieldIfNeeded(creep: Creep): void {
        const t = this.current();
        if (t.moves.has(creep.name)) return;

        const room = creep.pos.roomName;
        const xy = packXY(creep.pos.x, creep.pos.y);
        const claimer = getIn(t.claims, room, xy);
        const waiter = claimer === undefined ? getIn(t.waiting, room, xy) : undefined;

        const name = claimer ?? waiter;
        if (name === undefined) return;

        const other = Game.creeps[name];
        if (!other || !this.shove(creep, other, undefined)) return;

        // El que esperaba mi casilla ya puede entrar este mismo tick.
        if (waiter !== undefined) this.moveOnBehalf(other, creep.pos);
    }

    // -----------------------------------------------------------------------
    // Resolución de choques
    // -----------------------------------------------------------------------

    private static clear(mover: Creep, tile: Tile, moverNext: Tile | undefined): Blocker {
        const t = this.current();
        const room = mover.pos.roomName;
        const xy = packXY(tile.x, tile.y);

        const occupant = this.occupantAt(room, xy);
        const claimer = getIn(t.claims, room, xy);
        if (claimer !== undefined && claimer !== mover.name) {
            // Excepción: si el ocupante viene a MI casilla es un swap, y el
            // motor le da prioridad al swap sobre el que lo seguía en tren.
            return occupant && this.isMovingInto(occupant, mover.pos) ? "none" : "claimed";
        }

        if (!occupant || occupant.id === mover.id) return "none";
        if (!(occupant instanceof Creep) || !occupant.my) return "static";

        // Ya pidió moverse este tick: libera la casilla (tren) o viene a la mía (swap).
        if (t.moves.has(occupant.name)) return "none";

        // Se había quedado esperando: si lo que quería era MI casilla, swap ya mismo.
        const wanted = t.waitingBy.get(occupant.name);
        if (wanted) {
            const wantsMine = wanted.room === room && wanted.xy === packXY(mover.pos.x, mover.pos.y);
            return wantsMine && this.moveOnBehalf(occupant, mover.pos) ? "none" : "busy";
        }

        if (occupant.spawning || occupant.fatigue > 0) return "busy";

        // Va en camino y todavía no le tocó su turno este tick: va a avanzar.
        if (StateManager.isTravelling(occupant)) return "none";

        return this.shove(occupant, mover, moverNext) ? "none" : "static";
    }

    /** Corre a un creep quieto hacia un costado, sin alejarlo de su ancla. */
    private static shove(occupant: Creep, mover: Creep, avoid: Tile | undefined): boolean {
        if (occupant.spawning || occupant.fatigue > 0 || this.current().moves.has(occupant.name)) return false;

        const anchor = StateManager.anchorOf(occupant);
        if (!anchor) return false; // sin ancla (miner, upgrader fijo, rol ajeno...): no se toca

        const dir = this.pickShoveDirection(occupant, anchor, mover, avoid);
        return dir !== undefined && this.issue(occupant, dir);
    }

    private static pickShoveDirection(
        occupant: Creep,
        anchor: Anchor,
        mover: Creep,
        avoid: Tile | undefined
    ): DirectionConstant | undefined {
        const t = this.current();
        const room = occupant.pos.roomName;
        let best: DirectionConstant | undefined;
        let bestScore = Infinity;

        for (const dir of ALL_DIRECTIONS) {
            const tile = stepTile(occupant.pos.x, occupant.pos.y, dir);
            if (!tile || isExit(tile.x, tile.y)) continue;
            if (chebyshev(tile.x, tile.y, anchor.x, anchor.y) > anchor.range) continue;

            const xy = packXY(tile.x, tile.y);
            if (getIn(t.claims, room, xy) !== undefined) continue;

            const isSwap = tile.x === mover.pos.x && tile.y === mover.pos.y && mover.pos.roomName === room;
            if (!isSwap && (this.occupantAt(room, xy) || !CostMatrixManager.isWalkable(room, tile.x, tile.y))) continue;

            let score = 0;
            if (CostMatrixManager.isRoad(room, tile.x, tile.y)) score += SHOVE_SCORE.ROAD;
            if (avoid && tile.x === avoid.x && tile.y === avoid.y) score += SHOVE_SCORE.IN_THE_WAY;
            if (isSwap) score += SHOVE_SCORE.SWAP;

            if (score < bestScore) {
                bestScore = score;
                best = dir;
            }
        }

        return best;
    }

    /**
     * Rodeo sin perder distancia: una casilla vecina que también conecte con
     * el paso siguiente del path (o que ya quede en rango si era el último).
     * Si el bloqueo es pasajero, solo acepta rodeos que no cuesten más que
     * una road; si el bloqueo es fijo (o ya viene atascado), acepta plano.
     */
    private static sidestep(
        creep: Creep,
        state: TravelMemory,
        blocked: Tile,
        after: Tile | undefined,
        blocker: Blocker
    ): DirectionConstant | undefined {
        if (isExit(blocked.x, blocked.y)) return undefined;

        const lastStep = state.path.length === 1;
        if (!after && !lastStep) return undefined;

        const t = this.current();
        const pos = creep.pos;
        const room = pos.roomName;
        const costs = terrainCostsFor(creep);
        const maxCost = blocker === "static" || state.stuck > 0 ? costs.plain : ADVANCED_MOVE_CONFIG.PATH.ROAD_COST;

        let best: DirectionConstant | undefined;
        let bestTile: Tile | undefined;
        let bestCost = Infinity;

        for (const dir of ALL_DIRECTIONS) {
            const tile = stepTile(pos.x, pos.y, dir);
            if (!tile || isExit(tile.x, tile.y)) continue;
            if (tile.x === blocked.x && tile.y === blocked.y) continue;

            if (after) {
                if (chebyshev(tile.x, tile.y, after.x, after.y) > 1) continue;
            } else if (room !== state.dRoom || chebyshev(tile.x, tile.y, state.dx, state.dy) > state.range) {
                continue;
            }

            const cost = CostMatrixManager.tileCost(room, tile.x, tile.y, costs);
            if (cost > maxCost || cost >= bestCost) continue;

            const xy = packXY(tile.x, tile.y);
            if (getIn(t.claims, room, xy) !== undefined || this.occupantAt(room, xy)) continue;

            best = dir;
            bestTile = tile;
            bestCost = cost;
        }

        if (best === undefined || !bestTile) return undefined;

        // El path sigue siendo exacto: rodeo + (rodeo -> paso siguiente) + resto.
        let path = String(best);
        if (after) {
            if (bestTile.x !== after.x || bestTile.y !== after.y) {
                path += directionBetween(bestTile.x, bestTile.y, after.x, after.y);
            }
            path += state.path.slice(2);
        }
        state.path = path;

        return best;
    }

    /** Emite en nombre de otro creep el paso que él mismo quería dar. */
    private static moveOnBehalf(creep: Creep, toward: RoomPosition): boolean {
        const dir = directionBetween(creep.pos.x, creep.pos.y, toward.x, toward.y);
        if (!this.issue(creep, dir)) return false;
        StateManager.markMoved(creep);
        return true;
    }

    private static isMovingInto(occupant: Occupant, pos: RoomPosition): boolean {
        const intent = this.current().moves.get(occupant.name);
        return !!intent && intent.room === pos.roomName && intent.xy === packXY(pos.x, pos.y);
    }

    /** La casilla del path después de `target` (para rodeos y para no volver a trabar al empujado). */
    private static tileAfter(target: Tile, state: TravelMemory): Tile | undefined {
        if (state.path.length < 2 || isExit(target.x, target.y)) return undefined;
        return stepTile(target.x, target.y, directionAt(state.path, 1));
    }

    // -----------------------------------------------------------------------
    // Estado del tick
    // -----------------------------------------------------------------------

    private static current(): TickTraffic {
        if (traffic.tick !== Game.time) traffic = createTraffic(Game.time);
        return traffic;
    }

    private static occupantAt(room: string, xy: number): Occupant | undefined {
        const t = this.current();
        let index = t.occupants.get(room);

        if (!index) {
            index = new Map();
            const visible = Game.rooms[room];
            if (visible) {
                for (const c of visible.find(FIND_CREEPS)) index.set(packXY(c.pos.x, c.pos.y), c);
                for (const pc of visible.find(FIND_POWER_CREEPS)) index.set(packXY(pc.pos.x, pc.pos.y), pc);
            }
            t.occupants.set(room, index);
        }

        return index.get(xy);
    }

    private static markWaiting(creep: Creep, tile: Tile): void {
        const t = this.current();
        const intent = { room: creep.pos.roomName, xy: packXY(tile.x, tile.y) };
        t.waitingBy.set(creep.name, intent);
        setIn(t.waiting, intent.room, intent.xy, creep.name);
    }

    private static clearWaiting(name: string): void {
        const t = this.current();
        const wanted = t.waitingBy.get(name);
        if (!wanted) return;

        t.waitingBy.delete(name);
        if (getIn(t.waiting, wanted.room, wanted.xy) === name) deleteIn(t.waiting, wanted.room, wanted.xy);
    }
}

function createTraffic(tick: number): TickTraffic {
    return {
        tick,
        claims: new Map(),
        moves: new Map(),
        waiting: new Map(),
        waitingBy: new Map(),
        occupants: new Map()
    };
}

function getIn<T>(map: TileMap<T>, room: string, xy: number): T | undefined {
    const inner = map.get(room);
    return inner ? inner.get(xy) : undefined;
}

function setIn<T>(map: TileMap<T>, room: string, xy: number, value: T): void {
    let inner = map.get(room);
    if (!inner) {
        inner = new Map();
        map.set(room, inner);
    }
    inner.set(xy, value);
}

function deleteIn<T>(map: TileMap<T>, room: string, xy: number): void {
    const inner = map.get(room);
    if (inner) inner.delete(xy);
}
