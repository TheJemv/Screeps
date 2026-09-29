// src/utils/AdvancedMove/managers/LaneManager.ts
//
// CARRILES: circular por la DERECHA cuando hay 2+ roads paralelas.
//
// Con dos roads paralelas PathFinder elige el carril al azar (los dos cuestan
// lo mismo): los que van y los que vuelven se cruzan de frente y zigzaguean.
// Regla: cada creep usa el carril de SU derecha según hacia dónde camina.
//
//   hacia el este  -> el de abajo        hacia el oeste -> el de arriba
//   hacia el sur   -> el de la izquierda hacia el norte -> el de la derecha
//   (y lo mismo con roads en diagonal; en una U, el de afuera a la ida y el
//   de adentro a la vuelta)
//
// Cómo: PathManager busca el camino normal (pasada 1). Si pisa algún carril
// equivocado, LaneManager arma recargos para las casillas cercanas a ese
// camino y PathManager busca otra vez (pasada 2).
//
// Para cada road cercana se juntan dos cosas:
//   - hacia dónde CORRE esa road: su eje más largo (horizontal, vertical o
//     una de las diagonales), mirando solo la forma de las roads;
//   - hacia qué lado de ese eje va el creep: el sentido de marcha que el
//     propio camino lleva en ese tramo (sirve aunque la road doble).
// Con eso se sabe qué casilla le queda a la derecha:
//
//   carril con otro carril a su derecha      -> + LANES.WRONG_LANE_COST
//   el carril de más a la derecha            -> - LANES.RIGHT_LANE_BONUS
//   road que no es carril (plazas, cruces,
//   restos de road, o cruzarla de costado)   -> + LANES.OFF_LANE_COST
//
// Recargo + descuento hacen que pegarse a la derecha valga la pena aunque
// cueste un paso más (el carril de afuera de una curva es más largo). El
// recargo nunca llega al costo del plano: salirse de la road sigue siendo
// peor que ir por el carril equivocado. Con una sola road no cambia nada.

import { directionBetween, isDiagonal, offsetOf, packXY, roomToXY, rotate } from "../utils/position";
import { ADVANCED_MOVE_CONFIG } from "../config";
import CostMatrixManager from "./CostMatrixManager";

export interface LanePlan {
    /** Rooms que pisa el camino de la pasada 1: la pasada 2 no sale de ellos. */
    rooms: Set<string>;
    /** Recargo por room: packXY -> costo extra sobre la road. */
    extra: Map<string, Map<number, number>>;
}

/** Room que se está mirando: su nombre y su matriz de estructuras (roads = ROAD_COST). */
interface Area {
    roomName: string;
    base: CostMatrix;
}

/** Casillas cercanas al camino de un room, con el sentido de marcha del punto más cercano. */
interface Band {
    dist: Uint8Array;
    heading: Uint8Array;
}

/** Carril que pasa por una casilla, orientado hacia donde va el creep. */
interface Lane {
    /** Dirección del carril en el sentido de marcha (1..8). */
    dir: number;
    /** Largo del carril (contando para adelante y para atrás, hasta ~2 * FULL_RUN). */
    length: number;
}

/** Los 4 ejes posibles de una road: N-S, NE-SO, E-O, SE-NO (uno de sus dos sentidos). */
const AXES = [1, 2, 3, 4];
/** tan(22.5°): separa "recto" de "diagonal" al redondear un vector a 8 direcciones. */
const TAN_22_5 = 0.4142;
const FAR = 255;

export default class LaneManager {
    /**
     * Recargos para la pasada 2, o undefined si no hacen falta (el camino ya va
     * por su carril, o no hay roads paralelas en el camino).
     */
    public static plan(origin: RoomPosition, path: RoomPosition[], plainCost: number): LanePlan | undefined {
        const cfg = ADVANCED_MOVE_CONFIG.LANES;
        const cap = Math.min(cfg.WRONG_LANE_COST, plainCost - ADVANCED_MOVE_CONFIG.PATH.ROAD_COST - 1);
        if (!cfg.ENABLED || cap <= 0 || path.length < 2) return undefined;

        const points = [origin, ...path];
        const headings = this.headings(points);

        // ¿Pisa algún carril equivocado? Si no, el camino ya está bien.
        let wrong = false;
        for (let i = 1; i < points.length && !wrong; i++) {
            const { x, y, roomName } = points[i];
            const area = areaOf(roomName);
            const lane = isRoad(area, x, y) ? this.laneAt(area, x, y, headings[i]) : undefined;
            wrong = lane !== undefined && this.hasLaneOn(area, x, y, lane.dir, 1);
        }
        if (!wrong) return undefined;

        const bands = this.bands(points, headings);
        const extra = new Map<string, Map<number, number>>();

        for (const [roomName, band] of bands) {
            const area = areaOf(roomName);
            const costs = new Map<number, number>();

            for (let xy = 0; xy < band.dist.length; xy++) {
                if (band.dist[xy] === FAR) continue;
                const x = Math.floor(xy / 50);
                const y = xy % 50;
                if (!isRoad(area, x, y)) continue;

                const cost = this.extraCost(area, x, y, band.heading[xy]);
                if (cost !== 0) costs.set(xy, Math.min(cost, cap));
            }

            extra.set(roomName, costs);
        }

        return { rooms: new Set(bands.keys()), extra };
    }

    /** Recargo (o descuento, si es negativo) de una road para quien pasa con este sentido de marcha. */
    private static extraCost(area: Area, x: number, y: number, heading: number): number {
        const cfg = ADVANCED_MOVE_CONFIG.LANES;
        const lane = this.laneAt(area, x, y, heading);
        if (!lane) return cfg.OFF_LANE_COST;

        const isLane = lane.length >= cfg.FULL_RUN;
        let cost = isLane ? 0 : cfg.OFF_LANE_COST;
        if (this.hasLaneOn(area, x, y, lane.dir, 1)) cost += cfg.WRONG_LANE_COST;
        else if (isLane && this.hasLaneOn(area, x, y, lane.dir, -1)) cost -= cfg.RIGHT_LANE_BONUS;
        return cost;
    }

    /**
     * Sentido de marcha en cada punto: del punto de HEADING_WINDOW pasos atrás
     * al de HEADING_WINDOW pasos adelante, redondeado a 8 direcciones. Cerca
     * de las puntas la ventana se corre (no se achica): así el último paso en
     * diagonal hacia el destino no cambia el sentido de todo el tramo final.
     * En coordenadas de mundo, así el cruce de un borde no lo desarma.
     */
    private static headings(points: RoomPosition[]): number[] {
        const window = ADVANCED_MOVE_CONFIG.LANES.HEADING_WINDOW;
        const last = points.length - 1;
        const headings: number[] = [];

        for (let i = 0; i <= last; i++) {
            const start = Math.max(0, Math.min(i - window, last - 2 * window));
            const end = Math.min(last, Math.max(i + window, 2 * window));
            const from = worldXY(points[start]);
            const to = worldXY(points[end]);
            headings.push(toDirection(to[0] - from[0], to[1] - from[1]));
        }

        return headings;
    }

    /** Casillas a BAND o menos del camino (sin bordes), por room. */
    private static bands(points: RoomPosition[], headings: number[]): Map<string, Band> {
        const radius = ADVANCED_MOVE_CONFIG.LANES.BAND;
        const bands = new Map<string, Band>();

        for (let i = 0; i < points.length; i++) {
            if (!headings[i]) continue;
            const { x: px, y: py, roomName } = points[i];

            let band = bands.get(roomName);
            if (!band) {
                band = { dist: new Uint8Array(2500).fill(FAR), heading: new Uint8Array(2500) };
                bands.set(roomName, band);
            }

            for (let dx = -radius; dx <= radius; dx++) {
                const x = px + dx;
                if (x < 1 || x > 48) continue;

                for (let dy = -radius; dy <= radius; dy++) {
                    const y = py + dy;
                    if (y < 1 || y > 48) continue;

                    const xy = packXY(x, y);
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    if (dist < band.dist[xy]) {
                        band.dist[xy] = dist;
                        band.heading[xy] = headings[i];
                    }
                }
            }
        }

        return bands;
    }

    /**
     * El carril de esta road: su eje más largo (a igual largo, el más parecido
     * al sentido de marcha), orientado hacia donde va el creep. undefined si
     * el creep la cruza de costado (el eje queda a 90° de su marcha).
     */
    private static laneAt(area: Area, x: number, y: number, heading: number): Lane | undefined {
        if (!heading) return undefined;

        let best: Lane | undefined;
        let bestTurn = Infinity;
        for (const axis of AXES) {
            const length = this.laneLength(area, x, y, axis);
            // De los dos sentidos del eje, el más cercano a la marcha (0 = igual, 2 = a 90°).
            const turn = octantsBetween(axis, heading);
            const dir = turn <= 2 ? axis : rotate(axis, 4);
            const angle = Math.min(turn, 4 - turn);

            if (!best || length > best.length || (length === best.length && angle < bestTurn)) {
                best = { dir, length };
                bestTurn = angle;
            }
        }

        // A 90°: la road corre de costado a la marcha (ej: una plaza que baja al norte).
        return best && bestTurn < 2 ? best : undefined;
    }

    /**
     * ¿Hay un carril paralelo a la derecha (`sideSign` = 1) o a la izquierda
     * (-1)? La casilla de al lado (yendo en diagonal, la de un paso recto
     * hacia ese lado: ahí queda el carril diagonal vecino) tiene que ser road
     * que siga en el mismo sentido MIN_RUN casillas: el costado de una plaza
     * que se corta enseguida no cuenta. Si el propio carril se termina antes,
     * alcanza con una menos que el propio (el carril de afuera de una curva
     * es una casilla más corto), y nunca menos de 2.
     */
    private static hasLaneOn(area: Area, x: number, y: number, dir: number, sideSign: 1 | -1): boolean {
        const { MIN_RUN } = ADVANCED_MOVE_CONFIG.LANES;
        const side = offsetOf(rotate(dir, sideSign * (isDiagonal(dir) ? 1 : 2)));
        const own = this.run(area, x, y, dir, MIN_RUN + 1);
        const need = Math.max(2, Math.min(MIN_RUN, own - 1));
        return this.run(area, x + side.x, y + side.y, dir, need) >= need;
    }

    /** Largo del carril que pasa por (x, y) en el eje de `dir`, para adelante y para atrás. */
    private static laneLength(area: Area, x: number, y: number, dir: number): number {
        const full = ADVANCED_MOVE_CONFIG.LANES.FULL_RUN;
        const ahead = this.run(area, x, y, dir, full);
        if (ahead === 0) return 0;
        return ahead + this.run(area, x, y, rotate(dir, 4), full) - 1;
    }

    /** Casillas seguidas de carril desde (x, y) en `dir`, contando la propia (máximo `max`). */
    private static run(area: Area, x: number, y: number, dir: number, max: number): number {
        const step = offsetOf(dir);
        let length = 0;
        while (length < max && this.isLaneTile(area, x + step.x * length, y + step.y * length, dir)) {
            length++;
        }
        return length;
    }

    /**
     * Road, o (en carriles rectos) un hueco de UNA casilla pisable con road
     * adelante y atrás: no corta el carril. En diagonal no hay huecos: dos
     * roads en diagonal con plano en el medio no son un carril.
     */
    private static isLaneTile(area: Area, x: number, y: number, dir: number): boolean {
        if (isRoad(area, x, y)) return true;
        if (isDiagonal(dir) || !inRoom(x, y) || !CostMatrixManager.isWalkable(area.roomName, x, y)) return false;

        const step = offsetOf(dir);
        return isRoad(area, x + step.x, y + step.y) && isRoad(area, x - step.x, y - step.y);
    }
}

function areaOf(roomName: string): Area {
    return { roomName, base: CostMatrixManager.get(roomName) };
}

function inRoom(x: number, y: number): boolean {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isRoad(area: Area, x: number, y: number): boolean {
    return inRoom(x, y) && area.base.get(x, y) === ADVANCED_MOVE_CONFIG.PATH.ROAD_COST;
}

/** Octavos (45°) entre dos direcciones, por el lado más corto: 0..4. */
function octantsBetween(a: number, b: number): number {
    const diff = (((b - a) % 8) + 8) % 8;
    return Math.min(diff, 8 - diff);
}

/** Coordenadas de mundo (50 casillas por room). Rooms sin coordenadas ("sim"): las locales. */
function worldXY(pos: RoomPosition): [number, number] {
    const room = roomToXY(pos.roomName);
    return room ? [room[0] * 50 + pos.x, room[1] * 50 + pos.y] : [pos.x, pos.y];
}

/** Vector -> una de las 8 direcciones (0 si es nulo). */
function toDirection(dx: number, dy: number): number {
    if (dx === 0 && dy === 0) return 0;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const sx = ax > ay * TAN_22_5 ? Math.sign(dx) : 0;
    const sy = ay > ax * TAN_22_5 ? Math.sign(dy) : 0;
    return directionBetween(0, 0, sx, sy);
}
