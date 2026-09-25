export interface LocalRepairerMemory {
    role: 'repairer';
    working: boolean;
    targetId?: Id<StructureContainer | StructureExtension | StructureRoad>;
    targetContainerId?: Id<StructureContainer>;
    homeRoom: string
}

export type RepairerCreep = Omit<Creep, 'memory'> & {
    memory: CreepMemory & LocalRepairerMemory;
};
