import { GetPowerBankContainers } from "utils/GetPowerBank";
import { RepairerCreep } from "../types"; // Ajusta la ruta de types según tu proyecto
import ReservationManager from "../managers/ReservationManager"; // <-- Importamos el Manager
import { moveToRoad } from "utils/MoveToRoad";

const MAX_WALL_HITS = 100000;

export function repairStructures(creep: RepairerCreep): void {
    // 1. SI NO TIENE OBJETIVO: Buscar estructura <= 50% que NO esté reservada
    if (!creep.memory.targetId) {
        const cuartosNuestros = new Set<string>();
        cuartosNuestros.add(creep.memory.homeRoom || creep.room.name);

        for (const flagName in Game.flags) {
            if (flagName.startsWith("Miner_")) {
                cuartosNuestros.add(Game.flags[flagName].pos.roomName);
            }
        }

        // ---------------------------------------------------------------------
        // 🔒 Usamos nuestro Manager para obtener la lista negra de IDs
        // ---------------------------------------------------------------------
        const reservedIds = ReservationManager.getReservedIds(creep);

        let bestTarget: AnyStructure | null = null;
        let highestPriority = 0;
        let lowestHits = Infinity;

        for (const roomName of cuartosNuestros) {
            if (!Game.rooms[roomName]) continue;

            const structures = Game.rooms[roomName].find(FIND_STRUCTURES);

            for (const s of structures) {
                // 🛑 REGLA 1: Si otro repairer ya lo tiene reservado, lo saltamos
                if (reservedIds.has(s.id)) continue;

                const isWallOrRampart = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
                const maxHitsAllowed = isWallOrRampart ? MAX_WALL_HITS : s.hitsMax;

                // 🛑 REGLA 2: Solo atendemos emergencias de la mitad hacia abajo (<= 50%)
                if (s.hits > maxHitsAllowed * 0.5) continue;

                let priority = 0;

                switch (s.structureType) {
                    case STRUCTURE_CONTAINER:
                        priority = 4;
                        break;
                    case STRUCTURE_RAMPART:
                        priority = 3;
                        if (s.hits < 10000) priority = 5; // Emergencia crítica
                        break;
                    case STRUCTURE_EXTENSION:
                    case STRUCTURE_SPAWN:
                    case STRUCTURE_TOWER:
                    case STRUCTURE_LINK:      // <-- ¡Agregado!
                    case STRUCTURE_STORAGE:   // <-- Preparado para tu Storage
                    case STRUCTURE_TERMINAL:  // <-- Preparado para RCL 6
                        priority = 2;
                        break;
                    case STRUCTURE_ROAD:
                    case STRUCTURE_WALL:
                        priority = 1;
                        break;
                }

                if (priority > 0) {
                    if (priority > highestPriority || (priority === highestPriority && s.hits < lowestHits)) {
                        highestPriority = priority;
                        lowestHits = s.hits;
                        bestTarget = s;
                    }
                }
            }
        }

        if (bestTarget) {
            // Asignamos usando el manager
            ReservationManager.assign(creep, bestTarget.id);
        }
    }

    // 2. EJECUTAR REPARACIÓN (Hasta llegar al 100%)
    if (creep.memory.targetId) {
        const target = Game.getObjectById<Structure>(creep.memory.targetId);
        const isWallOrRampart = target && (target.structureType === STRUCTURE_WALL || target.structureType === STRUCTURE_RAMPART);
        const hitLimit = isWallOrRampart ? MAX_WALL_HITS : (target ? target.hitsMax : 0);

        // 🛑 REGLA 3: Si ya no existe o ya llegó a su máximo, lo liberamos
        if (!target || target.hits >= hitLimit) {
            ReservationManager.clear(creep);
            return;
        }

        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, target, {
                range: 3,
                visualizePathStyle: { stroke: '#00ff00' }
            });
        }
        return;
    }

    // 3. STAND-BY: Esperar sin bloquear
    const closestPowerBank = creep.pos.findClosestByRange(GetPowerBankContainers());
    if (closestPowerBank && !creep.pos.inRangeTo(closestPowerBank, 3)) {
        moveToRoad(creep, closestPowerBank, {
            range: 3,
            visualizePathStyle: { stroke: '#777777' }
        });
    }
}
