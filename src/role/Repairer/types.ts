/** Casilla de espera. Mismo formato que la de HaulerLocal: los dos se respetan el lugar. */
export interface ParkSpot {
    x: number;
    y: number;
    room: string;
}

export interface LocalRepairerMemory extends CreepMemory {
    role: 'repairer';
    working: boolean;
    /** Room donde nació (su casa). El Spawner guarda `room`: index.ts lo copia acá la primera vez. */
    homeRoom: string;
    /** Estructura que está reparando. Queda reservada (ningún otro repairer la toma), también mientras recarga. */
    targetId?: Id<AnyStructure>;
    /** Container del que está sacando energía (reserva que respeta utils/EnergyReservations). */
    targetContainerId?: Id<StructureContainer>;
    /** Dónde espera cuando no hay nada que reparar (ver managers/StandbyManager). */
    park?: ParkSpot;
}

export type RepairerCreep = Omit<Creep, 'memory'> & {
    memory: LocalRepairerMemory;
};
