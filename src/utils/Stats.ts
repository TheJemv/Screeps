import { GetPowerBankContainers } from "./GetPowerBank";

// Corré stats() a mano desde la consola de Screeps para ver el balance de
// energía/tick de toda la colonia -- costo de upkeep vs. ganancia real de
// minado. No es una proyección teórica: usa los bodies y sources reales de
// ahora mismo.

/** Costo de spawn de cada creep vivo, amortizado sobre su vida útil (1500
 * ticks sin boosts) -- lo que cuesta, en promedio, reponerlo cuando muera.
 * Si se pasa `role`, solo suma los creeps de ese rol. */
function creepUpkeepCost(role?: string): number {
    const creeps = role
        ? _.filter(Game.creeps, (c: Creep) => c.memory.role === role)
        : Object.values(Game.creeps);

    return _.sum(creeps, (c: Creep) => {
        const bodyCost = c.body.reduce((sum, part) => sum + BODYPART_COST[part.type], 0);
        return bodyCost / CREEP_LIFE_TIME;
    });
}

/** Energía tirada en el piso AHORA MISMO, sin recoger -- decae con el tiempo
 * si nadie la levanta, así que un número alto acá es energía que se está
 * perdiendo de verdad, no solo "está tardando en llegar". */
function droppedEnergyOnGround(): number {
    let total = 0;
    for (const roomName in Game.rooms) {
        total += _.sum(
            Game.rooms[roomName].find(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.resourceType === RESOURCE_ENERGY
            }),
            (r) => r.amount
        );
    }
    return total;
}

/** Power banks (containers de banderas Miner_, locales o remotos) que están
 * al 90% o más de su capacidad -- ahí sí hay pérdida real: el Miner sigue
 * cosechando igual y esa energía de más se tira al piso sin remedio. Un
 * container general o el del controller lleno no cuenta acá -- ahí no hay
 * nada forzando un depósito constante, el Hauler simplemente no les manda
 * nada más (ver getGeneralContainers), no se pierde nada. */
function powerBanksNearFull(): { count: number; details: string[] } {
    const details: string[] = [];

    for (const c of GetPowerBankContainers()) {
        const used = c.store[RESOURCE_ENERGY];
        const capacity = used + c.store.getFreeCapacity(RESOURCE_ENERGY);
        if (capacity > 0 && used / capacity >= 0.9) {
            details.push(`${c.pos.roomName}(${c.pos.x},${c.pos.y}) ${used}/${capacity}`);
        }
    }

    return { count: details.length, details };
}

/** Decay pasivo de todos los roads visibles ahora mismo (100 hits cada 1000
 * ticks, 1 energía repara 100 hits). No incluye el desgaste extra por
 * tráfico de creeps -- eso varía tick a tick y no se puede leer de un
 * snapshot como este. */
function roadUpkeepCost(): number {
    let roadCount = 0;
    for (const roomName in Game.rooms) {
        roadCount += Game.rooms[roomName].find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_ROAD
        }).length;
    }
    return (roadCount * ROAD_DECAY_AMOUNT) / ROAD_DECAY_TIME / 100;
}

/** Decay pasivo de todos los containers visibles ahora mismo. Los que están
 * en un room que NO es tuyo (ej: power banks remotos) decaen bastante más
 * rápido -- CONTAINER_DECAY_TIME en vez de CONTAINER_DECAY_TIME_OWNED. */
function containerUpkeepCost(): number {
    let cost = 0;

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        const isOwned = Boolean(room.controller && room.controller.my);
        const decayTime = isOwned ? CONTAINER_DECAY_TIME_OWNED : CONTAINER_DECAY_TIME;

        const containerCount = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER
        }).length;

        cost += (containerCount * CONTAINER_DECAY) / decayTime / 100;
    }

    return cost;
}

/** Decay pasivo de todos los ramparts visibles ahora mismo. Storage,
 * Extension, Spawn, Tower y Wall NO decaen solos con el tiempo -- solo
 * pierden vida si los atacan, así que no suman upkeep acá. */
function rampartUpkeepCost(): number {
    let rampartCount = 0;
    for (const roomName in Game.rooms) {
        rampartCount += Game.rooms[roomName].find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_RAMPART
        }).length;
    }
    return (rampartCount * RAMPART_DECAY_AMOUNT) / RAMPART_DECAY_TIME / 100;
}

/** Consumo activo de energía de los ControllerCreep upgradeando: cada WORK
 * gasta UPGRADE_CONTROLLER_POWER (1) energía/tick mientras trabaja. A
 * diferencia del upkeep de spawn/decay, esto no es mantenimiento -- es el
 * costo real de invertir en RCL -- pero sale de la misma energía minada, así
 * que también hay que restarlo del NETO. Asume que están upgradeando sin
 * parar (así están diseñados: parados fijos en su flag, sin otro trabajo).
 * El Upgrader normal no entra acá -- su body no tiene WORK a propósito. */
function controllerUpgradeCost(): number {
    return _.sum(
        _.filter(Game.creeps, (c: Creep) => c.memory.role === 'controllercreep'),
        (c: Creep) => c.body.filter((p) => p.type === WORK).length * UPGRADE_CONTROLLER_POWER
    );
}

/** Rendimiento sostenido real de cada Miner vivo (local o remoto): el mínimo
 * entre lo que sus WORK parts pueden cosechar por tick y lo que el source
 * realmente regenera en promedio (3000/300 si el room es tuyo o está
 * reservado, 1500/300 si no). */
function minerIncome(): number {
    let total = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role !== 'miner') continue;

        const workParts = creep.body.filter((p) => p.type === WORK).length;
        const harvestCapacity = workParts * HARVEST_POWER;

        const flag = creep.memory.minerFlag ? Game.flags[creep.memory.minerFlag] : undefined;
        const source = flag && flag.room ? flag.pos.findInRange(FIND_SOURCES, 1)[0] : undefined;

        if (!flag || !flag.room || !source) {
            // Sin visión del room ahora mismo -- asumimos su tope teórico
            // como aproximación optimista.
            total += harvestCapacity;
            continue;
        }

        const reservedOrOwned = Boolean(
            flag.room.controller && (flag.room.controller.my || flag.room.controller.reservation)
        );
        const capacity = reservedOrOwned ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY;
        const regenRate = capacity / ENERGY_REGEN_TIME;

        total += Math.min(harvestCapacity, regenRate);
    }

    return total;
}

export function stats(): void {
    const creepCost = creepUpkeepCost();
    const haulerCost = creepUpkeepCost('hauler');
    const roadCost = roadUpkeepCost();
    const containerCost = containerUpkeepCost();
    const rampartCost = rampartUpkeepCost();
    const upgradeCost = controllerUpgradeCost();
    const totalCost = creepCost + roadCost + containerCost + rampartCost + upgradeCost;

    const income = minerIncome();
    const net = income - totalCost;

    const dropped = droppedEnergyOnGround();
    const overflow = powerBanksNearFull();

    console.log('===== STATS (energía/tick) =====');
    console.log(`Costo creeps (spawn amortizado): ${creepCost.toFixed(3)}`);
    console.log(`  de los cuales Hauler:          ${haulerCost.toFixed(3)}`);
    console.log(`Costo roads (decay pasivo):      ${roadCost.toFixed(3)}`);
    console.log(`Costo containers (decay pasivo): ${containerCost.toFixed(3)}`);
    console.log(`Costo ramparts (decay pasivo):   ${rampartCost.toFixed(3)}`);
    console.log(`Costo upgrade (ControllerCreep, consumo activo): ${upgradeCost.toFixed(3)}`);
    console.log(`COSTO TOTAL:                     ${totalCost.toFixed(3)}`);
    console.log('---------------------------------');
    console.log(`Ganancia (mining sostenido):     ${income.toFixed(3)}`);
    console.log('---------------------------------');
    console.log(`NETO:                            ${net.toFixed(3)} ${net >= 0 ? '✅' : '⚠️'}`);
    console.log('===== ENERGÍA PERDIDA =====');
    console.log(`Tirada en el piso sin recoger:   ${dropped.toFixed(0)} ${dropped > 0 ? '⚠️' : '✅'}`);
    console.log(`Power banks casi llenos (>=90%): ${overflow.count} ${overflow.count > 0 ? '⚠️' : '✅'}`);
    overflow.details.forEach((d) => console.log(`  - ${d}`));
}
