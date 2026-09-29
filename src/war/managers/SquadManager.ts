// src/war/managers/SquadManager.ts
//
// Estado de cada pelotón:
//
//   rally   -> nacen y van a su casilla alrededor de la bandera Save. Esperan ahí
//              hasta estar los 6 y formados; recién entonces, si hay bandera
//              Attack, salen. (Aunque la bandera ya exista, esperan a todos.)
//   march   -> viajan en formación al room de Attack.
//   siege   -> atacan el room por prioridades (TargetManager).
//   retreat -> muy heridos (o safe mode): vuelven al room anterior a curarse.
//   return  -> se quitó la bandera Attack: vuelven a Save.
//
// Cada tick, además, cada creep pelea con lo que tenga a su alcance (roles/).
import { WAR_CONFIG } from "../config";
import type { PackedPos, Squad, SquadRole } from "../types";
import Navigator, { Destination } from "../movement/Navigator";
import FormationMove from "../movement/FormationMove";
import RoomGrid from "../movement/RoomGrid";
import { FACINGS, FORWARD, Facing, facingToward, rightOf } from "../movement/Formation";
import { BLOCKED, countInBox, nearestAnchor } from "../movement/Grid";
import TargetManager, { Target } from "./TargetManager";
import RouteManager from "./RouteManager";
import RoleMelee from "../roles/Melee";
import RoleRanged from "../roles/Ranged";
import RoleHealer from "../roles/Healer";
import type { CombatContext } from "../roles/context";
import { healPower, hostileStructuresIn, hostilesIn, isAlly, isThreat } from "../utils/combat";
import { attackRoom, safeModeActive, saveFlag } from "../utils/flags";
import { chebyshev, idx } from "../utils/geometry";
import { warMemory } from "../utils/memory";
import { roleOf } from "../utils/roles";
import { drawSquad } from "../utils/debug";

const { RETREAT, MOVE, SIEGE } = WAR_CONFIG;
/** Daño de una torre a distancia máxima (TOWER_POWER_ATTACK con toda la caída). */
const TOWER_MIN_DAMAGE = 150;

const SAY: Record<string, string> = {
    rally: "⏳",
    march: "🚩",
    siege: "⚔️",
    retreat: "🩹",
    return: "🏠"
};

export default class SquadManager {
    public static run(squad: Squad): void {
        const attack = attackRoom();
        this.observe(squad);

        const ctx: CombatContext = { siegeRoom: attack, focus: null, danger: false };
        switch (squad.mem.phase) {
            case "rally":
                this.rally(squad, attack);
                break;
            case "march":
                this.march(squad, attack);
                break;
            case "siege":
                this.siege(squad, attack, ctx);
                break;
            case "retreat":
                this.retreat(squad, attack);
                break;
            case "return":
                this.goHome(squad, attack);
                break;
        }

        ctx.danger =
            ctx.danger ||
            squad.creeps.some(c => c.pos.roomName === attack || hostilesIn(c.room).some(h => isThreat(h) && c.pos.inRangeTo(h, 6)));
        this.fight(squad, ctx);
        this.say(squad);
        drawSquad(squad, ctx);
    }

    // -----------------------------------------------------------------------
    // Fases
    // -----------------------------------------------------------------------

    private static rally(squad: Squad, attack: string | undefined): void {
        const mem = squad.mem;
        mem.rally = mem.rally ?? this.pickRally(squad);
        if (!mem.rally) {
            // Sin bandera Save: se forman donde estén.
            const room = squad.creeps[0]?.pos.roomName;
            if (room) Navigator.drive(squad, { kind: "room", room });
            return;
        }
        mem.anchor = mem.anchor ?? mem.rally;

        const facing = attack ? this.facingTowardRoom(mem.rally, attack) : mem.facing ?? 1;
        const result = Navigator.drive(squad, { kind: "anchor", pos: mem.rally, facing, range: 1 });
        const formed = result.status === "arrived";

        if (formed && this.isComplete(squad) && attack && !safeModeActive(attack)) {
            mem.phase = "march";
            mem.recruiting = false;
            mem.target = attack;
            mem.departed = Game.time;
            mem.path = undefined;
            console.log(`[War] 🚩 ${squad.id} completo (${squad.creeps.length}) y formado en Save: sale hacia ${attack}`);
        }
    }

    private static march(squad: Squad, attack: string | undefined): void {
        const mem = squad.mem;
        if (!attack) {
            this.setPhase(squad, "return");
            return;
        }
        if (mem.target !== attack) {
            mem.target = attack;
            mem.staging = undefined;
            mem.plan = undefined;
        }

        if (mem.anchor && mem.anchor.r === attack && !mem.crossing && !mem.train) {
            mem.phase = "siege";
            return;
        }

        const hold = safeModeActive(attack) || this.outgunned(squad, attack);
        const result = Navigator.drive(squad, { kind: "room", room: attack, hold });
        if (result.status === "nopath" && Game.time % 50 === 0) {
            console.log(`[War] ⚠️ ${squad.id} no encuentra camino hacia ${attack} (¿ruta/portal sin visión?)`);
        }
    }

    private static siege(squad: Squad, attack: string | undefined, ctx: CombatContext): void {
        const mem = squad.mem;
        if (!attack) {
            this.setPhase(squad, "return");
            return;
        }
        if (attack !== mem.target) {
            mem.target = attack;
            mem.phase = "march";
            return;
        }

        const room = Game.rooms[attack];
        // En tren (pasillo angosto) el ancla es la meta del tren.
        const anchor = mem.train ? mem.train.goal : mem.anchor;
        if (!room || !anchor || anchor.r !== attack) {
            mem.phase = "march";
            return;
        }
        ctx.danger = true;

        if (room.controller?.safeMode) {
            console.log(`[War] 🛑 ${attack} tiene safe mode (${room.controller.safeMode}t): ${squad.id} se retira`);
            this.setPhase(squad, "retreat");
            return;
        }
        if (this.shouldRetreat(squad)) {
            mem.healing = true;
            console.log(`[War] 🩹 ${squad.id} muy herido: se retira a curarse`);
            this.setPhase(squad, "retreat");
            return;
        }

        // Algo tapa el paso del bloque: primero eso. Si está justo enfrente del líder,
        // los tanques dan un paso al frente (asalto) para que le peguen los tres.
        const breach = mem.breachId ? Game.getObjectById(mem.breachId) : null;
        if (breach && squad.creeps.some(c => c.pos.isNearTo(breach))) {
            ctx.focus = breach;
            if (!mem.train) {
                const facing = mem.facing as Facing;
                const stance = FormationMove.canAssault(squad, anchor, facing) ? "assault" : "march";
                FormationMove.formUp(squad, anchor, facing, stance);
                return;
            }
        } else {
            delete mem.breachId;
        }

        const target = TargetManager.pick(squad, room, anchor);
        if (!target) {
            // Room limpio: se quedan formados.
            if (!mem.train) FormationMove.formUp(squad, anchor, mem.facing as Facing, "march");
            return;
        }
        ctx.focus = ctx.focus ?? target;

        const result = Navigator.drive(squad, this.engage(target, room));
        if (result.breach) {
            mem.breachId = result.breach.id;
            ctx.focus = result.breach;
        } else if (result.status === "nopath") {
            TargetManager.markUnreachable(squad, target.id);
        }
    }

    private static retreat(squad: Squad, attack: string | undefined): void {
        const mem = squad.mem;
        if (!mem.staging) {
            mem.healing = false;
            mem.phase = attack ? "siege" : "return";
            return;
        }

        const result = Navigator.drive(squad, { kind: "anchor", pos: mem.staging, facing: mem.staging.f, range: 1 });
        if (!attack) {
            this.setPhase(squad, "return");
            return;
        }

        const healthy = squad.creeps.every(c => c.hits >= c.hitsMax * RETREAT.REENGAGE_ABOVE);
        if (result.status === "arrived" && healthy && !safeModeActive(attack)) {
            mem.healing = false;
            mem.phase = "march";
            console.log(`[War] ⚔️ ${squad.id} curado: vuelve a entrar a ${attack}`);
        }
    }

    private static goHome(squad: Squad, attack: string | undefined): void {
        const mem = squad.mem;
        if (attack) {
            mem.phase = "march";
            return;
        }
        mem.rally = mem.rally ?? this.pickRally(squad);
        if (!mem.rally) {
            mem.phase = "rally";
            return;
        }
        const result = Navigator.drive(squad, { kind: "anchor", pos: mem.rally, facing: mem.facing ?? 1, range: 1 });
        if (result.status === "arrived") mem.phase = "rally";
    }

    // -----------------------------------------------------------------------
    // Ayudantes
    // -----------------------------------------------------------------------

    /** Cambio de fase que da la vuelta: se abandona el tren y el camino (iban hacia adentro). */
    private static setPhase(squad: Squad, phase: "retreat" | "return"): void {
        const mem = squad.mem;
        mem.phase = phase;
        delete mem.train;
        delete mem.breachId;
        mem.path = undefined;
        mem.plan = undefined;
    }

    /** La última vez el room tenía más torres de las que este pelotón puede curar. */
    private static outgunned(squad: Squad, room: string): boolean {
        if (!SIEGE.HOLD_IF_OUTGUNNED) return false;
        const intel = warMemory().intel[room];
        if (!intel || intel.towers === 0 || Game.time - intel.t > SIEGE.INTEL_TTL) return false;

        const heal = squad.creeps.reduce((sum, c) => sum + healPower(c), 0);
        const damage = intel.towers * TOWER_MIN_DAMAGE;
        if (heal >= damage) return false;
        if (Game.time % 100 === 0) {
            console.log(
                `[War] ⚠️ ${squad.id} espera fuera de ${room}: ${intel.towers} torre(s) con energía (>= ${damage} daño/tick) contra ${heal} de curación. ` +
                    `Más HEAL/boosts, o SIEGE.HOLD_IF_OUTGUNNED = false para entrar igual.`
            );
        }
        return true;
    }

    /**
     * Dónde se para el bloque para pegarle a una estructura: el líder pegado a ella
     * y mirándola (en asalto los tanques también llegan). A un creep: acercarse.
     */
    private static engage(target: Target, room: Room): Destination {
        const tx = target.pos.x;
        const ty = target.pos.y;

        if ("structureType" in target) {
            const box = RoomGrid.box(room.name);
            const goals = [];
            for (const [side, fwd] of [[0, 2], [1, 2], [-1, 2]]) {
                for (const f of FACINGS) {
                    const [fx, fy] = FORWARD[f];
                    const [rx, ry] = rightOf(f);
                    const x = tx - fx * fwd - rx * side;
                    const y = ty - fy * fwd - ry * side;
                    if (x < 2 || y < 2 || x > 47 || y > 47 || box[idx(x, y)] >= BLOCKED) continue;
                    goals.push({ x, y, range: 0, facing: f });
                }
            }
            if (goals.length > 0) {
                return { kind: "goals", room: room.name, goals, key: `s:${target.id}`, stance: "assault", face: { x: tx, y: ty } };
            }
        }
        return { kind: "goals", room: room.name, goals: [{ x: tx, y: ty, range: 2 }], key: `c:${target.id}`, face: { x: tx, y: ty } };
    }

    private static shouldRetreat(squad: Squad): boolean {
        if (!RETREAT.ENABLED || !squad.mem.staging) return false;
        // Sin healer no tiene sentido retirarse a "curarse".
        if (!squad.creeps.some(c => c.getActiveBodyparts(HEAL) > 0)) return false;

        const hits = squad.creeps.reduce((s, c) => s + c.hits, 0);
        const max = squad.creeps.reduce((s, c) => s + c.hitsMax, 0);
        return squad.creeps.some(c => c.hits < c.hitsMax * RETREAT.MEMBER_BELOW) || hits < max * RETREAT.SQUAD_BELOW;
    }

    /** Los 6 vivos y ya nacidos (un pelotón veterano que volvió sale con los que tenga). */
    private static isComplete(squad: Squad): boolean {
        if (!squad.mem.recruiting) return true;
        if (squad.spawning.length > 0) return false;

        const need = new Map<SquadRole, number>();
        for (const role of WAR_CONFIG.SPAWN.ORDER) need.set(role, (need.get(role) ?? 0) + 1);
        for (const c of squad.creeps) {
            const role = roleOf(c);
            need.set(role, (need.get(role) ?? 0) - 1);
        }
        return [...need.values()].every(n => n <= 0);
    }

    /** Ancla libre junto a Save (lejos de las roads y de otros pelotones que esperan). */
    private static pickRally(squad: Squad): PackedPos | undefined {
        const save = saveFlag();
        if (!save) return undefined;
        const room = save.pos.roomName;

        const others: PackedPos[] = [];
        for (const [id, mem] of Object.entries(warMemory().squads)) {
            if (id !== squad.id && mem.rally && mem.rally.r === room) others.push(mem.rally);
        }

        const found = nearestAnchor(RoomGrid.tile(room), RoomGrid.box(room), save.pos.x, save.pos.y, {
            maxDepth: 10,
            slack: 3,
            maxBox: MOVE.BREAK_BASE - 1,
            penalty: (x, y) => countInBox(x, y, (px, py) => RoomGrid.isRoad(room, px, py)) * 3,
            accept: (x, y) => others.every(o => chebyshev(o.x, o.y, x, y) >= 3)
        });
        return found ? { x: found.x, y: found.y, r: room } : undefined;
    }

    /** Mirando hacia la salida que lleva al room atacado. */
    private static facingTowardRoom(from: PackedPos, room: string): Facing {
        const hop = RouteManager.nextHop(from.r, room);
        if (hop && hop.via === "exit") return hop.side as Facing;
        return facingToward(25 - from.x, 25 - from.y);
    }

    /** Recuerda safe modes enemigos y las torres del room atacado (para no entrar a morir). */
    private static observe(squad: Squad): void {
        const seen = new Set(squad.creeps.map(c => c.pos.roomName));
        const attack = attackRoom();
        if (attack && seen.has(attack)) {
            const towers = hostileStructuresIn(Game.rooms[attack]).filter(
                s => s.structureType === STRUCTURE_TOWER && s.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST
            ).length;
            warMemory().intel[attack] = { towers, t: Game.time };
        }
        for (const name of seen) {
            const controller = Game.rooms[name]?.controller;
            if (!controller?.safeMode || controller.my || isAlly(controller.owner?.username)) continue;
            warMemory().safeMode[name] = Game.time + controller.safeMode;
        }
    }

    private static fight(squad: Squad, ctx: CombatContext): void {
        for (const creep of [...squad.creeps, ...squad.stranded]) {
            const role = roleOf(creep);
            if (role === "Healer") RoleHealer.act(creep, squad, ctx);
            else if (role === "Ranged") RoleRanged.act(creep, ctx);
            else RoleMelee.act(creep, ctx);
        }
    }

    private static say(squad: Squad): void {
        if (Game.time % 5 !== 0) return;
        const leader = squad.creeps.find(c => roleOf(c) === "Leader") ?? squad.creeps[0];
        if (!leader) return;
        const extra = squad.mem.phase === "rally" && squad.mem.recruiting ? `${squad.creeps.length}/${WAR_CONFIG.SPAWN.ORDER.length}` : "";
        leader.say(`${SAY[squad.mem.phase] ?? ""}${extra}`, true);
    }
}
