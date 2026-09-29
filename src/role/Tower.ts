import { getHostileCreeps } from "utils/Attack";

const TOWER_CONFIG = {
    /** Techo para muros y ramparts (el mismo que usan tus repairers). */
    WALL_TARGET_HITS: 100000,
    /** Muro/rampart por debajo de esto es EMERGENCIA: se repara antes que todo lo demás. */
    WALL_EMERGENCY_HITS: 5000,
    /** Resto de estructuras (roads, containers...): emergencia cuando bajan de este % de vida. */
    REPAIR_BELOW: 0.25,
    /** Solo repara con más de este % de energía: el resto queda de munición por si aparece un enemigo. */
    REPAIR_RESERVE: 0.5,
    /** Una torre repara 800 hits a ≤5 casillas y solo 200 a ≥20: prefiere obras a esta distancia. */
    EFFICIENT_RANGE: 10
};

type Repairable = Structure & { hits: number; hitsMax: number };

// ---------------------------------------------------------------------------
// Antes cada torre elegía sola "su estructura dañada más cercana": si la más
// cercana a una era una road, esa nunca tocaba los muros, y los muros solo se
// subían hasta el 25% del tope. Ahora las torres de un room se coordinan.
// ---------------------------------------------------------------------------
function runRoom(room: Room, towers: StructureTower[]): void {
    // 1. ATACAR: todas al MISMO blanco. Repartir disparos contra un grupo que
    //    se cura casi no hace daño; concentrados, lo bajan.
    const hostiles = getHostileCreeps(room);
    if (hostiles.length > 0) {
        const target = pickEnemy(hostiles);
        for (const tower of towers) tower.attack(target);
        return;
    }

    // 2. CURAR: cada torre al herido más cercano.
    const hurt = room.find(FIND_MY_CREEPS, { filter: (c) => c.hits < c.hitsMax });
    if (hurt.length > 0) {
        for (const tower of towers) {
            const creep = tower.pos.findClosestByRange(hurt);
            if (creep) tower.heal(creep);
        }
        return;
    }

    // 3. REPARAR (solo las que tienen energía de sobra).
    const ready = towers.filter(
        (t) => t.store.getUsedCapacity(RESOURCE_ENERGY) > t.store.getCapacity(RESOURCE_ENERGY) * TOWER_CONFIG.REPAIR_RESERVE
    );
    if (ready.length === 0) return;

    const { emergencies, walls } = repairTargets(room);
    const taken = new Set<string>();

    for (const tower of ready) {
        // Emergencias: van todas juntas. Muros: una distinta cada torre.
        const target = pickFor(tower, emergencies) ?? pickFor(tower, walls.filter((w) => !taken.has(w.id)));
        if (!target) continue;

        tower.repair(target);
        taken.add(target.id);
    }
}

/** Primero el que más cura (si no, los healers deshacen el daño); después el de menos vida. */
function pickEnemy(hostiles: Creep[]): Creep {
    let best = hostiles[0];
    for (const hostile of hostiles) {
        const heal = hostile.getActiveBodyparts(HEAL);
        const bestHeal = best.getActiveBodyparts(HEAL);
        if (heal > bestHeal || (heal === bestHeal && hostile.hits < best.hits)) best = hostile;
    }
    return best;
}

/**
 * Qué reparar, ordenado de más a menos urgente (menor % de vida primero):
 *  - emergencies: muros/ramparts a punto de caer, o cualquier otra estructura bajo REPAIR_BELOW.
 *  - walls: muros/ramparts por debajo del tope WALL_TARGET_HITS.
 */
function repairTargets(room: Room): { emergencies: Repairable[]; walls: Repairable[] } {
    const emergencies: Repairable[] = [];
    const walls: Repairable[] = [];
    const cfg = TOWER_CONFIG;

    for (const s of room.find(FIND_STRUCTURES)) {
        // Sin vida = indestructible (los muros de borde de la zona novice) o el controller.
        if (!s.hits || !s.hitsMax) continue;
        const structure = s as Repairable;

        if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
            if (s.structureType === STRUCTURE_RAMPART && !s.my) continue;
            if (s.hits < cfg.WALL_EMERGENCY_HITS) emergencies.push(structure);
            else if (s.hits < cfg.WALL_TARGET_HITS) walls.push(structure);
        } else if (s.hits < s.hitsMax * cfg.REPAIR_BELOW) {
            emergencies.push(structure);
        }
    }

    const ratio = (s: Repairable) => s.hits / Math.min(s.hitsMax, cfg.WALL_TARGET_HITS);
    emergencies.sort((a, b) => ratio(a) - ratio(b));
    walls.sort((a, b) => a.hits - b.hits);
    return { emergencies, walls };
}

/** La más urgente que tenga a distancia eficiente; si no hay ninguna cerca, la más urgente del room. */
function pickFor(tower: StructureTower, targets: Repairable[]): Repairable | undefined {
    return targets.find((s) => tower.pos.inRangeTo(s, TOWER_CONFIG.EFFICIENT_RANGE)) ?? targets[0];
}

export default {
    run(): void {
        const byRoom = new Map<string, StructureTower[]>();

        for (const id in Game.structures) {
            const s = Game.structures[id];
            if (s.structureType !== STRUCTURE_TOWER) continue;

            const list = byRoom.get(s.room.name) ?? [];
            list.push(s as StructureTower);
            byRoom.set(s.room.name, list);
        }

        for (const [roomName, towers] of byRoom) runRoom(Game.rooms[roomName], towers);
    }
};
