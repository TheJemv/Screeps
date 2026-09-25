export interface LocalLinkKeeperMemory {
    role: 'linkKeeper';
    linkKeeperFlag?: string;
}

export type LinkKeeperCreep = Omit<Creep, 'memory'> & {
    memory: CreepMemory & LocalLinkKeeperMemory;
};
