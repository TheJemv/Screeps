// 1. Definimos la memoria exclusiva de este rol
export interface LocalHaulerMemory {
    role: string;
    delivering: boolean;
    targetContainerId?: Id<StructureContainer>;
}

// 2. Creamos un tipo de Creep que combina la memoria base de Screeps con la nuestra
export type HaulerCreep = Omit<Creep, 'memory'> & {
    memory: CreepMemory & LocalHaulerMemory;
};
