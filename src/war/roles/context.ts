// src/war/roles/context.ts

/** Lo que el pelotón decidió este tick y los roles necesitan para pelear. */
export interface CombatContext {
    /** Room donde se pueden romper estructuras (el atacado). Fuera de él solo se pelea con creeps. */
    siegeRoom?: string;
    /** Objetivo del pelotón este tick: el de las prioridades, o el muro que tapa el paso. */
    focus?: AnyStructure | Creep | null;
    /** El pelotón está en territorio enemigo: el healer pre-cura aunque nadie esté herido. */
    danger: boolean;
}
