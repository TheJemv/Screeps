import { GetPowerBankContainers } from "utils/GetPowerBank";
import { RepairerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

export function repairStructures(creep: RepairerCreep): void {
    // 1. SI NO TIENE OBJETIVO: Buscar estructura más dañada en TODOS los cuartos visibles
    // 1. SI NO TIENE OBJETIVO: Buscar estructura más dañada SOLO en nuestros cuartos
    if (!creep.memory.targetId) {
        const allStructures: AnyStructure[] = [];

        // Identificar nuestros territorios (Base + Cuartos con minas)
        const cuartosNuestros = new Set<string>();
        cuartosNuestros.add((creep.memory.homeRoom) || creep.room.name); // Tu cuarto principal

        for (const flagName in Game.flags) {
            if (flagName.startsWith("Miner_")) {
                cuartosNuestros.add(Game.flags[flagName].pos.roomName); // Tus cuartos remotos
            }
        }

        // Recorrer SOLO los cuartos que nos interesan (y donde tengamos visión)
        for (const roomName of cuartosNuestros) {
            if (Game.rooms[roomName]) {
                allStructures.push(...Game.rooms[roomName].find(FIND_STRUCTURES));
            }
        }

        const masDanado = (a: AnyStructure, b: AnyStructure) => a.hits - b.hits;

        // Filtramos y ordenamos
        const damaged =
            allStructures.filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER && s.hits <= s.hitsMax * 0.75).sort(masDanado)[0] ||
            allStructures.filter((s): s is StructureExtension => s.structureType === STRUCTURE_EXTENSION && s.hits <= s.hitsMax * 0.75).sort(masDanado)[0] ||
            allStructures.filter((s): s is StructureRoad => s.structureType === STRUCTURE_ROAD && s.hits <= s.hitsMax * 0.75).sort(masDanado)[0];

        creep.memory.targetId = damaged ? damaged.id : undefined;
    }

    // 2. EJECUTAR REPARACIÓN
    if (creep.memory.targetId) {
        // Game.getObjectById funciona a nivel global, sin importar en qué cuarto esté el objeto
        const target = Game.getObjectById<StructureContainer | StructureExtension | StructureRoad>(creep.memory.targetId);

        // Si ya no existe, se reparó completamente, o perdimos visión del cuarto remoto
        if (!target || target.hits === target.hitsMax) {
            delete creep.memory.targetId;
            return;
        }

        // Ejecuta la reparación. Si da ERR_NOT_IN_RANGE (está a más de 3 casillas de distancia)
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, target, {
                range: 3, // 💡 TIP: repair alcanza hasta 3 casillas, te ahorras caminar de más
                visualizePathStyle: { stroke: '#00ff00' } // 🟢 VERDE: Reparando
            });
        }
        return;
    }

    // 3. STAND-BY: Si todo está reparado en todo el imperio, espera en el minero de casa
    const closestPowerBank = creep.pos.findClosestByRange(GetPowerBankContainers());
    if (closestPowerBank && !creep.pos.inRangeTo(closestPowerBank, 1)) {
        moveToRoad(creep, closestPowerBank, {
            range: 1,
            visualizePathStyle: { stroke: '#777777' } // 🔘 GRIS: En espera
        });
    }
}
