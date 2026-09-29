import { CreepHaulerLocal, CreepHaulerLocalMemory } from './types';
import { AdvancedMove } from '../../utils/AdvancedMove';
import CacheManager from './managers/CacheManager';
import StandbyManager from './managers/StandbyManager';
import { cacheFlag } from 'utils/EnergyCache';
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
        if (creep.memory.state === 'STANDBY') {
            StandbyManager.run(creep); // sin trabajo: se llena y espera fuera de las roads
            return;
        }

        if (creep.memory.state === 'COLLECTING') {
            CacheManager.release(creep); // vacío: si tenía el turno de caché, ya lo terminó
            runCollectTask(creep);
            return;
        }

        // =========================================================================
        // 1. 🏁 CACHÉ PARA BUILDERS (bandera Cache_Energy)
        // =========================================================================
        // Solo UNO a la vez, y solo si la caché está baja. El que la toma no se
        // distrae con nada más hasta vaciarse ahí; el otro sigue con lo normal.
        if (CacheManager.hasDuty(creep)) {
            CacheManager.deliver(creep);
            return;
        }

        // =========================================================================
        // 2. 🤝 RELEVO: un compañero vino a buscar mi carga
        // =========================================================================
        const nearbyRelay: CreepHaulerLocal[] = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
            filter: (c) => {
                const mem = c.memory as CreepHaulerLocalMemory;
                return mem.role === 'HaulerLocal' && mem.state === 'COLLECTING';
            }
        });

        if (nearbyRelay.length > 0 && nearbyRelay[0].memory.relayTarget === creep.id) {
            creep.transfer(nearbyRelay[0], RESOURCE_ENERGY);
            creep.say('📦 Toma!');
            return;
        }

        // =========================================================================
        // 3. 🏦 STORAGE
        // =========================================================================
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                AdvancedMove.travel(creep, storage, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
            }
            return; // 🛑 Cumplió con su deber principal, termina aquí.
        }

        // =========================================================================
        // 4. ÚLTIMO RECURSO: sin storage (o lleno) -> igual a la caché, aunque no esté baja
        // =========================================================================
        if (cacheFlag()) {
            CacheManager.deliver(creep);
        }
    }
}
