export function shouldFillControllerContainer(room: Room, container: StructureContainer): boolean {
    if (room.memory.fillControllerContainer === undefined) {
        room.memory.fillControllerContainer = false;
    }

    const energy = container.store[RESOURCE_ENERGY];

    // APAGAR MODO: Al llegar a 1800 de energía
    if (energy >= 1800) {
        room.memory.fillControllerContainer = false;
    }
    // ENCENDER MODO: Si cae por debajo de 200 de energía
    else if (energy < 200) {
        room.memory.fillControllerContainer = true;
    }

    return room.memory.fillControllerContainer;
}
