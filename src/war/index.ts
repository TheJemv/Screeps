// src/war/index.ts
import SquadManager from "./managers/SquadManager";
import { WarCreepMemory } from "./types";
import WarSpawn from "./managers/WarSpawn";

export default class WarSystem {
    public static run(): void {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (room.controller && room.controller.my) {
                WarSpawn.run(room);
            }
        }

        const activeSquads = new Map<string, Creep[]>();
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const mem = creep.memory as Partial<WarCreepMemory>;

            if (mem.role === 'WarCreep' && mem.squadId) {
                if (!activeSquads.has(mem.squadId)) {
                    activeSquads.set(mem.squadId, []);
                }
                activeSquads.get(mem.squadId)!.push(creep);
            }
        }

        // Ejecutar la lógica de cada escuadrón
        for (const [squadId, creeps] of activeSquads.entries()) {
            SquadManager.runSquad(squadId, creeps);
        }
    }
}
