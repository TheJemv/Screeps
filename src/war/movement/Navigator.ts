// src/war/movement/Navigator.ts
//
// Decide cómo se mueve el pelotón este tick hacia un destino:
//
//   cruce en curso -> cada uno a su casilla del otro lado (borde o portal)
//   tren en curso  -> en fila hasta donde se pueda volver a formar
//   otro room      -> el bloque va a la casilla "pre" pegada a la salida (o al
//                     portal), se forma, y cruzan a la casilla "post" del otro lado
//   mismo room     -> el bloque camina hasta el objetivo
//
// Si el bloque 3x3 no cabe (pasillo angosto), pasa a modo tren hasta el próximo
// lugar donde sí quepa.
import { WAR_CONFIG } from "../config";
import type { CrossPlan, PackedPos, Squad } from "../types";
import RouteManager, { Hop } from "../managers/RouteManager";
import { OFFSETS, chebyshev, idx, isEdge } from "../utils/geometry";
import { attackRoom } from "../utils/flags";
import { roleOf } from "../utils/roles";
import { FORWARD, Facing, Stance, facingToward } from "./Formation";
import FormationMove, { BoxGoal, StepResult } from "./FormationMove";
import { BLOCKED, boxComponent, countInBox, nearestAnchor } from "./Grid";
import RoomGrid from "./RoomGrid";
import Train from "./Train";

const { MOVE } = WAR_CONFIG;
/** Bloque sin nada que romper. */
const CLEAN = MOVE.BREAK_BASE - 1;
const TRAIN_TIMEOUT = 150;
const PLAN_TTL = 1500;

export type Destination =
    /** Formarse en un ancla exacta (Save, staging). `range`: con estar cerca alcanza. */
    | { kind: "anchor"; pos: PackedPos; facing: Facing; range?: number }
    /** Entrar a un room. `hold`: esperar formados antes de cruzar (safe mode). */
    | { kind: "room"; room: string; hold?: boolean }
    /** Casillas del centro del bloque dentro del room (enfrentar un objetivo). */
    | { kind: "goals"; room: string; goals: BoxGoal[]; key: string; stance?: Stance; face?: { x: number; y: number } };

export type DriveStatus = "arrived" | "moving" | "forming" | "waiting" | "blocked" | "holding" | "crossing" | "train" | "nopath";

export interface DriveResult {
    status: DriveStatus;
    /** Estructura que tapa el paso del bloque (hay que romperla). */
    breach?: AnyStructure;
}

export default class Navigator {
    public static drive(squad: Squad, dest: Destination): DriveResult {
        const mem = squad.mem;
        if (squad.creeps.length === 0) return { status: "waiting" };

        if (mem.crossing) {
            const c = mem.crossing;
            const formed = FormationMove.formUp(squad, c.to, c.f, "march");
            if (formed || Game.time - c.t > MOVE.CROSSING_TIMEOUT) {
                mem.anchor = formed ? c.to : undefined;
                mem.facing = c.f;
                mem.path = undefined;
                delete mem.crossing;
            }
            return { status: "crossing" };
        }

        if (mem.train) {
            // Sin camino (o demasiado tiempo en fila): quien llamó decide (ej: otro objetivo).
            // Rompiendo una brecha el reloj no corre: el tren está trabajando.
            const train = mem.train;
            const result = Train.run(squad);
            if (result.status === "formed") return { status: "train" };
            if (result.status === "breach") {
                train.t++;
                return { status: "blocked", breach: result.breach };
            }
            if (result.status === "failed" || Game.time - train.t > TRAIN_TIMEOUT) {
                delete mem.train;
                return { status: "nopath" };
            }
            return { status: "train" };
        }

        if (!this.ensureAnchor(squad, dest)) return { status: mem.train ? "train" : "nopath" };

        const anchor = mem.anchor as PackedPos;
        const destRoom = dest.kind === "anchor" ? dest.pos.r : dest.room;
        if (anchor.r !== destRoom) return this.towardRoom(squad, destRoom, dest);
        return this.inRoom(squad, dest);
    }

    // -----------------------------------------------------------------------
    // Ancla
    // -----------------------------------------------------------------------

    /** Hay ancla válida (o se eligió una). false = no se puede formar acá (quizás arrancó el tren). */
    private static ensureAnchor(squad: Squad, dest: Destination): boolean {
        const mem = squad.mem;
        const anchor = mem.anchor;
        const valid =
            anchor !== undefined &&
            RoomGrid.box(anchor.r)[idx(anchor.x, anchor.y)] < BLOCKED &&
            (mem.blocked ?? 0) < MOVE.REANCHOR_TICKS;
        if (valid) return true;

        // Se forma donde está la mayoría (sobre el healer o el líder si están ahí).
        const room = this.majorityRoom(squad);
        const inRoom = squad.creeps.filter(c => c.pos.roomName === room);
        const seed =
            inRoom.find(c => roleOf(c) === "Healer" && !isEdge(c.pos.x, c.pos.y)) ??
            inRoom.find(c => roleOf(c) === "Leader" && !isEdge(c.pos.x, c.pos.y)) ??
            inRoom[0];

        const own = new Set(squad.creeps.map(c => c.name));
        const occupancy = RoomGrid.occupancy(room);
        const stranger = (x: number, y: number) => {
            const name = occupancy.get(idx(x, y));
            return name !== undefined && !own.has(name);
        };
        const found = nearestAnchor(RoomGrid.tile(room), RoomGrid.box(room), seed.pos.x, seed.pos.y, {
            maxDepth: MOVE.ANCHOR_SEARCH,
            slack: 2,
            maxBox: CLEAN,
            accept: (x, y) => countInBox(x, y, stranger) === 0
        });

        mem.blocked = 0;
        mem.path = undefined;
        if (found) {
            mem.anchor = { x: found.x, y: found.y, r: room };
            mem.facing = mem.facing ?? this.facingFor(room, found, dest);
            return true;
        }

        // Acá no entra el bloque: en fila hasta un lugar donde sí.
        const goal = this.formableGoal(squad, room, dest);
        if (goal) mem.train = { goal: goal.pos, f: goal.f, t: Game.time };
        mem.anchor = undefined;
        return false;
    }

    private static majorityRoom(squad: Squad): string {
        const count = new Map<string, number>();
        for (const c of squad.creeps) count.set(c.pos.roomName, (count.get(c.pos.roomName) ?? 0) + 1);
        const leader = squad.creeps.find(c => roleOf(c) === "Leader");
        let best = leader ? leader.pos.roomName : squad.creeps[0].pos.roomName;
        for (const [room, n] of count) if (n > (count.get(best) ?? 0)) best = room;
        return best;
    }

    /** Un ancla donde SÍ cabe el bloque, rumbo al destino (meta del tren). */
    private static formableGoal(squad: Squad, room: string, dest: Destination): { pos: PackedPos; f: Facing } | null {
        const destRoom = dest.kind === "anchor" ? dest.pos.r : dest.room;
        if (room !== destRoom) {
            const hop = RouteManager.nextHop(room, destRoom);
            const plan = hop ? this.crossPlan(squad, room, hop, destRoom, undefined) : null;
            return plan ? { pos: plan.post, f: plan.f } : null;
        }
        const seed = squad.creeps.find(c => c.pos.roomName === room) ?? squad.creeps[0];
        const goals = this.goalsOf(dest);
        const bridge = goals ? this.bridgeAnchor(room, seed.pos, goals) : null;
        return bridge ? { pos: { x: bridge.x, y: bridge.y, r: room }, f: bridge.facing ?? 1 } : null;
    }

    private static goalsOf(dest: Destination): BoxGoal[] | null {
        if (dest.kind === "anchor") return [{ x: dest.pos.x, y: dest.pos.y, range: dest.range ?? 0, facing: dest.facing }];
        if (dest.kind === "goals") return dest.goals;
        return null;
    }

    private static facingFor(room: string, from: { x: number; y: number }, dest: Destination): Facing {
        if (dest.kind === "anchor" && dest.pos.r === room) return dest.facing;
        if (dest.kind === "goals" && dest.goals.length > 0) return facingToward(dest.goals[0].x - from.x, dest.goals[0].y - from.y);
        const destRoom = dest.kind === "anchor" ? dest.pos.r : dest.room;
        const hop = RouteManager.nextHop(room, destRoom);
        if (hop && hop.via === "exit") return hop.side as Facing;
        return facingToward(25 - from.x, 25 - from.y);
    }

    // -----------------------------------------------------------------------
    // Hacia otro room
    // -----------------------------------------------------------------------

    private static towardRoom(squad: Squad, destRoom: string, dest: Destination): DriveResult {
        const mem = squad.mem;
        const anchor = mem.anchor as PackedPos;
        const facing = mem.facing as Facing;

        const hop = RouteManager.nextHop(anchor.r, destRoom);
        if (!hop) return { status: "nopath" };
        const plan = this.crossPlan(squad, anchor.r, hop, destRoom, anchor);
        if (!plan) return { status: "nopath" };

        if (!plan.pre) {
            mem.train = { goal: plan.post, f: plan.f, t: Game.time };
            return { status: "train" };
        }

        if (!FormationMove.formUp(squad, anchor, facing, "march")) return { status: "forming" };

        if (anchor.x === plan.pre.x && anchor.y === plan.pre.y) {
            if (dest.kind === "room" && dest.hold && hop.room === destRoom) return { status: "holding" };
            if (squad.creeps.some(c => c.fatigue > 0)) return { status: "waiting" };

            // Staging: acá vuelven a curarse si hay que retirarse del room atacado.
            if (hop.room === mem.target) mem.staging = { ...anchor, f: plan.f };
            mem.crossing = { from: anchor.r, to: plan.post, f: plan.f, via: plan.via, t: Game.time };
            mem.plan = undefined;
            FormationMove.formUp(squad, plan.post, plan.f, "march");
            return { status: "crossing" };
        }

        const step = FormationMove.advance(squad, [{ x: plan.pre.x, y: plan.pre.y, range: 0 }], `pre:${plan.from}>${plan.to}`);
        return this.handle(squad, step, { pos: plan.post, f: plan.f });
    }

    /**
     * Plan de cruce (cacheado): ancla "pre" de este lado pegada a la salida/portal y
     * ancla "post" del otro lado. Sin "pre" alcanzable por el bloque -> tren a "post".
     */
    private static crossPlan(squad: Squad, from: string, hop: Hop, destRoom: string, anchor: PackedPos | undefined): CrossPlan | null {
        const mem = squad.mem;
        const cached = mem.plan;
        if (cached && cached.from === from && cached.to === hop.room && Game.time - cached.t < PLAN_TTL) return cached;

        const plan = hop.via === "exit" ? this.exitPlan(from, hop.room, hop.side, anchor) : this.portalPlan(from, hop, destRoom, anchor);
        mem.plan = plan ?? undefined;
        return plan;
    }

    private static exitPlan(from: string, to: string, side: number, anchor: PackedPos | undefined): CrossPlan | null {
        const tileA = RoomGrid.tile(from);
        const boxA = RoomGrid.box(from);
        const tileB = RoomGrid.tile(to);
        const boxB = RoomGrid.box(to);
        const [fx, fy] = FORWARD[side as Facing];

        interface Candidate {
            pre?: { x: number; y: number };
            post: { x: number; y: number };
            along: number;
        }
        const candidates: Candidate[] = [];

        for (let k = 1; k <= 48; k++) {
            // Casilla de salida en A y a dónde se llega en B.
            const ex = fx === 0 ? k : fx > 0 ? 49 : 0;
            const ey = fy === 0 ? k : fy > 0 ? 49 : 0;
            if (tileA[idx(ex, ey)] >= BLOCKED) continue;
            const ax = fx === 0 ? k : fx > 0 ? 0 : 49;
            const ay = fy === 0 ? k : fy > 0 ? 0 : 49;

            const post = nearestAnchor(tileB, boxB, ax, ay, { maxDepth: MOVE.POST_CROSS_MAX, maxBox: CLEAN });
            if (!post) continue;

            // Pre: centro a 2 del borde, con las 3 salidas de enfrente libres.
            const px = ex - fx * 2;
            const py = ey - fy * 2;
            let pre: { x: number; y: number } | undefined;
            if (boxA[idx(px, py)] <= CLEAN) {
                const [rx, ry] = [-fy, fx];
                const open = [-1, 0, 1].every(s => tileA[idx(ex + rx * s, ey + ry * s)] < BLOCKED);
                if (open) pre = { x: px, y: py };
            }
            candidates.push({ pre, post, along: k });
        }
        if (candidates.length === 0) return null;

        const f = side as Facing;
        const withPre = candidates.filter(c => c.pre);
        if (anchor && anchor.r === from && withPre.length > 0) {
            const reached = this.reachable(anchor, withPre.map(c => c.pre as { x: number; y: number }));
            if (reached) {
                const c = withPre.find(w => w.pre && w.pre.x === reached.x && w.pre.y === reached.y) as Candidate;
                return { from, to, via: "exit", pre: c.pre, post: { ...c.post, r: to }, f, t: Game.time };
            }
        }

        // El bloque no llega a la salida: tren hasta el "post" más cercano.
        const ref = anchor && anchor.r === from ? (fx === 0 ? anchor.x : anchor.y) : 25;
        candidates.sort((a, b) => Math.abs(a.along - ref) - Math.abs(b.along - ref));
        return { from, to, via: "exit", post: { ...candidates[0].post, r: to }, f, t: Game.time };
    }

    private static portalPlan(from: string, hop: Hop, destRoom: string, anchor: PackedPos | undefined): CrossPlan | null {
        if (hop.via !== "portal" || hop.portals.length === 0) return null;
        const to = hop.room;
        const portal = hop.portals[0];

        const post = nearestAnchor(RoomGrid.tile(to), RoomGrid.box(to), portal.dx, portal.dy, {
            maxDepth: MOVE.ANCHOR_SEARCH,
            maxBox: CLEAN
        });
        if (!post) return null;

        const next = to === destRoom ? null : RouteManager.nextHop(to, destRoom);
        const f: Facing = next && next.via === "exit" ? (next.side as Facing) : facingToward(25 - post.x, 25 - post.y);

        let pre: { x: number; y: number } | undefined;
        if (anchor && anchor.r === from) {
            const options: { x: number; y: number }[] = [];
            for (const p of hop.portals) {
                const a = nearestAnchor(RoomGrid.tile(from), RoomGrid.box(from), p.x, p.y, {
                    maxDepth: MOVE.ANCHOR_SEARCH,
                    maxBox: CLEAN
                });
                if (a && !options.some(o => o.x === a.x && o.y === a.y)) options.push(a);
            }
            pre = this.reachable(anchor, options) ?? undefined;
        }
        return { from, to, via: "portal", pre, post: { ...post, r: to }, f, t: Game.time };
    }

    /** ¿A cuál de estos centros llega el bloque desde el ancla? (el más barato) */
    private static reachable(anchor: PackedPos, spots: { x: number; y: number }[]): { x: number; y: number } | null {
        if (spots.length === 0) return null;
        const hit = spots.find(s => s.x === anchor.x && s.y === anchor.y);
        if (hit) return hit;

        const matrix = RoomGrid.boxMatrix(anchor.r);
        const result = PathFinder.search(
            new RoomPosition(anchor.x, anchor.y, anchor.r),
            spots.map(s => ({ pos: new RoomPosition(s.x, s.y, anchor.r), range: 0 })),
            { roomCallback: r => (r === anchor.r ? matrix : false), maxRooms: 1, maxOps: 8000, plainCost: 1, swampCost: 1 }
        );
        if (result.incomplete) return null;
        const last = result.path[result.path.length - 1];
        return last ? { x: last.x, y: last.y } : null;
    }

    // -----------------------------------------------------------------------
    // Dentro del room
    // -----------------------------------------------------------------------

    private static inRoom(squad: Squad, dest: Destination): DriveResult {
        const mem = squad.mem;
        const anchor = mem.anchor as PackedPos;
        const facing = mem.facing as Facing;

        if (dest.kind === "room") {
            return { status: FormationMove.formUp(squad, anchor, facing, "march") ? "arrived" : "forming" };
        }

        const goals = this.goalsOf(dest) as BoxGoal[];
        const key = dest.kind === "anchor" ? `a:${dest.pos.x},${dest.pos.y}` : dest.key;

        const atGoal = goals.find(g => chebyshev(anchor.x, anchor.y, g.x, g.y) <= g.range);
        if (atGoal) {
            const face = dest.kind === "goals" ? dest.face : undefined;
            const want = atGoal.facing ?? (face ? facingToward(face.x - anchor.x, face.y - anchor.y, facing) : facing);
            if (want !== facing) {
                mem.facing = want;
                mem.rotatedAt = Game.time;
            }
            const assault = dest.kind === "goals" && dest.stance === "assault" && FormationMove.canAssault(squad, anchor, mem.facing as Facing);
            const stance: Stance = assault ? "assault" : "march";
            return { status: FormationMove.formUp(squad, anchor, mem.facing as Facing, stance) ? "arrived" : "forming" };
        }

        if (!FormationMove.formUp(squad, anchor, facing, "march")) return { status: "forming" };

        // Room atacado: ¿abrir paso al bloque cuesta mucho más que un hueco de 1 para pasar en fila?
        const path = FormationMove.pathFor(squad, goals, key);
        if (path && anchor.r === attackRoom() && mem.pathTick === Game.time) {
            const toward = (dest.kind === "goals" ? dest.face : undefined) ?? goals[0];
            const file = this.cheaperInFile(anchor, goals, path, toward);
            if (file) {
                mem.train = { goal: file.pos, f: file.f, t: Game.time };
                mem.path = undefined;
                return { status: "train" };
            }
        }

        const step = FormationMove.advance(squad, goals, key);
        if (step.status !== "nopath") return this.handle(squad, step, null);
        // Si por terreno/estructuras el bloque sí llega, lo que falla es otra cosa (creeps): esperar.
        if (boxComponent(RoomGrid.box(anchor.r), goals)[idx(anchor.x, anchor.y)] === 1) return { status: "blocked" };

        // El bloque no llega desde acá (ej: un pasillo de 2): en fila hasta donde sí.
        const bridge = this.bridgeAnchor(anchor.r, anchor, goals, anchor);
        return this.handle(squad, step, bridge ? { pos: { x: bridge.x, y: bridge.y, r: anchor.r }, f: bridge.facing ?? facing } : null);
    }

    /**
     * Brecha angosta: el bloque 3x3 necesita un pasillo de 3 y rompe todo lo que pisa
     * (una línea de ramparts = romper ~3 por fila). En fila alcanza con UN hueco. Si el
     * hueco cuesta menos de la mitad, van en fila hasta un ancla limpia más cerca del
     * objetivo (desde la que el bloque llega) y ahí se vuelven a formar.
     */
    private static cheaperInFile(
        anchor: PackedPos,
        goals: BoxGoal[],
        path: string,
        toward: { x: number; y: number }
    ): { pos: PackedPos; f: Facing } | null {
        const room = anchor.r;

        // Todo lo rompible que pisa el 3x3 a lo largo del camino.
        const touched = new Set<number>();
        let x = anchor.x;
        let y = anchor.y;
        for (const ch of path) {
            const [dx, dy] = OFFSETS[Number(ch)];
            x += dx;
            y += dy;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const i = idx(x + ox, y + oy);
                    if (RoomGrid.breakHitsAt(room, i) > 0) touched.add(i);
                }
            }
        }
        let boxWork = 0;
        for (const i of touched) boxWork += RoomGrid.breakHitsAt(room, i);
        if (boxWork === 0) return null;

        // Anclas limpias desde las que el bloque llega, y que acerquen al objetivo.
        const box = RoomGrid.box(room);
        const reach = boxComponent(box, goals);
        const here = chebyshev(anchor.x, anchor.y, toward.x, toward.y);
        const candidates: { pos: RoomPosition; range: number }[] = [];
        for (let cy = 2; cy <= 47; cy++) {
            for (let cx = 2; cx <= 47; cx++) {
                const i = idx(cx, cy);
                if (!reach[i] || box[i] > CLEAN) continue;
                const d = chebyshev(cx, cy, toward.x, toward.y);
                if (d > here - 3 || d > 12) continue;
                candidates.push({ pos: new RoomPosition(cx, cy, room), range: 0 });
            }
        }
        if (candidates.length === 0) return null;

        const matrix = RoomGrid.travelMatrix(room, true).clone();
        const tile = RoomGrid.tile(room);
        for (const i of RoomGrid.breakables(room)) matrix.set(i % 50, Math.floor(i / 50), tile[i]);
        const result = PathFinder.search(new RoomPosition(anchor.x, anchor.y, room), candidates, {
            roomCallback: r => (r === room ? matrix : false),
            maxRooms: 1,
            maxOps: 6000,
            plainCost: MOVE.COST_PLAIN,
            swampCost: MOVE.COST_SWAMP
        });
        if (result.incomplete || result.path.length === 0) return null;

        let fileWork = 0;
        for (const p of result.path) fileWork += RoomGrid.breakHitsAt(room, idx(p.x, p.y));
        if (fileWork * 2 >= boxWork) return null;

        const end = result.path[result.path.length - 1];
        return { pos: { x: end.x, y: end.y, r: room }, f: facingToward(toward.x - end.x, toward.y - end.y) };
    }

    /**
     * Puente: el bloque no llega desde acá. Primer lugar (caminando en fila, sin romper
     * nada) donde vuelve a caber y desde el que el bloque SÍ llega a los goals.
     */
    private static bridgeAnchor(
        room: string,
        from: { x: number; y: number },
        goals: BoxGoal[],
        exclude?: { x: number; y: number }
    ): BoxGoal | null {
        const box = RoomGrid.box(room);
        const reach = boxComponent(box, goals);
        const search = (maxTile: number) =>
            nearestAnchor(RoomGrid.tile(room), box, from.x, from.y, {
                maxDepth: 60,
                maxBox: CLEAN,
                maxTile,
                accept: (x, y) => reach[idx(x, y)] === 1 && !(exclude && exclude.x === x && exclude.y === y)
            });
        // Primero caminando sin romper nada; si no hay, el tren abre brecha (compuertas angostas).
        const found = search(CLEAN) ?? search(MOVE.BREAK_MAX);
        if (!found) return null;
        const g = goals[0];
        return { x: found.x, y: found.y, range: 0, facing: facingToward(g.x - found.x, g.y - found.y) };
    }

    private static handle(squad: Squad, step: StepResult, trainGoal: { pos: PackedPos; f: Facing } | null): DriveResult {
        switch (step.status) {
            case "arrived":
                return { status: "arrived" };
            case "moving":
            case "rotating":
                return { status: "moving" };
            case "waiting":
                return { status: "waiting" };
            case "blocked":
                return { status: "blocked" };
            case "breach":
                return { status: "blocked", breach: step.structure };
            case "nopath":
                if (trainGoal && !(squad.mem.anchor && trainGoal.pos.x === squad.mem.anchor.x && trainGoal.pos.y === squad.mem.anchor.y)) {
                    squad.mem.train = { goal: trainGoal.pos, f: trainGoal.f, t: Game.time };
                    return { status: "train" };
                }
                return { status: "nopath" };
        }
    }
}

