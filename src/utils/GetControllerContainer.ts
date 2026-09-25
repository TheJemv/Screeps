export function getControllerContainer(room: Room): StructureContainer | null {
    if (!room.controller) return null;

    const container = room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: { structureType: STRUCTURE_CONTAINER }
    })[0] as StructureContainer | undefined;

    return container || null;
}
