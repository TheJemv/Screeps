// src/war/index.ts
//
// Sistema de guerra: pelotones de 6 (1 líder, 2 tanques, 1 healer, 2 ranged) que
// se mueven en formación con movimiento PROPIO (no usa utils/AdvancedMove).
//
// Flujo de cada tick:
//   1. RouteManager.scanPortals -> recuerda portales vistos
//   2. collect()                -> arma los pelotones (memoria + creeps vivos)
//   3. WarSpawn                 -> recluta un pelotón a la vez (la economía primero)
//   4. SquadManager             -> fase de cada pelotón + combate de cada creep
//
// Banderas: "Save" (reunión) y "Attack" (una sola: su room se ataca entero).
import { WAR_CONFIG } from "./config";
import type { Squad, SquadMemory, WarCreep, WarCreepMemory } from "./types";
import WarSpawn from "./managers/WarSpawn";
import SquadManager from "./managers/SquadManager";
import RouteManager from "./managers/RouteManager";
import { warMemory } from "./utils/memory";
import { installSpawnHook } from "./utils/spawnHook";
import { warInfo } from "./utils/debug";

// Al cargar el módulo (antes del primer tick), así ve los spawnCreep del Spawner.
installSpawnHook();

export default class WarSystem {
    public static run(): void {
        installSpawnHook();
        RouteManager.scanPortals();

        const squads = this.collect();
        WarSpawn.run(squads);

        for (const squad of squads.values()) {
            if (squad.creeps.length === 0 && squad.stranded.length === 0) continue;
            try {
                SquadManager.run(squad);
            } catch (err) {
                // Un pelotón con error no frena a los demás ni al resto de main.
                console.log(`[War] error en ${squad.id}: ${(err as Error)?.stack ?? String(err)}`);
            }
        }
    }

    /** Pelotones de este tick. Olvida los que ya no tienen a nadie (salvo el que recluta). */
    private static collect(): Map<string, Squad> {
        const mem = warMemory();
        const squads = new Map<string, Squad>();
        const get = (id: string, sample?: WarCreep): Squad => {
            let squad = squads.get(id);
            if (!squad) {
                mem.squads[id] = mem.squads[id] ?? this.adopt(sample);
                squad = { id, mem: mem.squads[id], creeps: [], stranded: [], spawning: [], names: new Set(), moved: new Map() };
                squads.set(id, squad);
            }
            return squad;
        };

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const m = creep.memory as Partial<WarCreepMemory>;
            if (m.role !== WAR_CONFIG.ROLE || !m.squadId) continue;

            const warCreep = creep as WarCreep;
            const squad = get(m.squadId, warCreep);
            squad.names.add(name);
            if (creep.spawning) squad.spawning.push(warCreep);
            else if (creep.getActiveBodyparts(MOVE) === 0) squad.stranded.push(warCreep);
            else squad.creeps.push(warCreep);
        }

        for (const id of Object.keys(mem.squads)) {
            if (squads.has(id)) continue;
            if (mem.squads[id].recruiting) get(id);
            else delete mem.squads[id];
        }
        return squads;
    }

    /** Creeps de guerra sin pelotón en memoria (ej: del sistema anterior): se adoptan en Save. */
    private static adopt(sample: WarCreep | undefined): SquadMemory {
        const home = sample?.memory.homeRoom ?? sample?.room.name ?? "";
        return { phase: "rally", recruiting: false, home, created: Game.time };
    }
}

global.warInfo = warInfo;
