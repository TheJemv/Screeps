import { CreepHaulerCore, EnergyStructure } from "../types";

// Find Target (Ordenamiento en Cadena)
export default function(creep: CreepHaulerCore): EnergyStructure[] {
    const rawTargets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: s => {
            const isSpawnOrExtension = s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION;
            if (!isSpawnOrExtension) return false;

            const target = s as EnergyStructure;
            return target.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        }
    }) as EnergyStructure[];

    if (rawTargets.length === 0) return [];

    const chainedTargets: EnergyStructure[] = [];
    let currentPosition = creep.pos;

    while (rawTargets.length > 0) {
        let closestIndex = 0;
        let minDistance = currentPosition.getRangeTo(rawTargets[0]);

        for (let i = 1; i < rawTargets.length; i++) {
            const distance = currentPosition.getRangeTo(rawTargets[i]);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = i;
            }
        }

        const closestTarget = rawTargets.splice(closestIndex, 1)[0];
        chainedTargets.push(closestTarget);
        currentPosition = closestTarget.pos;
    }

    return chainedTargets;
}
