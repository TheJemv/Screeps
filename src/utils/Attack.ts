// A quiénes no atacamos ni les quitamos nada.
//
// Un solo lugar decide "hostil" vs "aliado": Attacker usa esto para elegir blancos, y
// cualquier otra cosa que en el futuro necesite pelear (torres, etc.) debería leer de
// acá en vez de usar FIND_HOSTILE_* directo.
//
// La lista vive en Memory para poder cambiarla desde la consola sin redeploy
// (`Memory.allies.push("nombre")` / `Memory.allies = []`), sembrada con DEFAULT_ALLIES
// la primera vez.

const DEFAULT_ALLIES: string[] = ["BustJetter", "Fandalah"];

/** Dueños NPC: nunca son aliados. */
const NPC = new Set(["Invader", "Source Keeper"]);

let cache: { list: string[]; set: Set<string> } | undefined;

/** La lista de aliados actual, en minúsculas para comparar. */
function allies(): Set<string> {
    Memory.allies ??= [...DEFAULT_ALLIES];
    const list = Memory.allies;

    // Se reconstruye solo cuando cambia la identidad o el largo del array.
    if (!cache || cache.list !== list || cache.set.size !== list.length) {
        cache = { list, set: new Set(list.map(n => n.toLowerCase())) };
    }
    return cache.set;
}

/** ¿Este jugador es aliado? Los NPC y el dueño vacío nunca lo son. */
export function isAlly(name: string | undefined): boolean {
    if (!name || NPC.has(name)) return false;
    return allies().has(name.toLowerCase());
}

/** ¿Este creep es de alguien con quien no peleamos? */
export function isAllyCreep(creep: Creep): boolean {
    return isAlly(creep.owner?.username);
}

/** Creeps hostiles de una sala, sin los aliados. */
export function getHostileCreeps(room: Room): Creep[] {
    return room.find(FIND_HOSTILE_CREEPS, { filter: c => !isAllyCreep(c) });
}

/** Estructuras hostiles de una sala, sin las de aliados. */
export function getHostileStructures(room: Room): AnyOwnedStructure[] {
    return room.find(FIND_HOSTILE_STRUCTURES, { filter: s => !isAlly(s.owner?.username) });
}

/** Agregar un aliado desde la consola. Devuelve la lista resultante. */
export function addAlly(name: string): string[] {
    Memory.allies ??= [...DEFAULT_ALLIES];
    if (!Memory.allies.some(n => n.toLowerCase() === name.toLowerCase())) {
        Memory.allies.push(name);
    }
    return Memory.allies;
}

/** Quitar un aliado desde la consola. Devuelve la lista resultante. */
export function removeAlly(name: string): string[] {
    Memory.allies ??= [...DEFAULT_ALLIES];
    Memory.allies = Memory.allies.filter(n => n.toLowerCase() !== name.toLowerCase());
    return Memory.allies;
}
