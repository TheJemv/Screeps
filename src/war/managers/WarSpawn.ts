// src/war/managers/WarSpawn.ts
//
// Recluta UN pelotón a la vez:
//
//   - Mientras un pelotón está reclutando, se le spawnean los que le faltan (1 líder,
//     2 tanques, 1 healer, 2 ranged), con todos los spawns libres del home a la vez.
//   - Cuando sale de Save hacia el ataque deja de reclutar (Anti-goteo: nunca se
//     mandan refuerzos sueltos) y empieza el siguiente pelotón.
//   - La economía va primero: si el Spawner ya usó un spawn este tick, no se toca.
import { WAR_CONFIG } from "../config";
import type { Squad, SquadRole, WarCreepMemory } from "../types";
import { attackRoom, saveFlag } from "../utils/flags";
import { warMemory } from "../utils/memory";
import { roleOf } from "../utils/roles";
import { roomCommittedThisTick, spawnRequestedThisTick } from "../utils/spawnHook";

const { SPAWN } = WAR_CONFIG;

const LETTER: Record<SquadRole, string> = { Leader: "L", Tank: "T", Healer: "H", Ranged: "R" };

/** Orden del cuerpo: TOUGH adelante (absorbe), después el daño, MOVE, y HEAL al final. */
const PART_ORDER: Partial<Record<BodyPartConstant, number>> = {
    [TOUGH]: 0,
    [WORK]: 1,
    [CARRY]: 2,
    [ATTACK]: 3,
    [RANGED_ATTACK]: 4,
    [CLAIM]: 5,
    [MOVE]: 6,
    [HEAL]: 7
};

export default class WarSpawn {
    public static run(squads: Map<string, Squad>): void {
        if (!WAR_CONFIG.SPAWN_ACTIVE) return;
        const save = saveFlag();
        if (!save) return;

        const recruit = [...squads.values()].find(s => s.mem.recruiting);
        if (!recruit) {
            this.startSquad(squads, save);
            return;
        }

        const home = Game.rooms[recruit.mem.home];
        if (!home || roomCommittedThisTick(home.name)) return;

        const missing = this.missingRoles(recruit);
        if (missing.length === 0) return;

        const spawns = home.find(FIND_MY_SPAWNS).filter(s => !s.spawning && !spawnRequestedThisTick(s));
        let energy = home.energyAvailable;

        for (let i = 0; i < missing.length; i++) {
            const spawn = spawns.shift();
            if (!spawn) break;

            const role = missing[i];
            const { body, cost } = buildBody(role, home.energyCapacityAvailable);
            // Se respeta el orden: si no alcanza para este, se espera (no se salta al siguiente).
            if (body.length === 0 || cost > energy) break;

            const name = `${SPAWN.NAME_PREFIX}_${recruit.id}_${LETTER[role]}${i}_${Game.time % 100000}`;
            const memory: WarCreepMemory = { role: WAR_CONFIG.ROLE, squadId: recruit.id, squadRole: role, homeRoom: home.name };
            const result = spawn.spawnCreep(body, name, { memory });

            if (result === OK) {
                energy -= cost;
                console.log(`[War] 🪖 ${recruit.id}: spawneando ${role} ${name} (${cost}e, ${body.length} partes)`);
            } else {
                if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_BUSY) {
                    console.log(`[War] No se pudo spawnear ${role} para ${recruit.id}: código ${result}`);
                }
                break;
            }
        }
    }

    /** Nuevo pelotón a reclutar (si hay lugar). */
    private static startSquad(squads: Map<string, Squad>, save: Flag): void {
        if (squads.size >= SPAWN.MAX_SQUADS) return;

        const attack = attackRoom();
        const waiting = [...squads.values()].some(s => s.mem.phase === "rally");
        // Sin ataque alcanza con un pelotón esperando listo en Save.
        if (!attack && (waiting || !SPAWN.RECRUIT_WITHOUT_ATTACK)) return;

        const home = this.homeRoom(save);
        if (!home) return;

        const mem = warMemory();
        const id = this.nextName(squads);
        mem.squads[id] = { phase: "rally", recruiting: true, home, created: Game.time };
        console.log(`[War] 📋 Reclutando pelotón ${id} en ${home} (se reúne en Save ${save.pos.roomName})`);
    }

    private static missingRoles(squad: Squad): SquadRole[] {
        const have = new Map<SquadRole, number>();
        for (const c of [...squad.creeps, ...squad.stranded, ...squad.spawning]) {
            const role = roleOf(c);
            have.set(role, (have.get(role) ?? 0) + 1);
        }

        const missing: SquadRole[] = [];
        for (const role of SPAWN.ORDER) {
            const n = have.get(role) ?? 0;
            if (n > 0) have.set(role, n - 1);
            else missing.push(role);
        }
        return missing;
    }

    /** HOME_ROOM, o el room de Save si es mío con spawns, o el mío con spawns más cercano. */
    private static homeRoom(save: Flag): string | undefined {
        if (SPAWN.HOME_ROOM) return SPAWN.HOME_ROOM;

        const saveRoom = Game.rooms[save.pos.roomName];
        if (saveRoom?.controller?.my && saveRoom.find(FIND_MY_SPAWNS).length > 0) return saveRoom.name;

        let best: string | undefined;
        let bestDistance = Infinity;
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            if (!room.controller?.my || room.find(FIND_MY_SPAWNS).length === 0) continue;
            const distance = Game.map.getRoomLinearDistance(name, save.pos.roomName);
            if (distance < bestDistance) {
                best = name;
                bestDistance = distance;
            }
        }
        return best;
    }

    /** Alpha, Beta, ..., Echo, Alpha2, Beta2... (nunca repite uno vivo). */
    private static nextName(squads: Map<string, Squad>): string {
        const mem = warMemory();
        const names = SPAWN.SQUAD_NAMES;
        for (let k = mem.nextName; ; k++) {
            const round = Math.floor(k / names.length);
            const name = names[k % names.length] + (round > 0 ? String(round + 1) : "");
            if (!squads.has(name) && !mem.squads[name]) {
                mem.nextName = k + 1;
                return name;
            }
        }
    }
}

/** Cuerpo de `role` para esta capacidad de energía. body vacío = no alcanza ni para uno. */
export function buildBody(role: SquadRole, capacity: number): { body: BodyPartConstant[]; cost: number } {
    const { pattern, maxRepeats } = SPAWN.BODIES[role];
    const unit = pattern.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    const budget = SPAWN.MAX_COST > 0 ? Math.min(capacity, SPAWN.MAX_COST) : capacity;
    const repeats = Math.min(maxRepeats, Math.floor(budget / unit), Math.floor(MAX_CREEP_SIZE / pattern.length));
    if (repeats < 1) return { body: [], cost: 0 };

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < repeats; i++) body.push(...pattern);
    body.sort((a, b) => (PART_ORDER[a] ?? 5) - (PART_ORDER[b] ?? 5));
    return { body, cost: unit * repeats };
}
