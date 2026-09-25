import { HaulerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

export function parkHauler(creep: HaulerCreep, fallbackCollect: () => void): void {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        fallbackCollect();
        return;
    }

    const parkingFlags = creep.room.find(FIND_FLAGS, {
        filter: (f) => f.name.startsWith("Parking_")
    });

    if (parkingFlags.length === 0) return;

    const availableFlags = parkingFlags.filter((flag) => {
        const creepsOnFlag = flag.pos.lookFor(LOOK_CREEPS);
        return creepsOnFlag.length === 0 || (creepsOnFlag.length === 1 && creepsOnFlag[0].name === creep.name);
    });

    const targetFlag = creep.pos.findClosestByPath(availableFlags) || availableFlags[0];

    if (targetFlag) {
        if (!creep.pos.isEqualTo(targetFlag.pos)) {
            moveToRoad(creep, targetFlag, {
                range: 0,
                visualizePathStyle: { stroke: '#777777' } // 🔘 GRIS para parking
            });
        } else {
            creep.say('🅿️ parked');
        }
    }
}
