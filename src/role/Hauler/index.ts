import { HaulerCreep } from "./types";
import { collectEnergy } from "./services/collect";
import { deliverEnergy } from "./services/deliver";
import { moveToRoad } from "utils/MoveToRoad";

export default {
    run(creep: Creep): void {
        const hauler = creep as HaulerCreep;

        // Si quedó fuera de su room de origen (ej: un targetContainerId viejo
        // de antes del fix que lo mandó a otro lado), priorizar volver a casa
        // antes que nada -- ninguna prioridad de deliver/parking sirve en un
        // room que no es el suyo.
        if (hauler.memory.room && hauler.room.name !== hauler.memory.room) {
            moveToRoad(hauler, Game.spawns.Spawn1, { range: 3 });
            return;
        }

        if (hauler.memory.delivering === undefined) {
            hauler.memory.delivering = false;
        }

        // Transición a DELIVERING: Se vacía la reserva
        if (!hauler.memory.delivering && hauler.store.getFreeCapacity() === 0) {
            hauler.memory.delivering = true;
            delete hauler.memory.targetContainerId;
            hauler.say('🚚 deliver');
        }

        // Transición a COLLECTING
        if (hauler.memory.delivering && hauler.store[RESOURCE_ENERGY] === 0) {
            hauler.memory.delivering = false;
            delete hauler.memory.targetContainerId;
            delete hauler.memory.deliverTargetId;
            hauler.say('🔄 collect');
        }

        // Ejecutar estado actual
        if (hauler.memory.delivering) {
            deliverEnergy(hauler);
        } else {
            collectEnergy(hauler);
        }
    }
};
