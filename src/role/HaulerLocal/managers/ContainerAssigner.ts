import { CreepHaulerLocal, EnergySource } from '../types';

export default class ContainerAssigner {
  private static getClaimedContainerIds(currentCreepName: string): Set<string> {
    const claimed = new Set<string>();
    for (const name in Game.creeps) {
      if (name === currentCreepName) continue;

      const creep = Game.creeps[name] as CreepHaulerLocal;
      if (creep.memory && creep.memory.role === 'HaulerLocal' && creep.memory.target) {
        claimed.add(creep.memory.target);
      }
    }

    return claimed;
  }

  public static assign(
    creep: CreepHaulerLocal,
    sortedSources: EnergySource[] ,
    requiredCapacity: number
  ): EnergySource | null {
    const claimedIds = this.getClaimedContainerIds(creep.name);

    for (const source of sortedSources) {
      const availableEnergy = 'amount' in source
        ? source.amount
        : source.store.getUsedCapacity(RESOURCE_ENERGY);

      if (availableEnergy >= requiredCapacity && !claimedIds.has(source.id)) {
        creep.memory.target = source.id;
        return source;
      }
    }

    creep.memory.target = undefined;
    return null;
  }

  public static clear(creep: CreepHaulerLocal): void {
    creep.memory.target = undefined;
  }
}
