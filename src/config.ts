//  Flags
export const ATTACK_FLAG_NAME = "Attack";
export const SAVE_FLAG_PREFIX = "Save_";
export const CLAIM_FLAG_NAME = "Claim";
export const MINER_FLAG_PREFIX = "Miner_";
export const UPGRADER_FLAG_PREFIX = "Upgrader_";
export const CONTROLLERCREEP_FLAG_PREFIX = "ControllerCreep_";
export const BUILDERS_FLAG_NAME = "Builders";
export const LINKKEEPER_FLAG_PREFIX = "LinkKeeper_";

// Radio de "mi zona": un creep solo rellena spawn/extensions a esta distancia
// de su container asignado -- si todo lo cercano ya está lleno, no cruza el
// mapa a rellenar el clúster de otro container, sigue con su trabajo normal.
export const FILL_SPAWN_RANGE = 20;


export const CLAIM_FLAG_PREFIX = "Claim_";


//  Config Creeps
// Extensions terminadas: 800 de energía disponible. Esto es lo único que main.ts
// lee para saber cuántos y con qué body spawnear cada rol.
export interface CreepSpawnConfig {
    count: number;
    body: BodyPartConstant[];
    role?: string
}

export const CREEPS_CONFIG: Record<string, CreepSpawnConfig> = {
    // harvester: {
    //     count: 2,
    //     // Barato a propósito: rol de rescate, tiene que poder spawnear ya con
    //     // poca energía disponible. Subile el cupo o el body más adelante si
    //     // hace falta más músculo una vez que la economía se recupere.
    //     body: [WORK, CARRY, MOVE] // 200
    // },
    upgrader: {
        count: 2,
        // Sin WORK -- no upgradea, solo transfer()/withdraw(), que no lo necesitan.
        // CARRY:MOVE 1:1 (cuestan lo mismo) para velocidad completa en plano: son
        // viajes cortos y repetidos, rinde más la velocidad que cargar de más.
        body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE] // 400
    },
    miner: {
        count: 0, // ignorado -- la cantidad real sale de minerFlags().length, ver main.ts
        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE] // 650, satura el source (5x2=10/tick)
    },
    builder: {
        count: 0,   // 4 - Default
        // Menos WORK, más CARRY/MOVE que antes -- ahora que ControllerCreep se
        // encarga del upgrade fijo, Builder vuelve a ser más constructor/viajero
        // que fuente de progreso de controller.
        body: [
            WORK, WORK,
            CARRY, CARRY, CARRY,
            MOVE, MOVE, MOVE, MOVE
        ] // 550
    },
    controllercreep: {
        count: 4,
        // Se para en su flag para siempre (como Miner) y upgradea sin parar --
        // casi todo en WORK, 1 CARRY de buffer nomás (el container va a estar
        // pegado, recargar es instantáneo) y 1 MOVE porque solo camina una vez.
        body: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, CARRY] // 800
    },
    repairer: {
        count: 2,
        body: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE] // 600
    },
    claim: {
        count: 0,
        // 1 solo CLAIM alcanza (claim/reserve son 1 acción por tick, no escalan
        // con más partes de forma que valga la pena acá) y 1 MOVE por 1 parte que
        // no es MOVE ya da tick completo en plano.
        body: [CLAIM, CLAIM, MOVE, MOVE] // 600 + 600 + 50 + 50 = 1300
    },
    hauler: {
        count: 0,
        // Mismo criterio que Upgrader: sin WORK, CARRY:MOVE parejo para velocidad
        // completa -- ajustá el tamaño si ya tenés más de 400 de capacidad.
        body: [
            CARRY, CARRY, CARRY,
            MOVE, MOVE, MOVE,
        ] // 400
    },
    attacker: {
        count: 0,
        // Un ATTACK menos que 1:1, y el sobrante en MOVE de más -- pensado para
        // aguantar mejor el pantano de la sala enemiga (ahí la fatiga es 10/tick
        // por parte en vez de 2, así que conviene ir sobrado de MOVE).
        body: [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE] // 800
    },
    remoteHauler: {
        count: 0,
        body: [
            CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
            MOVE, MOVE, MOVE, MOVE, MOVE
        ] //    Cost = 15 * 50 = 750
          // 750 / 1500 = cost/tick
    },
    linkKeeper: {
        count: 0, // ignorado -- la cantidad real sale de las banderas LinkKeeper_, igual que Miner
        // Se para en su flag para siempre y solo hace transfer()/withdraw() a
        // rango 1 (al link y a lo que tenga al lado) -- casi todo CARRY para
        // amortiguar ráfagas, 1 MOVE porque camina una sola vez.
        body: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE] // 450
    },

    haulerCore: {
        count: 2,
        body: [
            CARRY, CARRY, CARRY, CARRY,
            MOVE, MOVE
        ],
        role: "HaulerCore"
    },
    haulerLocal: {
        count: 2,
        body: [
            CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
            CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
        ],
        role: "HaulerLocal"
    }
};
