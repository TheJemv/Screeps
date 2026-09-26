import RoleHealer from "../roles/Healer";
import RoleMelee from "../roles/Melee";
import RoleRanged from "../roles/Ranged";
import { WarCreepMemory } from "../types";

export default class SquadManager {
    public static runSquad(squadId: string, creeps: Creep[]): void {
        const leader = creeps.find(c => (c.memory as WarCreepMemory).squadRole === 'Leader');

        if (creeps.some(c => c.spawning)) return;

        this.updateState(squadId, creeps);

        for (const creep of creeps) {
            const mem = creep.memory as WarCreepMemory;
            if (mem.squadRole === 'Leader' || mem.squadRole === 'Escort') {
                RoleMelee.run(creep, leader, creeps);
            } else if (mem.squadRole === 'Ranged') {
                RoleRanged.run(creep, leader);
            } else if (mem.squadRole === 'Follower') {
                RoleHealer.run(creep, creeps);
            }
        }
    }

    private static updateState(squadId: string, creeps: Creep[]): void {
        const attackFlag = Game.flags[`Attack_${squadId}`];
        const state = attackFlag ? 'Attacking' : 'Patrolling';

        for (const creep of creeps) {
            (creep.memory as WarCreepMemory).state = state;
        }
    }
}
