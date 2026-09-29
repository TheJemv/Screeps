// src/war/managers/TargetManager.ts
//
// Qué romper en el room atacado (el objetivo de TODO el pelotón):
//
//   1. Torres               (lo que hace daño)
//   2. Extensions y spawns  (sin energía ni producción no hay defensa)
//   3. Creeps con daño      (ATTACK / RANGED / HEAL)
//   4. Economía             (storage, terminal, links, labs, containers...)
//   5. Cualquier creep que quede
//
// Dentro de un nivel gana el más barato: distancia + ticks para romperlo (con el
// rampart que lo cubre). Aparte de esto, cada creep le pega a lo que se le ponga
// enfrente (ver roles/): "si delante se les pone un creep, atacar".
import { WAR_CONFIG } from "../config";
import type { Squad } from "../types";
import { effectiveHits, hostileStructuresIn, hostilesIn, isThreat, squadDps } from "../utils/combat";
import { warMemory } from "../utils/memory";

const { TARGETS } = WAR_CONFIG;
/** Un objetivo que ya ataca otro pelotón "queda más lejos": si hay otro, se reparten. */
const CLAIMED_PENALTY = 30;

export type Target = AnyStructure | Creep;

export default class TargetManager {
    /** Objetivo actual del pelotón en `room` (pegajoso: no cambia de idea cada tick). */
    public static pick(squad: Squad, room: Room, from: { x: number; y: number }): Target | null {
        const mem = squad.mem;
        const current = mem.targetId ? Game.getObjectById(mem.targetId) : null;
        const valid = current && current.pos.roomName === room.name && !this.isIgnored(squad, current.id);

        const fresh = valid && Game.time - (mem.targetTick ?? 0) < TARGETS.RETARGET_TICKS;
        if (fresh) return current as Target;

        const best = this.best(squad, room, from);
        if (valid && best && (mem.targetTier ?? Infinity) <= best.tier) {
            // Mismo nivel o mejor: se sigue con el que ya se estaba rompiendo.
            mem.targetTick = Game.time;
            return current as Target;
        }

        if (!best) {
            delete mem.targetId;
            delete mem.targetTier;
            return valid ? (current as Target) : null;
        }
        mem.targetId = best.target.id as Id<Target>;
        mem.targetTier = best.tier;
        mem.targetTick = Game.time;
        return best.target;
    }

    /** No se pudo llegar: se ignora un rato y se elige otro. */
    public static markUnreachable(squad: Squad, id: string): void {
        const mem = squad.mem;
        mem.unreachable = mem.unreachable ?? {};
        mem.unreachable[id] = Game.time + TARGETS.UNREACHABLE_TICKS;
        if (mem.targetId === id) delete mem.targetId;
    }

    /** Nivel de un objetivo (menor = más importante). */
    public static tierOf(target: Target): number {
        for (let i = 0; i < TARGETS.TIERS.length; i++) {
            const tier = TARGETS.TIERS[i];
            if (tier === "threats") {
                if (!("structureType" in target) && isThreat(target)) return i;
            } else if (tier === "creeps") {
                if (!("structureType" in target)) return i;
            } else if ("structureType" in target && tier.includes(target.structureType)) {
                return i;
            }
        }
        return TARGETS.TIERS.length;
    }

    // -----------------------------------------------------------------------

    private static best(squad: Squad, room: Room, from: { x: number; y: number }): { target: Target; tier: number } | null {
        const dps = squadDps(squad.creeps);
        const structures = hostileStructuresIn(room);
        const creeps = hostilesIn(room);
        const claimed = new Set<string>();
        for (const [id, other] of Object.entries(warMemory().squads)) {
            if (id !== squad.id && other.phase === "siege" && other.target === room.name && other.targetId) claimed.add(other.targetId);
        }

        for (let i = 0; i < TARGETS.TIERS.length; i++) {
            const tier = TARGETS.TIERS[i];
            let list: Target[];
            if (tier === "threats") list = creeps.filter(c => isThreat(c));
            else if (tier === "creeps") list = creeps;
            else {
                list = structures.filter(s => tier.includes(s.structureType));
                // Containers no tienen dueño: se buscan aparte.
                if (tier.includes(STRUCTURE_CONTAINER)) {
                    list = list.concat(room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }));
                }
            }

            list = list.filter(t => !this.isIgnored(squad, t.id));
            if (list.length === 0) continue;

            let best: Target | undefined;
            let bestScore = Infinity;
            for (const t of list) {
                const distance = Math.max(Math.abs(t.pos.x - from.x), Math.abs(t.pos.y - from.y));
                let score = distance + effectiveHits(t, room) / dps + (claimed.has(t.id) ? CLAIMED_PENALTY : 0);
                // Una torre sin energía no dispara: primero las que sí.
                if ("structureType" in t && t.structureType === STRUCTURE_TOWER && t.store.getUsedCapacity(RESOURCE_ENERGY) < TOWER_ENERGY_COST) {
                    score += 1000;
                }
                if (score < bestScore) {
                    best = t;
                    bestScore = score;
                }
            }
            if (best) return { target: best, tier: i };
        }
        return null;
    }

    private static isIgnored(squad: Squad, id: string): boolean {
        const until = squad.mem.unreachable?.[id];
        if (until === undefined) return false;
        if (until > Game.time) return true;
        delete squad.mem.unreachable?.[id];
        return false;
    }
}
