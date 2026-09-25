// Define el tipo de estructuras que usas
export type EnergyStructure = StructureSpawn | StructureExtension | StructureContainer;
export type State = "COLLECTING" | "DEPOSITING"

// 1. La Memoria guarda únicamente las IDs (Strings con tipado fuerte de Screeps)
export interface CreepHaulerCoreMemory extends CreepMemory {
  targets?: Id<EnergyStructure>[];
  state?: State
}

// 2. Extiendes la interfaz nativa del Creep apuntando a tu interfaz de memoria
export interface CreepHaulerCore extends Creep {
  memory: CreepHaulerCoreMemory;
}
