// src/war/utils/geometry.ts
//
// Cuentas de casillas sin tocar la API del juego (se pueden probar fuera del juego).
import type { PackedPos } from "../types";

/** Dirección -> [dx, dy]. TOP = 1 ... TOP_LEFT = 8. */
export const OFFSETS: Record<number, [number, number]> = {
    1: [0, -1],
    2: [1, -1],
    3: [1, 0],
    4: [1, 1],
    5: [0, 1],
    6: [-1, 1],
    7: [-1, 0],
    8: [-1, -1]
};

export const ALL_DIRECTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as DirectionConstant[];

export function directionOf(dx: number, dy: number): DirectionConstant | undefined {
    for (const dir of ALL_DIRECTIONS) {
        const [ox, oy] = OFFSETS[dir];
        if (ox === Math.sign(dx) && oy === Math.sign(dy) && (dx !== 0 || dy !== 0)) return dir;
    }
    return undefined;
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Casilla de salida: pisarla (o quedarse parado encima) te pasa al room vecino. */
export function isEdge(x: number, y: number): boolean {
    return x <= 0 || y <= 0 || x >= 49 || y >= 49;
}

/** Índice en los arrays de 50x50 de este módulo. */
export function idx(x: number, y: number): number {
    return y * 50 + x;
}

export function unpack(p: PackedPos): RoomPosition {
    return new RoomPosition(p.x, p.y, p.r);
}

export function keyOf(x: number, y: number, room: string): string {
    return `${x},${y},${room}`;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** "W49N9" -> [-50, -10]. null si no es un nombre de room normal (ej: "sim"). */
export function roomCoords(name: string): [number, number] | null {
    const match = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
    if (!match) return null;
    const n = Number(match[2]);
    const m = Number(match[4]);
    return [match[1] === "W" ? -n - 1 : n, match[3] === "N" ? -m - 1 : m];
}

/** Lado por el que se sale de `from` para entrar a `to` (vecinos), o undefined. */
export function sideTowards(from: string, to: string): number | undefined {
    const a = roomCoords(from);
    const b = roomCoords(to);
    if (!a || !b) return undefined;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return undefined;
    return directionOf(dx, dy);
}

