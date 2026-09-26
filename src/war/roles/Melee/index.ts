import CombatMove from "../../utils/CombatMove";
import Targeting from "../../utils/Targeting";
import { WarCreepMemory } from "../../types";

export default class RoleMelee {
    public static run(creep: Creep, leader: Creep | undefined, platoon: Creep[]): void {
        const mem = creep.memory as WarCreepMemory;
        const attackFlag = Game.flags[`Attack_${mem.squadId}`];

        const hostile = Targeting.getOpportunityTarget(creep, 1);
        if (hostile) creep.attack(hostile);

        if (mem.squadRole === 'Leader') {
            if (mem.state === 'Patrolling') {
                const saveFlag = Game.flags.Save;
                if (saveFlag && !creep.pos.inRangeTo(saveFlag, 15)) {
                    creep.moveTo(saveFlag, { visualizePathStyle: { stroke: '#ff0000' } });
                }
            } else if (mem.state === 'Attacking') {
                if (attackFlag && creep.room.name !== attackFlag.pos.roomName) {
                    CombatMove.leaderMove(creep, platoon, attackFlag.pos);
                    return;
                }
                const target = Targeting.getEconomyTarget(creep);
                if (target) {
                    if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                        if (!CombatMove.breach(creep)) {
                            CombatMove.leaderMove(creep, platoon, target.pos);
                        }
                    }
                } else if (attackFlag) {
                    CombatMove.leaderMove(creep, platoon, attackFlag.pos);
                }
            }
        } else if (mem.squadRole === 'Escort' && leader) {
            if (mem.state === 'Patrolling') {
                const saveFlag = Game.flags.Save;
                if (saveFlag && !creep.pos.inRangeTo(saveFlag, 15)) {
                    CombatMove.platoonMove(creep, leader, saveFlag.pos);
                }
            } else {
                const target = attackFlag ? attackFlag.pos : leader.pos;
                CombatMove.platoonMove(creep, leader, target);
            }
        }
    }
}
