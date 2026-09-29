// src/guard/managers/GuardSpawn.ts
//
// Mantiene COUNT vigilantes vivos por home room. La economía va primero:
// si el Spawner (u otro) ya usó el spawn este tick, se espera al siguiente.
import { GUARD_CONFIG } from "../config";
import { GuardCreep, GuardCreepMemory } from "../types";
import { buildBody } from "../utils/body";
import { roomCommittedThisTick, spawnRequestedThisTick } from "../utils/spawnHook";

export default class GuardSpawn {
    /**
     * @param urgent hay una amenaza para este home: si no queda ningún vigilante,
     *               sale uno con la energía que haya (sin esperar a llenar las extensions).
     */
    public static run(room: Room, guards: GuardCreep[], urgent: boolean): void {
        const alive = guards.filter(g => !this.needsReplacement(g));
        if (alive.length >= GUARD_CONFIG.COUNT) return;
        if (roomCommittedThisTick(room.name)) return;

        // Sin urgencia, la economía tiene prioridad: si ya le pidieron algo a este
        // spawn este tick (aunque le falte energía), no se lo quitamos.
        const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning && (urgent || !spawnRequestedThisTick(s)));
        if (!spawn) return;

        const emergency = urgent && alive.length === 0;
        const budget = Math.min(emergency ? room.energyAvailable : room.energyCapacityAvailable, GUARD_CONFIG.SPAWN.MAX_COST);
        const { body, cost } = buildBody(budget);
        if (cost < GUARD_CONFIG.SPAWN.MIN_COST || cost > room.energyAvailable) return;

        const name = `${GUARD_CONFIG.SPAWN.NAME_PREFIX}_${room.name}_${Game.time}`;
        const memory: GuardCreepMemory = { role: GUARD_CONFIG.ROLE, home: room.name, room: room.name };
        const result = spawn.spawnCreep(body, name, { memory });

        if (result === OK) {
            console.log(`[Guard] 🛡️ Spawneando ${name} (${cost}e, ${body.length} partes)${emergency ? " [EMERGENCIA]" : ""}`);
        } else if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_BUSY) {
            console.log(`[Guard] No se pudo spawnear ${name}: código ${result}`);
        }
    }

    /** Cerca de morir de viejo: su reemplazo ya tiene que estar naciendo. */
    private static needsReplacement(guard: GuardCreep): boolean {
        if (guard.spawning || guard.ticksToLive === undefined) return false;
        return guard.ticksToLive < guard.body.length * CREEP_SPAWN_TIME + GUARD_CONFIG.SPAWN.REPLACE_MARGIN;
    }
}
