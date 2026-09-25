import { BuilderCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";
import { parkBuilder } from "./parking";

export function doBuildWork(creep: BuilderCreep): void {
    // El target ya lo decidió assignBuilderTargets() (corre una vez por tick,
    // reparte según cuánta energía le falta a cada site) -- acá solo se
    // ejecuta.
    if (creep.memory.targetSiteId) {
        const targetSite = Game.getObjectById(creep.memory.targetSiteId);

        if (creep.name === 'builder_83191280') {
            console.log(
                `[DEBUG ${creep.name}] tick=${Game.time} room=${creep.room.name} pos=${creep.pos.x},${creep.pos.y} ` +
                `fatigue=${creep.fatigue} targetSiteId=${creep.memory.targetSiteId} ` +
                `targetSite=${targetSite ? `${targetSite.structureType}@${targetSite.pos.roomName}(${targetSite.pos.x},${targetSite.pos.y}) progress=${targetSite.progress}/${targetSite.progressTotal}` : 'NULL'}`
            );
        }

        if (targetSite) {
            const buildResult = creep.build(targetSite);

            if (creep.name === 'builder_83191280') {
                console.log(`[DEBUG ${creep.name}] creep.build()=${buildResult}`);
            }

            if (buildResult === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, targetSite, {
                    range: 3,
                    visualizePathStyle: { stroke: '#2500ff' } // 🔵 AZUL para construir
                });
            }
            return;
        }

        delete creep.memory.targetSiteId;
    }

    // Sin target asignado (no hacía falta, o ya no existe): REPARACIONES
    // MENORES locales.
    const damagedStructure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) && s.hits < s.hitsMax * 0.7
    });

    if (damagedStructure) {
        if (creep.repair(damagedStructure) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, damagedStructure, {
                range: 3,
                visualizePathStyle: { stroke: '#00ffff' } // 🔷 CIAN para reparar
            });
        }
        return;
    }

    // PARKING
    parkBuilder(creep);
}
