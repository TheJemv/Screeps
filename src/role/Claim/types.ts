export interface LocalClaimMemory {
    role: 'claim';
    claimFlag?: string;
}

export type ClaimCreep = Omit<Creep, 'memory'> & {
    memory: CreepMemory & LocalClaimMemory;
};
