import { CreepHaulerLocal, EnergySource } from '../types';
import { GetPowersBank } from 'utils/GetPowerBank';
import { getControllerContainer } from 'utils/GetControllerContainer';
import { isCachePile } from 'utils/EnergyCache';

export default function(creep: CreepHaulerLocal): EnergySource[] {
  const room = creep.room;
  const ControllerContainer = getControllerContainer(room);

  // 0. Obtener todos los links del cuarto
  const links = room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureLink => s.structureType === STRUCTURE_LINK
  });

  // Función auxiliar: ¿Esta posición está pegada (rango 1) a algún link?
  const isNearLink = (pos: RoomPosition) => {
      return links.some(link => link.pos.inRangeTo(pos, 1));
  };

  // 1. Obtener Contenedores Generales del cuarto
  const roomContainers = room.find(FIND_STRUCTURES, {
      filter: (s): s is StructureContainer => {
          if (s.structureType !== STRUCTURE_CONTAINER) return false;
          if (ControllerContainer && s.id === ControllerContainer.id) return false;
          if (isNearLink(s.pos)) return false;
          return true;
      }
  });

  // 2. Procesar los Power Banks (Convertir Set<string> a objetos reales)
  const powerBankIds = GetPowersBank();
  const validPowerBanks: StructureContainer[] = [];

  for (const id of powerBankIds) {
      const container = Game.getObjectById<StructureContainer>(id as Id<StructureContainer>);

      // 🛑 EL FIX: Validamos que el contenedor esté en el MISMO CUARTO que el creep
      if (container && container.room.name === creep.room.name && !isNearLink(container.pos)) {
          validPowerBanks.push(container);
      }
  }

  // 3. Obtener Energía en el suelo (menos la caché de los builders: esa se deja ahí)
  const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
      filter: (r) => r.resourceType === RESOURCE_ENERGY && !isNearLink(r.pos) && !isCachePile(r)
  });

  // 4. Juntar todo en el Map para evitar duplicados
  const sourceMap = new Map<Id<EnergySource>, EnergySource>();

  for (const c of validPowerBanks) {
      sourceMap.set(c.id, c);
  }

  for (const c of roomContainers) {
      sourceMap.set(c.id, c);
  }

  for (const r of droppedEnergy) {
      sourceMap.set(r.id, r);
  }

  const allSources = Array.from(sourceMap.values());

  // 5. ORDENAR POR EL MÁS CERCANO
  return allSources.sort((a, b) => {
      const distA = creep.pos.getRangeTo(a);
      const distB = creep.pos.getRangeTo(b);
      return distA - distB;
  });
}
