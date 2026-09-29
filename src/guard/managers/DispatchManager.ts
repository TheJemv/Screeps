// src/guard/managers/DispatchManager.ts
//
// Reparte los vigilantes de cada home entre sus amenazas (ya vienen ordenadas
// por prioridad: home primero, después las más peligrosas y cercanas).
//
//   1. Cada amenaza necesita poder_enemigo * SAFETY_FACTOR / poder_vigilante (mín. 1).
//   2. El que ya tiene misión la conserva mientras haga falta ahí (no cambia de idea cada tick).
//   3. Los libres van a cubrir el déficit, el más cercano primero.
//   4. Los que sobran (SEND_EXTRA) refuerzan: nadie se queda en casa mirando.
//   Sin amenazas: todos a casa.
import { GUARD_CONFIG } from "../config";
import { GuardCreep, ThreatMemory } from "../types";
import { powerOf } from "../utils/combat";

export default class DispatchManager {
    public static run(guardsByHome: Map<string, GuardCreep[]>, threats: ThreatMemory[]): void {
        for (const [home, guards] of guardsByHome) {
            const ready = guards.filter(g => !g.spawning);
            this.assign(ready, threats.filter(t => t.home === home));
        }
    }

    private static assign(guards: GuardCreep[], threats: ThreatMemory[]): void {
        if (guards.length === 0) return;
        if (threats.length === 0) {
            for (const guard of guards) this.setMission(guard, undefined);
            return;
        }

        const guardPower = Math.max(1, guards.reduce((sum, g) => sum + powerOf(g), 0) / guards.length);
        const need = new Map<string, number>();
        for (const threat of threats) need.set(threat.room, this.needFor(threat, guardPower, guards.length));

        const assigned = new Map<string, number>();
        const count = (room: string) => assigned.get(room) ?? 0;
        let pending: GuardCreep[] = [];

        // 2. Conservar misión
        for (const guard of guards) {
            const mission = guard.memory.mission;
            if (mission && need.has(mission) && count(mission) < (need.get(mission) ?? 0)) {
                assigned.set(mission, count(mission) + 1);
            } else {
                pending.push(guard);
            }
        }

        // 3. Cubrir déficit por prioridad, el más cercano primero
        for (const threat of threats) {
            while (pending.length > 0 && count(threat.room) < (need.get(threat.room) ?? 0)) {
                const closest = _.min(pending, g => Game.map.getRoomLinearDistance(g.room.name, threat.room));
                pending = pending.filter(g => g !== closest);
                this.setMission(closest, threat.room);
                assigned.set(threat.room, count(threat.room) + 1);
            }
        }

        // 4. Sobrantes
        for (const guard of pending) {
            const current = guard.memory.mission;
            if (!GUARD_CONFIG.THREAT.SEND_EXTRA) this.setMission(guard, undefined);
            else if (!current || !need.has(current)) this.setMission(guard, threats[0].room);
        }
    }

    /** Cuántos vigilantes hacen falta: inofensivos o solo un core = 1. */
    private static needFor(threat: ThreatMemory, guardPower: number, available: number): number {
        if (threat.power <= 0) return 1;
        const needed = Math.ceil((threat.power * GUARD_CONFIG.THREAT.SAFETY_FACTOR) / guardPower);
        return Math.max(1, Math.min(available, needed));
    }

    private static setMission(guard: GuardCreep, room: string | undefined): void {
        if (guard.memory.mission === room) return;
        guard.memory.mission = room;
        guard.memory.rally = 0;
        if (room) console.log(`[Guard] ${guard.name} -> ${room}`);
    }
}
