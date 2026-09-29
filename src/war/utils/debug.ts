// src/war/utils/debug.ts
//
// Consola:  warInfo()
//   Pelotones: fase, reclutando, ancla, objetivo y cada miembro (rol, room, vida, fatiga).
// Visual (DEBUG.VISUALS): el bloque 3x3, la casilla de cada uno y el objetivo.
import { WAR_CONFIG } from "../config";
import type { Squad, WarCreepMemory } from "../types";
import type { CombatContext } from "../roles/context";
import FormationMove from "../movement/FormationMove";
import type { Facing } from "../movement/Formation";
import { warMemory } from "./memory";
import { attackRoom } from "./flags";

const { COLORS } = WAR_CONFIG.DEBUG;
const ARROW: Record<number, string> = { 1: "↑", 3: "→", 5: "↓", 7: "←" };

export function warInfo(): string {
    const mem = warMemory();
    const lines: string[] = [
        `=== ⚔️ Guerra ===  Attack: ${attackRoom() ?? "-"}  spawn: ${WAR_CONFIG.SPAWN_ACTIVE ? "activo" : "apagado"}`
    ];

    for (const [id, squad] of Object.entries(mem.squads)) {
        const a = squad.anchor ? `${squad.anchor.r} ${squad.anchor.x},${squad.anchor.y} ${ARROW[squad.facing ?? 1]}` : "-";
        const mode = squad.crossing ? " cruzando" : squad.train ? " tren" : "";
        lines.push(
            `  ${id}  ${squad.phase}${squad.recruiting ? " (reclutando)" : ""}${mode}  ancla ${a}  objetivo ${squad.target ?? "-"} ${squad.targetId ?? ""}`
        );
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const m = creep.memory as Partial<WarCreepMemory>;
        if (m.role !== WAR_CONFIG.ROLE) continue;
        const hp = Math.round((creep.hits / creep.hitsMax) * 100);
        const ttl = creep.spawning ? "naciendo" : `${creep.ticksToLive ?? "?"}t`;
        lines.push(
            `    ${m.squadId ?? "-"} ${m.squadRole ?? "-"} ${name}  ${creep.pos.roomName} ${creep.pos.x},${creep.pos.y}  casilla ${m.slot ?? "-"}  ${hp}%  fatiga ${creep.fatigue}  ${ttl}`
        );
    }

    const safe = Object.entries(mem.safeMode).filter(([, until]) => until > Game.time);
    if (safe.length > 0) lines.push(`  Safe mode: ${safe.map(([r, u]) => `${r} (${u - Game.time}t)`).join(", ")}`);
    return lines.join("\n");
}

export function drawSquad(squad: Squad, ctx: CombatContext): void {
    if (!WAR_CONFIG.DEBUG.VISUALS) return;
    const mem = squad.mem;

    if (mem.train) {
        const g = mem.train.goal;
        new RoomVisual(g.r).rect(g.x - 1.5, g.y - 1.5, 3, 3, { fill: "transparent", stroke: COLORS.TRAIN, lineStyle: "dashed" });
        return;
    }

    const anchor = mem.crossing ? mem.crossing.to : mem.anchor;
    if (!anchor) return;
    const facing: Facing = mem.crossing ? mem.crossing.f : mem.facing ?? 1;
    const visual = new RoomVisual(anchor.r);
    visual.rect(anchor.x - 1.5, anchor.y - 1.5, 3, 3, { fill: "transparent", stroke: COLORS.BOX, opacity: 0.6 });
    visual.text(ARROW[facing], anchor.x, anchor.y - 1.6, { color: COLORS.BOX, font: 0.6 });

    for (const { slot, pos } of FormationMove.slots(squad, anchor, facing, "march").values()) {
        visual.text(slot, pos.x, pos.y + 0.15, { color: COLORS.SLOT, font: 0.35, opacity: 0.6 });
    }

    const focus = ctx.focus;
    if (focus && focus.pos.roomName === anchor.r) {
        visual.line(anchor.x, anchor.y, focus.pos.x, focus.pos.y, { color: COLORS.TARGET, lineStyle: "dotted" });
        visual.circle(focus.pos.x, focus.pos.y, { radius: 0.6, fill: "transparent", stroke: COLORS.TARGET });
    }
}
