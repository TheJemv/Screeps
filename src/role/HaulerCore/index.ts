import CollectTask from './tasks/collect';
import { CreepHaulerCore } from './types';
import DepositTask from './tasks/deposit';
import depositControllerContainer from './tasks/depositControllerContainer';

export default {
    run(creep: CreepHaulerCore): void {
      if (!creep.memory.state) {
        creep.memory.state = 'COLLECTING';
      }

      const ruleDeposit = creep.memory.state === 'COLLECTING' && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
      if (ruleDeposit) {
        creep.memory.state = 'DEPOSITING';
        creep.say('🚚 deposit');
      }

      const ruleCollecting = creep.memory.state === 'DEPOSITING' && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
      if (ruleCollecting) {
        creep.memory.state = 'COLLECTING';
        creep.say('🔄 collect');
      }

      if (creep.memory.state === 'COLLECTING') {
        CollectTask(creep);
      } else {
        DepositTask(creep);

        if (!creep.memory.targets || creep.memory.targets.length === 0) {
          const assigned = depositControllerContainer(creep);

          if (assigned) {
            DepositTask(creep);
          } else {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                creep.memory.state = 'COLLECTING';
                creep.say("🔄 Refill");
            }
          }
        }
      }
    }
}
