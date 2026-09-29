// src/guard/types.ts

/** idle: estacionado en casa | travel: yendo a la amenaza | fight: peleando | kite: manteniendo distancia
 *  rally: esperando compañeros | retreat: curándose | heal: curando a otros | return: volviendo a casa */
export type GuardState = "idle" | "travel" | "fight" | "kite" | "rally" | "retreat" | "heal" | "return";

/** home: el propio home room | watched: reserva / remoto con bandera | sos: creep mío atacado en otro room */
export type ThreatKind = "home" | "watched" | "sos";

export interface GuardCreepMemory extends CreepMemory {
    role: "Guardian";
    /** Home room al que pertenece (donde espera y se reemplaza). */
    home: string;
    /** Room de la amenaza asignada (DispatchManager). undefined = en casa. */
    mission?: string;
    state?: GuardState;
    /** Retirándose a curarse (histeresis entre RETREAT_BELOW y RETURN_ABOVE). */
    retreat?: boolean;
    /** Ticks que ya esperó a sus compañeros en esta misión. */
    rally?: number;
    /** Bandera Guard_N que le toca en casa (PostManager). */
    post?: string;
    /** Sin bandera libre: casilla donde se estaciona en casa (fuera de las roads). */
    park?: { x: number; y: number; room: string };
}

export interface GuardCreep extends Creep {
    memory: GuardCreepMemory;
}

export interface ThreatMemory {
    room: string;
    /** Home room cuyos vigilantes la atienden (el más cercano). */
    home: string;
    kind: ThreatKind;
    /** Tick en que apareció. */
    since: number;
    /** Último tick en que se vio (sin visión, se mantiene hasta MEMORY_TICKS). */
    lastSeen: number;
    hostiles: number;
    /** Daño + curación por tick de los enemigos (con boosts). 0 = inofensivos o solo un core. */
    power: number;
    /** Hay un invader core atacable. */
    core?: boolean;
    /** Dueños de los enemigos (Invader, jugador...). */
    owners: string[];
    /** Última posición conocida de un enemigo: hacia ahí van los vigilantes. */
    x: number;
    y: number;
}

export interface GuardMemory {
    /** Rooms vigilados -> último tick en que se confirmó (bandera o reserva vista). */
    watched: Record<string, number>;
    /** Amenazas activas por room. */
    threats: Record<string, ThreatMemory>;
}

declare global {
    interface Memory {
        guard?: GuardMemory;
    }

    /** Consola: estado de los vigilantes, rooms vigilados y amenazas (ver utils/debug.ts). */
    function guardInfo(): string;
}
