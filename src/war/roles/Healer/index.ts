// src/war/roles/Healer/index.ts
//
// Healer (en medio de la formación): cura al que más lo necesita a su alcance
// (pegado cura x3 que a distancia). El pelotón primero, después otros creeps míos.
// Si nadie está herido pero están en territorio enemigo, PRE-cura al líder: el
// daño y la curación del mismo tick se suman, así el golpe de la torre llega ya
// compensado.
import type { Squad, WarCreep } from "../../types";
import { healPower } from "../../utils/combat";
import { roleOf } from "../../utils/roles";
import type { CombatContext } from "../context";

export default class RoleHealer {
    public static act(creep: WarCreep, squad: Squad, ctx: CombatContext): void {
        const power = healPower(creep);
        if (power === 0) return;

        let best: Creep | undefined;
        let bestValue = 0;
        for (const c of creep.pos.findInRange(FIND_MY_CREEPS, 3)) {
            const missing = c.hitsMax - c.hits;
            if (missing <= 0) continue;
            const amount = creep.pos.isNearTo(c) ? power : power / 3;
            const value = Math.min(missing, amount) * (squad.names.has(c.name) ? 1.5 : 1) + missing / 1000;
            if (value > bestValue) {
                best = c;
                bestValue = value;
            }
        }

        if (!best && ctx.danger) {
            best = squad.creeps.find(c => roleOf(c) === "Leader" && creep.pos.inRangeTo(c, 3)) ?? creep;
        }
        if (!best) return;

        if (creep.pos.isNearTo(best)) creep.heal(best);
        else creep.rangedHeal(best);
    }
}
