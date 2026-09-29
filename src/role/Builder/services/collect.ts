// src/roles/builder/services/collect.ts
import { AdvancedMove } from "../../../utils/AdvancedMove";
import { BuilderCreep } from "../types";
import { cachePiles } from "../../../utils/EnergyCache";
import { isPowerBankSite } from "../../../utils/GetPowerBank";

/** Si ya trae algo de energía y hay una obra a este rango, construye ahí en vez de ir a buscar más. */
const BUILD_WHILE_COLLECTING_RANGE = 3;
/** Energía tirada: solo si está a esta distancia en línea recta... */
const PICKUP_RANGE = 3;
/** ...y se llega caminando en estos pasos como mucho (no rodeando un muro para ir "al lado"). */
const PICKUP_MAX_STEPS = 4;
/** Pilas más chicas no valen el desvío. */
const PICKUP_MIN_AMOUNT = 50;

export function collectEnergy(creep: BuilderCreep): void {
    // ==============================================================
    // 0. YA TRAE ENERGÍA Y TIENE UNA OBRA AL LADO: usar lo que tiene
    // ==============================================================
    if (buildWithWhatItHas(creep)) return;

    // ==============================================================
    // 1. ENERGÍA MUY CERCA (≤3 casillas y ≤4 pasos reales): tirada en
    //    el suelo o en una tombstone (un creep que murió cargando)
    // ==============================================================
    const nearby = findNearbyEnergy(creep);
    if (nearby) {
        const result = "amount" in nearby ? creep.pickup(nearby) : creep.withdraw(nearby, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
            AdvancedMove.travel(creep, nearby, {
                range: 1,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        }
        return; // 🛑 Se detiene aquí, ¡ya no camina hacia el Storage!
    }

    const homeRoomName = creep.memory.room || creep.room.name;
    const homeRoom = Game.rooms[homeRoomName];

    // ==============================================================
    // 2. CACHÉ DE ENERGÍA (bandera Cache_Energy): si queda más cerca que el storage
    // ==============================================================
    const cache = cachePileCloserThanStorage(creep, homeRoom ? homeRoom.storage : undefined);
    if (cache) {
        if (creep.pickup(cache) === ERR_NOT_IN_RANGE) {
            AdvancedMove.travel(creep, cache, {
                range: 1,
                visualizePathStyle: { stroke: '#ffff00' }
            });
        }
        return;
    }

    // ==============================================================
    // 3. SI NO: Regresar al Storage de Casa
    // ==============================================================

    if (homeRoom && homeRoom.storage && homeRoom.storage.store[RESOURCE_ENERGY] > 0) {
        if (creep.withdraw(homeRoom.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            AdvancedMove.travel(creep, homeRoom.storage, {
                range: 1,
                visualizePathStyle: { stroke: '#ffaa00', lineStyle: 'dashed' }
            });
        }
        return;
    }

    // Si no hay Storage, buscar Containers en casa
    const homeContainers = homeRoom ? homeRoom.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity()
    }) : [];

    if (homeContainers.length > 0) {
        const target = creep.pos.findClosestByPath(homeContainers);
        if (target && creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            AdvancedMove.travel(creep, target, { range: 1, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
    }

    // Regreso de emergencia si está perdido
    if (homeRoom && creep.room.name !== homeRoom.name) {
        const spawn = homeRoom.find(FIND_MY_SPAWNS)[0];
        if (spawn) {
            AdvancedMove.travel(creep, spawn, { range: 3 });
        }
    }
}

/**
 * Sigue en modo "recolectar" hasta llenarse, pero si ya trae algo de energía
 * y tiene una obra al alcance, no tiene sentido irse a buscar más: la usa ahí
 * mismo (primero en la obra que tiene asignada, si está al alcance).
 */
function buildWithWhatItHas(creep: BuilderCreep): boolean {
    if (creep.store[RESOURCE_ENERGY] === 0) return false;

    // Nunca los futuros PowerBanks: esos los construye su Miner.
    const sites = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, BUILD_WHILE_COLLECTING_RANGE, {
        filter: (s) => !isPowerBankSite(s)
    });
    if (sites.length === 0) return false;

    const site = sites.find((s) => s.id === creep.memory.targetSiteId) ?? creep.pos.findClosestByRange(sites);
    return site !== null && creep.build(site) === OK;
}

/**
 * La energía más cercana que valga la pena: una pila en el suelo o una
 * tombstone (cuando un creep muere, lo que cargaba queda guardado en su
 * tombstone). Tiene que estar a ≤3 casillas en línea recta Y a ≤4 pasos
 * caminando: algo "a 3 casillas" del otro lado de un muro puede estar a 30
 * pasos rodeándolo.
 */
function findNearbyEnergy(creep: BuilderCreep): Resource | Tombstone | null {
    const candidates: (Resource | Tombstone)[] = [
        ...creep.pos.findInRange(FIND_DROPPED_RESOURCES, PICKUP_RANGE, {
            filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= PICKUP_MIN_AMOUNT
        }),
        ...creep.pos.findInRange(FIND_TOMBSTONES, PICKUP_RANGE, {
            filter: (t) => t.store[RESOURCE_ENERGY] >= PICKUP_MIN_AMOUNT
        })
    ];

    let best: Resource | Tombstone | null = null;
    let bestSteps = Infinity;

    for (const candidate of candidates) {
        const steps = AdvancedMove.stepsTo(creep, candidate, 1);
        if (steps <= PICKUP_MAX_STEPS && steps < bestSteps) {
            best = candidate;
            bestSteps = steps;
        }
    }

    return best;
}

/**
 * La pila más grande de la caché (bandera Cache_Energy), si está en este room
 * y queda más cerca que el storage. Para eso existe: que los builders que
 * trabajan lejos no tengan que ir hasta el storage.
 */
function cachePileCloserThanStorage(creep: BuilderCreep, storage: StructureStorage | undefined): Resource | null {
    let best: Resource | null = null;
    for (const pile of cachePiles()) {
        if (pile.pos.roomName !== creep.pos.roomName || pile.amount < PICKUP_MIN_AMOUNT) continue;
        if (!best || pile.amount > best.amount) best = pile;
    }
    if (!best) return null;

    const toStorage =
        storage && storage.store[RESOURCE_ENERGY] > 0 && storage.pos.roomName === creep.pos.roomName
            ? creep.pos.getRangeTo(storage)
            : Infinity;
    return creep.pos.getRangeTo(best) <= toStorage ? best : null;
}
