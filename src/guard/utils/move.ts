// src/guard/utils/move.ts
//
// Para ir (a la amenaza, a casa, detrás de un enemigo) se usa AdvancedMove:
// cruza rooms y portales, prefiere roads y negocia el paso con la economía
// (swap en vez de trabarse). Para escapar (kiting / retirada) se usa un flee
// propio de PathFinder, que AdvancedMove no tiene.
import { AdvancedMove } from "utils/AdvancedMove";

export function moveTo(creep: Creep, target: RoomPosition | _HasRoomPosition, range: number, color: string): void {
    AdvancedMove.travel(creep, target, { range, visualizePathStyle: { stroke: color, opacity: 0.4 } });
}

/** Posición central de un room: sirve de destino cuando no se sabe dónde está el enemigo. */
export function roomCenter(roomName: string): RoomPosition {
    return new RoomPosition(25, 25, roomName);
}

let matrixTick = -1;
const matrices = new Map<string, CostMatrix>();

/** Estructuras y creeps bloquean; los bordes también (no se escapa a otro room y vuelve rebotando). */
function fleeMatrix(roomName: string): CostMatrix | boolean {
    if (matrixTick !== Game.time) {
        matrixTick = Game.time;
        matrices.clear();
    }

    const cached = matrices.get(roomName);
    if (cached) return cached;

    const room = Game.rooms[roomName];
    if (!room) return false;

    const matrix = new PathFinder.CostMatrix();
    for (const s of room.find(FIND_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD) {
            matrix.set(s.pos.x, s.pos.y, 1);
        } else if (s.structureType === STRUCTURE_CONTAINER) {
            continue;
        } else if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) {
            continue;
        } else {
            matrix.set(s.pos.x, s.pos.y, 255);
        }
    }
    for (const c of room.find(FIND_CREEPS)) matrix.set(c.pos.x, c.pos.y, 255);
    for (const c of room.find(FIND_POWER_CREEPS)) matrix.set(c.pos.x, c.pos.y, 255);
    for (let i = 0; i < 50; i++) {
        matrix.set(i, 0, 255);
        matrix.set(i, 49, 255);
        matrix.set(0, i, 255);
        matrix.set(49, i, 255);
    }

    matrices.set(roomName, matrix);
    return matrix;
}

/**
 * Da un paso alejándose de `from` hasta quedar a `range` o más de todos.
 * Nunca sale del room. Devuelve false si no hay a dónde ir (acorralado).
 */
export function flee(creep: Creep, from: _HasRoomPosition[], range: number): boolean {
    if (from.length === 0 || creep.fatigue > 0) return false;

    const result = PathFinder.search(
        creep.pos,
        from.map(o => ({ pos: o.pos, range })),
        { flee: true, maxRooms: 1, plainCost: 2, swampCost: 10, maxOps: 1000, roomCallback: fleeMatrix }
    );
    if (result.path.length === 0) return false;

    return creep.move(creep.pos.getDirectionTo(result.path[0])) === OK;
}
