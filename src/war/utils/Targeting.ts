import { getHostileCreeps, getHostileStructures } from "../../utils/Attack";

export default class Targeting {
    /**
     * Ataque de oportunidad: Devuelve el enemigo más cercano a rango de ataque.
     */
    public static getOpportunityTarget(creep: Creep, range: number): Creep | null {
        const hostiles = getHostileCreeps(creep.room);
        const targetsInRange = hostiles.filter(c => creep.pos.getRangeTo(c) <= range);

        if (targetsInRange.length === 0) return null;

        return creep.pos.findClosestByPath(targetsInRange) || targetsInRange[0];
    }

    /**
     * Tierra Arrasada: Busca objetivos económicos prioritarios.
     */
    public static getEconomyTarget(creep: Creep): Structure | null {
        const hostiles = getHostileStructures(creep.room);

        // En sala enemiga, cualquier contenedor es un objetivo económico válido
        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });

        // Prioridad 1
        const sources = creep.room.find(FIND_SOURCES);
        const miningContainers = containers.filter(s =>
            sources.some(source => s.pos.inRangeTo(source, 2))
        );

        if (miningContainers.length > 0) {
            return creep.pos.findClosestByPath(miningContainers);
        }

        // Prioridad 2
        const storage = hostiles.find(s => s.structureType === STRUCTURE_STORAGE);
        if (storage) return storage;

        // Prioridad 3
        const infra = hostiles.filter(s =>
            s.structureType === STRUCTURE_TOWER ||
            s.structureType === STRUCTURE_EXTENSION ||
            s.structureType === STRUCTURE_SPAWN
        );
        if (infra.length > 0) return creep.pos.findClosestByPath(infra);

        // Prioridad 4
        if (hostiles.length > 0) {
            return creep.pos.findClosestByPath(hostiles);
        }

        // Prioridad 5
        if (containers.length > 0) {
            return creep.pos.findClosestByPath(containers);
        }

        return null;
    }
}
