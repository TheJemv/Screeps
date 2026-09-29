// src/utils/AdvancedMove/utils/moveHook.ts
//
// Envuelve Creep.prototype.move para enterarnos de CADA intención de
// movimiento del tick, venga de AdvancedMove o de cualquier otro lado
// (moveTo, moveByPath y MoveToRoad terminan llamando a this.move; está
// verificado en el código del motor, game/creeps.js).
//
// Solo OBSERVA: llama al move original, no cambia su resultado ni su
// comportamiento. Gracias a esto el TrafficManager nunca empuja a un creep que
// ya decidió moverse por su cuenta este tick.

type MoveTarget = DirectionConstant | Creep;
type MoveFn = (this: Creep, target: MoveTarget) => ScreepsReturnCode;
type MoveListener = (creep: Creep, target: MoveTarget) => void;

interface HookedPrototype {
    move: MoveFn;
    /** El move original del motor, guardado para no envolver dos veces. */
    advancedMoveOriginal?: MoveFn;
}

let installed = false;

/** Idempotente. Devuelve false si no hay Creep (ej: tests fuera del juego). */
export function installMoveHook(listener: MoveListener): boolean {
    if (installed) return true;
    if (typeof Creep === "undefined") return false;

    const proto = Creep.prototype as unknown as HookedPrototype;
    const original = proto.advancedMoveOriginal ?? proto.move;
    proto.advancedMoveOriginal = original;

    proto.move = function (this: Creep, target: MoveTarget): ScreepsReturnCode {
        const result = original.call(this, target);
        if (result === OK) {
            try {
                listener(this, target);
            } catch (err) {
                // Nunca romper el move de un rol por un fallo de registro.
                console.log(`[AdvancedMove] error registrando move de ${this.name}: ${String(err)}`);
            }
        }
        return result;
    };

    installed = true;
    return true;
}

export function isMoveHookInstalled(): boolean {
    return installed;
}
