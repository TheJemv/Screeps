import { CreepHaulerCore, EnergyStructure } from '../types';

export default class ReservationManager {
  private static getGlobalReservedTargetIds(currentCreepName: string): Set<string> {
    const reserved = new Set<string>();

    for (const name in Game.creeps) {
      if (name === currentCreepName) continue;

      const creep = Game.creeps[name] as CreepHaulerCore;

      if (creep.memory && creep.memory.role === 'HaulerCore' && creep.memory.targets) {
        for (const targetId of creep.memory.targets) {
          reserved.add(targetId);
        }
      }
    }

    return reserved;
  }

  public static post(
    creep: CreepHaulerCore,
    candidateTargets: EnergyStructure[]
  ): EnergyStructure[] {
    const reservedIds = this.getGlobalReservedTargetIds(creep.name);
    const approvedTargets: EnergyStructure[] = [];
    const approvedIds: Id<EnergyStructure>[] = [];

    for (const target of candidateTargets) {
      if (!reservedIds.has(target.id)) {
        approvedTargets.push(target);
        approvedIds.push(target.id);
        reservedIds.add(target.id);
      }
    }

    creep.memory.targets = approvedIds;

    return approvedTargets;
  }

  public static delete(creep: CreepHaulerCore, targetId?: Id<EnergyStructure>): void {
    if (!creep.memory.targets || creep.memory.targets.length === 0) return;

    if (targetId) {
      creep.memory.targets = creep.memory.targets.filter(id => id !== targetId);
    } else {
      creep.memory.targets.shift();
    }
  }

  public static getUnreservedTargets(
    creep: CreepHaulerCore,
    candidateTargets: EnergyStructure[]
  ): EnergyStructure[] {
    const reservedIds = this.getGlobalReservedTargetIds(creep.name);
    return candidateTargets.filter(target => !reservedIds.has(target.id));
  }
}
