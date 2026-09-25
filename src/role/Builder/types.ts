export interface LocalBuilderMemory {
    role: 'builder';
    building: boolean;
    targetContainerId?: Id<StructureContainer>;
    targetSiteId?: Id<ConstructionSite>;
}

export type BuilderCreep = Omit<Creep, 'memory'> & {
    memory: CreepMemory & LocalBuilderMemory;
};
