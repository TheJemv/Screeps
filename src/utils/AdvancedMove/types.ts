// src/utils/AdvancedMove/types.ts

export interface TravelOptions {
    /** Distancia aceptada al destino (0 = pisarlo). Default: 1. */
    range?: number;
    /** Dibuja el path restante (misma forma que MoveToOpts.visualizePathStyle). */
    visualizePathStyle?: PolyStyle;
    /** Fuerza el costo del plano (en casillas de road, como en moveTo). Por defecto sale del cuerpo y la carga. */
    plainCost?: number;
    /** Fuerza el costo del pantano (en casillas de road, como en moveTo). Por defecto sale del cuerpo y la carga. */
    swampCost?: number;
    /** Límite de operaciones de PathFinder. */
    maxOps?: number;
    /** Máximo de rooms que puede cruzar el path. */
    maxRooms?: number;
    /** Retoca la CostMatrix de un room (misma firma que MoveToOpts.costCallback). */
    costCallback?: (roomName: string, costMatrix: CostMatrix) => void | CostMatrix;
}

export type TravelReturnCode = OK | ERR_BUSY | ERR_TIRED | ERR_NO_BODYPART | ERR_NO_PATH;

/**
 * Estado por creep en Memory. Nombres cortos a propósito: se serializa cada
 * tick para cada creep que usa AdvancedMove.
 */
export interface TravelMemory {
    /** Destino (x, y, room). */
    dx: number;
    dy: number;
    dRoom: string;
    /** Rango aceptado alrededor del destino. */
    range: number;

    /**
     * El camino EXACTO que falta recorrer: una dirección (1-8) por carácter.
     * Empieza en el origen (ox, oy, oRoom) = donde estaba el creep al pedir el
     * último paso. Los cruces de borde no ocupan carácter: el motor transporta
     * solo al creep a la casilla espejo del room vecino.
     */
    path: string;
    ox: number;
    oy: number;
    oRoom: string;

    /**
     * Room desde donde se buscó el path. Al entrar a otro room se recalcula:
     * el path pudo armarse sin visión de ese room (sin conocer sus portales,
     * muros ni estructuras) y pisar un portal teletransporta al creep.
     */
    sRoom?: string;

    /** Tick del último move() emitido por travel(): sirve para detectar si ese paso falló. */
    moveTick: number;
    /** Tick de la última llamada a travel(): da frescura al "ancla" (destino) para los empujes. */
    callTick: number;
    /** Ticks seguidos sin poder avanzar. */
    stuck: number;
    /** Tick de la última búsqueda sin resultado (cooldown para no quemar CPU cada tick). */
    failTick?: number;
    /** Búsquedas fallidas seguidas: el cooldown se duplica con cada una. */
    fails?: number;
}

/** Destino al que un creep quieto "pertenece": empujarlo nunca lo aleja de ahí. */
export interface Anchor {
    x: number;
    y: number;
    range: number;
}

declare global {
    interface CreepMemory {
        /** Estado de AdvancedMove (path cacheado, atascos y ancla de trabajo). */
        travel?: TravelMemory;
    }

    /** Consola: quién está caminando con AdvancedMove y por qué casillas (ver debug.ts). */
    function moveInfo(): string;
    /** Consola: camino de AdvancedMove vs el más corto, en ticks reales (ver debug.ts). */
    function moveCompare(name: string, x?: number, y?: number): string;
}
