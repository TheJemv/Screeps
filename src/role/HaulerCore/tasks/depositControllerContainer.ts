import { CreepHaulerCore } from "../types"; // <-- Asegúrate de importar EnergyStructure
import ReservationManager from "../managers/ReservationManager";
import { getControllerContainer } from "utils/GetControllerContainer";

export default function(creep: CreepHaulerCore): boolean {
  const room = creep.room;
  const needsPrimaryEnergy = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureSpawn | StructureExtension => {
      const isSpawnOrExt = s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION;
      if (!isSpawnOrExt) return false;

      return s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    }
  });

  if (needsPrimaryEnergy.length > 0) return false;


  const storage = room.storage;
  const controllerContainer = getControllerContainer(room);

  if (!storage || !controllerContainer) return false;
  if (storage.store.getUsedCapacity(RESOURCE_ENERGY) < 3000) return false;

  const currentEnergy = controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY);
  const maxCapacity = controllerContainer.store.getCapacity(RESOURCE_ENERGY);
  const freeCapacity = controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY);
  const creepEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

  if (currentEnergy >= maxCapacity * 0.5) return false;
  if (freeCapacity < creepEnergy) return false;

  for (const name in Game.creeps) {
    if (name === creep.name) continue;
    const otherCreep = Game.creeps[name] as CreepHaulerCore;

    if (
      otherCreep.memory &&
      otherCreep.memory.role === "HaulerCore" &&
      otherCreep.memory.targets &&
      otherCreep.memory.targets.includes(controllerContainer.id)
    ) {
      return false;
    }
  }

  // Asignar y reservar
  ReservationManager.post(creep, [controllerContainer]);
  return true;
}
