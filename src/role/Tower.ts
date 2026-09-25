import { getHostileCreeps } from "utils/Attack";

function runTower(tower: StructureTower): void {
    // getHostileCreeps (no FIND_HOSTILE_CREEPS directo) para no dispararle a
    // los aliados de Memory.allies -- mismo criterio que usa Attacker.ts.
    const hostile = tower.pos.findClosestByRange(getHostileCreeps(tower.room));
    if (hostile) {
        tower.attack(hostile);
        return;
    }

    const hurtCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: (c) => c.hits < c.hitsMax
    });
    if (hurtCreep) {
        tower.heal(hurtCreep);
        return;
    }

    // Misma jerarquía que usa el Repairer (containers > extensions, <=75% de
    // vida, más dañado primero por hits absolutos) -- sin roads ni muros/
    // ramparts, para no drenar la energía de la tower en algo de bajo impacto
    // o que nunca termina.
    // const structures = tower.room.find(FIND_STRUCTURES);
    // const masDanado = (a: AnyStructure, b: AnyStructure) => a.hits - b.hits;

    // const damaged =
    //     structures.filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER && s.hits <= s.hitsMax * 0.75).sort(masDanado)[0] ||
    //     structures.filter((s): s is StructureExtension => s.structureType === STRUCTURE_EXTENSION && s.hits <= s.hitsMax * 0.75).sort(masDanado)[0];

    // if (damaged) tower.repair(damaged);
}

export default {
    run(): void {
        const towers = Object.values(Game.structures).filter(
            (s): s is StructureTower => s.structureType === STRUCTURE_TOWER
        );

        towers.forEach(runTower);
    }
};
