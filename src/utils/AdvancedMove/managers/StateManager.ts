// src/utils/AdvancedMove/managers/StateManager.ts
//
// Dueño de creep.memory.travel. Cada tick compara dónde quedó el creep con el
// paso que pidió el tick anterior:
//
//   - llegó a la casilla esperada  -> consume ese paso del path
//   - sigue en el origen           -> el paso falló: atasco + 1
//   - está en cualquier otro lado  -> lo movieron (empujón, otro código,
//                                     portal): el path ya no sirve, se recalcula
//
// Verificar la casilla EXACTA (y no solo "se movió") es lo que permite que el
// TrafficManager empuje o desvíe creeps sin desincronizar sus paths.

import { Anchor, TravelMemory } from "../types";
import { chebyshev, directionAt, directionBetween, isSameTile, stepTile } from "../utils/position";
import { ADVANCED_MOVE_CONFIG } from "../config";

/** Campos que dejaban la versión anterior de AdvancedMove y moveToRoad/moveTo. */
interface LegacyMoveMemory {
    moveTracking?: unknown;
    _move?: unknown;
    lastPosX?: number;
    lastPosY?: number;
    stuckCount?: number;
    yieldTicks?: number;
}

export default class StateManager {
    /** Carga (o crea) el estado, sincroniza el último paso y aplica un cambio de destino. */
    public static prepare(creep: Creep, dest: RoomPosition, range: number): TravelMemory {
        let state = creep.memory.travel;

        if (!state) {
            this.cleanLegacy(creep.memory);
            state = {
                dx: dest.x,
                dy: dest.y,
                dRoom: dest.roomName,
                range,
                path: "",
                ox: creep.pos.x,
                oy: creep.pos.y,
                oRoom: creep.pos.roomName,
                moveTick: 0,
                callTick: Game.time,
                stuck: 0
            };
            creep.memory.travel = state;
            return state;
        }

        this.sync(creep, state);

        if (state.dx !== dest.x || state.dy !== dest.y || state.dRoom !== dest.roomName || state.range !== range) {
            this.retarget(creep, state, dest, range);
        }

        state.callTick = Game.time;
        return state;
    }

    public static setPath(state: TravelMemory, origin: RoomPosition, path: string): void {
        state.path = path;
        state.ox = origin.x;
        state.oy = origin.y;
        state.oRoom = origin.roomName;
    }

    /** ¿El creep está parado exactamente en el origen de su path? (false si está en el espejo de un borde) */
    public static isAtOrigin(creep: Creep, state: TravelMemory): boolean {
        return creep.pos.x === state.ox && creep.pos.y === state.oy && creep.pos.roomName === state.oRoom;
    }

    /**
     * Recién entró (y está parado en el origen de su path) a un room distinto
     * del que se usó para buscar el camino: se recalcula ahora que lo ve. Un
     * path armado sin visión no conoce sus portales, muros ni estructuras.
     */
    public static enteredNewRoom(creep: Creep, state: TravelMemory): boolean {
        return (
            state.path.length > 0 &&
            state.sRoom !== undefined &&
            state.sRoom !== creep.pos.roomName &&
            this.isAtOrigin(creep, state)
        );
    }

    /**
     * Recalcular por atasco en stuck = 2, 5, 8, 14, 26, 50... (con la config
     * por defecto): rápido al principio y cada vez más espaciado si el bloqueo
     * es permanente (ej: pasillo tapado), para no quemar CPU buscando lo mismo.
     */
    public static shouldRepath(state: TravelMemory): boolean {
        const { REPATH_AFTER, REPATH_EVERY } = ADVANCED_MOVE_CONFIG.STUCK;
        const since = state.stuck - REPATH_AFTER;
        if (since < 0) return false;
        if (since === 0) return true;

        const cycles = since / REPATH_EVERY;
        return Number.isInteger(cycles) && Number.isInteger(Math.log2(cycles));
    }

    /** Alguien (el TrafficManager) emitió un move de su path en nombre de este creep. */
    public static markMoved(creep: Creep): void {
        const state = creep.memory.travel;
        if (state) state.moveTick = Game.time;
    }

    /**
     * ¿Va en camino y todavía no le tocó procesarse este tick? Entonces lo más
     * probable es que avance y libere su casilla (tren o swap).
     */
    public static isTravelling(creep: Creep): boolean {
        const state = creep.memory.travel;
        // Ya procesado este tick (se movió, esperó o llegó), o ya no viene usando travel().
        if (!state || state.callTick !== Game.time - 1) return false;

        // Si todavía no está en rango, su rol lo va a volver a mandar a caminar.
        const inRange =
            creep.pos.roomName === state.dRoom &&
            chebyshev(creep.pos.x, creep.pos.y, state.dx, state.dy) <= state.range;
        return !inRange;
    }

    /**
     * Ancla de un creep quieto: su último destino, si está trabajando cerca de
     * él. `range` es la distancia máxima a la que se lo puede empujar (nunca
     * más lejos de lo que ya está, para no sacarlo de rango de su tarea).
     */
    public static anchorOf(creep: Creep): Anchor | undefined {
        const state = creep.memory.travel;
        if (!state || state.dRoom !== creep.pos.roomName) return undefined;
        if (Game.time - state.callTick > ADVANCED_MOVE_CONFIG.TRAFFIC.ANCHOR_TTL) return undefined;

        const dist = chebyshev(creep.pos.x, creep.pos.y, state.dx, state.dy);
        if (dist > Math.max(state.range, ADVANCED_MOVE_CONFIG.TRAFFIC.SHOVE_MAX_ANCHOR_RANGE)) return undefined;

        return { x: state.dx, y: state.dy, range: Math.max(dist, state.range) };
    }

    private static sync(creep: Creep, state: TravelMemory): void {
        if (!state.path) return;

        const pos = creep.pos;

        // Sigue en el origen (o rebotó en un borde): el paso del tick anterior falló.
        if (isSameTile(pos, state.ox, state.oy, state.oRoom)) {
            if (state.moveTick === Game.time - 1) state.stuck++;
            return;
        }

        // Llegó justo a la casilla esperada (o a su espejo si era un exit).
        const next = stepTile(state.ox, state.oy, directionAt(state.path, 0));
        if (next && isSameTile(pos, next.x, next.y, state.oRoom)) {
            this.setPath(state, pos, state.path.slice(1));
            state.stuck = 0;
            return;
        }

        // Lo movieron por fuera del camino.
        state.path = "";
        state.stuck = 0;
    }

    private static retarget(creep: Creep, state: TravelMemory, dest: RoomPosition, range: number): void {
        // Objetivo que se corrió UNA casilla (ej: seguir a otro creep): alcanza
        // con estirar el final del path un paso en la misma dirección, sin
        // volver a llamar a PathFinder... mientras el path no se desvíe de más.
        const shiftedOneTile =
            state.path.length > 0 &&
            state.range === range &&
            state.dRoom === dest.roomName &&
            chebyshev(state.dx, state.dy, dest.x, dest.y) === 1 &&
            !this.detoursTooMuch(creep, state, dest, range);

        if (shiftedOneTile) {
            state.path += directionBetween(state.dx, state.dy, dest.x, dest.y);
        } else {
            state.path = "";
            state.stuck = 0;
        }

        state.dx = dest.x;
        state.dy = dest.y;
        state.dRoom = dest.roomName;
        state.range = range;
        delete state.failTick;
        delete state.fails;
    }

    /** ¿El path estirado ya es bastante más largo que ir directo? Mejor recalcular. */
    private static detoursTooMuch(creep: Creep, state: TravelMemory, dest: RoomPosition, range: number): boolean {
        if (creep.pos.roomName !== dest.roomName) return false;
        const direct = Math.max(0, chebyshev(creep.pos.x, creep.pos.y, dest.x, dest.y) - range);
        return state.path.length + 1 - direct > ADVANCED_MOVE_CONFIG.PATH.MOVING_TARGET_SLACK;
    }

    private static cleanLegacy(memory: CreepMemory): void {
        const legacy = memory as CreepMemory & LegacyMoveMemory;
        delete legacy.lastPosX;
        delete legacy.lastPosY;
        delete legacy.stuckCount;
        delete legacy.yieldTicks;
        delete legacy.moveTracking;
        delete legacy._move; // cache de moveTo: si vuelve a usarse, moveTo lo recrea solo
    }
}
