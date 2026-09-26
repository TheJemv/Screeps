export default class CombatMove {
    public static platoonMove(creep: Creep, leader: Creep, target: RoomPosition): void {
        if (creep.pos.getRangeTo(leader) > 2) {
            creep.moveTo(leader, { visualizePathStyle: { stroke: '#00ff00' } });
        } else {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, ignoreDestructibleStructures: true });
        }
    }

    public static leaderMove(leader: Creep, platoon: Creep[], target: RoomPosition | null): void {
        if (!target) return;

        // Freno de cohesión: Si algún miembro del pelotón se queda muy atascado (>3 casillas), el líder espera
        const straggler = platoon.find(c => c.id !== leader.id && c.pos.getRangeTo(leader) > 3);
        if (straggler) {
            leader.moveTo(straggler, { visualizePathStyle: { stroke: '#ffff00' } });
            return;
        }

        leader.moveTo(target, {
            visualizePathStyle: { stroke: '#ff0000' },
            ignoreDestructibleStructures: true
        });
    }

    public static breach(leader: Creep): boolean {
        const blockingStructures = leader.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
        });

        if (blockingStructures.length > 0) {
            leader.attack(blockingStructures[0]);
            return true;
        }
        return false;
    }
}
