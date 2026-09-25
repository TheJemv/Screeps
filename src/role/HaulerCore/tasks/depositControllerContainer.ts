import { CreepHaulerCore, EnergyStructure } from "../types"; // <-- Asegúrate de importar EnergyStructure
import ReservationManager from "../managers/ReservationManager";
import { getControllerContainer } from "utils/GetControllerContainer";

export default function(creep: CreepHaulerCore): boolean {
  const room = creep.room;

// ----------------------------------------------------------------------
  // 0. CANDADO DE PRIORIDAD ABSOLUTA
  // Verificar la necesidad REAL y FÍSICA de los Spawns y Extensions
  // ----------------------------------------------------------------------
  const needsPrimaryEnergy = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureSpawn | StructureExtension => {
      const isSpawnOrExt = s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION;
      if (!isSpawnOrExt) return false;

      return s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    }
  });

  if (needsPrimaryEnergy.length > 0) {
    return false; // Hay Spawns o Extensions vacíos. Abortamos ir al ControllerContainer.
  }
  // ----------------------------------------------------------------------

  const storage = room.storage;
  const controllerContainer = getControllerContainer(room);

  // 1. Validaciones de existencia básica
  if (!storage || !controllerContainer) return false;

  // 2. Condición: Storage con al menos 3,000 de energía
  if (storage.store.getUsedCapacity(RESOURCE_ENERGY) < 3000) return false;

  const currentEnergy = controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY);
  const maxCapacity = controllerContainer.store.getCapacity(RESOURCE_ENERGY);
  const freeCapacity = controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY);
  const creepEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

  // 3. Condición: ControllerContainer por debajo del 50% de capacidad
  if (currentEnergy >= maxCapacity * 0.5) return false;

  // 4. Condición: La energía total del creep cabe en el espacio libre del contenedor
  if (freeCapacity < creepEnergy) return false;

  // 5. Exclusividad: Verificar que NINGÚN otro HaulerCore lo tenga asignado
  for (const name in Game.creeps) {
    if (name === creep.name) continue;
    const otherCreep = Game.creeps[name] as CreepHaulerCore;

    if (
      otherCreep.memory &&
      otherCreep.memory.role === "HaulerCore" &&
      otherCreep.memory.targets &&
      otherCreep.memory.targets.includes(controllerContainer.id)
    ) {
      return false; // Ya hay otro HaulerCore asignado a este contenedor
    }
  }

  // Asignar y reservar
  ReservationManager.post(creep, [controllerContainer]);
  return true;
}
