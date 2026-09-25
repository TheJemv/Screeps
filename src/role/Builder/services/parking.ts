import { BuilderCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

export function parkBuilder(creep: BuilderCreep): void {
    const allParkingFlags = _.filter(Game.flags, (f: Flag) => f.name.startsWith("ParkingBuilder_"));

    if (allParkingFlags.length === 0) return;

    const availableFlags = allParkingFlags.filter((flag) => {
        if (!flag.room) return true;
        const creepsOnFlag = flag.pos.lookFor(LOOK_CREEPS);
        return creepsOnFlag.length === 0 || (creepsOnFlag.length === 1 && creepsOnFlag[0].name === creep.name);
    });

    if (availableFlags.length === 0) return;

    const targetFlag = creep.pos.findClosestByPath(availableFlags) || availableFlags[0];

    if (targetFlag) {
        if (!creep.pos.isEqualTo(targetFlag.pos)) {
            moveToRoad(creep, targetFlag, {
                range: 0,
                visualizePathStyle: { stroke: '#777777' } // 🔘 GRIS para estacionar
            });
        } else {
            creep.say('🅿️ B-Parked');
        }
    }
}
