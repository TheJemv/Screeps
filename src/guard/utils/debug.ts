// src/guard/utils/debug.ts
//
// Consola:  guardInfo()
//   Vigilantes (room, misión, estado, vida, ticks de vida), rooms vigilados y amenazas activas.
import { GUARD_CONFIG } from "../config";
import { GuardCreepMemory } from "../types";
import { guardMemory } from "../managers/RoomManager";

export function guardInfo(): string {
    const mem = guardMemory();
    const lines: string[] = ["=== 🛡️ Vigilantes ==="];

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const m = creep.memory as Partial<GuardCreepMemory>;
        if (m.role !== GUARD_CONFIG.ROLE) continue;

        const hp = Math.round((creep.hits / creep.hitsMax) * 100);
        const ttl = creep.spawning ? "naciendo" : `${creep.ticksToLive ?? "?"}t`;
        lines.push(
            `  ${name}  en ${creep.room.name}  home ${m.home ?? "-"}  misión ${m.mission ?? "-"}  puesto ${m.post ?? "-"}  ${m.state ?? "-"}  ${hp}%  ${ttl}`
        );
    }

    const watched = Object.keys(mem.watched);
    lines.push(`=== 👁️ Vigilados (${watched.length}) ===`, `  ${watched.join(", ") || "-"}`);

    const threats = Object.values(mem.threats);
    lines.push(`=== 🚨 Amenazas (${threats.length}) ===`);
    for (const t of threats) {
        const seen = Game.time - t.lastSeen === 0 ? "visible" : `sin visión hace ${Game.time - t.lastSeen}t`;
        const core = t.core ? " + invader core" : "";
        lines.push(
            `  ${t.room} (${t.kind}, home ${t.home})  ${t.hostiles} enemigo(s) ${t.owners.join(", ")}${core}  poder ${t.power}  hace ${Game.time - t.since}t  ${seen}`
        );
    }

    return lines.join("\n");
}
