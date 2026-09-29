// src/utils/AdvancedMove/index.ts
//
// Fachada pública. Misma API que antes: AdvancedMove.travel(creep, target, opts).
//
// Una vez por tick (desde el primer move() o travel() del tick):
//   0. PortalManager  -> baja de los portales a quien no quiere cruzar (evita el ping-pong)
//
// Flujo de cada llamada:
//   1. StateManager   -> ¿el paso del tick anterior salió bien? avanza el path / cuenta atasco
//   2. ¿llegó?        -> libera el path; si alguien necesita su casilla, se corre sin salir de rango
//   3. PathManager    -> solo si no hay path, cambió el destino o lleva ticks atascado
//   4. TrafficManager -> negocia el paso con los demás creeps de ESTE tick (swap/empujón/rodeo)
//   5. move()
//
// Ver README.md en esta carpeta para el detalle de cada regla.

import { TravelMemory, TravelOptions, TravelReturnCode } from "./types";
import { directionAt, isExit, mirrorOf, stepTile } from "./utils/position";
import { moveCompare, moveInfo } from "./debug";
import { ADVANCED_MOVE_CONFIG } from "./config";
import CostMatrixManager from "./managers/CostMatrixManager";
import PathManager from "./managers/PathManager";
import PortalManager from "./managers/PortalManager";
import StateManager from "./managers/StateManager";
import TrafficManager from "./managers/TrafficManager";
import { installMoveHook } from "./utils/moveHook";

export type { TravelOptions, TravelReturnCode } from "./types";

let lastTick = -1;

/** Trabajo que se hace UNA vez por tick, antes que cualquier otra cosa de AdvancedMove. */
function beginTick(): void {
    if (lastTick === Game.time) return;
    lastTick = Game.time;
    PortalManager.guard();
}

/** Listener del hook: cualquier move() del tick pasa por acá. */
function onMove(creep: Creep, target: DirectionConstant | Creep): void {
    beginTick();
    TrafficManager.recordMove(creep, target);
}

export class AdvancedMove {
    /**
     * OPCIONAL: una llamada por tick en main.ts (ej: antes del loop de creeps).
     * El trabajo por tick (guardia de portales) ya corre solo con el primer
     * move()/travel() de cualquier creep; esto lo GARANTIZA también en ticks
     * donde ningún creep se mueve.
     */
    public static run(): void {
        installMoveHook(onMove);
        beginTick();
    }

    public static travel(
        creep: Creep,
        destination: RoomPosition | _HasRoomPosition,
        opts: TravelOptions = {}
    ): TravelReturnCode {
        installMoveHook(onMove);
        beginTick();
        if (creep.spawning) return ERR_BUSY;

        const dest = "pos" in destination ? destination.pos : destination;
        const range = this.resolveRange(dest, opts.range);
        const state = StateManager.prepare(creep, dest, range);

        if (creep.pos.inRangeTo(dest, range)) {
            state.path = "";
            state.stuck = 0;
            TrafficManager.yieldIfNeeded(creep);
            return OK;
        }

        if (creep.fatigue > 0) return ERR_TIRED;
        if (creep.getActiveBodyparts(MOVE) === 0) return ERR_NO_BODYPART;

        // Parado sobre el portal que lo lleva a destino: el motor lo cruza al
        // final del tick. No moverlo ni gastar CPU buscando camino.
        if (PortalManager.wantsToCross(creep, state)) return OK;

        if (!state.path || StateManager.enteredNewRoom(creep, state) || StateManager.shouldRepath(state)) {
            const code = this.repath(creep, state, dest, range, opts);
            if (code !== OK) return code;
        }

        // Parado en el espejo de un borde (recién cruzó o rebotó): el motor
        // lo pasa al otro lado solo, este tick no hay que moverlo.
        if (!StateManager.isAtOrigin(creep, state)) return OK;

        const dir = TrafficManager.negotiate(creep, state);
        if (dir === undefined) {
            state.stuck++;
        } else if (TrafficManager.issue(creep, dir)) {
            state.moveTick = Game.time;
        }

        if (opts.visualizePathStyle) this.draw(creep, state, opts.visualizePathStyle);
        return OK;
    }

    /** El camino EXACTO que le falta recorrer al creep, casilla por casilla (cruza rooms). */
    public static getPath(creep: Creep): RoomPosition[] {
        const state = creep.memory.travel;
        if (!state || !state.path) return [];

        const positions: RoomPosition[] = [];
        let x = state.ox;
        let y = state.oy;
        let room = state.oRoom;

        for (let i = 0; i < state.path.length; i++) {
            const next = stepTile(x, y, directionAt(state.path, i));
            if (!next) break;

            positions.push(new RoomPosition(next.x, next.y, room));
            x = next.x;
            y = next.y;

            // Pisar un exit lo transporta al room vecino: el path sigue desde el espejo.
            const mirror = mirrorOf(x, y, room);
            if (mirror) {
                x = mirror.x;
                y = mirror.y;
                room = mirror.roomName;
            }
        }

        return positions;
    }

    /**
     * Cuántos pasos REALES (rodeando muros) le faltan para quedar a `range`
     * del objetivo, con los mismos costos que travel(). Infinity si no hay
     * camino corto. Sirve para decidir "¿vale la pena ir?" sin mover al creep:
     * algo "a 3 casillas" en línea recta puede estar a 30 rodeando un muro.
     * `maxOps` chico a propósito: es para distancias cortas.
     */
    public static stepsTo(
        creep: Creep,
        target: RoomPosition | _HasRoomPosition,
        range = ADVANCED_MOVE_CONFIG.DEFAULT_RANGE,
        maxOps = 500
    ): number {
        const dest = "pos" in target ? target.pos : target;
        const resolved = this.resolveRange(dest, range);
        if (creep.pos.inRangeTo(dest, resolved)) return 0;

        const sameRoom = dest.roomName === creep.pos.roomName;
        const result = PathManager.search(
            creep,
            dest,
            resolved,
            { maxOps, maxRooms: sameRoom ? 1 : undefined },
            0,
            creep.pos,
            false // solo importa el largo: sin la pasada de carriles
        );
        if (!result || !result.path || result.incomplete) return Infinity;
        return result.path.length;
    }

    /** Olvida el estado de movimiento del creep (path, atascos y ancla). */
    public static forget(creep: Creep): void {
        delete creep.memory.travel;
    }

    /**
     * Rango 0 sobre algo que no se puede pisar (spawn, storage, controller,
     * muro) es imposible: queda al lado, igual que moveTo.
     */
    private static resolveRange(dest: RoomPosition, range: number | undefined): number {
        const value = range ?? ADVANCED_MOVE_CONFIG.DEFAULT_RANGE;
        if (value === 0 && !CostMatrixManager.isWalkable(dest.roomName, dest.x, dest.y)) return 1;
        return value;
    }

    private static repath(
        creep: Creep,
        state: TravelMemory,
        dest: RoomPosition,
        range: number,
        opts: TravelOptions
    ): TravelReturnCode {
        // Sin camino hace poco: no quemar CPU buscando lo mismo cada tick
        // (backoff exponencial: 5, 10, 20, 40, 50... ticks).
        if (state.failTick !== undefined) {
            const { NO_PATH_COOLDOWN, NO_PATH_MAX_COOLDOWN } = ADVANCED_MOVE_CONFIG.PATH;
            const cooldown = Math.min(NO_PATH_MAX_COOLDOWN, NO_PATH_COOLDOWN * Math.pow(2, (state.fails ?? 1) - 1));
            if (Game.time - state.failTick < cooldown) return ERR_NO_PATH;
        }

        const result = PathManager.search(creep, dest, range, opts, state.stuck);
        if (!result || !result.path) {
            state.path = "";
            state.failTick = Game.time;
            state.fails = (state.fails ?? 0) + 1;
            return ERR_NO_PATH;
        }

        delete state.failTick;
        delete state.fails;
        StateManager.setPath(state, result.origin, result.path);
        state.sRoom = result.origin.roomName;
        return OK;
    }

    /** Dibuja lo que falta del path dentro del room actual. */
    private static draw(creep: Creep, state: TravelMemory, style: PolyStyle): void {
        const points: [number, number][] = [[creep.pos.x, creep.pos.y]];
        const steps = Math.min(state.path.length, ADVANCED_MOVE_CONFIG.VISUAL_MAX_STEPS);
        let x = creep.pos.x;
        let y = creep.pos.y;

        for (let i = 0; i < steps; i++) {
            const next = stepTile(x, y, directionAt(state.path, i));
            if (!next) break;

            points.push([next.x, next.y]);
            if (isExit(next.x, next.y)) break;
            x = next.x;
            y = next.y;
        }

        creep.room.visual.poly(points, style);
    }
}

// Instalar el hook apenas carga el módulo (global reset) para registrar
// también los moves que ocurran antes del primer travel() del tick.
installMoveHook(onMove);

// Comandos de diagnóstico para la consola del juego (ver debug.ts).
global.moveInfo = moveInfo;
global.moveCompare = moveCompare;

export default AdvancedMove;
