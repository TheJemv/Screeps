import { RepairerCreep } from "./types";
import { REPAIRER_CONFIG } from "./config";
import { collectEnergy } from "./services/collect";
import { repairStructures } from "./services/repair";
import StandbyManager from "./managers/StandbyManager";

export default {
    run(creep: Creep): void {
        const repairer = creep as RepairerCreep;
        const memory = repairer.memory;

        // Casa = donde nació. El Spawner (trySpawn) guarda `room`, no `homeRoom`:
        // sin esto, "casa" era el room donde estuviera parado en ese momento.
        if (!memory.homeRoom) {
            memory.homeRoom = memory.room ?? repairer.room.name;
        }

        if (memory.working === undefined) {
            memory.working = false;
        }

        // Transición a REPARAR (Mochila llena)
        if (!memory.working && repairer.store.getFreeCapacity() === 0) {
            memory.working = true;
            delete memory.targetContainerId; // Libera la reserva para otros creeps
            repairer.say('🛠️ repair');
        }

        // Transición a RECOLECTAR (Mochila vacía). El objetivo NO se suelta:
        // sigue reservado y al volver lo termina.
        if (memory.working && repairer.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
            repairer.say('🔄 refill');
        }

        // Ejecutar estado
        let busy: boolean;
        if (memory.working) {
            busy = repairStructures(repairer);
        } else {
            busy = collectEnergy(repairer);

            // No hay de dónde cargar: si ya trae algo, sale a trabajar con eso.
            if (!busy && repairer.store[RESOURCE_ENERGY] >= REPAIRER_CONFIG.MIN_ENERGY_TO_WORK) {
                memory.working = true;
                busy = repairStructures(repairer);
            }
        }

        // Sin trabajo o sin energía: a casa, estacionado fuera de las roads.
        if (busy) StandbyManager.leave(repairer);
        else StandbyManager.run(repairer);
    }
};
