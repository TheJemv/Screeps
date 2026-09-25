export default {
    run(creep: Creep): void {
        if (creep.memory.working === undefined) creep.memory.working = true;

        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
        }

        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
            delete creep.memory.targetId;
        }

        if (creep.memory.working) {
            if (creep.memory.targetId === undefined) {
                const spawn = Game.spawns.Spawn1;
                const necesitaEnergia = spawn && spawn.room.energyAvailable < spawn.room.energyCapacityAvailable;
                creep.memory.targetId = necesitaEnergia ? spawn.id : "";
            }

            if (creep.memory.targetId) {
                const spawn = Game.getObjectById(creep.memory.targetId as Id<StructureSpawn>);
                if (!spawn || spawn.room.energyAvailable >= spawn.room.energyCapacityAvailable) {
                    delete creep.memory.targetId;
                    return;
                }
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn);
                }
                return;
            }

            const controller = creep.room.controller;
            if (controller && creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller);
            }
        } else {
            if (creep.memory.targetId === undefined) {
                const ruin = creep.pos.findClosestByPath(FIND_RUINS, {
                    filter: r => r.store[RESOURCE_ENERGY] > 0
                });

                if (ruin) {
                    creep.memory.targetId = ruin.id;
                    creep.memory.targetType = "ruin";
                } else {
                    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
                    creep.memory.targetId = source ? source.id : "";
                    creep.memory.targetType = "source";
                }
            }

            if (creep.memory.targetType === "ruin") {
                const ruin = Game.getObjectById(creep.memory.targetId as Id<Ruin>);
                if (!ruin || ruin.store[RESOURCE_ENERGY] === 0) {
                    delete creep.memory.targetId;
                    return;
                }
                if (creep.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(ruin);
                }
                return;
            }

            if (creep.memory.targetId) {
                const source = Game.getObjectById(creep.memory.targetId as Id<Source>);
                if (!source || source.energy === 0) {
                    delete creep.memory.targetId;
                    return;
                }
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source);
                }
            }
        }
    }
}
