// src/roles/builder/services/assign.ts
import { isPowerBankSite } from "utils/GetPowerBank";
import { isReachable } from "utils/PortalRoute";

/** Rango de build(): un builder a esta distancia de su obra y con energía está trabajando en ella. */
const BUILD_RANGE = 3;

/**
 * Una obra ya empezada (progress > 0) cuenta como si estuviera esta cantidad
 * de casillas más cerca: primero se termina lo que quedó a medias, salvo que
 * una obra nueva quede mucho más cerca.
 */
const STARTED_SITE_BONUS = 10;

/** Distancia estimada a una obra en otro room: 50 casillas por room + media sala. */
const ROOM_DISTANCE = 50;

function isPriority(s: ConstructionSite): boolean {
    return s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN;
}

function remainingOf(site: ConstructionSite): number {
    return site.progressTotal - site.progress;
}

/** Energía que este builder va a poner en su obra: la que trae, o una carga completa si va a recargar. */
function energyOf(builder: Creep): number {
    const carried = builder.store[RESOURCE_ENERGY];
    return carried > 0 ? carried : builder.store.getCapacity(RESOURCE_ENERGY);
}

/** Está parado a rango de su obra y con energía: la está construyendo AHORA. */
function isWorkingOn(builder: Creep, site: ConstructionSite): boolean {
    return builder.store[RESOURCE_ENERGY] > 0 && builder.pos.inRangeTo(site, BUILD_RANGE);
}

/** Menor = mejor. Distancia al builder, con ventaja para las obras empezadas. */
function scoreFor(builder: Creep, site: ConstructionSite): number {
    const distance =
        site.pos.roomName === builder.room.name
            ? builder.pos.getRangeTo(site)
            : Game.map.getRoomLinearDistance(builder.room.name, site.pos.roomName) * ROOM_DISTANCE + ROOM_DISTANCE / 2;

    return distance - (site.progress > 0 ? STARTED_SITE_BONUS : 0);
}

/**
 * Corre UNA vez por tick (main.ts). Reparte las obras entre los builders:
 *
 *  - Cada obra acepta builders mientras la energía que ya le van a poner no
 *    cubra lo que le falta (no un número fijo de builders por obra).
 *  - Un builder que está trabajando en su obra NUNCA se saca de ahí: antes se
 *    lo movía a otra cuando la obra "ya tenía suficientes" y quedaba a medias.
 *  - A los libres se les asigna "el par más cercano primero": cada obra se
 *    queda con los builders que tiene más cerca.
 *  - Orden: container/extension/spawn primero; dentro de eso, las empezadas
 *    tienen ventaja (STARTED_SITE_BONUS).
 */
export function assignBuilderTargets(): void {
    const builders = _.filter(Game.creeps, (c: Creep) => c.memory.role === "builder");
    if (builders.length === 0) return;

    // Los containers sobre banderas Miner_ (futuros PowerBanks) los construye su
    // propio Miner: ni se reparten, y el builder que tuviera uno lo suelta.
    const sites = Object.values(Game.constructionSites).filter((s) => !isPowerBankSite(s));
    const siteById = new Map(sites.map((s) => [s.id, s]));

    // isReachable puede buscar portales (caro): una vez por par de rooms por tick.
    const reachable = new Map<string, boolean>();
    const canReach = (from: string, to: string): boolean => {
        const key = `${from}>${to}`;
        let value = reachable.get(key);
        if (value === undefined) {
            value = isReachable(from, to);
            reachable.set(key, value);
        }
        return value;
    };

    const committed = new Map<Id<ConstructionSite>, number>();
    const commit = (builder: Creep, site: ConstructionSite) => {
        builder.memory.targetSiteId = site.id;
        committed.set(site.id, (committed.get(site.id) ?? 0) + energyOf(builder));
    };
    const needsMore = (site: ConstructionSite) => (committed.get(site.id) ?? 0) < remainingOf(site);

    // ------------------------------------------------------------------
    // 1. Mantener asignaciones válidas. Primero los que YA están trabajando
    //    (esos se quedan siempre); después el resto, mientras la obra todavía
    //    necesite energía.
    // ------------------------------------------------------------------
    const assigned: { builder: Creep; site: ConstructionSite }[] = [];
    const free: Creep[] = [];

    for (const builder of builders) {
        const siteId = builder.memory.targetSiteId as Id<ConstructionSite> | undefined;
        const site = siteId ? siteById.get(siteId) : undefined;
        if (site) assigned.push({ builder, site });
        else {
            delete builder.memory.targetSiteId;
            free.push(builder);
        }
    }

    assigned.sort((a, b) => Number(isWorkingOn(b.builder, b.site)) - Number(isWorkingOn(a.builder, a.site)));

    for (const { builder, site } of assigned) {
        const keep =
            isWorkingOn(builder, site) || (needsMore(site) && canReach(builder.room.name, site.pos.roomName));

        if (keep) commit(builder, site);
        else {
            delete builder.memory.targetSiteId;
            free.push(builder);
        }
    }

    if (free.length === 0) return;

    // ------------------------------------------------------------------
    // 2. Repartir a los libres: todos los pares (builder, obra) ordenados por
    //    prioridad y cercanía, y se asigna el mejor par disponible primero.
    // ------------------------------------------------------------------
    const pairs: { builder: Creep; site: ConstructionSite; tier: number; score: number }[] = [];

    for (const builder of free) {
        for (const site of sites) {
            if (!needsMore(site) || !canReach(builder.room.name, site.pos.roomName)) continue;
            pairs.push({ builder, site, tier: isPriority(site) ? 0 : 1, score: scoreFor(builder, site) });
        }
    }

    pairs.sort((a, b) => a.tier - b.tier || a.score - b.score);

    const done = new Set<string>();
    for (const { builder, site } of pairs) {
        if (done.has(builder.name) || !needsMore(site)) continue;
        commit(builder, site);
        done.add(builder.name);
    }

    // Los que sobran se quedan sin obra (build.ts los pone a reparar o a estacionar).
}
