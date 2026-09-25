import { CreepHaulerLocal, CreepHaulerLocalMemory } from './types';
import { runCollectTask } from './tasks/collect';

export default {
    run(creep: CreepHaulerLocal): void {
        if (!creep.memory.state) {
            creep.memory.state = 'COLLECTING';
        }

        // Transiciones de estado
        if (creep.memory.state === 'COLLECTING' && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.state = 'DEPOSITING';
            creep.say('🚚 Storage');
        }

        if (creep.memory.state === 'DEPOSITING' && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            creep.memory.state = 'COLLECTING';
            creep.say('🔄 Container');
        }

        // Ejecución según el estado
        if (creep.memory.state === 'COLLECTING') {
            runCollectTask(creep);
        } else {
            const nearbyRelay = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
                filter: (c) => {
                    const mem = c.memory as CreepHaulerLocalMemory;
                    return mem.role === 'HaulerLocal' && mem.state === 'COLLECTING';
                }
            });

            if (nearbyRelay.length > 0) {
                creep.transfer(nearbyRelay[0], RESOURCE_ENERGY);
                creep.say('📦 Toma!');
            } else {
                const storage = creep.room.storage;
                if (storage) {
                    if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                }
            }
        }
    }
}
