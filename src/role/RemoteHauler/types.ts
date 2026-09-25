export interface RemoteHaulerMemory extends CreepMemory {
    role: 'remoteHauler';
    working: boolean;
    targetContainerId?: Id<StructureContainer>; // ID del contenedor remoto asignado exclusivamente a este creep
    homeRoom: string;                            // Cuarto principal (casa)
}

export type RemoteHaulerCreep = Omit<Creep, 'memory'> & {
    memory: RemoteHaulerMemory
}
