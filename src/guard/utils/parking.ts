// src/guard/utils/parking.ts
import { AdvancedMove } from "utils/AdvancedMove";
import { GUARD_CONFIG } from "../config";
import { GuardCreep, GuardCreepMemory } from "../types";

/** No se estaciona al lado de estructuras donde otros creeps trabajan pegados. */
const WORK_STRUCTURES = new Set<string>([
    STRUCTURE_STORAGE, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_LINK,
    STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER,
    STRUCTURE_CONTAINER, STRUCTURE_CONTROLLER
]);
const EDGE_MARGIN = 2;

/** Centro del home (sin bandera Guard_ propia): storage > spawn > controller. */
export function postOf(home: string): RoomPosition {
    const room = Game.rooms[home];
    if (!room) return new RoomPosition(25, 25, home);
    if (room.storage) return room.storage.pos;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn) return spawn.pos;
    return room.controller ? room.controller.pos : new RoomPosition(25, 25, home);
}

/**
 * Casilla cerca del punto de espera donde un vigilante parado no estorba:
 * fuera de roads y estructuras, sin pegarse a donde trabajan otros, sin pisar
 * banderas ni el lugar de otro vigilante. La más cercana, o null.
 */
export function findParkingSpot(creep: GuardCreep, anchor: RoomPosition): RoomPosition | null {
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
    for (const name in Game.creeps) {
        if (name === creep.name) continue;
        const park = (Game.creeps[name].memory as Partial<GuardCreepMemory>).park;
        if (park && park.room === room.name) blocked.add(key(park.x, park.y));
    }

    const { PARK_MIN_RANGE, PARK_MAX_RANGE } = GUARD_CONFIG.IDLE;
    for (let r = PARK_MIN_RANGE; r <= PARK_MAX_RANGE; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (x < EDGE_MARGIN || x > 49 - EDGE_MARGIN || y < EDGE_MARGIN || y > 49 - EDGE_MARGIN) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL || blocked.has(key(x, y))) continue;

                // Que se pueda llegar (no un hueco encerrado entre muros).
                const spot = new RoomPosition(x, y, room.name);
                if (creep.room.name === room.name && AdvancedMove.stepsTo(creep, spot, 0, 2500) === Infinity) continue;

                return spot;
            }
        }
    }

    return null;
}
