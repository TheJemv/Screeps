import { AdvancedMove } from "utils/AdvancedMove";
import { REPAIRER_CONFIG } from "../config";
import { RepairerCreep } from "../types";
import findParkingSpot from "../utils/findParkingSpot";
import { repairPassing } from "../utils/repairPassing";

const GREY: PolyStyle = { stroke: '#777777' };

/**
 * STANDBY: no hay nada que reparar, o no hay de dónde sacar energía.
 *
 * Antes se quedaba al lado del container minero más cercano DEL ROOM DONDE
 * ESTUVIERA: si terminaba un trabajo en un remoto, se quedaba a vivir ahí.
 * Ahora siempre vuelve a casa y espera cerca del storage, fuera de las roads.
 */
export default class StandbyManager {
    public static run(creep: RepairerCreep): void {
        const homeName = creep.memory.homeRoom;
        const home = Game.rooms[homeName];
        const anchor = home ? anchorOf(home) : new RoomPosition(25, 25, homeName);

        // 1. Fuera de casa: volver (reparando roads de pasada si trae energía).
        if (creep.room.name !== homeName) {
            repairPassing(creep);
            AdvancedMove.travel(creep, anchor, { range: REPAIRER_CONFIG.PARK_MAX_RANGE, visualizePathStyle: GREY });
            return;
        }

        // 2. En casa: estacionarse donde no estorbe.
        const spot = this.parkingSpot(creep, anchor);
        if (spot && !creep.pos.isEqualTo(spot)) {
            AdvancedMove.travel(creep, spot, { range: 0, visualizePathStyle: GREY });
        }
    }

    /** Salió de standby: libera su lugar para que otro lo pueda usar. */
    public static leave(creep: RepairerCreep): void {
        delete creep.memory.park;
    }

    /** El lugar guardado, si sigue libre; si no, busca otro. */
    private static parkingSpot(creep: RepairerCreep, anchor: RoomPosition): RoomPosition | null {
        const park = creep.memory.park;
        if (park && park.room === creep.room.name) {
            const pos = new RoomPosition(park.x, park.y, park.room);
            if (!pos.lookFor(LOOK_CREEPS).some((c) => c.name !== creep.name)) return pos;
        }

        const spot = findParkingSpot(creep, anchor);
        if (spot) creep.memory.park = { x: spot.x, y: spot.y, room: spot.roomName };
        else delete creep.memory.park;
        return spot;
    }
}

/** Punto de referencia de casa: el storage, o el spawn, o el controller. */
function anchorOf(room: Room): RoomPosition {
    if (room.storage) return room.storage.pos;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn) return spawn.pos;

    return room.controller ? room.controller.pos : new RoomPosition(25, 25, room.name);
}
