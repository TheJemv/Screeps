import { AdvancedMove } from "utils/AdvancedMove";
import TargetManager from "../managers/TargetManager";
import { RepairerCreep } from "../types";
import { repairPassing } from "../utils/repairPassing";

const GREEN: PolyStyle = { stroke: '#00ff00' };

/**
 * Repara su objetivo hasta el 100% (o el tope de muros). Si no tiene, toma el
 * más urgente que esté libre (ver managers/TargetManager). Devuelve false si
 * no hay nada que reparar: index.ts lo manda a esperar a casa.
 */
export function repairStructures(creep: RepairerCreep): boolean {
    const target = TargetManager.current(creep) ?? TargetManager.pick(creep);
    if (!target) return false;

    const result = creep.repair(target);

    if (result === ERR_NOT_IN_RANGE) {
        repairPassing(creep);
        if (AdvancedMove.travel(creep, target, { range: 3, visualizePathStyle: GREEN }) === ERR_NO_PATH) {
            TargetManager.skip(creep, target.id); // sin camino: que no se quede parado para siempre
        }
    } else if (result !== OK) {
        TargetManager.skip(creep, target.id); // el motor no deja repararla
    }

    return true;
}
