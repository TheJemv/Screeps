// src/roles/builder/services/build.ts
import { BuilderCreep } from "../types";
import { AdvancedMove } from "../../../utils/AdvancedMove";
import { parkBuilder } from "./parking";

export function doBuildWork(creep: BuilderCreep): void {

    // ==========================================
    // 🚧 PRIORIDAD 1: CONSTRUIR
    // ==========================================
    if (creep.memory.targetSiteId) {
        const targetSite = Game.getObjectById(creep.memory.targetSiteId);

        if (targetSite) {
            const buildResult = creep.build(targetSite);

            if (buildResult === ERR_NOT_IN_RANGE) {
                AdvancedMove.travel(creep, targetSite, {
                    range: 1, // 👈 ¡CAMBIADO A 1! Se pegarán lo más cerca posible (adyacentes)
                    visualizePathStyle: { stroke: '#2500ff' } // 🔵 AZUL para construir
                });
            }
            return;
        }

        delete creep.memory.targetSiteId;
    }

    // ==========================================
    // 🔧 PRIORIDAD 2: REPARAR (Fallback)
    // ==========================================
    const damagedStructure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (s) =>
            s.hits < s.hitsMax * 0.8 &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
    });

    if (damagedStructure) {
        if (creep.repair(damagedStructure) === ERR_NOT_IN_RANGE) {
            AdvancedMove.travel(creep, damagedStructure, {
                range: 1, // 👈 También aquí los pegamos a rango 1 para reparar sin estorbar
                visualizePathStyle: { stroke: '#00ffff' } // 🔷 CIAN para reparar
            });
        }
        return;
    }

    // ==========================================
    // 🅿️ PRIORIDAD 3: ESTACIONARSE
    // ==========================================
    parkBuilder(creep);
}
