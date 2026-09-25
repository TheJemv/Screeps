import { BuilderCreep } from "./types";
import { collectEnergy } from "./services/collect";
import { doBuildWork } from "./services/build";

export default {
    run(creep: Creep): void {
        const builder = creep as BuilderCreep;

        if (builder.memory.building === undefined) {
            builder.memory.building = false;
        }

        // Transición a CONSTRUIR (Mochila llena)
        if (!builder.memory.building && builder.store.getFreeCapacity() === 0) {
            builder.memory.building = true;
            delete builder.memory.targetContainerId; // Libera reservas de energía
            builder.say('🔨 build');
        }

        // Transición a RECOLECTAR (Mochila vacía)
        if (builder.memory.building && builder.store[RESOURCE_ENERGY] === 0) {
            builder.memory.building = false;
            delete builder.memory.targetContainerId;
            builder.say('🔄 collect');
        }

        // Ejecución de la máquina de estados
        if (builder.memory.building) {
            doBuildWork(builder);
        } else {
            collectEnergy(builder);
        }
    }
};
