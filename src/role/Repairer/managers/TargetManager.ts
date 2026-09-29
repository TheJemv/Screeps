import { REPAIRER_CONFIG } from "../config";
import { RepairerCreep } from "../types";
import { workableRemotes } from "../utils/rooms";
import ReservationManager from "./ReservationManager";

/**
 * Prioridades: número más alto = más urgente. Dentro de la misma prioridad
 * gana la más cercana (y en empate, la más dañada).
 */
export const TIER = {
    /** Rampart por caerse, o container / estructura propia bajo CRITICAL_BELOW. */
    CRITICAL: 5,
    /** Spawn, extensions, torres, storage, links...: no decaen, si están dañadas hubo un ataque. */
    OWNED: 4,
    /** Containers de casa y de los remotos: la economía. Solo el repairer cuida los remotos. */
    CONTAINER: 3,
    /** Roads de casa y de los remotos. */
    ROAD: 2,
    /** Muros y ramparts hasta WALL_TARGET_HITS: el trabajo de relleno. */
    WALL: 1
};

interface Candidate {
    id: Id<AnyStructure>;
    tier: number;
    ratio: number;
    pos: RoomPosition;
}

// Candidatos por casa, recalculados una vez por tick y compartidos entre repairers.
let cacheTick = -1;
const candidatesByHome = new Map<string, Candidate[]>();

// Objetivos a los que no se pudo llegar (o que el motor no dejó reparar): id -> tick en que se vuelven a probar.
const skipped = new Map<string, number>();

export default class TargetManager {
    /** El objetivo guardado, si todavía vale la pena seguir con él. Si no, lo suelta. */
    public static current(creep: RepairerCreep): AnyStructure | null {
        const id = creep.memory.targetId;
        if (!id) return null;

        const target = Game.getObjectById(id);
        if (target && isRepairable(target) && isInScope(target, creep.memory.homeRoom)) return target;

        ReservationManager.clear(creep);
        return null;
    }

    /** Elige y reserva el objetivo más urgente que nadie más tenga. */
    public static pick(creep: RepairerCreep): AnyStructure | null {
        const reserved = ReservationManager.getReservedIds(creep);
        let best: Candidate | undefined;
        let bestDistance = Infinity;

        for (const candidate of candidates(creep.memory.homeRoom)) {
            if (reserved.has(candidate.id) || isSkipped(candidate.id)) continue;

            const d = distance(creep.pos, candidate.pos);
            const better =
                !best ||
                candidate.tier > best.tier ||
                (candidate.tier === best.tier &&
                    (d < bestDistance || (d === bestDistance && candidate.ratio < best.ratio)));

            if (better) {
                best = candidate;
                bestDistance = d;
            }
        }

        if (!best) return null;

        ReservationManager.assign(creep, best.id);
        return Game.getObjectById(best.id);
    }

    /** Suelta el objetivo y lo ignora un rato (sin camino, o el motor no deja repararlo). */
    public static skip(creep: RepairerCreep, id: Id<AnyStructure>): void {
        skipped.set(id, Game.time + REPAIRER_CONFIG.UNREACHABLE_TTL);
        ReservationManager.clear(creep);
    }
}

/** Todas las estructuras que ya necesitan reparación, en casa y en los remotos seguros. */
function candidates(home: string): Candidate[] {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        candidatesByHome.clear();
    }

    const cached = candidatesByHome.get(home);
    if (cached) return cached;

    const list: Candidate[] = [];

    for (const roomName of [home, ...workableRemotes(home)]) {
        const room = Game.rooms[roomName];
        if (!room) continue;

        const atHome = roomName === home;
        for (const s of room.find(FIND_STRUCTURES)) {
            if (!isRepairable(s)) continue;

            const tier = tierOf(s, atHome);
            if (tier !== null) list.push({ id: s.id, tier, ratio: s.hits / hitLimit(s), pos: s.pos });
        }
    }

    candidatesByHome.set(home, list);
    return list;
}

/** Hasta dónde se repara: muros y ramparts hasta WALL_TARGET_HITS, lo demás al 100%. */
function hitLimit(s: AnyStructure): number {
    const isWall = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
    return isWall ? Math.min(s.hitsMax, REPAIRER_CONFIG.WALL_TARGET_HITS) : s.hitsMax;
}

/**
 * ¿Se puede reparar y todavía le falta vida? No mira umbrales: esos son solo
 * para EMPEZAR. Una vez tomada, se repara hasta el tope (así no vuelve cada
 * rato por 1%).
 */
function isRepairable(s: AnyStructure): boolean {
    if (!s.hits || !s.hitsMax) return false; // indestructible (muros de zona novice) o controller
    if ("my" in s && !s.my) return false; // de otro jugador, o de NPC (keeper lair, invader core)
    return s.hits < hitLimit(s);
}

/** Fuera de casa solo se cuidan containers y roads, y solo en remotos seguros. */
function isInScope(s: AnyStructure, home: string): boolean {
    if (s.pos.roomName === home) return true;
    if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD) return false;
    return workableRemotes(home).includes(s.pos.roomName);
}

/** ¿Qué tan urgente es EMPEZAR a repararla? null = todavía no hace falta. */
function tierOf(s: AnyStructure, atHome: boolean): number | null {
    const cfg = REPAIRER_CONFIG;
    const ratio = s.hits / hitLimit(s);

    switch (s.structureType) {
        case STRUCTURE_RAMPART:
            if (!atHome) return null;
            if (s.hits < cfg.RAMPART_CRITICAL_HITS) return TIER.CRITICAL;
            return ratio < cfg.START_BELOW ? TIER.WALL : null;

        case STRUCTURE_WALL:
            if (!atHome) return null;
            return ratio < cfg.START_BELOW ? TIER.WALL : null;

        case STRUCTURE_CONTAINER:
            if (ratio < cfg.CRITICAL_BELOW) return TIER.CRITICAL;
            return ratio < cfg.CONTAINER_START_BELOW ? TIER.CONTAINER : null;

        case STRUCTURE_ROAD:
            return ratio < (atHome ? cfg.START_BELOW : cfg.REMOTE_START_BELOW) ? TIER.ROAD : null;

        default:
            if (!atHome) return null;
            if (ratio < cfg.CRITICAL_BELOW) return TIER.CRITICAL;
            return ratio < cfg.OWNED_START_BELOW ? TIER.OWNED : null;
    }
}

/** Casillas en el mismo room; entre rooms, 50 por cada room de distancia (siempre "más lejos"). */
function distance(from: RoomPosition, to: RoomPosition): number {
    if (from.roomName === to.roomName) return from.getRangeTo(to);
    return Game.map.getRoomLinearDistance(from.roomName, to.roomName) * 50;
}

function isSkipped(id: string): boolean {
    const until = skipped.get(id);
    if (until === undefined) return false;
    if (Game.time < until) return true;

    skipped.delete(id);
    return false;
}
