import { CreepHaulerLocal } from '../types';
import { GetPowersBank } from 'utils/GetPowerBank';
import { getControllerContainer } from 'utils/GetControllerContainer';

// Creamos un tipo exportable que abarque ambos (Contenedor o Recurso del suelo)
type EnergySource = StructureContainer | Resource;

export default function(creep: CreepHaulerLocal): EnergySource[] {
  const ControllerContainer = getControllerContainer(creep.room);
  const powerBankContainers = GetPowersBank();

  // 1. Obtener Contenedores
  const roomContainers = creep.room.find(FIND_STRUCTURES, {
    filter: (s): s is StructureContainer => {
        if (s.structureType !== STRUCTURE_CONTAINER) return false;
        if (ControllerContainer && s.id === ControllerContainer.id) return false;
        return true;
    }
  });

  // 2. Obtener Energía en el suelo
  const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY
  });

  // 3. Juntar todo en el Map para evitar duplicados (ahora tipado como EnergySource)
  const sourceMap = new Map<Id<EnergySource>, EnergySource>();
  const allContainers = [...powerBankContainers, ...roomContainers];

  for (const c of allContainers) {
    if (typeof c !== 'string') {
      sourceMap.set(c.id, c);
    }
  }

  for (const r of droppedEnergy) {
    sourceMap.set(r.id, r);
  }

  const allSources = Array.from(sourceMap.values());

  // 4. ORDENAR POR EL MÁS CERCANO (Como pediste)
  return allSources.sort((a, b) => {
    const distA = creep.pos.getRangeTo(a);
    const distB = creep.pos.getRangeTo(b);
    return distA - distB;
  });

  /*
  // NOTA: Si después prefieres volver a ordenarlos por el que tenga MÁS ENERGÍA, usa esto:
  return allSources.sort((a, b) => {
    const energyA = 'amount' in a ? a.amount : a.store.getUsedCapacity(RESOURCE_ENERGY);
    const energyB = 'amount' in b ? b.amount : b.store.getUsedCapacity(RESOURCE_ENERGY);
    return energyB - energyA;
  });
  */
}
