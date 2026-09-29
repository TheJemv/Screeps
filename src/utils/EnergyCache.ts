// src/utils/EnergyCache.ts
//
// Caché de energía para los builders. Se pone la bandera "Cache_Energy" cerca
// de la zona de obras; un HaulerLocal deja energía tirada pegada a ella
// (role/HaulerLocal/managers/CacheManager.ts) y los builders la toman de ahí en
// vez de ir hasta el storage (role/Builder/services/collect.ts).

export const CACHE_FLAG_NAME = "Cache_Energy";

/** La energía tirada a esta distancia de la bandera cuenta como parte de la caché. */
export const CACHE_PILE_RANGE = 1;

export function cacheFlag(): Flag | undefined {
    return Game.flags[CACHE_FLAG_NAME];
}

/** Pilas de energía de la caché (vacío si no hay bandera o no hay visión de su room). */
export function cachePiles(): Resource[] {
    const flag = cacheFlag();
    if (!flag || !flag.room) return [];

    return flag.pos.findInRange(FIND_DROPPED_RESOURCES, CACHE_PILE_RANGE, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY
    });
}

/** Energía total que hay ahora en la caché. */
export function cacheAmount(): number {
    return _.sum(cachePiles(), (r: Resource) => r.amount);
}

/** ¿Esta energía tirada es parte de la caché? Los HaulerLocal no deben volver a levantarla. */
export function isCachePile(resource: Resource): boolean {
    const flag = cacheFlag();
    return (
        flag !== undefined &&
        flag.pos.roomName === resource.pos.roomName &&
        flag.pos.inRangeTo(resource.pos, CACHE_PILE_RANGE)
    );
}
