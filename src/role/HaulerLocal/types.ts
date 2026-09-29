/** STANDBY: sin trabajo; se llena en el storage y espera estacionado fuera de las roads. */
type state = "COLLECTING" | "DEPOSITING" | "STANDBY"
export type EnergySource = StructureContainer | Resource;
export interface CreepHaulerLocalMemory extends CreepMemory {
    role: 'HaulerLocal';
    state: state;
    target: Id<EnergySource> | undefined;
    relayTarget?: Id<Creep>;
    /** Tiene el turno de llevar energía a la caché de los builders (ver managers/CacheManager). */
    cacheDuty?: boolean;
    /** Casilla donde se estaciona mientras está en STANDBY (ver managers/StandbyManager). */
    park?: { x: number; y: number; room: string };
}

export interface CreepHaulerLocal extends Creep {
    memory: CreepHaulerLocalMemory;
}
