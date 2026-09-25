import { CreepHaulerCore } from "../types";
import ReservationManager from "../managers/ReservationManager";
import getClosestEnergyTargets from "../utils/getClosestEnergyTargets";
import { getControllerContainer } from "utils/GetControllerContainer";
import getFillableTargets from "../utils/getFillableTargets";

// Deposit
export default function(creep: CreepHaulerCore): void {
    const energy = creep.store[RESOURCE_ENERGY];
    if (energy === 0) return;

    const controllerContainer = getControllerContainer(creep.room);
    const isTargetingController = controllerContainer && creep.memory.targets?.includes(controllerContainer.id);
    const hasNoTargets = !creep.memory.targets || creep.memory.targets.length === 0;

    if (hasNoTargets || isTargetingController) {
        const closest = getClosestEnergyTargets(creep);
        const unreserved = ReservationManager.getUnreservedTargets(creep, closest)
        const fillable = getFillableTargets(unreserved, energy, creep.store.getCapacity(RESOURCE_ENERGY));
        if (fillable.length > 0) {
            if (isTargetingController) {
                ReservationManager.delete(creep, controllerContainer.id);
                creep.say('🚨 Prioridad');
            }

            ReservationManager.post(creep, fillable);
        }
    }

    if (!creep.memory.targets || creep.memory.targets.length === 0) return;
    let currentTargetId = creep.memory.targets[0];
    let target = Game.getObjectById(currentTargetId);

    if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        ReservationManager.delete(creep, currentTargetId);
        currentTargetId = creep.memory.targets[0];
        target = Game.getObjectById(currentTargetId);
    }

    if (!target) return;

    if (creep.pos.isNearTo(target)) {
        const freeCap = target.store.getFreeCapacity(RESOURCE_ENERGY);
        creep.transfer(target, RESOURCE_ENERGY);

        if (energy >= freeCap) ReservationManager.delete(creep, currentTargetId);
    }

    const activeTargetId = creep.memory.targets[0];
    if (activeTargetId) {
        const activeTarget = Game.getObjectById(activeTargetId);
        if (activeTarget && !creep.pos.isNearTo(activeTarget)) {
            creep.moveTo(activeTarget, { visualizePathStyle: { stroke: "#ffffff" } });
        }
    }
}
