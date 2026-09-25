type state = "COLLECTING" | "DEPOSITING"
export type EnergySource = StructureContainer | Resource;
export interface CreepHaulerLocalMemory extends CreepMemory {
    role: 'HaulerLocal'
    state: state
    target: Id<EnergySource> | undefined
}

export interface CreepHaulerLocal extends Creep {
    memory: CreepHaulerLocalMemory
}
