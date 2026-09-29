// src/war/utils/spawnHook.ts
//
// Envuelve StructureSpawn.prototype.spawnCreep para saber qué spawns ya recibieron
// una orden en ESTE tick (del Spawner de la economía o de quien sea).
//
// Por qué: el motor no marca `spawn.spawning` hasta el tick siguiente, y un segundo
// spawnCreep en el mismo tick PISA al primero. Sin esto, war le podría borrar el
// spawn a un miner o a un hauler. La economía va primero.
//
// Solo OBSERVA: llama al spawnCreep original y no cambia su resultado.

type SpawnFn = (this: StructureSpawn, body: BodyPartConstant[], name: string, opts?: SpawnOptions) => ScreepsReturnCode;

interface HookedPrototype {
    spawnCreep: SpawnFn;
    /** El spawnCreep que había antes de war (el del motor u otro hook), para no envolver dos veces. */
    warOriginalSpawnCreep?: SpawnFn;
}

let installed = false;
let tick = -1;
const requested = new Set<string>();
const committedRooms = new Set<string>();

function reset(): void {
    if (tick === Game.time) return;
    tick = Game.time;
    requested.clear();
    committedRooms.clear();
}

/** Idempotente. false si no hay StructureSpawn (ej: tests fuera del juego). */
export function installSpawnHook(): boolean {
    if (installed) return true;
    if (typeof StructureSpawn === "undefined") return false;

    const proto = StructureSpawn.prototype as unknown as HookedPrototype;
    const original = proto.warOriginalSpawnCreep ?? proto.spawnCreep;
    proto.warOriginalSpawnCreep = original;

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

/** ¿Algún spawn del room ya arrancó un creep este tick? (su energía ya está comprometida) */
export function roomCommittedThisTick(roomName: string): boolean {
    reset();
    return committedRooms.has(roomName);
}
