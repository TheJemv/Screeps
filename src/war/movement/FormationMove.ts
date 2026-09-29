// src/war/movement/FormationMove.ts
//
// El bloque se mueve como UNA unidad:
//
//   1. formUp()  -> cada miembro camina a su casilla. Los que ya están, esperan.
//   2. advance() -> SOLO si todos están en su casilla y NADIE tiene fatiga, todos
//                   dan el mismo paso a la vez. Si uno se atrasó (fatiga, pantano,
//                   un creep ajeno en el medio), los demás lo esperan formados.
//
// El camino es del CENTRO del bloque sobre la grilla `box` (el bloque entero tiene
// que caber). Antes de dar el paso se revisan las 6 casillas nuevas: un creep ajeno
// -> se espera (y después se recalcula esquivando); una estructura enemiga -> se
// devuelve como "breach" para romperla.
import { WAR_CONFIG } from "../config";
import type { PackedPos, Squad, WarCreep } from "../types";
import { OFFSETS, chebyshev, idx, isEdge, keyOf } from "../utils/geometry";
import { attackRoom } from "../utils/flags";
import { roleOf } from "../utils/roles";
import { Facing, MemberInfo, Slot, Stance, assignSlots, headingFacing, slotAt } from "./Formation";
import { BLOCKED } from "./Grid";
import RoomGrid from "./RoomGrid";
import { travel } from "./Travel";

const { MOVE } = WAR_CONFIG;

/** Casilla(s) objetivo del CENTRO del bloque. */
export interface BoxGoal {
    x: number;
    y: number;
    range: number;
    /** Al llegar, mirar hacia acá. */
    facing?: Facing;
}

export type StepResult =
    | { status: "arrived"; goal: BoxGoal }
    | { status: "moving" | "waiting" | "rotating" | "blocked" | "nopath" }
    | { status: "breach"; structure: AnyStructure };

export default class FormationMove {
    /** Casilla que le toca a cada miembro con esta ancla. */
    public static slots(
        squad: Squad,
        anchor: PackedPos,
        facing: Facing,
        stance: Stance
    ): Map<string, { slot: Slot; pos: RoomPosition }> {
        const members: MemberInfo[] = squad.creeps.map(c => ({
            name: c.name,
            role: roleOf(c),
            x: c.pos.x,
            y: c.pos.y,
            room: c.pos.roomName,
            previous: c.memory.slot
        }));

        const out = new Map<string, { slot: Slot; pos: RoomPosition }>();
        for (const [name, slot] of assignSlots(members, anchor, facing, stance)) {
            const p = slotAt(anchor, slot, facing, stance);
            out.set(name, { slot, pos: new RoomPosition(p.x, p.y, anchor.r) });
        }
        return out;
    }

    /**
     * ¿Se puede pasar a postura de asalto? Los tanques dan un paso a las esquinas de
     * adelante: tienen que estar libres (sin nada que romper ni creeps ajenos).
     */
    public static canAssault(squad: Squad, anchor: PackedPos, facing: Facing): boolean {
        const tile = RoomGrid.tile(anchor.r);
        const occupancy = RoomGrid.occupancy(anchor.r);
        const own = new Set(squad.creeps.map(c => c.name));
        return (["TL", "TR"] as Slot[]).every(slot => {
            const p = slotAt(anchor, slot, facing, "assault");
            const name = occupancy.get(idx(p.x, p.y));
            return !isEdge(p.x, p.y) && tile[idx(p.x, p.y)] < MOVE.BREAK_BASE && (name === undefined || own.has(name));
        });
    }

    /**
     * Mueve a cada miembro a su casilla (desde cualquier room: cruza bordes y portales).
     * true = todos formados.
     */
    public static formUp(squad: Squad, anchor: PackedPos, facing: Facing, stance: Stance): boolean {
        const slots = this.slots(squad, anchor, facing, stance);
        const settled = new Set<number>();
        const pending: [WarCreep, RoomPosition][] = [];

        for (const creep of squad.creeps) {
            const target = slots.get(creep.name);
            if (!target) continue;
            creep.memory.slot = target.slot;
            if (creep.pos.isEqualTo(target.pos)) settled.add(idx(creep.pos.x, creep.pos.y));
            else pending.push([creep, target.pos]);
        }

        if (pending.length === 0) {
            squad.mem.blocked = 0;
            return true;
        }

        const own = new Set(squad.creeps.map(c => c.name));
        const occupancy = RoomGrid.occupancy(anchor.r);
        let stranger = false;

        for (const [creep, pos] of pending) {
            const occupant = occupancy.get(idx(pos.x, pos.y));
            const blocked = occupant !== undefined && !own.has(occupant);
            if (blocked) stranger = true;
            if (creep.fatigue > 0) continue;

            const here = creep.pos.roomName === anchor.r;
            if (here && creep.pos.isNearTo(pos)) {
                // Al lado: paso directo (si la ocupa un compañero, él también se está moviendo).
                if (blocked) continue;
                const step = creep.pos.getDirectionTo(pos);
                if (creep.move(step) === OK) squad.moved.set(creep.name, step);
                continue;
            }

            const far = !here || creep.pos.getRangeTo(pos) > 6;
            const { dir } = travel(creep, pos, { range: 0, avoid: here ? settled : undefined, ignore: own, reuse: far });
            if (dir) squad.moved.set(creep.name, dir);
        }

        squad.mem.blocked = stranger ? (squad.mem.blocked ?? 0) + 1 : 0;
        return false;
    }

    /**
     * Un paso del bloque hacia `goals` (mismo room que el ancla). Supone que ya están
     * formados (llamar después de formUp).
     */
    public static advance(squad: Squad, goals: BoxGoal[], key: string): StepResult {
        const mem = squad.mem;
        const anchor = mem.anchor as PackedPos;
        const facing = mem.facing as Facing;

        const reached = goals.find(g => chebyshev(anchor.x, anchor.y, g.x, g.y) <= g.range);
        if (reached) {
            mem.path = undefined;
            return { status: "arrived", goal: reached };
        }

        // Nadie avanza hasta que el más lento se recupere: se mueven todos juntos.
        if (squad.creeps.some(c => c.fatigue > 0)) return { status: "waiting" };

        const path = this.pathFor(squad, goals, key);
        if (!path) return { status: "nopath" };

        // Si el camino dobla de costado o hacia atrás, primero se gira (el líder siempre al frente).
        if (Game.time - (mem.rotatedAt ?? -Infinity) >= MOVE.ROTATE_COOLDOWN) {
            const heading = headingFacing(path.slice(0, 6).split("").map(Number), facing, OFFSETS);
            if (heading !== undefined && heading !== facing) {
                mem.facing = heading;
                mem.rotatedAt = Game.time;
                return { status: "rotating" };
            }
        }

        const dir = Number(path[0]) as DirectionConstant;
        const check = this.checkStep(squad, dir);
        if (check.structure) return { status: "breach", structure: check.structure };
        if (check.blocked) {
            mem.stuck = (mem.stuck ?? 0) + 1;
            // Se recalcula (esquivando creeps si ya van varios ticks trabados).
            if (check.terrain || mem.stuck >= MOVE.STUCK_REPATH) mem.path = undefined;
            return { status: "blocked" };
        }

        for (const creep of squad.creeps) {
            if (creep.move(dir) === OK) squad.moved.set(creep.name, dir);
        }
        const [dx, dy] = OFFSETS[dir];
        mem.anchor = { x: anchor.x + dx, y: anchor.y + dy, r: anchor.r };
        mem.path = path.slice(1);
        mem.pathAt = keyOf(anchor.x + dx, anchor.y + dy, anchor.r);
        mem.stuck = 0;
        return { status: "moving" };
    }

    /** Camino del centro del bloque (direcciones), cacheado en memoria. */
    public static pathFor(squad: Squad, goals: BoxGoal[], key: string): string | null {
        const mem = squad.mem;
        const anchor = mem.anchor as PackedPos;
        const at = keyOf(anchor.x, anchor.y, anchor.r);
        const stale = anchor.r === attackRoom() && Game.time - (mem.pathTick ?? 0) >= MOVE.SIEGE_REPATH_TICKS;

        if (mem.path && mem.pathKey === key && mem.pathAt === at && !stale) return mem.path;

        const search = (matrix: CostMatrix) =>
            PathFinder.search(
                new RoomPosition(anchor.x, anchor.y, anchor.r),
                goals.map(g => ({ pos: new RoomPosition(g.x, g.y, anchor.r), range: g.range })),
                {
                    roomCallback: room => (room === anchor.r ? matrix : false),
                    maxRooms: 1,
                    maxOps: 8000,
                    plainCost: 1,
                    swampCost: 1
                }
            );

        // Trabados: se prueba esquivando creeps. Si así no hay camino (otro pelotón tapa
        // el único paso), se sigue con el normal y se espera a que se muevan.
        let result = search(RoomGrid.boxMatrix(anchor.r));
        if ((mem.stuck ?? 0) >= MOVE.STUCK_REPATH) {
            const avoiding = search(RoomGrid.boxMatrixAvoiding(anchor.r, new Set(squad.creeps.map(c => c.name))));
            if (!avoiding.incomplete && avoiding.path.length > 0) result = avoiding;
        }

        if (result.incomplete || result.path.length === 0) {
            mem.path = undefined;
            mem.pathKey = undefined;
            return null;
        }

        let dirs = "";
        let x = anchor.x;
        let y = anchor.y;
        for (const step of result.path) {
            dirs += String(new RoomPosition(x, y, anchor.r).getDirectionTo(step));
            x = step.x;
            y = step.y;
        }

        mem.path = dirs;
        mem.pathKey = key;
        mem.pathAt = at;
        mem.pathTick = Game.time;
        return dirs;
    }

    /** ¿Se puede dar el paso `dir`? Revisa las casillas nuevas de cada miembro. */
    private static checkStep(
        squad: Squad,
        dir: DirectionConstant
    ): { blocked?: boolean; terrain?: boolean; structure?: AnyStructure } {
        const anchor = squad.mem.anchor as PackedPos;
        const [dx, dy] = OFFSETS[dir];
        const own = new Set(squad.creeps.map(c => c.name));
        const occupancy = RoomGrid.occupancy(anchor.r);
        const tile = RoomGrid.tile(anchor.r);

        for (const creep of squad.creeps) {
            const nx = creep.pos.x + dx;
            const ny = creep.pos.y + dy;
            if (isEdge(nx, ny)) return { blocked: true, terrain: true };

            const structure = RoomGrid.breachAt(anchor.r, nx, ny);
            if (structure) return { structure };
            if (tile[idx(nx, ny)] >= BLOCKED) return { blocked: true, terrain: true };

            const occupant = occupancy.get(idx(nx, ny));
            if (occupant !== undefined && !own.has(occupant)) return { blocked: true };
        }
        return {};
    }
}
