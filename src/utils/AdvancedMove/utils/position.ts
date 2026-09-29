// src/utils/AdvancedMove/utils/position.ts
//
// Helpers de coordenadas SIN crear RoomPosition (son la parte caliente de cada
// tick). Todo trabaja con (x, y, roomName) crudos.

/** Casilla cruda: evita alocar RoomPosition en el camino caliente. */
export interface Tile {
    x: number;
    y: number;
}

/** Desplazamiento de cada DirectionConstant (índice = dirección 1..8). */
const OFFSET_X = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const OFFSET_Y = [0, -1, -1, 0, 1, 1, 1, 0, -1];

// Literales en vez de TOP/LEFT/...: así el módulo se puede importar fuera del
// juego (tests) sin que exploten los globals de Screeps.
// TOP=1 TOP_RIGHT=2 RIGHT=3 BOTTOM_RIGHT=4 BOTTOM=5 BOTTOM_LEFT=6 LEFT=7 TOP_LEFT=8

/** Dirección según (dy + 1) * 3 + (dx + 1). El centro (índice 4) nunca se usa. */
const DIRECTION_BY_DELTA: DirectionConstant[] = [
    8, 1, 2,
    7, 1, 3,
    6, 5, 4
];

export const ALL_DIRECTIONS: DirectionConstant[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** x,y -> un solo número (0..2499), para usar como key de Map. */
export function packXY(x: number, y: number): number {
    return x * 50 + y;
}

/** ¿Es una casilla de salida? Pisarla transporta al creep al room vecino. */
export function isExit(x: number, y: number): boolean {
    return x === 0 || y === 0 || x === 49 || y === 49;
}

/** Casilla a un paso en `dir` dentro del MISMO room. undefined si se sale del mapa. */
export function stepTile(x: number, y: number, dir: number): Tile | undefined {
    if (!(dir >= 1 && dir <= 8)) return undefined; // también descarta NaN (path corrupto)
    const nx = x + OFFSET_X[dir];
    const ny = y + OFFSET_Y[dir];
    if (nx < 0 || nx > 49 || ny < 0 || ny > 49) return undefined;
    return { x: nx, y: ny };
}

/** Dirección entre dos casillas (se asume adyacentes, mismo room). */
export function directionBetween(fromX: number, fromY: number, toX: number, toY: number): DirectionConstant {
    const dx = Math.sign(toX - fromX);
    const dy = Math.sign(toY - fromY);
    return DIRECTION_BY_DELTA[(dy + 1) * 3 + (dx + 1)];
}

/** Desplazamiento (dx, dy) de una dirección 1..8. */
export function offsetOf(dir: number): Tile {
    return { x: OFFSET_X[dir], y: OFFSET_Y[dir] };
}

/** Gira `dir` en sentido horario, de a 45° por paso (negativo = antihorario). */
export function rotate(dir: number, steps: number): DirectionConstant {
    return ((((((dir - 1 + steps) % 8) + 8) % 8) + 1) as DirectionConstant);
}

/** TOP_RIGHT, BOTTOM_RIGHT, BOTTOM_LEFT y TOP_LEFT son las pares. */
export function isDiagonal(dir: number): boolean {
    return dir % 2 === 0;
}

/** Rango de Chebyshev (el "range" de Screeps) dentro de un mismo room. */
export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Lee la dirección `index` de un path serializado ("1".."8"). NaN si no existe. */
export function directionAt(path: string, index: number): number {
    return path.charCodeAt(index) - 48;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const ROOM_NAME = /^([WE])(\d+)([NS])(\d+)$/;
const roomCoordsCache = new Map<string, [number, number] | null>();

/** "W1N2" -> coordenadas de mundo [x, y] (y crece hacia el sur). null en "sim". */
export function roomToXY(roomName: string): [number, number] | null {
    const cached = roomCoordsCache.get(roomName);
    if (cached !== undefined) return cached;

    const match = ROOM_NAME.exec(roomName);
    let coords: [number, number] | null = null;
    if (match) {
        const h = parseInt(match[2], 10);
        const v = parseInt(match[4], 10);
        coords = [match[1] === "W" ? -h - 1 : h, match[3] === "N" ? -v - 1 : v];
    }

    roomCoordsCache.set(roomName, coords);
    return coords;
}

export function xyToRoom(x: number, y: number): string {
    const h = x < 0 ? `W${-x - 1}` : `E${x}`;
    const v = y < 0 ? `N${-y - 1}` : `S${y}`;
    return h + v;
}

/** Casilla ESPEJO de un exit: a donde el motor transporta al creep que termina el tick ahí. */
export function mirrorOf(x: number, y: number, roomName: string): (Tile & { roomName: string }) | undefined {
    if (!isExit(x, y)) return undefined;

    const coords = roomToXY(roomName);
    if (!coords) return undefined;
    const [rx, ry] = coords;

    // Mismo orden de chequeo que el motor (processor/intents/creeps/tick.js)
    if (x === 0) return { x: 49, y, roomName: xyToRoom(rx - 1, ry) };
    if (y === 0) return { x, y: 49, roomName: xyToRoom(rx, ry - 1) };
    if (x === 49) return { x: 0, y, roomName: xyToRoom(rx + 1, ry) };
    return { x, y: 0, roomName: xyToRoom(rx, ry + 1) };
}

/**
 * ¿`pos` está en la casilla (x, y, roomName)? Cuenta como la misma casilla el
 * espejo de un exit, porque el motor transporta al creep en el mismo tick y
 * nunca se lo observa parado del lado de donde entró.
 */
export function isSameTile(pos: RoomPosition, x: number, y: number, roomName: string): boolean {
    if (pos.x === x && pos.y === y && pos.roomName === roomName) return true;

    const mirror = mirrorOf(x, y, roomName);
    return mirror !== undefined && pos.x === mirror.x && pos.y === mirror.y && pos.roomName === mirror.roomName;
}

/** Info del nombre de room para costos de ruta (highway / source keeper). */
export function describeRoom(roomName: string): { highway: boolean; sourceKeeper: boolean } {
    const match = ROOM_NAME.exec(roomName);
    if (!match) return { highway: false, sourceKeeper: false };

    const h = parseInt(match[2], 10) % 10;
    const v = parseInt(match[4], 10) % 10;
    const highway = h === 0 || v === 0;
    const sourceKeeper = !highway && h >= 4 && h <= 6 && v >= 4 && v <= 6 && !(h === 5 && v === 5);

    return { highway, sourceKeeper };
}
