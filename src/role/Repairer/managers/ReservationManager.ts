import { RepairerCreep } from "../types";

export default class ReservationManager {
    /**
     * Obtiene una lista (Set) de todos los IDs de estructuras que
     * ya están siendo reparadas por OTROS repairers.
     */
    public static getReservedIds(currentCreep: RepairerCreep): Set<string> {
        const reservedIds = new Set<string>();

        for (const name in Game.creeps) {
            if (name === currentCreep.name) continue; // Ignorarnos a nosotros mismos

            const otherCreep = Game.creeps[name] as RepairerCreep;

            if (otherCreep.memory.role === 'repairer' && otherCreep.memory.targetId) {
                reservedIds.add(otherCreep.memory.targetId);
            }
        }

        return reservedIds;
    }

    /**
     * Asigna un objetivo de forma segura (con el bypass para TypeScript).
     */
    public static assign(creep: RepairerCreep, targetId: string): void {
        creep.memory.targetId = targetId as Id<AnyStructure>;
    }

    /**
     * Libera el objetivo actual del creep.
     */
    public static clear(creep: RepairerCreep): void {
        delete creep.memory.targetId;
    }
}
