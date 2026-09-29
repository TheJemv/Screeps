// src/utils/AdvancedMove/config.ts

export const ADVANCED_MOVE_CONFIG = {
    /** Rango por defecto cuando no se pasa `range`. */
    DEFAULT_RANGE: 1,

    // --- Búsqueda de caminos ---
    PATH: {
        /**
         * Prioridad de las roads. Cada casilla FUERA de la road cuesta este %
         * más de lo que de verdad tarda en ticks. Una ruta por road se elige
         * mientras no tarde más de ese % que el atajo por el plano, y los
         * empates siempre van por la road.
         *   0   -> solo tiempo (el más rápido, aunque salga de la road)
         *   0.3 -> acepta hasta 30% más de ticks por ir por la road
         *   1   -> acepta hasta el doble
         */
        ROAD_PREFERENCE: 0.3,
        /**
         * Escala interna: lo que vale una road en la CostMatrix (el plano y el
         * pantano se escalan igual). Con 10 la heurística de PathFinder
         * (heuristicWeight máx. 9) nunca sobreestima -> caminos óptimos.
         * Con el default del motor (1.2 y road = 1) A* puede devolver caminos
         * hasta ~20% más largos. No hace falta tocarlo.
         */
        ROAD_COST: 10,
        /**
         * Operaciones de PathFinder para un viaje dentro del mismo room. Cada op
         * cierra una casilla y un room tiene 2500: con 2500 la búsqueda es
         * exhaustiva, así que nunca se corta a medias en un camino largo (y no
         * termina rodeando por un room vecino sin necesidad).
         */
        SINGLE_ROOM_OPS: 2500,
        /** Operaciones de PathFinder por cada room permitido en viajes entre rooms. */
        OPS_PER_ROOM: 2000,
        /** Tope absoluto de operaciones por búsqueda. */
        MAX_OPS: 20000,
        /** Si no hay camino dentro del mismo room, reintenta dejando cruzar hasta N rooms. */
        SAME_ROOM_RETRY_MAX_ROOMS: 3,
        /**
         * Ticks sin volver a llamar a PathFinder después de una búsqueda sin
         * resultado (anti-quema de CPU). Se duplica con cada fallo seguido.
         */
        NO_PATH_COOLDOWN: 5,
        NO_PATH_MAX_COOLDOWN: 50,
        /**
         * Objetivo que se mueve de a una casilla: se estira el path en vez de
         * recalcular, salvo que ya sea N pasos más largo que ir directo.
         */
        MOVING_TARGET_SLACK: 4
    },

    // --- Carriles (2+ roads paralelas) ---
    LANES: {
        /**
         * Circular por la DERECHA de su sentido de marcha: el que va y el que
         * vuelve usan carriles distintos y no se cruzan de frente.
         */
        ENABLED: true,
        /**
         * Recargo por pisar un carril que tiene otro carril a su derecha (en la
         * escala de ROAD_COST). Se recorta para que nunca iguale al plano: ir
         * por el carril equivocado siempre es mejor que salirse de la road.
         */
        WRONG_LANE_COST: 2,
        /**
         * Descuento para el carril de la derecha (el de más a la derecha de 2+
         * paralelos). Junto con WRONG_LANE_COST hace que pegarse a la derecha
         * valga aunque cueste un paso más (ej: el carril de afuera de una curva).
         */
        RIGHT_LANE_BONUS: 3,
        /** Recargo por road que no sigue derecho (plazas, cruces): desempata a favor del carril recto. */
        OFF_LANE_COST: 1,
        /**
         * El carril de al lado cuenta si sigue para adelante al menos estas
         * casillas (una menos si el propio se termina antes, como el carril de
         * afuera de una curva). Siempre el mismo largo: así, mientras el carril
         * de arriba sigue, el creep no baja y vuelve a subir (zigzag).
         */
        MIN_RUN: 3,
        /**
         * Carril "que sigue": una road que se corta antes de este largo (plaza,
         * cruce, resto de road) paga OFF_LANE_COST. Y el carril de la derecha
         * solo cuenta si sigue tanto como el propio (hasta este largo): el
         * costado de una plaza no obliga a meterse en ella.
         */
        FULL_RUN: 5,
        /** Pasos antes y después con los que se calcula el sentido de marcha (suaviza zigzags). */
        HEADING_WINDOW: 3,
        /** Distancia al camino hasta donde se aplican los recargos (alcanza para 4 carriles). */
        BAND: 3
    },

    // --- Atascos ---
    STUCK: {
        /** Ticks sin avanzar antes del primer recálculo esquivando creeps. */
        REPATH_AFTER: 2,
        /** Mientras siga atascado, vuelve a recalcular a los N, 2N, 4N, 8N... ticks (espaciado exponencial). */
        REPATH_EVERY: 3,
        /**
         * Costo (en casillas de road) que se suma POR CADA TICK atascado a las
         * casillas con creeps cercanos. Esquive progresivo: al principio
         * prefiere esperar a que se muevan; cuanto más dura el atasco, más largo
         * el rodeo que acepta. Nunca llega a 255 -> jamás deja al creep sin
         * camino en un pasillo.
         */
        CREEP_COST_PER_TICK: 10,
        /** Solo los creeps a este radio cuentan como obstáculo (los lejanos ya se habrán movido). */
        CREEP_AVOID_RADIUS: 4
    },

    // --- Tráfico ---
    TRAFFIC: {
        /**
         * Un creep quieto se puede empujar solo si está trabajando cerca de su
         * último destino de AdvancedMove (a esta distancia o menos). Al
         * empujarlo nunca se lo aleja de ese destino.
         */
        SHOVE_MAX_ANCHOR_RANGE: 3,
        /** Ticks que sigue siendo válido ese "ancla" desde la última llamada a travel(). */
        ANCHOR_TTL: 300
    },

    // --- Cachés en heap ---
    CACHE: {
        /** Reconstruye la CostMatrix de estructuras cada N ticks aunque no cambie el conteo. */
        MATRIX_TTL: 500,
        /** Vida de una ruta entre rooms (Game.map.findRoute) cacheada. */
        ROUTE_TTL: 1000,
        /** Cada cuántos ticks se vuelven a leer los portales de un room. */
        PORTAL_TTL: 100
    },

    // --- Costo de cruzar rooms (findRoute) ---
    ROOM_COST: {
        HIGHWAY: 1,
        DEFAULT: 1.5,
        SOURCE_KEEPER: 5,
        /** Room con dueño que no soy yo ni un aliado (Memory.allies). */
        HOSTILE: 10
    },

    /** Máximo de pasos que se dibujan con visualizePathStyle. */
    VISUAL_MAX_STEPS: 40,

    /** Logs de diagnóstico en consola. */
    DEBUG: false
};
