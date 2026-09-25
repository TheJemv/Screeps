// Corre UNA vez por tick (no por creep, los Link no son creeps): la posta
// Link -> Link es una acción de la estructura, no algo que haga un creep.
//
// Un link "receptor" es el que tiene un Storage a rango 1 (ahí lo drena el
// LinkKeeper del lado B). Cualquier otro link propio es "emisor" -- cuando
// junta al menos la mitad de su capacidad, le manda todo al receptor más
// cercano. Esperar a la mitad en vez de mandar apenas tenga algo evita
// transferencias chiquitas que gastan cooldown sin aprovecharlo.

const SEND_THRESHOLD = 0.5;

function isReceiver(link: StructureLink): boolean {
    return link.pos.findInRange(FIND_MY_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_STORAGE
    }).length > 0;
}

export function runLinks(): void {
    const links = Object.values(Game.structures).filter(
        (s): s is StructureLink => s.structureType === STRUCTURE_LINK
    );
    if (links.length < 2) return;

    const receivers = links.filter(isReceiver);
    if (receivers.length === 0) return;

    for (const link of links) {
        if (isReceiver(link)) continue;
        if (link.cooldown > 0) continue;
        if (link.store[RESOURCE_ENERGY] < link.store.getCapacity(RESOURCE_ENERGY)! * SEND_THRESHOLD) continue;

        const receiver = link.pos.findClosestByRange(receivers);
        if (receiver) link.transferEnergy(receiver);
    }
}
