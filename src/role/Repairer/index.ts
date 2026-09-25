import { RepairerCreep } from "./types";
import { collectEnergy } from "./services/collect";
import { repairStructures } from "./services/repair";

export default {
    run(creep: Creep): void {
        const repairer = creep as RepairerCreep;

        if (repairer.memory.working === undefined) {
            repairer.memory.working = false;
        }

        // Transición a REPARAR (Mochila llena)
        if (!repairer.memory.working && repairer.store.getFreeCapacity() === 0) {
            repairer.memory.working = true;
            delete repairer.memory.targetContainerId; // Libera la reserva para otros creeps
            repairer.say('🛠️ repair');
        }

        // Transición a RECOLECTAR (Mochila vacía)
        if (repairer.memory.working && repairer.store[RESOURCE_ENERGY] === 0) {
            repairer.memory.working = false;
            delete repairer.memory.targetId;
            delete repairer.memory.targetContainerId;
            repairer.say('🔄 refill');
        }

        // Ejecutar estado
        if (repairer.memory.working) {
            repairStructures(repairer);
        } else {
            collectEnergy(repairer);
        }
    }
};
