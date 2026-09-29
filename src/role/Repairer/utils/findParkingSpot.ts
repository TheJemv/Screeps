import { AdvancedMove } from "utils/AdvancedMove";
import { REPAIRER_CONFIG } from "../config";
import { ParkSpot, RepairerCreep } from "../types";

/** Tampoco pegado a los bordes del room (exits). */
const EDGE_MARGIN = 2;

/** Estructuras con las que otros creeps trabajan pegados: no estacionarse al lado. */
const WORK_STRUCTURES = new Set<string>([
    'storage', 'spawn', 'extension', 'tower', 'link', 'terminal', 'lab',
    'factory', 'powerSpawn', 'nuker', 'container', 'controller'
]);

/**
 * Casilla cerca de `anchor` (storage o spawn de casa) donde un repairer parado
 * no estorba: fuera de las roads, sin pegarse a estructuras donde trabajan
 * otros (ni a sources/minerales), sin pisar banderas ni el lugar guardado de
 * otro creep (HaulerLocal guarda el suyo en el mismo campo `park`).
 * Devuelve la más cercana, o null.
 */
export default function findParkingSpot(creep: RepairerCreep, anchor: RoomPosition): RoomPosition | null {
    const room = Game.rooms[anchor.roomName];
    if (!room) return null;

    const terrain = room.getTerrain();
    const blocked = new Set<number>();
    const key = (x: number, y: number) => x * 50 + y;
    const blockAround = (pos: RoomPosition, radius: number) => {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) blocked.add(key(pos.x + dx, pos.y + dy));
        }
    };

    for (const s of room.find(FIND_STRUCTURES)) {
        // Roads y cualquier estructura, salvo ramparts (encima de un rampart propio se puede estar).
        if (s.structureType !== STRUCTURE_RAMPART) blocked.add(key(s.pos.x, s.pos.y));
        if (WORK_STRUCTURES.has(s.structureType)) blockAround(s.pos, 1);
    }
    for (const site of room.find(FIND_CONSTRUCTION_SITES)) blocked.add(key(site.pos.x, site.pos.y));
    for (const source of room.find(FIND_SOURCES)) blockAround(source.pos, 1);
    for (const mineral of room.find(FIND_MINERALS)) blockAround(mineral.pos, 1);
    for (const flag of room.find(FIND_FLAGS)) blocked.add(key(flag.pos.x, flag.pos.y));
    for (const other of room.find(FIND_CREEPS)) {
        if (other.name !== creep.name) blocked.add(key(other.pos.x, other.pos.y));
    }
    // Lugares ya elegidos por otros creeps, aunque todavía no hayan llegado.
    for (const name in Game.creeps) {
        if (name === creep.name) continue;
        const park = (Game.creeps[name].memory as { park?: ParkSpot }).park;
        if (park && park.room === room.name) blocked.add(key(park.x, park.y));
    }

    // Anillos de adentro hacia afuera: la primera casilla válida es la más cercana.
    for (let r = REPAIRER_CONFIG.PARK_MIN_RANGE; r <= REPAIRER_CONFIG.PARK_MAX_RANGE; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (x < EDGE_MARGIN || x > 49 - EDGE_MARGIN || y < EDGE_MARGIN || y > 49 - EDGE_MARGIN) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL || blocked.has(key(x, y))) continue;

                // Que se pueda llegar (no un hueco encerrado entre muros).
                const spot = new RoomPosition(x, y, room.name);
                if (AdvancedMove.stepsTo(creep, spot, 0, 2500) === Infinity) continue;

                return spot;
            }
        }
    }

    return null;
}
