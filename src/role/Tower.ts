import { getHostileCreeps } from "utils/Attack";

// Mismo tope que usan tus repairers para no vaciar la torre intentando subir muros a 300M
const MAX_WALL_HITS = 100000;

function runTower(tower: StructureTower): void {
    // 1. ATACAR (Prioridad Máxima)
    const hostile = tower.pos.findClosestByRange(getHostileCreeps(tower.room));
    if (hostile) {
        tower.attack(hostile);
        return;
    }

    // 2. CURAR (Prioridad Alta)
    const hurtCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: (c) => c.hits < c.hitsMax
    });
    if (hurtCreep) {
        tower.heal(hurtCreep);
        return;
    }

    // 3. REPARAR (Prioridad Baja - Solo emergencias al 25%)
    // 🛑 SEGURIDAD: La torre solo repara si tiene más de la mitad de su energía.
    // Así siempre guarda munición para defenderse si aparece un enemigo de golpe.
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
        const damagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (s) => {
                const isWallOrRampart = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
                const maxHitsAllowed = isWallOrRampart ? MAX_WALL_HITS : s.hitsMax;

                // Solo si la estructura está por debajo del 25% de su límite
                return s.hits < maxHitsAllowed * 0.25;
            }
        });

        if (damagedStructure) {
            tower.repair(damagedStructure);
            return;
        }
    }
}

export default {
    run(): void {
        const towers = Object.values(Game.structures).filter(
            (s): s is StructureTower => s.structureType === STRUCTURE_TOWER
        );

        towers.forEach(runTower);
    }
};
