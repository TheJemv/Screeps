// src/war/types.ts
import type { Facing, Slot } from "./movement/Formation";

/** Leader: frente al centro · Tank: a los lados · Healer: en medio · Ranged: atrás. */
export type SquadRole = "Leader" | "Tank" | "Healer" | "Ranged";
/** Nombres del sistema anterior: se traducen solos (Escort -> Tank, Follower -> Healer). */
export type LegacySquadRole = "Escort" | "Follower";

/**
 * rally   -> naciendo / esperando en Save hasta estar completos y formados
 * march   -> viajando al room de la bandera Attack
 * siege   -> atacando el room
 * retreat -> retirada al room anterior para curarse (o por safe mode)
 * return  -> sin bandera Attack: vuelven a Save
 */
export type SquadPhase = "rally" | "march" | "siege" | "retreat" | "return";

/** Posición compacta para memoria. */
export interface PackedPos {
    x: number;
    y: number;
    r: string;
}

export interface WarCreepMemory extends CreepMemory {
    role: "WarCreep";
    squadId: string;
    squadRole: SquadRole | LegacySquadRole;
    homeRoom: string;
    /** Casilla de la formación del último tick (desempate estable izquierda/derecha). */
    slot?: Slot;
}

export type WarCreep = Creep & { memory: WarCreepMemory };

/** Cruce de room en curso: cada uno va a su casilla alrededor de `to` (en el room nuevo). */
export interface CrossingMemory {
    from: string;
    to: PackedPos;
    f: Facing;
    via: "exit" | "portal";
    t: number;
}

/** Cómo pasar de un room al siguiente (se calcula una vez por cruce). */
export interface CrossPlan {
    from: string;
    to: string;
    via: "exit" | "portal";
    /** Ancla del lado de salida, pegada al borde/portal. undefined = el bloque no llega: modo tren. */
    pre?: { x: number; y: number };
    /** Ancla del lado de llegada. */
    post: PackedPos;
    f: Facing;
    t: number;
}

/** Modo tren: en fila detrás del líder hasta `goal`, donde se vuelven a formar. */
export interface TrainMemory {
    goal: PackedPos;
    f: Facing;
    t: number;
    /** Ticks seguidos en que el de adelante no encontró camino. */
    fails?: number;
}

export interface SquadMemory {
    phase: SquadPhase;
    /** Todavía se le spawnean miembros (solo uno a la vez está reclutando). */
    recruiting: boolean;
    home: string;
    created: number;
    departed?: number;
    /** Room que ataca (el de la bandera Attack cuando salió). */
    target?: string;
    /** Ancla de reunión en Save. */
    rally?: PackedPos;
    /** Ancla en el room anterior al atacado: ahí se retiran a curarse. */
    staging?: PackedPos & { f: Facing };

    // --- Formación ---
    /** Centro del bloque 3x3 (la casilla del healer). */
    anchor?: PackedPos;
    facing?: Facing;
    rotatedAt?: number;
    /** Camino del bloque (direcciones) desde `pathAt`. */
    path?: string;
    pathKey?: string;
    pathAt?: string;
    pathTick?: number;
    /** Ticks trabados por un creep ajeno. */
    stuck?: number;
    /** Ticks sin poder formar. */
    blocked?: number;
    crossing?: CrossingMemory;
    plan?: CrossPlan;
    train?: TrainMemory;

    // --- Combate ---
    targetId?: Id<AnyStructure | Creep>;
    targetTier?: number;
    targetTick?: number;
    /** Muro / rampart / estructura que tapa el paso del bloque. */
    breachId?: Id<AnyStructure>;
    /** id -> tick hasta el que se ignora (no se pudo llegar). */
    unreachable?: Record<string, number>;
    /** Retirándose hasta curarse (histeresis). */
    healing?: boolean;
}

export interface PortalInfo {
    x: number;
    y: number;
    /** Room destino y casilla de llegada. */
    d: string;
    dx: number;
    dy: number;
}

export interface WarMemory {
    squads: Record<string, SquadMemory>;
    /** Índice del próximo nombre de pelotón. */
    nextName: number;
    /** Room -> tick en que termina su safe mode. */
    safeMode: Record<string, number>;
    /** Portales vistos por room (sin visión se siguen usando). */
    portals: Record<string, { t: number; list: PortalInfo[] }>;
    /** Lo último que se vio del room atacado: torres con energía (para no entrar a morir). */
    intel: Record<string, { towers: number; t: number }>;
}

/** Un pelotón armado para este tick. */
export interface Squad {
    id: string;
    mem: SquadMemory;
    /** Vivos, ya nacidos y con MOVE: los que forman. */
    creeps: WarCreep[];
    /** Vivos sin MOVE activo: ya no pueden seguir a la formación, pelean donde están. */
    stranded: WarCreep[];
    /** Todavía en el spawn. */
    spawning: WarCreep[];
    /** Todos los nombres del pelotón (para no confundirlos con creeps ajenos). */
    names: Set<string>;
    /** Movimientos ya emitidos este tick (el tren los usa para seguir al de adelante). */
    moved: Map<string, DirectionConstant>;
}

declare global {
    interface Memory {
        war?: WarMemory;
    }

    /** Consola: estado de los pelotones (ver utils/debug.ts). */
    function warInfo(): string;
}
