import { isReachable } from "utils/PortalRoute";

// 3 CARRY x 50 de capacidad = 150 -- el body actual de CREEPS_CONFIG.builder.
// Si cambia el body, hay que actualizar esto (no se calcula dinámico a
// propósito: los builders vivos pueden tener bodies viejos de antes de un
// cambio de config, así que un número fijo es más predecible que promediar).
const BUILDER_CARRY_CAPACITY = 150;

function isPriority(s: ConstructionSite): boolean {
    return s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_EXTENSION;
}

function buildersNeededFor(site: ConstructionSite): number {
    const remaining = site.progressTotal - site.progress;
    return Math.max(1, Math.ceil(remaining / BUILDER_CARRY_CAPACITY));
}

/** Corre UNA vez por tick (no por creep): reparte los builders entre los
 * construction sites según cuánta energía le falta a cada uno -- container/
 * extension primero, y dentro de cada uno, exactamente los builders que
 * hacen falta para completarlo (redondeado para arriba), no todos.
 *
 * PERSISTENTE: un builder que ya tiene un target válido y todavía hace falta
 * ahí se queda con ese, sin importar si otro quedó momentáneamente más
 * cerca ese tick puntual -- si se recalculara todo desde cero cada tick, la
 * distancia "más cercano" cambia con cada paso que caminan, y dos builders
 * pueden terminar intercambiándose el target en bucle sin llegar nunca a
 * ningún lado. Solo se reasigna a los que genuinamente quedaron sin nada
 * (nuevos, o su site se completó/dejó de necesitarlos). */
export function assignBuilderTargets(): void {
    const builders = _.filter(Game.creeps, (c: Creep) => c.memory.role === 'builder');
    if (builders.length === 0) return;

    const allSites = Object.values(Game.constructionSites);
    const siteById = new Map(allSites.map((s) => [s.id, s]));

    const byRemaining = (a: ConstructionSite, b: ConstructionSite) =>
        (a.progressTotal - a.progress) - (b.progressTotal - b.progress);

    const prioritySites = allSites.filter(isPriority).sort(byRemaining);
    const otherSites = allSites.filter((s) => !isPriority(s)).sort(byRemaining);
    const orderedSites = [...prioritySites, ...otherSites];

    // 1. Respetar las asignaciones existentes que sigan siendo válidas y
    // útiles (el site sigue existiendo, todavía necesita gente, y el builder
    // puede llegar).
    const claimedCount = new Map<Id<ConstructionSite>, number>();
    const unassigned: Creep[] = [];

    for (const c of builders) {
        const siteId = c.memory.targetSiteId as Id<ConstructionSite> | undefined;
        const site = siteId ? siteById.get(siteId) : undefined;

        if (!site) {
            if (siteId) delete c.memory.targetSiteId;
            unassigned.push(c);
            continue;
        }

        const need = buildersNeededFor(site);
        const already = claimedCount.get(site.id) ?? 0;

        if (already < need && isReachable(c.room.name, site.pos.roomName)) {
            claimedCount.set(site.id, already + 1);
            // Se queda con su target -- no se toca.
        } else {
            delete c.memory.targetSiteId;
            unassigned.push(c);
        }
    }

    // 2. Repartir a los que quedaron sin target entre los sites que todavía
    // les falte gente (descontando a los que ya se quedaron en el paso 1).
    let pool = unassigned;

    for (const site of orderedSites) {
        if (pool.length === 0) break;

        const need = buildersNeededFor(site);
        const already = claimedCount.get(site.id) ?? 0;
        const missing = need - already;
        if (missing <= 0) continue;

        const reachablePool = pool.filter((c) => isReachable(c.room.name, site.pos.roomName));
        const chosen = _.sortBy(reachablePool, (c: Creep) => c.pos.getRangeTo(site.pos.x, site.pos.y)).slice(0, missing);

        chosen.forEach((c: Creep) => {
            c.memory.targetSiteId = site.id as Id<ConstructionSite>;
        });

        pool = pool.filter((c) => !chosen.includes(c));
    }

    // Los que sobran de verdad: sin target.
    pool.forEach((c: Creep) => {
        delete c.memory.targetSiteId;
    });
}
