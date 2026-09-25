import { GetPowersBank } from "./GetPowerBank";
import { getControllerContainer } from "./GetControllerContainer";

/**
 * Containers de un room que no son ni el del controller ni un power bank
 * (los de las banderas Miner_) -- containers "sueltos" de propósito general.
 * No filtra por energía/capacidad, eso lo decide cada caller.
 */
export function getGeneralContainers(room: Room): StructureContainer[] {
    const controllerContainer = getControllerContainer(room);
    const powerBankIds = GetPowersBank();

    return room.find(FIND_STRUCTURES, {
        filter: (s): s is StructureContainer =>
            s.structureType === STRUCTURE_CONTAINER &&
            (!controllerContainer || s.id !== controllerContainer.id) &&
            !powerBankIds.has(s.id)
    });
}
