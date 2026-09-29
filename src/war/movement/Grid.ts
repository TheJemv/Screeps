// src/war/movement/Grid.ts
//
// Cuentas sobre la grilla de 50x50 (sin API del juego, se pueden probar fuera).
//
//   tile[i] = costo de pisar la casilla (255 = no se puede)
//   box[i]  = costo de parar el CENTRO del bloque 3x3 ahí = el peor de sus 9 casillas.
//             255 si alguna es intransitable o si el bloque tocaría un borde de
//             salida (quedarse parado en un borde te pasa al room vecino).
import { ALL_DIRECTIONS, OFFSETS, idx } from "../utils/geometry";

export const BLOCKED = 255;

export function boxCosts(tile: Uint8Array): Uint8Array {
    // Máximo 3x3 separable: primero horizontal, después vertical.
    const horizontal = new Uint8Array(2500).fill(BLOCKED);
    for (let y = 0; y < 50; y++) {
        for (let x = 1; x < 49; x++) {
            horizontal[idx(x, y)] = Math.max(tile[idx(x - 1, y)], tile[idx(x, y)], tile[idx(x + 1, y)]);
        }
    }

    const box = new Uint8Array(2500).fill(BLOCKED);
    for (let y = 2; y <= 47; y++) {
        for (let x = 2; x <= 47; x++) {
            box[idx(x, y)] = Math.max(horizontal[idx(x, y - 1)], horizontal[idx(x, y)], horizontal[idx(x, y + 1)]);
        }
    }
    return box;
}

export interface AnchorSearch {
    /** Pasos máximos desde el inicio. */
    maxDepth: number;
    /** Después de encontrar el primero, sigue buscando estos pasos más por uno mejor. */
    slack?: number;
    /** Costo máximo aceptado del bloque (menor a BREAK_BASE = sin nada que romper). */
    maxBox: number;
    /** Penalización extra por candidato (ej: roads, creeps). */
    penalty?: (x: number, y: number) => number;
    /** false = descartado (ej: se pisa con otro pelotón). */
    accept?: (x: number, y: number) => boolean;
    /** Casillas que se pueden caminar en la búsqueda (por defecto todo lo que no es 255). */
    maxTile?: number;
}

/**
 * Centro de bloque válido más cercano CAMINANDO desde (sx, sy) (BFS por casillas
 * pisables: no salta muros). null si no hay ninguno a maxDepth pasos.
 */
export function nearestAnchor(
    tile: Uint8Array,
    box: Uint8Array,
    sx: number,
    sy: number,
    opts: AnchorSearch
): { x: number; y: number } | null {
    const maxBox = opts.maxBox;
    const maxTile = opts.maxTile ?? BLOCKED - 1;
    const depth = new Int16Array(2500).fill(-1);
    const queue: number[] = [idx(sx, sy)];
    depth[idx(sx, sy)] = 0;

    let best: { x: number; y: number; score: number } | null = null;
    let stopAt = opts.maxDepth;

    // for-of también recorre lo que se agrega a la cola durante el BFS.
    for (const i of queue) {
        const d = depth[i];
        if (d > stopAt) break;
        const x = i % 50;
        const y = (i - x) / 50;

        if (box[i] <= maxBox && (!opts.accept || opts.accept(x, y))) {
            const score = d * 10 + (opts.penalty ? opts.penalty(x, y) : 0);
            if (!best || score < best.score) best = { x, y, score };
            if (stopAt === opts.maxDepth) stopAt = Math.min(opts.maxDepth, d + (opts.slack ?? 0));
        }

        for (const dir of ALL_DIRECTIONS) {
            const [ox, oy] = OFFSETS[dir];
            const nx = x + ox;
            const ny = y + oy;
            // Los bordes solo sirven de punto de partida (pisarlos te saca del room).
            if (nx <= 0 || ny <= 0 || nx >= 49 || ny >= 49) continue;
            const ni = idx(nx, ny);
            if (depth[ni] !== -1 || tile[ni] > maxTile) continue;
            depth[ni] = d + 1;
            queue.push(ni);
        }
    }

    return best ? { x: best.x, y: best.y } : null;
}

/** Cantidad de casillas del bloque centrado en (x, y) que cumplen `test`. */
export function countInBox(x: number, y: number, test: (x: number, y: number) => boolean): number {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (test(x + dx, y + dy)) n++;
        }
    }
    return n;
}

/**
 * Centros desde los que el bloque llega (moviéndose como bloque, rompiendo si hace
 * falta) a alguno de los goals: la componente conexa de la grilla `box` que los
 * contiene. 1 = llega.
 */
export function boxComponent(box: Uint8Array, goals: { x: number; y: number; range: number }[]): Uint8Array {
    const seen = new Uint8Array(2500);
    const queue: number[] = [];
    for (const g of goals) {
        for (let y = Math.max(2, g.y - g.range); y <= Math.min(47, g.y + g.range); y++) {
            for (let x = Math.max(2, g.x - g.range); x <= Math.min(47, g.x + g.range); x++) {
                const i = idx(x, y);
                if (box[i] >= BLOCKED || seen[i]) continue;
                seen[i] = 1;
                queue.push(i);
            }
        }
    }

    for (const i of queue) {
        const x = i % 50;
        const y = (i - x) / 50;
        for (const dir of ALL_DIRECTIONS) {
            const [ox, oy] = OFFSETS[dir];
            const ni = idx(x + ox, y + oy);
            if (x + ox < 2 || y + oy < 2 || x + ox > 47 || y + oy > 47) continue;
            if (seen[ni] || box[ni] >= BLOCKED) continue;
            seen[ni] = 1;
            queue.push(ni);
        }
    }
    return seen;
}
