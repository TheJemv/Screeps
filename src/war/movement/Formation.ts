// src/war/movement/Formation.ts
//
// Geometría de la formación (sin API del juego, se puede probar fuera).
//
// El pelotón ocupa un bloque de 3x3. El ANCLA es el centro (casilla del healer).
// Mirando hacia arriba (facing TOP):
//
//        marcha              asalto (quietos pegándole a una estructura)
//      .  L  .               TL L  TR
//      TL H  TR              .  H  .
//      RL .  RR              RL .  RR
//
//   L = líder (frente, en medio)   TL/TR = tanques a los lados
//   H = healer (en medio, protegido)   RL/RR = ranged atrás
//
// En asalto los tanques dan un paso al frente para que los TRES melee le peguen
// a lo que está delante del líder; al volver a moverse regresan a los lados.
// La formación gira en 4 direcciones (TOP, RIGHT, BOTTOM, LEFT) pero se traslada
// en las 8 (todos dan el mismo paso a la vez).
import type { SquadRole } from "../types";
import { chebyshev } from "../utils/geometry";

export type Facing = 1 | 3 | 5 | 7;
export type Slot = "L" | "TL" | "TR" | "H" | "RL" | "RR";
export type Stance = "march" | "assault";

export const FACINGS: Facing[] = [1, 3, 5, 7];

/** [lado, adelante] de cada casilla: lado +1 = derecha, adelante +1 = hacia donde mira. */
const LAYOUT: Record<Stance, Record<Slot, [number, number]>> = {
    march: { L: [0, 1], TL: [-1, 0], H: [0, 0], TR: [1, 0], RL: [-1, -1], RR: [1, -1] },
    assault: { L: [0, 1], TL: [-1, 1], H: [0, 0], TR: [1, 1], RL: [-1, -1], RR: [1, -1] }
};

/** Vector "adelante" de cada facing (y crece hacia abajo). */
export const FORWARD: Record<Facing, [number, number]> = {
    1: [0, -1],
    3: [1, 0],
    5: [0, 1],
    7: [-1, 0]
};

/** Vector "derecha" (adelante girado 90° en sentido horario). */
export function rightOf(facing: Facing): [number, number] {
    const [fx, fy] = FORWARD[facing];
    return [-fy, fx];
}

export function slotOffset(slot: Slot, facing: Facing, stance: Stance): [number, number] {
    const [side, fwd] = LAYOUT[stance][slot];
    const [fx, fy] = FORWARD[facing];
    const [rx, ry] = rightOf(facing);
    return [side * rx + fwd * fx, side * ry + fwd * fy];
}

export function slotAt(anchor: { x: number; y: number }, slot: Slot, facing: Facing, stance: Stance): { x: number; y: number } {
    const [dx, dy] = slotOffset(slot, facing, stance);
    return { x: anchor.x + dx, y: anchor.y + dy };
}

/** Facing que mira hacia (dx, dy): el eje dominante. */
export function facingToward(dx: number, dy: number, fallback: Facing = 1): Facing {
    if (dx === 0 && dy === 0) return fallback;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 3 : 7;
    return dy > 0 ? 5 : 1;
}

/**
 * Hacia dónde conviene mirar según los próximos pasos del camino. undefined = no
 * hay que girar: el camino sigue más o menos hacia adelante (o es muy corto).
 * Solo gira cuando el camino va de costado o hacia atrás, así no se la pasa girando.
 */
export function headingFacing(dirs: number[], current: Facing, offsets: Record<number, [number, number]>): Facing | undefined {
    let sx = 0;
    let sy = 0;
    for (const d of dirs) {
        const o = offsets[d];
        if (!o) continue;
        sx += o[0];
        sy += o[1];
    }
    if (Math.max(Math.abs(sx), Math.abs(sy)) < 3) return undefined;

    const [fx, fy] = FORWARD[current];
    if (fx * sx + fy * sy > 0) return undefined;
    return facingToward(sx, sy, current);
}

// ---------------------------------------------------------------------------
// Quién va en cada casilla
// ---------------------------------------------------------------------------

export interface MemberInfo {
    name: string;
    role: SquadRole;
    x: number;
    y: number;
    room: string;
    /** Casilla del tick anterior (desempate estable). */
    previous?: Slot;
}

/**
 * Reparte las casillas. Fijos: líder -> L, healer -> H. Los dos tanques y los dos
 * ranged se reparten izquierda/derecha según quién queda más cerca (así, al girar,
 * nadie cruza la formación entera). Si muere el líder, el tanque más cercano
 * pasa al frente para no dejar al healer expuesto.
 */
export function assignSlots(
    members: MemberInfo[],
    anchor: { x: number; y: number; r: string },
    facing: Facing,
    stance: Stance
): Map<string, Slot> {
    const result = new Map<string, Slot>();
    const sorted = [...members].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const dist = (m: MemberInfo, slot: Slot): number => {
        if (m.room !== anchor.r) return 100;
        const p = slotAt(anchor, slot, facing, stance);
        return chebyshev(m.x, m.y, p.x, p.y);
    };

    const leaders = sorted.filter(m => m.role === "Leader");
    const tanks = sorted.filter(m => m.role === "Tank");
    const healers = sorted.filter(m => m.role === "Healer");
    const ranged = sorted.filter(m => m.role === "Ranged");

    // Líderes de sobra pelean como tanques.
    if (leaders.length > 0) {
        result.set(leaders[0].name, "L");
        tanks.unshift(...leaders.slice(1));
    } else if (tanks.length > 0) {
        tanks.sort((a, b) => dist(a, "L") - dist(b, "L"));
        const promoted = tanks.shift() as MemberInfo;
        result.set(promoted.name, "L");
        tanks.sort((a, b) => (a.name < b.name ? -1 : 1));
    }

    if (healers.length > 0) result.set(healers[0].name, "H");

    pair(tanks, "TL", "TR", dist, result);
    pair(ranged, "RL", "RR", dist, result);
    return result;
}

function pair(
    list: MemberInfo[],
    left: Slot,
    right: Slot,
    dist: (m: MemberInfo, slot: Slot) => number,
    out: Map<string, Slot>
): void {
    if (list.length === 0) return;

    if (list.length === 1) {
        const m = list[0];
        const dl = dist(m, left);
        const dr = dist(m, right);
        if (dl === dr) out.set(m.name, m.previous === right ? right : left);
        else out.set(m.name, dl < dr ? left : right);
        return;
    }

    const [a, b] = list;
    const straight = dist(a, left) + dist(b, right);
    const crossed = dist(a, right) + dist(b, left);
    let aLeft = straight < crossed;
    if (straight === crossed) aLeft = a.previous !== right && b.previous !== left;
    out.set(a.name, aLeft ? left : right);
    out.set(b.name, aLeft ? right : left);
}
