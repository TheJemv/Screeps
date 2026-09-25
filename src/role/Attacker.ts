import { ATTACK_FLAG_NAME, SAVE_FLAG_PREFIX } from "config";
import { getHostileCreeps, getHostileStructures } from "utils/Attack";
import { moveToRoad } from "utils/MoveToRoad";

// Qué tan lejos "ve" una amenaza y se desvía de su objetivo para pelear en vez de
// esperar a tenerlo pegado. No implica quedarse a esa distancia: siempre se acerca
// hasta poder pegarle (attack() es cuerpo a cuerpo, rango 1).
const ENGAGE_RANGE = 3;

/** ¿Este hostil puede pelear? Se prioriza sobre harvesters/haulers/etc sin armas. */
function isAttackerCreep(creep: Creep): boolean {
    return creep.body.some(p => p.type === ATTACK || p.type === RANGED_ATTACK);
}

/** El hostil más urgente cerca del creep: primero los que pelean, y entre esos el más cercano. */
function priorityTarget(creep: Creep): Creep | undefined {
    const nearby = getHostileCreeps(creep.room).filter(c => creep.pos.inRangeTo(c, ENGAGE_RANGE));
    if (nearby.length === 0) return undefined;

    const attackers = nearby.filter(isAttackerCreep);
    const pool = attackers.length > 0 ? attackers : nearby;

    return creep.pos.findClosestByRange(pool) ?? undefined;
}

/** Flags Save_1, Save_2... las que haya puestas (puede ser una sola o varias). */
function saveFlags(): Flag[] {
    return Object.values(Game.flags).filter(f => f.name.startsWith(SAVE_FLAG_PREFIX));
}

/** Sin bandera de ataque: replegarse y repartirse entre los Save_N que existan. */
function guard(creep: Creep): void {
    const flags = saveFlags();
    if (flags.length === 0) return;

    let saveFlagName = creep.memory.saveFlag;
    if (saveFlagName && !Game.flags[saveFlagName]) saveFlagName = undefined;

    if (!saveFlagName) {
        // Balancea: cada creep va al Save_N con menos gente asignada.
        let mejor = flags[0];
        let menorConteo = Infinity;
        for (const f of flags) {
            const asignados = _.filter(Game.creeps, c => c.memory.role === "attacker" && c.memory.saveFlag === f.name).length;
            if (asignados < menorConteo) {
                menorConteo = asignados;
                mejor = f;
            }
        }
        saveFlagName = mejor.name;
    }
    creep.memory.saveFlag = saveFlagName;

    const flag = Game.flags[saveFlagName];
    if (!creep.pos.isEqualTo(flag.pos)) moveToRoad(creep, flag);
}

export default {
    run(creep: Creep): void {
        // Regla pareja en cualquier modo: si hay un hostil cerca, se pelea antes que nada.
        const enemy = priorityTarget(creep);
        if (enemy) {
            if (creep.attack(enemy) === ERR_NOT_IN_RANGE) moveToRoad(creep, enemy);
            return;
        }

        const flag = Game.flags[ATTACK_FLAG_NAME];
        if (!flag) {
            guard(creep);
            return;
        }
        delete creep.memory.saveFlag;

        // Objetivo por defecto: la estructura hostil más cercana a la bandera (su spawn).
        const structure = flag.room && flag.pos.findClosestByRange(getHostileStructures(flag.room));
        if (structure) {
            if (creep.attack(structure) === ERR_NOT_IN_RANGE) moveToRoad(creep, structure);
            return;
        }

        moveToRoad(creep, flag);
    }
};
