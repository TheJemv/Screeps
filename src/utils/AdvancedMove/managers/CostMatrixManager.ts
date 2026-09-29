// src/utils/AdvancedMove/managers/CostMatrixManager.ts
//
// CostMatrix de ESTRUCTURAS por room, cacheada en heap (sobrevive entre ticks
// hasta el próximo global reset). Es la base compartida de todos los paths:
// NUNCA se muta; quien necesite agregar creeps/hostiles hace clone().
//
//   road                           -> PATH.ROAD_COST (el plano/pantano los pone PathFinder según el creep)
//   estructura sólida / sitio mío  -> 255 (no se puede pisar)
//   rampart ajeno no público       -> 255
//   portal                         -> 255 (pisarlo teletransporta: solo a propósito)
//   container / rampart propio     -> 0   (costo del terreno)
//
// Se invalida si cambia la cantidad de estructuras o de construction sites, o
// por TTL. El chequeo se hace una sola vez por room por tick.

import { ADVANCED_MOVE_CONFIG } from "../config";
import { TerrainCosts } from "../utils/body";

interface MatrixEntry {
    matrix: CostMatrix;
    /** Variante con los exits bloqueados (lazy), para viajes dentro del mismo room. */
    noExits?: CostMatrix;
    builtAt: number;
    checkedAt: number;
    structures: number;
    sites: number;
}

const IMPASSABLE = 255;

const matrices = new Map<string, MatrixEntry>();
const terrains = new Map<string, RoomTerrain>();
let emptyMatrix: CostMatrix | undefined;
let obstacleTypes: Set<string> | undefined;

export default class CostMatrixManager {
    /** Matriz base del room. Compartida: NO mutar (usar clone()). */
    public static get(roomName: string): CostMatrix {
        const entry = matrices.get(roomName);
        if (entry && entry.checkedAt === Game.time) return entry.matrix;

        const room = Game.rooms[roomName];
        // Sin visión: la última conocida, o una vacía (solo terreno).
        if (!room) return entry ? entry.matrix : this.empty();

        const structures = room.find(FIND_STRUCTURES);
        const sites = room.find(FIND_MY_CONSTRUCTION_SITES);

        if (
            entry &&
            Game.time - entry.builtAt < ADVANCED_MOVE_CONFIG.CACHE.MATRIX_TTL &&
            entry.structures === structures.length &&
            entry.sites === sites.length
        ) {
            entry.checkedAt = Game.time;
            return entry.matrix;
        }

        const matrix = this.build(room, structures, sites);
        matrices.set(roomName, {
            matrix,
            builtAt: Game.time,
            checkedAt: Game.time,
            structures: structures.length,
            sites: sites.length
        });
        return matrix;
    }

    /**
     * Igual que get() pero con las casillas de salida bloqueadas. Para viajes
     * dentro del mismo room: pisar un exit teletransporta al room vecino, y
     * PathFinder a veces lo usa de atajo por el borde (el clásico "baile" en
     * los bordes). Compartida: NO mutar.
     */
    public static getWithoutExits(roomName: string): CostMatrix {
        const base = this.get(roomName);
        const entry = matrices.get(roomName);
        if (!entry || entry.matrix !== base) return this.blockExits(base.clone(), roomName); // sin visión ni caché

        if (!entry.noExits) entry.noExits = this.blockExits(base.clone(), roomName);
        return entry.noExits;
    }

    /** ¿Se puede pisar? Terreno + estructuras (sin contar creeps). */
    public static isWalkable(roomName: string, x: number, y: number): boolean {
        const cost = this.get(roomName).get(x, y);
        if (cost >= IMPASSABLE) return false;
        if (cost > 0) return true; // road: se puede pisar aunque sea un túnel sobre muro
        return !this.isWallTerrain(roomName, x, y);
    }

    public static isRoad(roomName: string, x: number, y: number): boolean {
        return this.get(roomName).get(x, y) === ADVANCED_MOVE_CONFIG.PATH.ROAD_COST;
    }

    /** Costo de pisar la casilla para un creep con esos costos de terreno. Infinity si no se puede. */
    public static tileCost(roomName: string, x: number, y: number, costs: TerrainCosts): number {
        const cost = this.get(roomName).get(x, y);
        if (cost >= IMPASSABLE) return Infinity;
        if (cost > 0) return cost;

        const terrain = this.terrain(roomName).get(x, y);
        if (terrain % 2 === 1) return Infinity; // bit de muro (TERRAIN_MASK_WALL = 1)
        return terrain === TERRAIN_MASK_SWAMP ? costs.swamp : costs.plain;
    }

    private static isWallTerrain(roomName: string, x: number, y: number): boolean {
        return this.terrain(roomName).get(x, y) % 2 === 1;
    }

    /** Terreno del room (cacheado en heap). */
    public static terrain(roomName: string): RoomTerrain {
        let terrain = terrains.get(roomName);
        if (!terrain) {
            terrain = Game.map.getRoomTerrain(roomName);
            terrains.set(roomName, terrain);
        }
        return terrain;
    }

    private static build(room: Room, structures: AnyStructure[], sites: ConstructionSite[]): CostMatrix {
        const matrix = new PathFinder.CostMatrix();
        const obstacles = this.obstacles();
        const road = ADVANCED_MOVE_CONFIG.PATH.ROAD_COST;

        for (const s of structures) {
            const { x, y } = s.pos;

            if (s.structureType === STRUCTURE_ROAD) {
                // Una road no "destapa" una estructura sólida que ya esté en la casilla.
                if (matrix.get(x, y) === 0) matrix.set(x, y, road);
            } else if (s.structureType === STRUCTURE_RAMPART) {
                if (!s.my && !s.isPublic) matrix.set(x, y, IMPASSABLE);
            } else if (s.structureType === STRUCTURE_PORTAL || obstacles.has(s.structureType)) {
                matrix.set(x, y, IMPASSABLE);
            }
        }

        // Mis sitios de estructuras sólidas: el motor no me deja pisarlos, y
        // pararse encima impide construirlos.
        for (const site of sites) {
            if (obstacles.has(site.structureType)) matrix.set(site.pos.x, site.pos.y, IMPASSABLE);
        }

        // Sources/minerales no son estructuras pero sí obstáculos.
        for (const source of room.find(FIND_SOURCES)) matrix.set(source.pos.x, source.pos.y, IMPASSABLE);
        for (const mineral of room.find(FIND_MINERALS)) matrix.set(mineral.pos.x, mineral.pos.y, IMPASSABLE);

        return matrix;
    }

    private static blockExits(matrix: CostMatrix, roomName: string): CostMatrix {
        const terrain = this.terrain(roomName);
        for (let i = 1; i < 49; i++) {
            if (terrain.get(0, i) % 2 === 0) matrix.set(0, i, IMPASSABLE);
            if (terrain.get(49, i) % 2 === 0) matrix.set(49, i, IMPASSABLE);
            if (terrain.get(i, 0) % 2 === 0) matrix.set(i, 0, IMPASSABLE);
            if (terrain.get(i, 49) % 2 === 0) matrix.set(i, 49, IMPASSABLE);
        }
        return matrix;
    }

    private static empty(): CostMatrix {
        if (!emptyMatrix) emptyMatrix = new PathFinder.CostMatrix();
        return emptyMatrix;
    }

    private static obstacles(): Set<string> {
        if (!obstacleTypes) obstacleTypes = new Set<string>(OBSTACLE_OBJECT_TYPES);
        return obstacleTypes;
    }
}
