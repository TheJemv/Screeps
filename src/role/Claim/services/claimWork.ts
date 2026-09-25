import { isAlly } from "utils/Attack";
import { moveToRoad } from "utils/MoveToRoad";
import { ClaimCreep } from "../types";

// 🟣 MAGENTA: desplazamiento hacia la flag/controller a reclamar o reservar.
const CLAIM_PATH_STYLE = { stroke: '#ff00ff' };

export function doClaimWork(creep: ClaimCreep, flag: Flag): void {
    // Todavía viajando hacia la sala de la flag -- seguir, nada más que hacer.
    if (creep.room.name !== flag.pos.roomName) {
        moveToRoad(creep, flag, { visualizePathStyle: CLAIM_PATH_STYLE });
        return;
    }

    const controller = creep.room.controller;

    // Ni dueño, ni aliado dueño, ni aliado con reserva -- eso último importa: claimear
    // SÍ pisa la reserva de otro jugador, así que un amigo reservando no lo protege solo.
    if (controller && !controller.my && !isAlly(controller.owner?.username) && !isAlly(controller.reservation?.username)) {
        const claimResult = creep.claimController(controller);

        if (claimResult === ERR_NOT_IN_RANGE) {
            moveToRoad(creep, controller, { visualizePathStyle: CLAIM_PATH_STYLE });
        } else if (claimResult === ERR_GCL_NOT_ENOUGH) {
            // Sin GCL para poseerla todavía -- mientras tanto la reservamos: eso no
            // pide GCL, bloquea invasores y mejora el regen de energía de la sala.
            if (creep.reserveController(controller) === ERR_NOT_IN_RANGE) {
                moveToRoad(creep, controller, { visualizePathStyle: CLAIM_PATH_STYLE });
            }
        } else if (claimResult !== OK) {
            console.log(`${creep.name} no pudo claimear ${controller.room.name}: código ${claimResult}`);
        }
        return;
    }

    // Ya llegó pero no hay nada para hacer (ya la claimeó, o es de un aliado
    // protegido) -- volver a casa en vez de quedarse ahí sin hacer nada.
    if (creep.memory.room && creep.room.name !== creep.memory.room) {
        moveToRoad(creep, Game.spawns.Spawn1, { visualizePathStyle: { stroke: '#777777' } }); // 🔘 GRIS volviendo a casa
    }
}
