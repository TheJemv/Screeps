// src/guard/managers/PostManager.ts
//
// Puestos fijos en casa: banderas Guard_1, Guard_2... en el home room.
// Una bandera por vigilante y siempre la misma (la conserva mientras está de
// misión, así vuelve a su lugar). Si hay más vigilantes que banderas (ej: el
// reemplazo nace antes de que muera el viejo), los que sobran se estacionan
// fuera de las roads hasta que se libere una.
import { GUARD_CONFIG } from "../config";
import { GuardCreep } from "../types";

/** Número al final del nombre (Guard_2 < Guard_10); sin número, al final. */
function flagNumber(name: string): number {
    const match = /(\d+)$/.exec(name);
    return match ? Number(match[1]) : Infinity;
}

/** Banderas Guard_ del home, en orden: Guard_1, Guard_2, ... */
export function postFlags(home: string): Flag[] {
    const prefix = GUARD_CONFIG.IDLE.FLAG_PREFIX;
    const flags: Flag[] = [];
    for (const name in Game.flags) {
        const flag = Game.flags[name];
        if (flag.pos.roomName === home && name.startsWith(prefix)) flags.push(flag);
    }
    return flags.sort((a, b) => flagNumber(a.name) - flagNumber(b.name) || a.name.localeCompare(b.name));
}

export default class PostManager {
    public static assign(home: string, guards: GuardCreep[]): void {
        const flags = postFlags(home);
        const names = new Set(flags.map(f => f.name));
        const taken = new Set<string>();
        const free: GuardCreep[] = [];

        // Conserva su bandera si sigue existiendo y nadie más la tiene.
        for (const guard of guards) {
            const post = guard.memory.post;
            if (post && names.has(post) && !taken.has(post)) {
                taken.add(post);
            } else {
                delete guard.memory.post;
                free.push(guard);
            }
        }

        // Los que no tienen: la primera bandera libre (Guard_1, Guard_2...).
        for (const guard of free) {
            const flag = flags.find(f => !taken.has(f.name));
            if (!flag) break;
            guard.memory.post = flag.name;
            delete guard.memory.park;
            taken.add(flag.name);
            console.log(`[Guard] ${guard.name} -> puesto ${flag.name}`);
        }
    }
}
