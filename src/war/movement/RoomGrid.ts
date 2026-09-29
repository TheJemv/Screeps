// src/war/movement/RoomGrid.ts
//
// Grillas de costos de cada room, una vez por tick (el terreno se cachea para siempre).
//
//   tile   -> costo de cada casilla para el bloque: roads 1, plano 2, pantano 10,
//             estructura enemiga rompible (SOLO en el room atacado) 40..250, resto 255.
//   box    -> costo de parar el centro del bloque 3x3 ahí (ver Grid.ts).
//   travel -> CostMatrix para un creep suelto (reagrupar, tren): nunca rompe nada.
//
// Portales: siempre 255 (pisar uno te teletransporta), salvo el que se quiere cruzar.
import { WAR_CONFIG } from "../config";
import { isAlly } from "../utils/combat";
import { attackRoom } from "../utils/flags";
import { idx, isEdge } from "../utils/geometry";
import { BLOCKED, boxCosts } from "./Grid";

const { MOVE } = WAR_CONFIG;

interface RoomCache {
    tick: number;
    tile: Uint8Array;
    box?: Uint8Array;
    boxMatrix?: CostMatrix;
    travel?: CostMatrix;
    travelInside?: CostMatrix;
    /** Casilla -> room destino del portal ("" = otro shard). */
    portals: Map<number, string>;
    /** Casillas con algo que el bloque puede romper (room atacado). */
    breakable: Set<number>;
    /** Casilla -> hits a romper (rampart + lo que tenga abajo). */
    breakHits: Map<number, number>;
    roads: Set<number>;
}

const terrainCache = new Map<string, Uint8Array>();
const rooms = new Map<string, RoomCache>();

let occupancyTick = -1;
const occupancy = new Map<string, Map<number, string>>();

export default class RoomGrid {
    /** Costos de terreno puro (sin visión también sirve). */
    public static terrain(roomName: string): Uint8Array {
        let t = terrainCache.get(roomName);
        if (t) return t;

        t = new Uint8Array(2500);
        const terrain = Game.map.getRoomTerrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const kind = terrain.get(x, y);
                t[idx(x, y)] = kind === TERRAIN_MASK_WALL ? BLOCKED : kind === TERRAIN_MASK_SWAMP ? MOVE.COST_SWAMP : MOVE.COST_PLAIN;
            }
        }
        terrainCache.set(roomName, t);
        return t;
    }

    public static tile(roomName: string): Uint8Array {
        return this.get(roomName).tile;
    }

    public static box(roomName: string): Uint8Array {
        const c = this.get(roomName);
        if (!c.box) c.box = boxCosts(c.tile);
        return c.box;
    }

    public static portals(roomName: string): Map<number, string> {
        return this.get(roomName).portals;
    }

    public static isBreakable(roomName: string, x: number, y: number): boolean {
        return this.get(roomName).breakable.has(idx(x, y));
    }

    /** Casillas con algo rompible (solo en el room atacado). */
    public static breakables(roomName: string): Set<number> {
        return this.get(roomName).breakable;
    }

    /** Hits a romper en esa casilla (0 si no hay nada rompible). */
    public static breakHitsAt(roomName: string, i: number): number {
        const c = this.get(roomName);
        return c.breakable.has(i) ? c.breakHits.get(i) ?? 0 : 0;
    }

    /** Qué hay que romper para pisar (x, y): primero el rampart (protege lo de abajo). */
    public static breachAt(roomName: string, x: number, y: number): AnyStructure | undefined {
        const room = Game.rooms[roomName];
        if (!room || !this.isBreakable(roomName, x, y)) return undefined;
        const list = room.lookForAt(LOOK_STRUCTURES, x, y);
        const rampart = list.find(s => s.structureType === STRUCTURE_RAMPART && !s.my);
        if (rampart) return rampart;
        return list.find(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER);
    }

    public static isRoad(roomName: string, x: number, y: number): boolean {
        return this.get(roomName).roads.has(idx(x, y));
    }

    /** CostMatrix del bloque (todas las casillas definidas: 255 o costo). */
    public static boxMatrix(roomName: string): CostMatrix {
        const c = this.get(roomName);
        if (!c.boxMatrix) c.boxMatrix = toMatrix(this.box(roomName));
        return c.boxMatrix;
    }

    /** Igual, pero con los creeps ajenos como obstáculos (para destrabarse). No se cachea. */
    public static boxMatrixAvoiding(roomName: string, squadNames: Set<string>): CostMatrix {
        const tile = this.tile(roomName).slice();
        const occ = this.occupancy(roomName);
        for (const [i, name] of occ) {
            if (!squadNames.has(name)) tile[i] = BLOCKED;
        }
        return toMatrix(boxCosts(tile));
    }

    /**
     * CostMatrix para un creep suelto. El terreno lo pone PathFinder (plano 2,
     * pantano 10); acá van roads, obstáculos y portales.
     * @param inside true = las casillas de salida también son 255 (viaje dentro del room:
     *               pisarlas te saca del room).
     */
    public static travelMatrix(roomName: string, inside: boolean): CostMatrix {
        const c = this.get(roomName);
        if (inside && c.travelInside) return c.travelInside;
        if (!inside && c.travel) return c.travel;

        const matrix = new PathFinder.CostMatrix();
        const terrain = this.terrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const i = idx(x, y);
                if (inside && isEdge(x, y)) matrix.set(x, y, BLOCKED);
                else if (c.breakable.has(i) || c.portals.has(i)) matrix.set(x, y, BLOCKED);
                else if (c.tile[i] >= BLOCKED && terrain[i] < BLOCKED) matrix.set(x, y, BLOCKED);
                else if (c.roads.has(i)) matrix.set(x, y, MOVE.COST_ROAD);
            }
        }

        if (inside) c.travelInside = matrix;
        else c.travel = matrix;
        return matrix;
    }

    /** Casilla -> nombre de TODOS los creeps (y power creeps) del room este tick. */
    public static occupancy(roomName: string): Map<number, string> {
        if (occupancyTick !== Game.time) {
            occupancyTick = Game.time;
            occupancy.clear();
        }
        let map = occupancy.get(roomName);
        if (map) return map;

        map = new Map();
        const room = Game.rooms[roomName];
        if (room) {
            for (const c of room.find(FIND_CREEPS)) map.set(idx(c.pos.x, c.pos.y), c.name);
            for (const c of room.find(FIND_POWER_CREEPS)) map.set(idx(c.pos.x, c.pos.y), c.name);
        }
        occupancy.set(roomName, map);
        return map;
    }

    // -----------------------------------------------------------------------

    private static get(roomName: string): RoomCache {
        const cached = rooms.get(roomName);
        const visible = Boolean(Game.rooms[roomName]);
        // Sin visión se reutiliza lo último que se vio (o el terreno) hasta volver a verlo.
        if (cached && (cached.tick === Game.time || !visible)) return cached;

        const built = visible ? this.build(roomName) : this.blind(roomName);
        rooms.set(roomName, built);
        return built;
    }

    /** Sin visión: terreno + portales recordados. */
    private static blind(roomName: string): RoomCache {
        const tile = this.terrain(roomName).slice();
        const portals = new Map<number, string>();
        for (const p of Memory.war?.portals[roomName]?.list ?? []) {
            portals.set(idx(p.x, p.y), p.d);
            tile[idx(p.x, p.y)] = BLOCKED;
        }
        return { tick: -1, tile, portals, breakable: new Set(), breakHits: new Map(), roads: new Set() };
    }

    private static build(roomName: string): RoomCache {
        const room = Game.rooms[roomName];
        const tile = this.terrain(roomName).slice();
        const siege = roomName === attackRoom();

        const roads = new Set<number>();
        const blocked = new Set<number>();
        const portals = new Map<number, string>();
        const breakHits = new Map<number, number>();

        for (const s of room.find(FIND_STRUCTURES)) {
            const i = idx(s.pos.x, s.pos.y);
            switch (s.structureType) {
                case STRUCTURE_ROAD:
                    roads.add(i);
                    break;
                case STRUCTURE_CONTAINER:
                    break;
                case STRUCTURE_PORTAL: {
                    const dest = s.destination;
                    portals.set(i, "roomName" in dest ? dest.roomName : "");
                    blocked.add(i);
                    break;
                }
                case STRUCTURE_RAMPART: {
                    if (s.my) break;
                    if (isAlly(s.owner?.username)) {
                        if (!s.isPublic) blocked.add(i);
                    } else if (siege) {
                        breakHits.set(i, (breakHits.get(i) ?? 0) + s.hits);
                    } else {
                        blocked.add(i);
                    }
                    break;
                }
                case STRUCTURE_WALL:
                    if (siege) breakHits.set(i, (breakHits.get(i) ?? 0) + s.hits);
                    else blocked.add(i);
                    break;
                default: {
                    const owned = s as AnyOwnedStructure;
                    const enemy =
                        siege &&
                        owned.owner !== undefined &&
                        !owned.my &&
                        !isAlly(owned.owner.username) &&
                        s.structureType !== STRUCTURE_CONTROLLER &&
                        s.structureType !== STRUCTURE_INVADER_CORE &&
                        s.hits !== undefined;
                    if (enemy) breakHits.set(i, (breakHits.get(i) ?? 0) + s.hits);
                    else blocked.add(i);
                }
            }
        }

        for (const src of room.find(FIND_SOURCES)) blocked.add(idx(src.pos.x, src.pos.y));
        for (const min of room.find(FIND_MINERALS)) blocked.add(idx(min.pos.x, min.pos.y));
        for (const dep of room.find(FIND_DEPOSITS)) blocked.add(idx(dep.pos.x, dep.pos.y));

        // Road primero (sirve también para túneles sobre muro); después lo que tapa.
        for (const i of roads) tile[i] = MOVE.COST_ROAD;
        const breakable = new Set<number>();
        const terrain = this.terrain(roomName);
        for (const [i, hits] of breakHits) {
            if (blocked.has(i) || terrain[i] >= BLOCKED) continue;
            tile[i] = Math.min(MOVE.BREAK_MAX, MOVE.BREAK_BASE + Math.floor(hits / MOVE.BREAK_HITS_PER_POINT));
            breakable.add(i);
        }
        for (const i of blocked) tile[i] = BLOCKED;

        return { tick: Game.time, tile, portals, breakable, breakHits, roads };
    }
}

function toMatrix(values: Uint8Array): CostMatrix {
    const matrix = new PathFinder.CostMatrix();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) matrix.set(x, y, values[idx(x, y)]);
    }
    return matrix;
}
