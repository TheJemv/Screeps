// src/guard/index.ts
//
// Sistema de vigilantes: COUNT por home room, esperando estacionados. Si en el
// home, en una reserva o en un remoto aparece un enemigo (o atacan a un creep
// mío cerca), salen rápido a matarlo y vuelven a casa.
//
// Flujo de cada tick:
//   1. RoomManager     -> home rooms + rooms vigilados (reservas, banderas)
//   2. ThreatManager   -> amenazas (con memoria cuando se pierde la visión)
//   3. GuardSpawn      -> mantiene COUNT vigilantes por home (la economía primero)
//   4. DispatchManager -> reparte vigilantes entre amenazas
//   5. Guardian        -> cada vigilante pelea / viaja / se estaciona
//
// Uso en main.ts (DESPUÉS de Spawner(), para no pisarle el spawn):
//   import GuardSystem from "./guard";
//   GuardSystem.run();
import { GUARD_CONFIG } from "./config";
import { GuardCreep, GuardCreepMemory } from "./types";
import RoomManager from "./managers/RoomManager";
import ThreatManager from "./managers/ThreatManager";
import GuardSpawn from "./managers/GuardSpawn";
import DispatchManager from "./managers/DispatchManager";
import PostManager from "./managers/PostManager";
import Guardian from "./roles/Guardian";
import { installSpawnHook } from "./utils/spawnHook";
import { guardInfo } from "./utils/debug";

// Al cargar el módulo (antes del primer tick), así ve los spawnCreep del Spawner.
installSpawnHook();

export default class GuardSystem {
    public static run(): void {
        installSpawnHook();

        const homes = RoomManager.homes();
        RoomManager.update(homes);
        const threats = ThreatManager.scan(homes);

        const guardsByHome = this.collectGuards(homes);
        for (const [home, guards] of guardsByHome) PostManager.assign(home, guards);

        if (GUARD_CONFIG.SPAWN.ENABLED) {
            for (const home of homes) {
                const urgent = threats.some(t => t.home === home);
                GuardSpawn.run(Game.rooms[home], guardsByHome.get(home) ?? [], urgent);
            }
        }

        DispatchManager.run(guardsByHome, threats);

        const byMission = new Map<string, GuardCreep[]>();
        for (const guards of guardsByHome.values()) {
            for (const guard of guards) {
                const mission = guard.memory.mission;
                if (!mission || guard.spawning) continue;
                byMission.set(mission, [...(byMission.get(mission) ?? []), guard]);
            }
        }

        for (const guards of guardsByHome.values()) {
            for (const guard of guards) {
                try {
                    Guardian.run(guard, byMission.get(guard.memory.mission ?? "") ?? [guard]);
                } catch (err) {
                    // Un vigilante con error no frena a los demás ni al resto de main.
                    console.log(`[Guard] error en ${guard.name}: ${(err as Error)?.stack ?? String(err)}`);
                }
            }
        }
    }

    /** Vigilantes agrupados por home. Si su home dejó de serlo, pasa al más cercano. */
    private static collectGuards(homes: string[]): Map<string, GuardCreep[]> {
        const byHome = new Map<string, GuardCreep[]>();
        for (const home of homes) byHome.set(home, []);

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if ((creep.memory as Partial<GuardCreepMemory>).role !== GUARD_CONFIG.ROLE) continue;
            const guard = creep as GuardCreep;

            if (!byHome.has(guard.memory.home)) {
                const home = RoomManager.homeFor(guard.room.name, homes);
                if (!home) continue;
                guard.memory.home = home;
                delete guard.memory.park;
            }
            byHome.get(guard.memory.home)?.push(guard);
        }

        return byHome;
    }
}

global.guardInfo = guardInfo;
