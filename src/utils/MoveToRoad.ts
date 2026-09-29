import { AdvancedMove, TravelReturnCode } from "./AdvancedMove";

// moveToRoad ahora es un envoltorio de AdvancedMove.travel(): todos los roles
// que lo usan comparten el mismo sistema de movimiento (caminos cacheados,
// prioridad de roads según cuerpo y carga, tráfico con swap/empujón, bordes y
// portales). Lo que hacía antes a mano (costos de roads, esquivar portales,
// detectar atascos, cruzar por portales) ya lo hace AdvancedMove.
//
// Se mantiene la firma y el comportamiento de moveTo que los roles esperan:
// sin `range` explícito, el creep se para ENCIMA del objetivo si se puede pisar
// (banderas de Miner/LinkKeeper/ControllerCreep, containers) y queda al lado si
// no (spawn, storage, controller).
export function moveToRoad(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    opts?: MoveToOpts
): TravelReturnCode {
    return AdvancedMove.travel(creep, target, {
        range: opts?.range ?? 0,
        visualizePathStyle: opts?.visualizePathStyle,
        plainCost: opts?.plainCost,
        swampCost: opts?.swampCost,
        maxOps: opts?.maxOps,
        maxRooms: opts?.maxRooms,
        costCallback: opts?.costCallback
    });
}
