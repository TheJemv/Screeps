// src/war/utils/combat.ts
//
// Radar compartido del tick: quién es enemigo, qué estructuras se pueden romper
// y cuánto pega el pelotón. Todo se calcula una vez por tick y room.
import { WAR_CONFIG } from "../config";
import type { WarCreep } from "../types";

/** Dueños NPC: nunca aliados. Los Source Keepers no se persiguen (reaparecen). */
const NPC = new Set(["Invader", "Source Keeper"]);
const IGNORED_OWNERS = new Set(["Source Keeper"]);

/** Partes que hacen daño (o curan a los que lo hacen): un creep con alguna es una amenaza. */
const THREAT_PARTS: BodyPartConstant[] = [ATTACK, RANGED_ATTACK, HEAL];

let cacheTick = -1;
let allySet: Set<string> = new Set();
const hostileCreeps = new Map<string, Creep[]>();
const hostileStructures = new Map<string, AnyOwnedStructure[]>();
const rampartTiles = new Map<string, Map<number, StructureRampart>>();

function fresh(): void {
    if (cacheTick === Game.time) return;
    cacheTick = Game.time;
    hostileCreeps.clear();
    hostileStructures.clear();
    rampartTiles.clear();
    const list = [...WAR_CONFIG.ALLIES, ...(Memory.allies ?? [])];
    allySet = new Set(list.map(n => n.toLowerCase()));
}

export function isAlly(username: string | undefined): boolean {
    fresh();
    if (!username || NPC.has(username)) return false;
    return allySet.has(username.toLowerCase());
}

/** Enemigos del room: sin aliados ni Source Keepers. */
export function hostilesIn(room: Room): Creep[] {
    fresh();
    let list = hostileCreeps.get(room.name);
    if (!list) {
        list = room.find(FIND_HOSTILE_CREEPS, {
            filter: c => !isAlly(c.owner.username) && !IGNORED_OWNERS.has(c.owner.username)
        });
        hostileCreeps.set(room.name, list);
    }
    return list;
}

export function isThreat(creep: Creep): boolean {
    return THREAT_PARTS.some(part => creep.getActiveBodyparts(part) > 0);
}

/** Estructuras con dueño enemigo (sin aliados ni el controller). */
export function hostileStructuresIn(room: Room): AnyOwnedStructure[] {
    fresh();
    let list = hostileStructures.get(room.name);
    if (!list) {
        list = room.find(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType !== STRUCTURE_CONTROLLER && !isAlly(s.owner?.username)
        });
        hostileStructures.set(room.name, list);
    }
    return list;
}

/** Ramparts enemigos por casilla: lo que está debajo no recibe daño hasta romperlos. */
export function hostileRamparts(room: Room): Map<number, StructureRampart> {
    fresh();
    let map = rampartTiles.get(room.name);
    if (!map) {
        map = new Map();
        for (const s of hostileStructuresIn(room)) {
            if (s.structureType === STRUCTURE_RAMPART) map.set(s.pos.y * 50 + s.pos.x, s);
        }
        rampartTiles.set(room.name, map);
    }
    return map;
}

export function isUnderRampart(obj: RoomObject & { pos: RoomPosition }, room: Room): boolean {
    return hostileRamparts(room).has(obj.pos.y * 50 + obj.pos.x);
}

/** Vida real para romperlo: la estructura + el rampart que la cubre. */
export function effectiveHits(target: AnyStructure | Creep, room: Room): number {
    const isRampart = "structureType" in target && target.structureType === STRUCTURE_RAMPART;
    const rampart = isRampart ? undefined : hostileRamparts(room).get(target.pos.y * 50 + target.pos.x);
    return (target.hits ?? 0) + (rampart ? rampart.hits : 0);
}

/** Hay algo de un aliado a <= range (rangedMassAttack le pega a todo lo que tenga dueño ajeno). */
export function alliesNear(pos: RoomPosition, range: number): boolean {
    if (pos.findInRange(FIND_HOSTILE_CREEPS, range, { filter: c => isAlly(c.owner.username) }).length > 0) return true;
    return pos.findInRange(FIND_HOSTILE_STRUCTURES, range, { filter: s => isAlly(s.owner?.username) }).length > 0;
}

// ---------------------------------------------------------------------------
// Poder del pelotón
// ---------------------------------------------------------------------------

/** BOOSTS del motor, con índices sueltos: parte -> boost -> acción -> multiplicador. */
const BOOST_TABLE = BOOSTS as Record<string, Record<string, Record<string, number> | undefined> | undefined>;

function partPower(part: BodyPartDefinition, type: BodyPartConstant, base: number, action: string): number {
    if (part.hits <= 0 || part.type !== type) return 0;
    const multiplier = part.boost ? BOOST_TABLE[part.type]?.[String(part.boost)]?.[action] ?? 1 : 1;
    return base * multiplier;
}

export function meleeDamage(creep: Creep): number {
    return creep.body.reduce((sum, p) => sum + partPower(p, ATTACK, ATTACK_POWER, "attack"), 0);
}

export function rangedDamage(creep: Creep): number {
    return creep.body.reduce((sum, p) => sum + partPower(p, RANGED_ATTACK, RANGED_ATTACK_POWER, "rangedAttack"), 0);
}

export function healPower(creep: Creep): number {
    return creep.body.reduce((sum, p) => sum + partPower(p, HEAL, HEAL_POWER, "heal"), 0);
}

/** Daño por tick contra estructuras de todo el pelotón (para estimar cuánto tarda en romper algo). */
export function squadDps(creeps: WarCreep[]): number {
    return Math.max(1, creeps.reduce((sum, c) => sum + meleeDamage(c) + rangedDamage(c), 0));
}

/**
 * Mejor creep para pegarle: primero el que NO está bajo rampart (al otro le pega
 * el rampart), después el que cura, después el de menos vida.
 */
export function bestCreep(list: Creep[], room: Room): Creep | undefined {
    let best: Creep | undefined;
    let bestScore = -Infinity;
    for (const c of list) {
        const score =
            (isUnderRampart(c, room) ? 0 : 1_000_000) + c.getActiveBodyparts(HEAL) * 10_000 + (c.hitsMax - c.hits);
        if (score > bestScore) {
            best = c;
            bestScore = score;
        }
    }
    return best;
}
