import { WarCreepMemory } from "../types";

const SQUAD_NAMES = ['Alpha', 'Beta', 'Charlie', 'Delta', 'Echo'];

export default class WarSpawn {
    public static run(room: Room): void {
        const saveFlag = Game.flags.Save;
        if (!saveFlag) return;

        if (!Memory.war) {
            Memory.war = { currentSquadIndex: 0, squadDeployed: false };
        }
        const warMem = Memory.war ;
        const squadName = SQUAD_NAMES[warMem.currentSquadIndex] || 'Omega';

        const squadCreeps = room.find(FIND_MY_CREEPS, {
            filter: c => c.memory.role === 'WarCreep' && (c.memory as WarCreepMemory).squadId === squadName
        });

        const leader = squadCreeps.find(c => (c.memory as WarCreepMemory).squadRole === 'Leader');
        const escorts = squadCreeps.filter(c => (c.memory as WarCreepMemory).squadRole === 'Escort');
        const rangeds = squadCreeps.filter(c => (c.memory as WarCreepMemory).squadRole === 'Ranged');
        const follower = squadCreeps.find(c => (c.memory as WarCreepMemory).squadRole === 'Follower');

        const isComplete = leader && escorts.length === 2 && rangeds.length === 2 && follower;

        // Protocolo de Bajas: Si el pelotón estaba completo y falta alguien, avanzamos de escuadrón (Alpha -> Beta)
        if (warMem.squadDeployed && !isComplete) {
            warMem.currentSquadIndex = (warMem.currentSquadIndex + 1) % SQUAD_NAMES.length;
            warMem.squadDeployed = false;
            return;
        }

        if (isComplete) {
            warMem.squadDeployed = true;
            return;
        }

        const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
        if (!spawn) return;

        // 1. Líder Tanque (1600e)
        if (!leader) {
            const body = [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH, ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK, MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            spawn.spawnCreep(body, `TNK_${squadName}_${Game.time.toString().slice(-4)}`, {
                memory: { role: 'WarCreep', squadRole: 'Leader', squadClass: 'Demolition', squadId: squadName, state: 'Spawning', homeRoom: room.name } as WarCreepMemory
            });
            return;
        }

        // 2. Escoltas de Asalto (2 unidades, 1600e c/u)
        if (escorts.length < 2) {
            const body = [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH, ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK, MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            spawn.spawnCreep(body, `ESC_${squadName}_${Game.time.toString().slice(-4)}`, {
                memory: { role: 'WarCreep', squadRole: 'Escort', squadClass: 'Demolition', squadId: squadName, state: 'Spawning', homeRoom: room.name } as WarCreepMemory
            });
            return;
        }

        // 3. Artillería Ranged (2 unidades, 1500e c/u)
        if (rangeds.length < 2) {
            const body = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK, MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            spawn.spawnCreep(body, `RNG_${squadName}_${Game.time.toString().slice(-4)}`, {
                memory: { role: 'WarCreep', squadRole: 'Ranged', squadClass: 'Harass', squadId: squadName, state: 'Spawning', homeRoom: room.name } as WarCreepMemory
            });
            return;
        }

        // 4. Médico Jefe (1 unidad, 1800e)
        if (!follower) {
            const body = [HEAL,HEAL,HEAL,HEAL,HEAL,HEAL, MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            spawn.spawnCreep(body, `MED_${squadName}_${Game.time.toString().slice(-4)}`, {
                memory: { role: 'WarCreep', squadRole: 'Follower', squadClass: 'Demolition', squadId: squadName, state: 'Spawning', homeRoom: room.name } as WarCreepMemory
            });
        }
    }
}
