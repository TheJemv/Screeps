// src/utils/AdvancedMove.ts

interface ScreepsMoveMemory {
    _move?: {
        path?: string;
    };
    lastPosX?: number;
    lastPosY?: number;
    stuckCount?: number;
    yieldTicks?: number; // Turnos que estará congelado cediendo el paso
}

export class AdvancedMove {
    public static travel(creep: Creep, destination: RoomPosition | _HasRoomPosition, opts?: MoveToOpts): void {
        const targetPos = (destination as _HasRoomPosition).pos || (destination as RoomPosition);
        const range = opts?.range || 1;

        const mem = creep.memory as CreepMemory & ScreepsMoveMemory;

        // Si ya llegó, limpiamos contadores
        if (creep.pos.getRangeTo(targetPos) <= range) {
            mem.stuckCount = 0;
            mem.yieldTicks = 0;
            return;
        }

        // Si está en período de rendimiento (cediendo el paso)
        if (mem.yieldTicks && mem.yieldTicks > 0) {
            mem.yieldTicks--;
            creep.say('💤 Cediendo');
            console.log(`[AdvancedMove] 💤 Creep ${creep.name} está cediendo el paso. Quedan ${mem.yieldTicks} ticks.`);
            return; // Se queda quieto para dejar pasar al otro
        }

        // 1. Detección de atasco por posición fija
        if (creep.fatigue === 0) {
            if (mem.lastPosX === creep.pos.x && mem.lastPosY === creep.pos.y) {
                mem.stuckCount = (mem.stuckCount || 0) + 1;
            } else {
                mem.stuckCount = 0;
            }
        }

        mem.lastPosX = creep.pos.x;
        mem.lastPosY = creep.pos.y;

        // =========================================================
        // 2. MOVIMIENTO CON DETECCIÓN DE BLOQUEO DIRECTO (ANTI-BAILE)
        // =========================================================
        const result = creep.moveTo(targetPos, {
            ...opts,
            reusePath: 3,         // 👈 CAMBIADO A 3: Rutas cortas para que reaccione al instante si el de adelante se quita
            ignoreCreeps: false,  // Obligatorio para detectar colisiones reales
            swampCost: 10         // 👈 CAMBIADO A 10: Penalización máxima al pantano para prohibir que se salgan al lodo inútilmente
        });

        // Si lleva 2 ticks atascado o el movimiento dio error por bloqueo
        if ((mem.stuckCount && mem.stuckCount >= 2) || result === ERR_NO_PATH || result === ERR_INVALID_TARGET) {
            console.log(`[AdvancedMove] 🚨 ATASCO DETECTADO: Creep ${creep.name} atascado en (${creep.pos.x}, ${creep.pos.y}) hacia ${targetPos.x},${targetPos.y}. Aplicando regla de desempate.`);

            // BUSCAR SI HAY UN CREEP ALIADO BLOQUEANDO ADYACENTE
            const blockingCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1);
            const otherCreep = blockingCreeps.find(c => c.name !== creep.name);

            if (otherCreep) {
                // ⚖️ DESEMPATE ALFABÉTICO DETERMINISTA:
                // El que tenga el nombre "mayor" alfabéticamente cede el paso. El otro avanza.
                if (creep.name > otherCreep.name) {
                    creep.say('🛑 Cedo');
                    mem.yieldTicks = 4; // Se congela 4 turnos y deja libre el espacio
                    mem.stuckCount = 0;
                    console.log(`[AdvancedMove] 🛑 ${creep.name} cede el paso a ${otherCreep.name} por orden alfabético.`);
                    return;
                } else {
                    creep.say('⚡ Forzando');
                    console.log(`[AdvancedMove] ⚡ ${creep.name} tiene prioridad sobre ${otherCreep.name}, recalculando ruta libre.`);
                }
            }

            // Si no hay otro creep directo pero sigue atascado, forzamos recálculo ignorando caché vieja
            creep.moveTo(targetPos, {
                ...opts,
                reusePath: 0,
                ignoreCreeps: false,
                swampCost: 10 // Mantiene el desprecio al pantano al recalcular de emergencia
            });
            mem.stuckCount = 0;
        }
    }
}
