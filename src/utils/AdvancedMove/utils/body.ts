// src/utils/AdvancedMove/utils/body.ts
//
// Costos de terreno calculados del cuerpo REAL del creep y de lo que carga,
// replicando la fórmula de fatiga del motor (processor/intents/movement.js):
//
//   fatiga = (partes que no son MOVE/CARRY + CARRY necesarias para lo cargado) * k
//   k: road = 1, plain = 2, swamp = 10.  Cada MOVE activa quita 2 por tick.
//
// Con eso sabemos cuántos ticks tarda de verdad en cada terreno, y encima se
// aplica PATH.ROAD_PREFERENCE: salir de la road cuesta un % extra, así los
// creeps van por las roads salvo que el atajo sea bastante más rápido (un
// cargado casi nunca sale; uno vacío solo si el atajo le ahorra de verdad).
// Ignora boosts (caso raro).

import { ADVANCED_MOVE_CONFIG } from "../config";

export interface TerrainCosts {
    /** Costo del plano en la escala de la CostMatrix (road = PATH.ROAD_COST). */
    plain: number;
    swamp: number;
}

/** Ticks reales que tarda el creep en cruzar una casilla de cada terreno. */
export interface TerrainTicks {
    road: number;
    plain: number;
    swamp: number;
}

const MAX_COST = 254;

export function terrainCostsFor(creep: Creep): TerrainCosts {
    const ticks = terrainTicksFor(creep);
    const plain = offRoadCost(ticks.plain / ticks.road);
    const swamp = Math.max(plain, offRoadCost(ticks.swamp / ticks.road));
    return { plain, swamp };
}

export function terrainTicksFor(creep: Creep): TerrainTicks {
    let carried = creep.store.getUsedCapacity() ?? 0;
    let weight = 0;
    let moves = 0;

    // El motor asigna la carga a las CARRY empezando por el final del body.
    for (let i = creep.body.length - 1; i >= 0; i--) {
        const part = creep.body[i];

        if (part.type === MOVE) {
            if (part.hits > 0) moves++;
        } else if (part.type === CARRY) {
            if (carried > 0 && part.hits > 0) {
                carried -= CARRY_CAPACITY;
                weight++;
            }
        } else {
            weight++; // WORK/ATTACK/... pesan aunque estén dañadas
        }
    }

    // Ticks por casilla en cada terreno (sin peso: 1 tick en cualquier lado).
    const ticks = (rate: number) =>
        moves === 0 || weight === 0 ? 1 : Math.max(1, Math.ceil((weight * rate) / (moves * 2)));

    return { road: ticks(1), plain: ticks(2), swamp: ticks(10) };
}

/** Relación de ticks contra la road -> costo en la escala de la CostMatrix, con la preferencia por roads. */
function offRoadCost(ticksVsRoad: number): number {
    const { ROAD_COST, ROAD_PREFERENCE } = ADVANCED_MOVE_CONFIG.PATH;
    let cost = Math.round(ROAD_COST * ticksVsRoad * (1 + ROAD_PREFERENCE));
    // Con preferencia, el plano nunca empata con la road (desempata a favor de la road).
    if (ROAD_PREFERENCE > 0) cost = Math.max(cost, ROAD_COST + 1);
    return Math.min(MAX_COST, Math.max(1, cost));
}
