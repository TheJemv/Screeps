// src/guard/utils/spawnHook.ts
//
// Envuelve StructureSpawn.prototype.spawnCreep para saber qué spawns ya
// recibieron una orden en ESTE tick (del Spawner de la economía, de war...).
//
// Por qué: el motor no marca `spawn.spawning` hasta el tick siguiente, y un
// segundo spawnCreep en el mismo tick PISA al primero. Sin esto, un vigilante
// podría borrarle el spawn a un miner o a un hauler.
//
// Solo OBSERVA: llama al spawnCreep original y no cambia su resultado.

type SpawnFn = (
    this: StructureSpawn,
    body: BodyPartConstant[],
    name: string,
    opts?: SpawnOptions
) => ScreepsReturnCode;

interface HookedPrototype {
    spawnCreep: SpawnFn;
    /** El spawnCreep original del motor, guardado para no envolver dos veces. */
    guardOriginalSpawnCreep?: SpawnFn;
}

let installed = false;
let tick = -1;
/** Spawns que recibieron un spawnCreep este tick (haya salido OK o no). */
const requested = new Set<string>();
/** Rooms con un spawnCreep OK este tick: su energyAvailable ya está comprometido. */
const committedRooms = new Set<string>();

function reset(): void {
    if (tick === Game.time) return;
    tick = Game.time;
    requested.clear();
    committedRooms.clear();
}

/** Idempotente. Devuelve false si no hay StructureSpawn (ej: tests fuera del juego). */
export function installSpawnHook(): boolean {
    if (installed) return true;
    if (typeof StructureSpawn === "undefined") return false;

    const proto = StructureSpawn.prototype as unknown as HookedPrototype;
    const original = proto.guardOriginalSpawnCreep ?? proto.spawnCreep;
    proto.guardOriginalSpawnCreep = original;

    proto.spawnCreep = function (this: StructureSpawn, body, name, opts) {
        const result = original.call(this, body, name, opts);
        if (!opts?.dryRun) {
            reset();
            requested.add(this.id);
            if (result === OK) committedRooms.add(this.room.name);
        }
        return result;
    };

    installed = true;
    return true;
}

/** ¿Alguien ya le pidió algo a este spawn este tick? (aunque haya fallado por energía) */
export function spawnRequestedThisTick(spawn: StructureSpawn): boolean {
    reset();
    return requested.has(spawn.id);
}

/** ¿Algún spawn del room ya arrancó un creep este tick? */
export function roomCommittedThisTick(roomName: string): boolean {
    reset();
    return committedRooms.has(roomName);
}
