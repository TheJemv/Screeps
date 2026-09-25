import { findPortalTowards } from "./PortalRoute";

// Wrapper sobre creep.moveTo() que de verdad prefiere roads: road cuesta 1,
// plano cuesta 3 (plainCost) -> road queda relativamente más barato. Sin esto,
// solo poner el road en costo 1 no logra nada porque 1 ya es el default del plano.
// moveTo ya trae su propio cacheo de path (reusePath) y manejo de creeps/obstáculos,
// así que no hace falta reimplementar nada de eso a mano.
//
// También detecta cuando el creep lleva ticks sin moverse a pesar de no tener
// fatiga (probablemente bloqueado por otro creep parado, o con un path viejo
// cacheado que ya no sirve) y en ese caso fuerza recalcular la ruta evitando
// las posiciones actuales de los demás creeps, en vez de quedarse atorado
// reintentando el mismo camino tapado. Esto aplica tanto al movimiento dentro
// del mismo room como al cruce entre rooms (incluido el paso final hacia un
// portal, que es justo donde más tráfico se puede juntar por ser un único
// punto de paso).
// Penaliza (no bloquea) las casillas de portal en el costMatrix. Un portal SÍ
// es caminable según las reglas del juego -- por eso, sin esto, el pathfinder
// lo toma como atajo válido si cae sobre la ruta más corta y termina
// teletransportando al creep sin que lo pidamos. Pero ojo: cost 255 sería
// "jamás lo uses, ni aunque sea la única forma de llegar" -- eso deja a un
// creep con un target legítimo del otro lado del portal parado ahí para
// siempre sin ruta posible. Con un costo alto pero finito, el pathfinder lo
// evita cuando hay cualquier otra ruta razonable, pero lo sigue usando si
// genuinamente es el único camino.
const PORTAL_AVOID_COST = 50;

function avoidPortals(roomName: string, costMatrix: CostMatrix, extraCallback?: (roomName: string, costMatrix: CostMatrix) => void) {
    const room = Game.rooms[roomName];
    if (room) {
        room.find(FIND_STRUCTURES).forEach(s => {
            if (s.structureType === STRUCTURE_PORTAL) {
                costMatrix.set(s.pos.x, s.pos.y, PORTAL_AVOID_COST);
            }
        });
    }
    if (typeof extraCallback === 'function') {
        extraCallback(roomName, costMatrix);
    }
}

function blockOtherCreeps(roomName: string, costMatrix: CostMatrix, creep: Creep) {
    const room = Game.rooms[roomName];
    if (!room) return;
    room.find(FIND_CREEPS).forEach(other => {
        if (other.id !== creep.id) costMatrix.set(other.pos.x, other.pos.y, 0xff);
    });
}

/** ¿Lleva ticks sin moverse a pesar de no tener fatiga? Si es así, limpia el
 * path cacheado para forzar un recálculo fresco la próxima vez que se llame
 * a moveTo. Se llama una sola vez por tick, al principio, para que aplique
 * sea cual sea la rama de movimiento que termine usándose. */
function trackStuck(creep: Creep): boolean {
    const posKey = creep.pos.toString();
    const tracking = creep.memory.moveTracking;
    const stuckTicks = tracking && tracking.pos === posKey ? tracking.stuckTicks + 1 : 0;
    creep.memory.moveTracking = { pos: posKey, stuckTicks };

    const stuck = stuckTicks >= 1 && creep.fatigue === 0;
    if (stuck) delete creep.memory._move;

    return stuck;
}

export function moveToRoad(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    opts?: MoveToOpts // <-- Usar MoveToOpts de @types/screeps
) {
    const targetPos = "pos" in target ? target.pos : target;
    const stuck = trackStuck(creep);

    if (targetPos.roomName !== creep.room.name) {
        // Si el room destino no tiene ruta por salidas normales, moveTo()
        // nunca lo va a encontrar solo -- un portal no cuenta como salida
        // para el sistema de rutas. Si hay un portal puente conocido, el
        // primer paso es caminar hasta ÉL (range 0, sin evitarlo esta vez);
        // el teletransporte pasa solo al pisarlo, y el tick siguiente ya
        // arranca del otro lado con rutas normales.
        const noNormalRoute = Game.map.findRoute(creep.room.name, targetPos.roomName) === ERR_NO_PATH;

        if (creep.name === 'builder_83191280') {
            console.log(
                `[DEBUG ${creep.name}] moveToRoad: from=${creep.room.name} pos=${creep.pos.x},${creep.pos.y} ` +
                `to=${targetPos.roomName}(${targetPos.x},${targetPos.y}) noNormalRoute=${noNormalRoute} ` +
                `fatigue=${creep.fatigue} stuck=${stuck} _move=${JSON.stringify(creep.memory._move)}`
            );
        }

        if (noNormalRoute) {
            const portal = findPortalTowards(creep.room.name, targetPos.roomName);

            if (creep.name === 'builder_83191280') {
                console.log(
                    `[DEBUG ${creep.name}] portal=${portal ? `${portal.pos.roomName}(${portal.pos.x},${portal.pos.y}) destino=${JSON.stringify(portal.destination)}` : 'NINGUNO'}`
                );
            }

            if (portal) {
                // OJO: acá NO se bloquean otros creeps aunque esté "stuck".
                // Cruzar de room suele pasar por un cuello de botella (borde
                // del room, o la única casilla del portal) -- si otro creep
                // está parado justo ahí, marcarlo como pared (255) no lo
                // esquiva, hace que esa ruta sea directamente IMPOSIBLE. Mejor
                // esperar un tick a que se mueva que autobloquearse la única
                // salida.
                const moveResult = creep.moveTo(portal, { range: 0 });

                if (creep.name === 'builder_83191280') {
                    console.log(`[DEBUG ${creep.name}] moveTo(portal)=${moveResult}`);
                }

                return moveResult;
            }
        }

        // Salto entre rooms: sin la lógica de roads (sería carísimo escanear
        // cada room de la ruta), pero igual evitando portales en el camino.
        // Tampoco bloquea otros creeps acá por la misma razón de arriba.
        return creep.moveTo(target, {
            ...opts,
            costCallback: (roomName, costMatrix) => avoidPortals(roomName, costMatrix, opts?.costCallback)
        });
    }

    const stuckTicks = (creep.memory.moveTracking?.stuckTicks) ?? 0;
    if (stuckTicks >= 8) {
        return creep.moveTo(target, opts);
    }

    return creep.moveTo(target, {
        ...opts,
        maxRooms: 1,
        plainCost: 5,
        swampCost: 20,
        costCallback: (roomName, costMatrix) => {
            const room = Game.rooms[roomName];
            if (!room) return;

            room.find(FIND_STRUCTURES).forEach(s => {
                if (s.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(s.pos.x, s.pos.y, 1);
                } else if (s.structureType === STRUCTURE_PORTAL) {
                    costMatrix.set(s.pos.x, s.pos.y, PORTAL_AVOID_COST);
                } else if (
                    s.structureType !== STRUCTURE_CONTAINER &&
                    (s.structureType !== STRUCTURE_RAMPART || !s.my)
                ) {
                    costMatrix.set(s.pos.x, s.pos.y, 0xff);
                }
            });

            if (stuck) blockOtherCreeps(roomName, costMatrix, creep);

            if (opts && typeof opts.costCallback === 'function') {
                opts.costCallback(roomName, costMatrix);
            }
        }
    });
}
