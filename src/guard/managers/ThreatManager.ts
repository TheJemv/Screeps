// src/guard/managers/ThreatManager.ts
//
// Una vez por tick revisa cada room que se ve y decide si hay amenaza:
//   - home:    cualquier enemigo en el home room.
//   - watched: cualquier enemigo (o invader core) en una reserva / remoto vigilado.
//   - sos:     un creep mío herido por enemigos armados en otro room cercano.
//
// Sin visión, la amenaza queda en Memory hasta que un vigilante llegue y vea
// el room vacío (o venza MEMORY_TICKS). Así, si los invaders matan al miner
// y se pierde la visión, los vigilantes igual salen.
import { GUARD_CONFIG } from "../config";
import { ThreatKind, ThreatMemory } from "../types";
import { attackableCores, hostilesIn, hurtFriends, isHarmless, powerOf } from "../utils/combat";
import RoomManager, { guardMemory } from "./RoomManager";

/** Roles militares: que les peguen a ellos no dispara un SOS (ya están peleando). */
const MILITARY_ROLES = new Set<string>([GUARD_CONFIG.ROLE, "WarCreep"]);

export default class ThreatManager {
    /** Actualiza las amenazas y las devuelve ordenadas: home primero, después las más peligrosas y cercanas. */
    public static scan(homes: string[]): ThreatMemory[] {
        const threats = guardMemory().threats;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const kind = this.classify(room, homes);
            const found = kind ? this.inspect(room, kind) : undefined;
            const previous = threats[roomName];

            if (!found || !kind) {
                if (previous) {
                    console.log(`[Guard] ✅ ${roomName} despejado (${Game.time - previous.since} ticks)`);
                    delete threats[roomName];
                }
                continue;
            }

            const home = RoomManager.homeFor(roomName, homes);
            if (!home) continue;

            threats[roomName] = { ...found, room: roomName, home, kind, since: previous?.since ?? Game.time, lastSeen: Game.time };
            if (!previous) {
                const what = found.hostiles > 0 ? `${found.hostiles} enemigo(s) de ${found.owners.join(", ")}` : "invader core";
                console.log(`[Guard] 🚨 Amenaza en ${roomName} (${kind}): ${what}, poder ${found.power} -> vigilantes de ${home}`);
            }
        }

        // Sin visión: se mantiene un rato; el home puede haber cambiado.
        for (const roomName in threats) {
            if (Game.rooms[roomName]) continue;
            const threat = threats[roomName];
            const ttl = threat.kind === "sos" ? GUARD_CONFIG.THREAT.SOS_MEMORY_TICKS : GUARD_CONFIG.THREAT.MEMORY_TICKS;
            const home = homes.includes(threat.home) ? threat.home : RoomManager.homeFor(roomName, homes);

            if (!home || Game.time - threat.lastSeen > ttl) {
                console.log(`[Guard] ⌛ ${roomName}: sin visión desde hace ${Game.time - threat.lastSeen} ticks, se olvida`);
                delete threats[roomName];
            } else {
                threat.home = home;
            }
        }

        return this.sorted(Object.values(threats));
    }

    public static get(roomName: string): ThreatMemory | undefined {
        return guardMemory().threats[roomName];
    }

    /** Qué tipo de room es para los vigilantes (undefined = no nos importa). */
    private static classify(room: Room, homes: string[]): ThreatKind | undefined {
        if (homes.includes(room.name)) return "home";

        // Room de otro jugador (o de un aliado): nunca meterse bajo sus torres.
        const controller = room.controller;
        if (controller?.owner && !controller.my) return undefined;

        if (RoomManager.isWatched(room.name)) return "watched";

        const home = RoomManager.homeFor(room.name, homes);
        if (home && Game.map.getRoomLinearDistance(home, room.name) <= GUARD_CONFIG.ROOMS.SOS_MAX_DISTANCE) return "sos";
        return undefined;
    }

    private static inspect(
        room: Room,
        kind: ThreatKind
    ): Pick<ThreatMemory, "hostiles" | "power" | "core" | "owners" | "x" | "y"> | undefined {
        const hostiles = hostilesIn(room);

        if (kind === "sos") {
            // Solo si de verdad están atacando a alguien mío (no por cruzarse con un jugador).
            const armed = hostiles.filter(h => !isHarmless(h));
            const victim = hurtFriends(room).some(c => !MILITARY_ROLES.has(c.memory.role ?? ""));
            if (armed.length === 0 || !victim) return undefined;
        }

        const cores = kind === "watched" ? attackableCores(room) : [];
        if (hostiles.length === 0 && cores.length === 0) return undefined;

        const first = hostiles[0] ?? cores[0];
        return {
            hostiles: hostiles.length,
            power: hostiles.reduce((sum, h) => sum + powerOf(h), 0),
            core: cores.length > 0 || undefined,
            owners: Array.from(new Set(hostiles.map(h => h.owner.username))),
            x: first.pos.x,
            y: first.pos.y
        };
    }

    private static sorted(threats: ThreatMemory[]): ThreatMemory[] {
        const rank = (t: ThreatMemory) => (t.kind === "home" ? 0 : 1);
        const armed = (t: ThreatMemory) => (t.power > 0 ? 1 : 0);
        const distance = (t: ThreatMemory) => Game.map.getRoomLinearDistance(t.home, t.room);

        return threats.sort(
            (a, b) => rank(a) - rank(b) || armed(b) - armed(a) || b.power - a.power || distance(a) - distance(b)
        );
    }
}
