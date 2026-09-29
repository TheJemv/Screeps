import { AdvancedMove } from "utils/AdvancedMove";
import { getAvailableEnergy } from "utils/EnergyReservations";
import { GetPowerBankContainers } from "utils/GetPowerBank";
import { REPAIRER_CONFIG } from "../config";
import TargetManager from "../managers/TargetManager";
import { RepairerCreep } from "../types";

type EnergySource = StructureStorage | StructureContainer | Resource;

const ORANGE: PolyStyle = { stroke: '#ffaa00' };

/**
 * Carga energía. Regla principal: NUNCA cruza a otro room solo para buscar
 * energía. Antes usaba withdrawFromPowerBank(), que como último recurso lo
 * mandaba a CUALQUIER container minero del imperio: con los containers de
 * casa vaciados por los HaulerLocal, terminaba en el container remoto lleno
 * (el que tiene energía tirada alrededor) y ya no volvía.
 *
 *   1. Si tiene un trabajo pendiente en el room remoto donde está parado:
 *      la energía tirada de ahí (se pudre) o el container minero de ese room.
 *   2. El storage de casa, si le sobra (deja STORAGE_RESERVE para spawns/haulers).
 *   3. Los containers mineros de casa, respetando lo que otros ya reservaron.
 *
 * Devuelve false si no hay de dónde cargar (index.ts decide qué hacer).
 */
export function collectEnergy(creep: RepairerCreep): boolean {
    const source = pickSource(creep);

    if (!source) {
        delete creep.memory.targetContainerId;
        return false;
    }

    // Solo los containers se reservan (utils/EnergyReservations descuenta lo que otros van a sacar).
    if (!("amount" in source) && source.structureType === STRUCTURE_CONTAINER) {
        creep.memory.targetContainerId = source.id;
    } else {
        delete creep.memory.targetContainerId;
    }

    const result = "amount" in source ? creep.pickup(source) : creep.withdraw(source, RESOURCE_ENERGY);
    if (result === ERR_NOT_IN_RANGE) {
        AdvancedMove.travel(creep, source, { range: 1, visualizePathStyle: ORANGE });
    }

    return true;
}

function pickSource(creep: RepairerCreep): EnergySource | null {
    const home = creep.memory.homeRoom;

    // 1. Trabajando en un remoto: cargar ahí mismo en vez de viajar a casa.
    if (creep.room.name !== home) {
        const job = TargetManager.current(creep);

        if (job && job.pos.roomName === creep.room.name) {
            const local = localSource(creep);
            if (local) return local;

            // Aquí no hay energía: si ya trae algo, mejor gastarlo en el trabajo que ir a casa por más.
            if (creep.store[RESOURCE_ENERGY] >= REPAIRER_CONFIG.MIN_ENERGY_TO_WORK) return null;
        }
    }

    // 2. Storage de casa.
    const storage = Game.rooms[home]?.storage;
    if (storage && storage.store[RESOURCE_ENERGY] > REPAIRER_CONFIG.STORAGE_RESERVE) return storage;

    // 3. Containers mineros de casa.
    return minerContainer(creep, home);
}

/** Energía del room remoto donde está trabajando: pilas tiradas y su container minero, lo más cercano. */
function localSource(creep: RepairerCreep): EnergySource | null {
    const piles: EnergySource[] = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= REPAIRER_CONFIG.MIN_CONTAINER_ENERGY
    });

    const container = minerContainer(creep, creep.room.name);
    if (container) piles.push(container);

    return creep.pos.findClosestByRange(piles);
}

/** Container minero (bandera Miner_) del room con energía libre; sigue con el que ya tenía reservado. */
function minerContainer(creep: RepairerCreep, roomName: string): StructureContainer | null {
    const reservedId = creep.memory.targetContainerId;
    const reserved = reservedId ? Game.getObjectById(reservedId) : null;
    if (reserved && reserved.pos.roomName === roomName && reserved.store[RESOURCE_ENERGY] > 0) return reserved;

    const options = GetPowerBankContainers().filter(
        (c) => c.pos.roomName === roomName && getAvailableEnergy(c, creep as Creep) >= REPAIRER_CONFIG.MIN_CONTAINER_ENERGY
    );
    if (options.length === 0) return null;

    // findClosestByRange no ve objetos de otro room: desde afuera, el que más energía tenga.
    return (
        creep.pos.findClosestByRange(options) ??
        options.reduce((a, b) => (b.store[RESOURCE_ENERGY] > a.store[RESOURCE_ENERGY] ? b : a))
    );
}
