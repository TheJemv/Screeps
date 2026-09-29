import { CACHE_PILE_RANGE, cacheAmount, cacheFlag } from 'utils/EnergyCache';
import { CreepHaulerLocal, CreepHaulerLocalMemory } from '../types';
import { AdvancedMove } from 'utils/AdvancedMove';

/** Se rellena la caché cuando le queda menos que esto. */
const REFILL_BELOW = 300;

/**
 * Turno para llevar energía a la caché de los builders (bandera Cache_Energy).
 *
 *  - Solo UN HaulerLocal a la vez tiene el turno (memory.cacheDuty); el otro
 *    sigue con su trabajo normal (containers -> storage), por si surge algo
 *    con más prioridad.
 *  - El turno se toma solo si la caché bajó de REFILL_BELOW.
 *  - El que lo tiene no se distrae (ni relevo ni storage) hasta vaciar su
 *    carga junto a la bandera; recién ahí lo suelta.
 */
export default class CacheManager {
    /** ¿Tiene el turno, o lo puede tomar ahora? */
    public static hasDuty(creep: CreepHaulerLocal): boolean {
        const flag = cacheFlag();
        if (!flag || flag.pos.roomName !== creep.room.name) {
            this.release(creep);
            return false;
        }

        if (creep.memory.cacheDuty) return true;
        if (this.someoneElseOnDuty(creep) || cacheAmount() >= REFILL_BELOW) return false;

        creep.memory.cacheDuty = true;
        creep.say('🏁 Caché');
        return true;
    }

    /** Ir hasta la bandera y vaciar toda la carga pegado a ella. */
    public static deliver(creep: CreepHaulerLocal): void {
        const flag = cacheFlag();
        if (!flag) return;

        if (creep.pos.inRangeTo(flag, CACHE_PILE_RANGE)) {
            creep.drop(RESOURCE_ENERGY);
            creep.say('👇 Drop');
            return;
        }

        AdvancedMove.travel(creep, flag, {
            range: CACHE_PILE_RANGE,
            visualizePathStyle: { stroke: '#ffff00', lineStyle: 'dashed' }
        });
    }

    public static release(creep: CreepHaulerLocal): void {
        if (creep.memory.cacheDuty) delete creep.memory.cacheDuty;
    }

    /** Para el relevo: a un hauler con turno de caché no se le quita la carga. */
    public static isOnDuty(creep: Creep): boolean {
        return (creep.memory as CreepHaulerLocalMemory).cacheDuty === true;
    }

    private static someoneElseOnDuty(creep: CreepHaulerLocal): boolean {
        return _.some(Game.creeps, (c: Creep) => c.name !== creep.name && this.isOnDuty(c));
    }
}
