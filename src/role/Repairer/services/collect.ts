import { RepairerCreep } from "../types";
import { withdrawFromPowerBank } from "utils/EnergyReservations";

export function collectEnergy(creep: RepairerCreep): void {
    // Intenta reservar y retirar energía de los contenedores mineros ( GetPowersBank )
    // Mantiene rango 1 automáticamente para no estorbar a los mineros
    withdrawFromPowerBank(creep, 100);
}
