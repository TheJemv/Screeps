// src/war/movement/Train.ts
//
// Modo tren: para pasillos donde el bloque 3x3 no cabe. Van en fila detrás del
// líder (líder, tanque, healer, tanque, ranged, ranged: el healer queda en medio
// para alcanzar a todos) hasta `goal`, donde se vuelven a formar.
//
//   - El de adelante solo avanza si nadie tiene fatiga y la fila está unida
//     (cada uno a <= TRAIN_LEASH del anterior). Si no, espera.
//   - Cada uno pisa la casilla que deja el de adelante (serpiente), así pasan
//     por el mismo lugar: bordes, portales y pasillos de 1.
//   - Nunca se quedan parados sobre un borde (el motor los rebotaría de room).
import { WAR_CONFIG } from "../config";
import type { Squad, WarCreep } from "../types";
import { ALL_DIRECTIONS, OFFSETS, idx, isEdge, unpack } from "../utils/geometry";
import { roleOf } from "../utils/roles";
import { attackRoom } from "../utils/flags";
import FormationMove from "./FormationMove";
import { BLOCKED } from "./Grid";
import RoomGrid from "./RoomGrid";
import { travel } from "./Travel";

const ORDER = ["Leader", "Tank", "Healer", "Tank", "Ranged", "Ranged"];

/** Ticks seguidos sin camino antes de abandonar el tren. */
const MAX_FAILS = 3;

export interface TrainResult {
    status: "formed" | "moving" | "failed" | "breach";
    /** El de adelante tiene enfrente una estructura enemiga: todos le pegan. */
    breach?: AnyStructure;
}

export default class Train {
    /** formed = llegó y ya están formados en `goal` (el tren terminó). failed = no hay camino. */
    public static run(squad: Squad): TrainResult {
        const mem = squad.mem;
        const train = mem.train;
        if (!train) return { status: "formed" };

        const goal = unpack(train.goal);
        const order = this.order(squad);
        if (order.length === 0) return { status: "moving" };
        const head = order[0];

        const allThere = order.every(c => c.pos.roomName === goal.roomName && !isEdge(c.pos.x, c.pos.y));
        if (allThere && head.pos.getRangeTo(goal) <= 3) {
            const formed = FormationMove.formUp(squad, train.goal, train.f, "march");
            if (formed) {
                mem.anchor = train.goal;
                mem.facing = train.f;
                mem.path = undefined;
                delete mem.train;
            }
            return { status: formed ? "formed" : "moving" };
        }

        const fatigued = order.some(c => c.fatigue > 0);
        const linked = order.every(
            (c, i) => i === 0 || (c.pos.roomName === order[i - 1].pos.roomName && c.pos.getRangeTo(order[i - 1]) <= WAR_CONFIG.MOVE.TRAIN_LEASH)
        );
        // Recién cruzó y los demás vienen atrás: se aleja un poco del borde para hacerles lugar.
        const behind = order.some(c => c.pos.roomName !== head.pos.roomName);
        const nearEdge = Math.min(head.pos.x, head.pos.y, 49 - head.pos.x, 49 - head.pos.y) < 4;

        let breach: AnyStructure | undefined;
        if ((linked && !fatigued) || isEdge(head.pos.x, head.pos.y) || (behind && nearEdge)) {
            const own = new Set(order.map(c => c.name));
            // En el room atacado el de adelante abre paso: se para frente al rampart y le pegan todos.
            const breakables = head.pos.roomName === attackRoom();
            const result = travel(head, goal, { range: 0, ignore: own, reuse: true, complete: true, breakables });
            if (result.dir) squad.moved.set(head.name, result.dir);
            breach = result.breach;
            train.fails = result.noPath ? (train.fails ?? 0) + 1 : 0;
            if (train.fails >= MAX_FAILS) {
                delete mem.train;
                return { status: "failed" };
            }
        }

        for (let i = 1; i < order.length; i++) this.follow(squad, order[i], order[i - 1]);
        return breach ? { status: "breach", breach } : { status: "moving" };
    }

    public static order(squad: Squad): WarCreep[] {
        const left = [...squad.creeps];
        const out: WarCreep[] = [];
        for (const role of ORDER) {
            const i = left.findIndex(c => roleOf(c) === role);
            if (i >= 0) out.push(...left.splice(i, 1));
        }
        return [...out, ...left];
    }

    private static follow(squad: Squad, creep: WarCreep, pred: WarCreep): void {
        if (creep.fatigue > 0) return;
        const own = new Set(squad.creeps.map(c => c.name));

        if (creep.pos.roomName !== pred.pos.roomName) {
            // El de adelante ya cruzó: se sigue su rastro (borde o portal).
            const { dir } = travel(creep, pred.pos, { range: 1, ignore: own, reuse: true });
            if (dir) squad.moved.set(creep.name, dir);
            return;
        }

        if (creep.pos.getRangeTo(pred) > 1) {
            const { dir } = travel(creep, pred.pos, { range: 1, ignore: own });
            if (dir) squad.moved.set(creep.name, dir);
            return;
        }

        if (squad.moved.has(pred.name)) {
            // Serpiente: pisa la casilla que deja el de adelante.
            const dir = creep.pos.getDirectionTo(pred);
            if (creep.move(dir) === OK) squad.moved.set(creep.name, dir);
            return;
        }

        if (isEdge(creep.pos.x, creep.pos.y)) this.stepOffEdge(squad, creep, pred.pos);
    }

    /** Se baja del borde a la casilla libre más cercana a `toward`. */
    private static stepOffEdge(squad: Squad, creep: WarCreep, toward: RoomPosition): void {
        const room = creep.pos.roomName;
        const tile = RoomGrid.tile(room);
        const occupancy = RoomGrid.occupancy(room);
        let best: DirectionConstant | undefined;
        let bestRange = Infinity;

        for (const dir of ALL_DIRECTIONS) {
            const [dx, dy] = OFFSETS[dir];
            const x = creep.pos.x + dx;
            const y = creep.pos.y + dy;
            if (isEdge(x, y) || tile[idx(x, y)] >= BLOCKED || occupancy.has(idx(x, y))) continue;
            const range = Math.max(Math.abs(x - toward.x), Math.abs(y - toward.y));
            if (range < bestRange) {
                best = dir;
                bestRange = range;
            }
        }
        if (best !== undefined && creep.move(best) === OK) squad.moved.set(creep.name, best);
    }
}
