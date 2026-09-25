import { CreepHaulerLocal, CreepHaulerLocalMemory, EnergySource } from '../types';
import ContainerAssigner from '../managers/ContainerAssigner';
import getSortedContainers from '../utils/getSortedContainers'; // Importamos EnergySource

export function runCollectTask(creep: CreepHaulerLocal): void {

  const creepCapacity = creep.store.getCapacity(RESOURCE_ENERGY);

  // 1. Cambiamos el tipado para que acepte tanto contenedores como recursos del suelo
  let targetSource: EnergySource | null = null;

  // ---------------------------------------------------------------------------
  // 1. VERIFICACIÓN PASIVA (Cada tick)
  // ---------------------------------------------------------------------------
  if (creep.memory.target) {
    // Le decimos explícitamente a TypeScript qué tipo de objeto esperamos
    const currentTarget = Game.getObjectById(creep.memory.target) ;

    if (!currentTarget) {
      ContainerAssigner.clear(creep);
    } else {
      // 2. Comprobamos de manera segura cuánta energía tiene
      const availableEnergy = 'amount' in currentTarget
        ? currentTarget.amount
        : currentTarget.store.getUsedCapacity(RESOURCE_ENERGY);

      if (availableEnergy < creepCapacity) {
        ContainerAssigner.clear(creep);
      } else {
        targetSource = currentTarget;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. BUSCAR NUEVO TARGET (Si no tiene o si el anterior fue descartado)
  // ---------------------------------------------------------------------------
  if (!targetSource) {
    const sortedContainers = getSortedContainers(creep);
    targetSource = ContainerAssigner.assign(
      creep,
      sortedContainers,
      creepCapacity
    );
  }

  // ---------------------------------------------------------------------------
  // 3. EJECUCIÓN Y VERIFICACIÓN ACTIVA (Al tomar energía)
  // ---------------------------------------------------------------------------
  if (targetSource) {
    if (creep.pos.isNearTo(targetSource)) {

      const isResource = 'amount' in targetSource;
      const availableEnergy = isResource
        ? (targetSource as Resource).amount
        : (targetSource as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY);

      const freeSpaceInCreep = creep.store.getFreeCapacity(RESOURCE_ENERGY);

      // 3. Usamos pickup si es recurso del suelo, withdraw si es contenedor
      const result = isResource
        ? creep.pickup(targetSource as Resource)
        : creep.withdraw(targetSource as StructureContainer, RESOURCE_ENERGY);

      if (result === OK) {
        const energyExtracted = Math.min(availableEnergy, freeSpaceInCreep);
        const remainingEnergy = availableEnergy - energyExtracted;

        if (remainingEnergy < creepCapacity) {
          ContainerAssigner.clear(creep);
        }
      }
    } else {
      creep.moveTo(targetSource, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
  } else {
    // ---------------------------------------------------------------------------
    // 4. LÓGICA DE RELEVO (BUCKET BRIGADE)
    // ---------------------------------------------------------------------------
    const alliesToRelay = creep.room.find(FIND_MY_CREEPS, {
      filter: (c) => {
        const mem = c.memory as CreepHaulerLocalMemory;
        return (
          mem.role === 'HaulerLocal' &&
          mem.state === 'DEPOSITING' && // El compañero viene lleno
          mem.target !== undefined &&   // El compañero planea volver por más energía
          c.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        );
      }
    });

    if (alliesToRelay.length > 0) {
      const furthestAlly = alliesToRelay.sort((a, b) => {
        const distA = creep.pos.getRangeTo(a);
        const distB = creep.pos.getRangeTo(b);
        return distB - distA; // Descendente: el índice [0] será el más lejano
      })[0];

      if (furthestAlly) {
        creep.moveTo(furthestAlly, { visualizePathStyle: { stroke: "#00ff00", lineStyle: "dashed" } })
        creep.say('🤝 Relevo');
      }
    } else {
      creep.say('💤 Idle');
    }
  }
}
