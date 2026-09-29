// src/utils/AdvancedMove/debug.ts
//
// Comandos cortos para la consola del juego (index.ts los deja como globals).
// La consola no ejecuta snippets muy largos, así que el diagnóstico vive acá y
// usa exactamente los mismos costos que el código real.
//
//   moveInfo()
//     Quién está caminando ahora: posición, destino, atasco y el tipo de cada
//     casilla que le falta (R = road, . = plano, S = pantano) con sus ticks.
//
//   moveCompare('builder_123')           desde donde está parado
//   moveCompare('builder_123', 20, 24)   desde otra casilla del mismo room
//     Compara el camino que elige AdvancedMove contra el más corto en
//     casillas, en TICKS REALES para el cuerpo y la carga actual del creep.

import { TerrainTicks, terrainTicksFor } from "./utils/body";
import { Tile, directionAt, isExit, stepTile } from "./utils/position";
import { ADVANCED_MOVE_CONFIG } from "./config";
import CostMatrixManager from "./managers/CostMatrixManager";
import PathManager from "./managers/PathManager";

interface Summary {
    text: string;
    ticks: number;
}

export function moveInfo(): string {
    try {
        const lines: string[] = [];

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const state = creep.memory.travel;
            if (!state || !state.path || state.callTick < Game.time - 1) continue;

            const tiles = tilesOf(state.path, state.ox, state.oy);
            const summary = describe(state.oRoom, tiles, terrainTicksFor(creep));
            // tilesOf se corta en el borde: si quedan pasos, el viaje sigue en otro room.
            const continues = tiles.length < state.path.length ? `  -> sigue en ${state.dRoom}` : "";
            const dest = state.dRoom === creep.pos.roomName ? "" : `${state.dRoom} `;

            lines.push(
                `${name} [${load(creep)}] ${creep.pos.roomName} ${creep.pos.x},${creep.pos.y} -> ` +
                    `${dest}${state.dx},${state.dy} (rango ${state.range}) atascado ${state.stuck} | ` +
                    `${summary.text}${continues}`
            );
        }

        return lines.join("\n") || "Nadie está caminando con AdvancedMove ahora.";
    } catch (err) {
        return `moveInfo falló: ${String(err)}`;
    }
}

export function moveCompare(name: string, x?: number, y?: number): string {
    try {
        const creep = Game.creeps[name];
        if (!creep) return `No existe el creep ${name}.`;

        const state = creep.memory.travel;
        if (!state) return `${name} todavía no usó AdvancedMove.`;

        const roomName = creep.pos.roomName;
        if (state.dRoom !== roomName) return `El destino de ${name} está en otro room (${state.dRoom}).`;

        const origin = x !== undefined && y !== undefined ? new RoomPosition(x, y, roomName) : creep.pos;
        const dest = new RoomPosition(state.dx, state.dy, state.dRoom);
        const ticks = terrainTicksFor(creep);
        const { ROAD_COST, ROAD_PREFERENCE, MAX_OPS } = ADVANCED_MOVE_CONFIG.PATH;

        // 1) El que elige AdvancedMove (mismo código que travel()).
        const ours = PathManager.search(creep, dest, state.range, {}, 0, origin);
        if (!ours || !ours.path) return `AdvancedMove no encuentra camino desde ${origin.x},${origin.y}.`;
        const oursSummary = describe(roomName, tilesOf(ours.path, ours.origin.x, ours.origin.y), ticks);

        // 2) El de menos pasos: todas las casillas cuestan lo mismo.
        const shortest = PathFinder.search(
            origin,
            { pos: dest, range: state.range },
            {
                plainCost: ROAD_COST,
                swampCost: ROAD_COST,
                maxRooms: 1,
                maxOps: MAX_OPS,
                heuristicWeight: Math.min(9, ROAD_COST),
                roomCallback: room => CostMatrixManager.getWithoutExits(room)
            }
        );
        const shortSummary = describe(roomName, shortest.path, ticks);

        const lines = [
            `${name} [${load(creep)}]: road=${ticks.road}, plano=${ticks.plain}, pantano=${ticks.swamp} ticks por casilla`,
            `desde ${origin.x},${origin.y} hasta ${dest.x},${dest.y} (rango ${state.range})`,
            `AdvancedMove: ${oursSummary.text}${ours.incomplete ? " (INCOMPLETO)" : ""}`,
            `más corto:    ${shortSummary.text}${shortest.incomplete ? " (INCOMPLETO)" : ""}`,
            verdict(oursSummary.ticks, shortSummary.ticks, ROAD_PREFERENCE)
        ];
        return lines.join("\n");
    } catch (err) {
        return `moveCompare falló: ${String(err)}`;
    }
}

function verdict(ours: number, shortest: number, preference: number): string {
    if (ours <= shortest) return "OK: el camino de AdvancedMove es igual o más rápido.";

    const extra = (ours - shortest) / shortest;
    const pct = Math.round(extra * 100);
    if (extra <= preference + 0.01) {
        return `OK: tarda ${pct}% más, pero va por road (dentro del margen ROAD_PREFERENCE = ${preference * 100}%).`;
    }
    return `REVISAR: tarda ${pct}% más de lo que permite ROAD_PREFERENCE (${preference * 100}%).`;
}

/** Casillas de un path serializado desde (x, y), dentro del mismo room. */
function tilesOf(path: string, startX: number, startY: number): Tile[] {
    const tiles: Tile[] = [];
    let x = startX;
    let y = startY;

    for (let i = 0; i < path.length; i++) {
        const next = stepTile(x, y, directionAt(path, i));
        if (!next) break;
        tiles.push(next);
        if (isExit(next.x, next.y)) break; // lo que sigue ya es en otro room
        x = next.x;
        y = next.y;
    }

    return tiles;
}

/** "N pasos = T ticks  RR..S" con los ticks reales de ese creep. */
function describe(roomName: string, tiles: Tile[], ticks: TerrainTicks): Summary {
    const terrain = Game.map.getRoomTerrain(roomName);
    let kinds = "";
    let total = 0;

    for (const { x, y } of tiles) {
        if (CostMatrixManager.isRoad(roomName, x, y)) {
            kinds += "R";
            total += ticks.road;
        } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
            kinds += "S";
            total += ticks.swamp;
        } else {
            kinds += ".";
            total += ticks.plain;
        }
    }

    return { text: `${tiles.length} pasos = ${total} ticks  ${kinds}`, ticks: total };
}

function load(creep: Creep): string {
    const capacity = creep.store.getCapacity();
    return capacity ? `${creep.store.getUsedCapacity()}/${capacity}` : "sin CARRY";
}
