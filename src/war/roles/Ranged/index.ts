import CombatMove from "../../utils/CombatMove";
import Targeting from "../../utils/Targeting";
import { WarCreepMemory } from "../../types";

export default class RoleRanged {
    public static run(creep: Creep, leader: Creep | undefined): void {
        const mem = creep.memory as WarCreepMemory;
        const attackFlag = Game.flags[`Attack_${mem.squadId}`];

        const hostile = Targeting.getOpportunityTarget(creep, 3);
        if (hostile) creep.rangedAttack(hostile);

        if (leader) {
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
