// src/guard/utils/combat.ts
//
// Radar compartido: qué enemigos importan, cuánto pegan y a quién apuntar.
// Todo se calcula una vez por tick y room (lo usan el ThreatManager y todos
// los vigilantes del room).
import { isAllyCreep } from "utils/Attack";
import { GUARD_CONFIG } from "../config";

/** Los Source Keepers no se persiguen nunca: no se van y reaparecen. */
const IGNORED_OWNERS = new Set(["Source Keeper"]);

/** Partes que hacen daño o ayudan a hacerlo. Un creep sin ninguna es un scout. */
const DANGEROUS_PARTS: BodyPartConstant[] = [ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM];

let cacheTick = -1;
const hostileCache = new Map<string, Creep[]>();
const hurtCache = new Map<string, Creep[]>();
const focusCache = new Map<string, Creep | null>();

function fresh(): void {
    if (cacheTick === Game.time) return;
    cacheTick = Game.time;
    hostileCache.clear();
    hurtCache.clear();
    focusCache.clear();
}

/** Enemigos del room que los vigilantes atienden (sin aliados ni Source Keepers). */
export function hostilesIn(room: Room): Creep[] {
    fresh();
    let list = hostileCache.get(room.name);
    if (!list) {
        list = room.find(FIND_HOSTILE_CREEPS, {
            filter: c => !isAllyCreep(c) && !IGNORED_OWNERS.has(c.owner.username)
        });
        if (GUARD_CONFIG.THREAT.IGNORE_HARMLESS) list = list.filter(c => !isHarmless(c));
        hostileCache.set(room.name, list);
    }
    return list;
}

/** Sin ninguna parte peligrosa activa (scout, carry vacío...). */
export function isHarmless(creep: Creep): boolean {
    return !DANGEROUS_PARTS.some(part => creep.getActiveBodyparts(part) > 0);
}

/** Invader cores que conviene romper (nivel bajo y ya desplegados). */
export function attackableCores(room: Room): StructureInvaderCore[] {
    const maxLevel = GUARD_CONFIG.THREAT.MAX_CORE_LEVEL;
    if (maxLevel < 0) return [];
    return room.find(FIND_HOSTILE_STRUCTURES, {
        filter: (s): s is StructureInvaderCore => s.structureType === STRUCTURE_INVADER_CORE && s.level <= maxLevel
    });
}

/** Creeps míos heridos en el room. */
export function hurtFriends(room: Room): Creep[] {
    fresh();
    let list = hurtCache.get(room.name);
    if (!list) {
        list = room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
        hurtCache.set(room.name, list);
    }
    return list;
}

/** Hay creeps de aliados a <= range (rangedMassAttack también les pega a ellos). */
export function alliesNear(pos: RoomPosition, range: number): boolean {
    return pos.findInRange(FIND_HOSTILE_CREEPS, range, { filter: c => isAllyCreep(c) }).length > 0;
}

// ---------------------------------------------------------------------------
// Poder de combate
// ---------------------------------------------------------------------------

/** BOOSTS del motor, con índices sueltos: parte -> boost -> acción -> multiplicador. */
const BOOST_TABLE = BOOSTS as Record<string, Record<string, Record<string, number> | undefined> | undefined>;

const BASE_POWER: Partial<Record<BodyPartConstant, { base: number; action: string }>> = {
    [ATTACK]: { base: ATTACK_POWER, action: "attack" },
    [RANGED_ATTACK]: { base: RANGED_ATTACK_POWER, action: "rangedAttack" },
    [HEAL]: { base: HEAL_POWER, action: "heal" }
};

function partPower(part: BodyPartDefinition, only?: BodyPartConstant): number {
    if (part.hits <= 0) return 0;
    if (only && part.type !== only) return 0;
    const info = BASE_POWER[part.type];
    if (!info) return 0;
    const multiplier = part.boost ? BOOST_TABLE[part.type]?.[String(part.boost)]?.[info.action] ?? 1 : 1;
    return info.base * multiplier;
}

/** Daño + curación por tick (partes activas, con boosts). Sirve para comparar bandos. */
export function powerOf(creep: Creep): number {
    return creep.body.reduce((sum, part) => sum + partPower(part), 0);
}

/** Solo el daño melee (ATTACK): lo que devuelve si le pegas cuerpo a cuerpo. */
export function meleePower(creep: Creep): number {
    return creep.body.reduce((sum, part) => sum + partPower(part, ATTACK), 0);
}

export function totalPower(creeps: Creep[]): number {
    return creeps.reduce((sum, c) => sum + powerOf(c), 0);
}

// ---------------------------------------------------------------------------
// Blancos
// ---------------------------------------------------------------------------

/** Mejor blanco de una lista: primero el que más cura (si no, deshace el daño), después el de menos vida. */
export function bestTarget(hostiles: Creep[], from?: RoomPosition): Creep | undefined {
    let best: Creep | undefined;
    let bestHeal = -1;
    for (const hostile of hostiles) {
        const heal = hostile.getActiveBodyparts(HEAL);
        if (
            !best ||
            heal > bestHeal ||
            (heal === bestHeal && hostile.hits < best.hits) ||
            (heal === bestHeal && hostile.hits === best.hits && from && from.getRangeTo(hostile) < from.getRangeTo(best))
        ) {
            best = hostile;
            bestHeal = heal;
        }
    }
    return best;
}

/**
 * Blanco común de todos los vigilantes del room este tick (fuego concentrado:
 * repartir disparos contra un grupo que se cura casi no hace daño).
 */
export function focusTarget(room: Room): Creep | undefined {
    fresh();
    if (!focusCache.has(room.name)) {
        focusCache.set(room.name, bestTarget(hostilesIn(room)) ?? null);
    }
    return focusCache.get(room.name) ?? undefined;
}
