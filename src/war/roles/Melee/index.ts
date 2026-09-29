// src/war/roles/Melee/index.ts
//
// Líder y tanques: le pegan (attack) a lo que tengan AL LADO, en este orden:
//   1. el objetivo del pelotón (o el muro que tapa el paso)
//   2. un creep enemigo (el que no está bajo rampart, el que cura, el más herido)
//   3. en el room atacado: la estructura enemiga pegada más importante
// El movimiento lo decide la formación, no el rol.
import type { WarCreep } from "../../types";
import TargetManager from "../../managers/TargetManager";
import { bestCreep, hostilesIn, isAlly } from "../../utils/combat";
import type { CombatContext } from "../context";

export default class RoleMelee {
    public static act(creep: WarCreep, ctx: CombatContext): void {
        if (creep.getActiveBodyparts(ATTACK) === 0) return;
        const room = creep.room;
        const siege = room.name === ctx.siegeRoom;

        const focus = ctx.focus;
        if (focus && focus.pos.roomName === room.name && creep.pos.isNearTo(focus) && (siege || !("structureType" in focus))) {
            creep.attack(focus);
            return;
        }

        const enemy = bestCreep(
            hostilesIn(room).filter(h => creep.pos.isNearTo(h)),
            room
        );
        if (enemy) {
            creep.attack(enemy);
            return;
        }

        if (!siege) return;
        const structure = bestAdjacentStructure(creep);
        if (structure) creep.attack(structure);
    }
}

/** La estructura enemiga pegada más importante (muros y ramparts al final). */
export function bestAdjacentStructure(creep: WarCreep, range = 1): AnyStructure | undefined {
    const list = creep.pos.findInRange(FIND_STRUCTURES, range, {
        filter: s => {
            if (s.structureType === STRUCTURE_CONTROLLER || s.structureType === STRUCTURE_ROAD) return false;
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_CONTAINER) return true;
            const owned = s as AnyOwnedStructure;
            return owned.owner !== undefined && !owned.my && !isAlly(owned.owner.username);
        }
    });

    let best: AnyStructure | undefined;
    let bestScore = Infinity;
    for (const s of list) {
        const tier = TargetManager.tierOf(s);
        const score = tier * 1e9 + s.hits;
        if (score < bestScore) {
            best = s;
            bestScore = score;
        }
    }
    return best;
}
