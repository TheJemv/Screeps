// src/role/Repairer/config.ts
//
// Todos los números afinables del Repairer.

export const REPAIRER_CONFIG = {
    // --- Qué reparar (ver managers/TargetManager.ts) ---

    // Cada umbral dice cuándo una estructura se vuelve trabajo (% de su vida). Una vez tomada se repara hasta el 100%.

    /** Containers, en casa y en los remotos. */
    CONTAINER_START_BELOW: 0.5,
    /** Spawn, extensions, torres, storage, links, terminal, labs... (casa). */
    OWNED_START_BELOW: 0.5,
    /** Roads, muros y ramparts de casa. */
    START_BELOW: 0.7,
    /** Roads de los remotos. Más bajo: ir hasta allá cuesta un viaje entre rooms. */
    REMOTE_START_BELOW: 0.5,
    /** Container o estructura propia debajo de este %: emergencia, va antes que todo. */
    CRITICAL_BELOW: 0.25,
    /** Muros y ramparts se suben hasta acá (el mismo WALL_TARGET_HITS de role/Tower.ts). */
    WALL_TARGET_HITS: 100000,
    /** Un rampart con menos vida que esto está por caerse (decae 300 cada 100 ticks): emergencia. */
    RAMPART_CRITICAL_HITS: 10000,
    /** De pasada: mientras camina con energía, repara la road que pisa si bajó de este %. */
    PASSING_BELOW: 0.8,

    // --- Dónde puede trabajar ---

    /** Rooms remotos (banderas Miner_) a más de esta distancia de casa no se atienden. */
    REMOTE_MAX_DISTANCE: 2,
    /** Un objetivo al que no se pudo llegar se ignora durante estos ticks. */
    UNREACHABLE_TTL: 1500,

    // --- Energía (ver services/collect.ts) ---

    /** Energía que se le deja al storage (spawns, haulers): el repairer solo usa lo que sobra. */
    STORAGE_RESERVE: 5000,
    /** Mínimo de energía libre (restando lo que otros ya reservaron) para ir a un container o a una pila. */
    MIN_CONTAINER_ENERGY: 100,
    /** Si no hay de dónde cargar y ya trae al menos esto, sale a trabajar con lo que tiene. */
    MIN_ENERGY_TO_WORK: 50,

    // --- Espera (ver managers/StandbyManager.ts) ---

    /** Distancia al storage (o al spawn) donde busca estacionarse sin estorbar. */
    PARK_MIN_RANGE: 3,
    PARK_MAX_RANGE: 8
};
