// src/war/roles/Ranged/index.ts
//
// Ranged: disparan desde atrás (rango 3).
//   - rangedMassAttack cuando rinde más que un disparo (varios enemigos pegados),
//     nunca con aliados cerca (le pega a todo lo que tenga dueño ajeno).
//   - si no: el objetivo del pelotón, un creep enemigo, o (en el room atacado) la
//     estructura enemiga más importante en rango.
import type { WarCreep } from "../../types";
import { alliesNear, bestCreep, hostileStructuresIn, hostilesIn } from "../../utils/combat";
import type { CombatContext } from "../context";
import { bestAdjacentStructure } from "../Melee";

/** Daño relativo de rangedMassAttack por distancia (1, 2, 3). */
const MASS = [0, 10, 4, 1];

export default class RoleRanged {
    public static act(creep: WarCreep, ctx: CombatContext): void {
        if (creep.getActiveBodyparts(RANGED_ATTACK) === 0) return;
        const room = creep.room;
        const siege = room.name === ctx.siegeRoom;

        const creeps = hostilesIn(room).filter(h => creep.pos.inRangeTo(h, 3));
        const structures = siege ? hostileStructuresIn(room).filter(s => creep.pos.inRangeTo(s, 3)) : [];

        let mass = 0;
        for (const t of [...creeps, ...structures]) mass += MASS[Math.max(1, creep.pos.getRangeTo(t))] ?? 0;

        let single: AnyStructure | Creep | undefined;
        let value = 0;
        const focus = ctx.focus;
        if (focus && focus.pos.roomName === room.name && creep.pos.inRangeTo(focus, 3) && (siege || !("structureType" in focus))) {
            single = focus;
            value = 20;
        } else {
            single = bestCreep(creeps, room) ?? (siege ? bestAdjacentStructure(creep, 3) : undefined);
            value = single ? 10 : 0;
        }

        if (mass > value && !alliesNear(creep.pos, 3)) {
            creep.rangedMassAttack();
        } else if (single) {
            creep.rangedAttack(single);
        }
    }
}
