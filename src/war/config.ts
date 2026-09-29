// src/war/config.ts
//
// Todos los números afinables del sistema de guerra (pelotones de 6).
import type { SquadRole } from "./types";

export const WAR_CONFIG = {
    /** Apaga/prende el reclutamiento de pelotones nuevos (los que ya viven siguen peleando). */
    SPAWN_ACTIVE: false,

    /** Rol en memoria de todos los creeps de guerra (guard lo conoce como militar: no pide SOS por ellos). */
    ROLE: "WarCreep" as const,

    /** No les pegamos nunca. Se suma a Memory.allies (la lista que se edita desde la consola). */
    ALLIES: ["BustJetter", "Fandalah"],

    // --- Banderas ---
    FLAGS: {
        /** Punto de reunión: los pelotones nacen, se juntan y esperan aquí hasta estar COMPLETOS. */
        SAVE: "Save",
        /**
         * UNA sola bandera. El room donde está es el que se ataca entero (la posición
         * dentro del room no importa: los objetivos salen de las prioridades).
         */
        ATTACK: "Attack"
    },

    // --- Reclutamiento ---
    SPAWN: {
        /** Room que spawnea. Vacío = el room de la bandera Save (si es mío y tiene spawns); si no, el mío más cercano. */
        HOME_ROOM: "",
        SQUAD_NAMES: ["Alpha", "Beta", "Charlie", "Delta", "Echo"],
        /** Pelotones vivos a la vez como máximo (el que se recluta + los que están en campaña). */
        MAX_SQUADS: 3,
        /** Sin bandera Attack: ¿se recluta igual un pelotón para que espere listo en Save? */
        RECRUIT_WITHOUT_ATTACK: true,
        /** Composición y orden de spawn: 1 líder, 2 tanques, 1 healer, 2 ranged. */
        ORDER: ["Leader", "Tank", "Tank", "Healer", "Ranged", "Ranged"] as SquadRole[],
        /**
         * Cuerpos: el patrón se repite mientras alcance la energía del room (y maxRepeats).
         * Todos 1:1 con MOVE: en plano avanzan cada tick; en pantano todos se frenan
         * y la formación espera al más lento.
         *   1800e (RCL5): líder/tanque 5T 10A 15M · healer 6H 6M · ranged 9RA 9M
         */
        BODIES: {
            Leader: { pattern: [TOUGH, ATTACK, ATTACK, MOVE, MOVE, MOVE], maxRepeats: 8 },
            Tank: { pattern: [TOUGH, ATTACK, ATTACK, MOVE, MOVE, MOVE], maxRepeats: 8 },
            Healer: { pattern: [HEAL, MOVE], maxRepeats: 25 },
            Ranged: { pattern: [RANGED_ATTACK, MOVE], maxRepeats: 25 }
        } as Record<SquadRole, { pattern: BodyPartConstant[]; maxRepeats: number }>,
        /** Tope de energía por creep. 0 = toda la capacidad del room. */
        MAX_COST: 0,
        /** Prefijo de nombre: War_Alpha_T_12345. */
        NAME_PREFIX: "War"
    },

    // --- Movimiento en formación ---
    MOVE: {
        /** Costos de casilla para el bloque 3x3 (se usa el peor de las 9 casillas). */
        COST_ROAD: 1,
        COST_PLAIN: 2,
        COST_SWAMP: 10,
        /** Estructura enemiga que se puede romper (solo en el room atacado): base + hits / HITS_PER_POINT. */
        BREAK_BASE: 40,
        BREAK_HITS_PER_POINT: 10000,
        BREAK_MAX: 250,
        /** En el room atacado las estructuras cambian: el camino del bloque se recalcula cada N ticks. */
        SIEGE_REPATH_TICKS: 15,
        /** Ticks trabados por un creep ajeno antes de recalcular esquivando creeps. */
        STUCK_REPATH: 3,
        /** Ticks sin poder formar (una casilla tapada por un creep ajeno) antes de correr el ancla. */
        REANCHOR_TICKS: 6,
        /** Ticks mínimos entre dos giros de la formación. */
        ROTATE_COOLDOWN: 8,
        /** Distancia máxima (en pasos) para buscar dónde formar. */
        ANCHOR_SEARCH: 12,
        /** Al cruzar de room: el ancla del otro lado no puede quedar más lejos que esto de la entrada. */
        POST_CROSS_MAX: 6,
        /** Ticks máximos para terminar de cruzar (si no, se reagrupan donde estén). */
        CROSSING_TIMEOUT: 60,
        /** Modo tren (pasillos angostos): distancia máxima entre un creep y el de adelante. */
        TRAIN_LEASH: 2,
        /** Rutas y portales conocidos se recalculan cada N ticks. */
        ROUTE_TTL: 500,
        PORTAL_SCAN_TICKS: 100,
        /** Un portal solo se usa si ahorra al menos esta cantidad de rooms. */
        PORTAL_MIN_SAVING: 2
    },

    // --- Prioridades en el room atacado ---
    TARGETS: {
        /**
         * Niveles, en orden. Dentro de un nivel se elige el más barato
         * (distancia + ticks para romperlo). Siempre, aparte de esto, cada creep le
         * pega a lo que se le ponga enfrente.
         *   "threats" = creeps enemigos con partes de combate
         *   "creeps"  = cualquier creep enemigo que quede
         */
        TIERS: [
            [STRUCTURE_TOWER],
            [STRUCTURE_EXTENSION, STRUCTURE_SPAWN],
            "threats",
            [
                STRUCTURE_STORAGE,
                STRUCTURE_TERMINAL,
                STRUCTURE_LINK,
                STRUCTURE_LAB,
                STRUCTURE_FACTORY,
                STRUCTURE_POWER_SPAWN,
                STRUCTURE_NUKER,
                STRUCTURE_OBSERVER,
                STRUCTURE_EXTRACTOR,
                STRUCTURE_CONTAINER
            ],
            "creeps"
        ] as (StructureConstant[] | "threats" | "creeps")[],
        /** Cada cuánto se revisa si hay un objetivo mejor del mismo nivel. */
        RETARGET_TICKS: 10,
        /** Un objetivo al que no se pudo llegar se ignora estos ticks. */
        UNREACHABLE_TICKS: 200
    },

    // --- Antes de entrar ---
    SIEGE: {
        /**
         * Si en la última visita el room tenía torres con energía y la curación del
         * pelotón no alcanza ni para el daño MÍNIMO de esas torres (150 por torre a
         * distancia máxima), esperan formados en el room anterior en vez de entrar a
         * morir. false = entran igual (ej: para vaciarles la energía a las torres).
         */
        HOLD_IF_OUTGUNNED: true,
        /** Información del room atacado más vieja que esto se ignora. */
        INTEL_TTL: 3000
    },

    // --- Retirada ---
    RETREAT: {
        ENABLED: true,
        /** Algún miembro bajo este % de vida -> todos se retiran al room anterior a curarse. */
        MEMBER_BELOW: 0.45,
        /** O el pelotón entero bajo este % de vida total. */
        SQUAD_BELOW: 0.6,
        /** Vuelven a entrar cuando todos están sobre este %. */
        REENGAGE_ABOVE: 0.9
    },

    DEBUG: {
        VISUALS: true,
        COLORS: {
            BOX: "#ffaa00",
            SLOT: "#ffffff",
            TARGET: "#ff3333",
            TRAIN: "#33aaff"
        }
    }
};
