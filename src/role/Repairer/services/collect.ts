import { RepairerCreep } from "../types";
import { withdrawFromPowerBank } from "utils/EnergyReservations";

export function collectEnergy(creep: RepairerCreep): void {
    // Intenta reservar y retirar energía de los contenedores mineros ( GetPowersBank )
    // Mantiene rango 1 automáticamente para no estorbar a los mineros
    const storage = creep.room.storage
    if (storage && storage.store[RESOURCE_ENERGY] > 5000) {
        if (storage.store[RESOURCE_ENERGY] >= 100) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage);
            }

            return;
        }
    }

    withdrawFromPowerBank(creep, 100);
}
