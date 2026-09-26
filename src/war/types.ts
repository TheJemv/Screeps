export type SquadRole = 'Leader' | 'Escort' | 'Ranged' | 'Follower';
export type WarState = 'Spawning' | 'Regrouping' | 'Patrolling' | 'Attacking';
export type SquadClass = 'Demolition' | 'Harass';

export interface WarCreepMemory extends CreepMemory {
    role: 'WarCreep';
    squadClass: SquadClass;
    squadRole: SquadRole;
    squadId: string;
    state: WarState;
    homeRoom: string;
}

export interface WarMemory {
    currentSquadIndex: number;
    squadDeployed: boolean;
}

declare global {
    interface Memory {
        war?: WarMemory;
    }
}
