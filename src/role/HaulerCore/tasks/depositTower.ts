import { CreepHaulerCore } from "../types";
import ReservationManager from "../managers/ReservationManager";

export default function(creep: CreepHaulerCore): boolean {
  const room = creep.room;

  // 1. Doble check: Asegurarnos de que no urja llenar Spawns/Extensiones
  const needsPrimaryEnergy = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureSpawn | StructureExtension => {
      const isSpawnOrExt = s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION;
      if (!isSpawnOrExt) return false;
      return s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    }
  });

  if (needsPrimaryEnergy.length > 0) return false;

  // 2. Buscar todas las torres que necesiten energía
  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureTower => {
      return s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    }
  });

  if (towers.length === 0) return false;

  // 3. Ordenarlas por la que tenga MENOS energía, para mantenerlas equilibradas
  towers.sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY));

  // 4. Buscar la primera torre que NO esté reservada por otro Hauler
  for (const tower of towers) {
    let alreadyTargeted = false;

    for (const name in Game.creeps) {
      if (name === creep.name) continue;
      const otherCreep = Game.creeps[name] as CreepHaulerCore;

      if (
        otherCreep.memory &&
        otherCreep.memory.role === "HaulerCore" &&
        otherCreep.memory.targets &&
        otherCreep.memory.targets.includes(tower.id)
      ) {
        alreadyTargeted = true;
        break; // Alguien más ya va a esta torre, checamos la siguiente
      }
    }

    // Si nadie va a esta torre, la reservamos y terminamos
    if (!alreadyTargeted) {
      ReservationManager.post(creep, [tower]);
      return true;
    }
  }

  // Si todas las torres necesitadas ya tienen a alguien en camino
  return false;
}
