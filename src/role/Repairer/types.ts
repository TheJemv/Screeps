export interface LocalRepairerMemory extends CreepMemory {
    role: 'repairer';
    working: boolean;
    targetId?: Id<AnyStructure>;
    targetContainerId?: Id<StructureContainer>;
    homeRoom: string
}

export type RepairerCreep = Omit<Creep, 'memory'> & {
    memory: LocalRepairerMemory;
};
