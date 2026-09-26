import { WarCreepMemory } from "../../types";

export default class RoleHealer {
    public static run(creep: Creep, platoon: Creep[]): void {
        let targetToHeal: Creep | undefined;
        let lowestHitsPercent = 1.0;

        for (const c of platoon) {
            const hpPercent = c.hits / c.hitsMax;
            if (hpPercent < lowestHitsPercent) {
                lowestHitsPercent = hpPercent;
                targetToHeal = c;
            }
        }

        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        } else if (targetToHeal) {
            if (creep.pos.isNearTo(targetToHeal)) {
                creep.heal(targetToHeal);
            } else {
                creep.rangedHeal(targetToHeal);
            }
        }

        const leader = platoon.find(c => (c.memory as WarCreepMemory).squadRole === 'Leader');
        if (leader && !creep.pos.isNearTo(leader)) {
            creep.moveTo(leader, { visualizePathStyle: { stroke: '#00ff00' } });
        }
    }
}
