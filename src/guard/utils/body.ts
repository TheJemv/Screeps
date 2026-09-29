// src/guard/utils/body.ts
import { GUARD_CONFIG } from "../config";

const MAX_PARTS = 50;

/**
 * Cuerpo de vigilante para `energy`: recorre PART_CYCLE agregando cada parte
 * con su MOVE (1:1 = velocidad completa en plano). Si una parte no entra,
 * prueba con las siguientes, así no se desperdicia energía.
 *
 * Orden final: ataque primero (absorbe el daño), MOVE en el medio y HEAL al
 * final (lo último en romperse: puede seguir curándose y escapando).
 */
export function buildBody(energy: number): { body: BodyPartConstant[]; cost: number } {
    const combat: BodyPartConstant[] = [];
    let cost = 0;
    let added = true;

    while (added) {
        added = false;
        for (const part of GUARD_CONFIG.SPAWN.PART_CYCLE) {
            if ((combat.length + 1) * 2 > MAX_PARTS) break;

            const partCost = BODYPART_COST[part] + BODYPART_COST[MOVE];
            if (cost + partCost > energy) continue;

            combat.push(part);
            cost += partCost;
            added = true;
        }
    }

    const count = (type: BodyPartConstant) => combat.filter(p => p === type).length;
    const others = combat.filter(p => p !== RANGED_ATTACK && p !== ATTACK && p !== HEAL);
    const body: BodyPartConstant[] = [
        ...others,
        ...Array<BodyPartConstant>(count(RANGED_ATTACK)).fill(RANGED_ATTACK),
        ...Array<BodyPartConstant>(count(ATTACK)).fill(ATTACK),
        ...Array<BodyPartConstant>(combat.length).fill(MOVE),
        ...Array<BodyPartConstant>(count(HEAL)).fill(HEAL)
    ];

    return { body, cost };
}
