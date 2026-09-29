// src/guard/config.ts

export const GUARD_CONFIG = {
    /** Rol en memoria. main.ts no lo conoce, así que no lo corre dos veces. */
    ROLE: "Guardian" as const,

    /** Vigilantes que viven en cada home room. */
    COUNT: 3,

    // --- Spawn ---
    SPAWN: {
        ENABLED: true,
        NAME_PREFIX: "Guardian",
        /**
         * Orden en que se agregan partes de combate, cada una con su MOVE (1:1 =
         * velocidad completa en plano: llegan rápido). Se repite mientras alcance
         * la energía; si una parte no entra, prueba con las siguientes.
         *   1300e (RCL4) -> 3 RANGED, 3 ATTACK, 1 HEAL
         *   1800e (RCL5) -> 4 RANGED, 3 ATTACK, 2 HEAL
         */
        PART_CYCLE: [RANGED_ATTACK, ATTACK, RANGED_ATTACK, HEAL, ATTACK] as BodyPartConstant[],
        /** Tope de energía por vigilante (el cuerpo escala con energyCapacityAvailable hasta acá). */
        MAX_COST: 3000,
        /** Nunca spawnea un vigilante más barato que esto (no sirve de nada). */
        MIN_COST: 450,
        /** El reemplazo nace cuando al viejo le quedan (tiempo de spawn + esto) ticks. */
        REPLACE_MARGIN: 100
    },

    // --- Qué rooms se cuidan ---
    ROOMS: {
        /** Home rooms fijos. Vacío = todos mis rooms con spawn y RCL >= MIN_HOME_RCL. */
        HOME_ROOMS: [] as string[],
        MIN_HOME_RCL: 3,
        /**
         * Banderas cuyo room se vigila: reservas (Claim / Claim_), minería remota
         * (Miner_) y cualquiera a mano (Watch_xxx). Además se vigilan solos los
         * rooms que se ven reservados por mí.
         */
        WATCH_FLAG_PREFIXES: ["Watch_", "Claim", "Miner_"],
        /** Un room que dejó de verse reservado y no tiene bandera se olvida a los N ticks. */
        WATCH_FORGET_TICKS: 20000,
        /**
         * Auxilio (SOS): un creep mío herido por enemigos armados en un room que
         * NO se vigila (ej: un remoteHauler de paso) también se atiende, si ese
         * room está a esta distancia lineal de casa o menos.
         */
        SOS_MAX_DISTANCE: 2
    },

    // --- Amenazas ---
    THREAT: {
        /**
         * Sin visión (murieron los creeps que veían el room) la amenaza sigue
         * activa hasta que un vigilante llegue y confirme que no queda nadie, o
         * hasta N ticks (la vida de un invader).
         */
        MEMORY_TICKS: 1500,
        SOS_MEMORY_TICKS: 200,
        /** true = no salir por enemigos sin partes peligrosas (scouts con solo MOVE). */
        IGNORE_HARMLESS: false,
        /** Invader cores de nivel <= este también se atacan (bloquean la reserva). -1 = nunca. */
        MAX_CORE_LEVEL: 0,
        /** Vigilantes por amenaza = poder enemigo * esto / poder de un vigilante (mínimo 1). */
        SAFETY_FACTOR: 1.5,
        /** Los que sobran también salen (a la amenaza más peligrosa) en vez de quedarse en casa. */
        SEND_EXTRA: true
    },

    // --- Combate ---
    COMBAT: {
        /** Por debajo de este % de vida prioriza curarse antes que pegar melee. */
        SELF_HEAL_BELOW: 0.6,
        /** Por debajo de este % se retira (fuera del alcance enemigo) a curarse. */
        RETREAT_BELOW: 0.4,
        /** Vuelve a pelear al recuperar este %. */
        RETURN_ABOVE: 0.85,
        /** Distancia que mantiene de los melee enemigos más fuertes que él (kiting). */
        KITE_RANGE: 3,
        /**
         * Si el enemigo es más fuerte que los vigilantes que ya llegaron, los
         * primeros esperan a los compañeros (fuera de su alcance) hasta N ticks
         * en vez de morir de a uno.
         */
        RALLY_MAX_WAIT: 25,
        RALLY_DISTANCE: 5
    },

    // --- En casa ---
    IDLE: {
        /**
         * Puestos fijos: banderas Guard_1, Guard_2... en el home room. Cada
         * vigilante tiene la suya (siempre la misma) y se para encima.
         */
        FLAG_PREFIX: "Guard_",
        /** Sin bandera libre: se estacionan fuera de las roads, a esta distancia del storage/spawn. */
        PARK_MIN_RANGE: 2,
        PARK_MAX_RANGE: 7
    },

    /** Colores de los caminos (visualizePathStyle). */
    COLORS: {
        TRAVEL: "#ff3333",
        FIGHT: "#ff0000",
        HOME: "#8888ff",
        HEAL: "#00ff88"
    }
};
