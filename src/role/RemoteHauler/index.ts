import { RemoteHaulerCreep } from "./types";
import { collectRemoteEnergy } from "./services/collect";
import { deliverRemoteEnergy } from "./services/deliver";
import { retireToSpawn, shouldRetire } from "./services/retire";

export default {
    run(creep: Creep): void {
        const hauler = creep as RemoteHaulerCreep;
        if (!hauler.memory.homeRoom) {
            hauler.memory.homeRoom = hauler.room.name;
        }

        if (shouldRetire(hauler)) {
            retireToSpawn(hauler);
            return;
        }

        // Gestión de estados (Lleno vs Vacío)
        if (hauler.memory.working && hauler.store[RESOURCE_ENERGY] === 0) {
            hauler.memory.working = false;
            hauler.say('🔄 Ir a mina');
        }
        if (!hauler.memory.working && hauler.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            hauler.memory.working = true;
            hauler.say('📦 A casa');
        }

        // Ejecución de servicios según el estado
        if (!hauler.memory.working) {
            collectRemoteEnergy(hauler);
        } else {
            deliverRemoteEnergy(hauler);
        }
    }
};
