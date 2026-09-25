import { CreepHaulerCore } from '../types';
import getClosestPowerBanks from '../utils/getClosestPowerBanks';

export default function(creep: CreepHaulerCore): void {
  const storage = creep.room.storage;

  //  1.  Get from Storage
  if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) >= creep.store.getCapacity()) {
    if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(storage, {
        visualizePathStyle: { stroke: '#ffaa00' }
      });
    }

    return
  }

  //  2. Get Power Banks - Temporal...
  const target = getClosestPowerBanks(creep)[0]
  if (target && target.store.getUsedCapacity(RESOURCE_ENERGY) !== 0) {
    if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(target, {
        visualizePathStyle: { stroke: '#ffaa00' }
      })
    }
  }

  return
}
