import { RemoteHaulerCreep } from "../types";
import { moveToRoad } from "utils/MoveToRoad";

/** ¿Hay otro remoteHauler vivo apuntando al mismo container que yo? Si es así,
 * uno de los dos sobra -- desempate determinístico por id para que ambos
 * lleguen a la misma conclusión sin coordinarse. */
export function shouldRetire(creep: RemoteHaulerCreep): boolean {
    if (!creep.memory.targetContainerId) return false;

    const siblings = _.filter(Game.creeps, (c: Creep) =>
        c.memory.role === 'remoteHauler' &&
        c.memory.targetContainerId === creep.memory.targetContainerId
    );

    if (siblings.length <= 1) return false;

    const keeper = siblings.reduce((a, b) => (a.id < b.id ? a : b));
    return keeper.id !== creep.id;
}

/** Vuelve al spawn de casa y se recicla (recupera energía) en vez de seguir
 * compitiendo por un container que ya tiene dueño. */
export function retireToSpawn(creep: RemoteHaulerCreep): void {
    const spawn = Game.spawns.Spawn1;
    if (!spawn) return;

    if (creep.pos.isNearTo(spawn)) {
        spawn.recycleCreep(creep);
    } else {
        moveToRoad(creep, spawn, { range: 1 });
    }
}
