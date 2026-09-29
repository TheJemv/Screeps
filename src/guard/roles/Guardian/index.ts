// src/guard/roles/Guardian/index.ts
//
// Cada tick:
//   1. act()      -> pega / dispara / cura lo que tenga en rango (siempre).
//   2. retirada   -> muy herido: se aleja de los enemigos y se cura.
//   3. sin misión -> cura heridos del room (si no es casa) y vuelve a estacionarse.
//   4. misión en otro room -> va rápido (AdvancedMove) a la última posición conocida del enemigo.
//   5. misión acá -> espera compañeros si el enemigo es más fuerte, después pelea
//                    (melee si le gana cuerpo a cuerpo, kiting a rango 3 si no).
import { GUARD_CONFIG } from "../../config";
import { GuardCreep, GuardState } from "../../types";
import ThreatManager from "../../managers/ThreatManager";
import {
    attackableCores,
    focusTarget,
    hostilesIn,
    hurtFriends,
    isHarmless,
    meleePower,
    totalPower
} from "../../utils/combat";
import { flee, moveTo, roomCenter } from "../../utils/move";
import { findParkingSpot, postOf } from "../../utils/parking";
import { act } from "./actions";

const SAY: Record<GuardState, string> = {
    idle: "🛡️",
    travel: "🚨",
    fight: "⚔️",
    kite: "🏹",
    rally: "⏳",
    retreat: "🏃",
    heal: "🩹",
    return: "🏠"
};

const { COMBAT, COLORS } = GUARD_CONFIG;

export default class Guardian {
    /** @param partners vigilantes con la misma misión (para esperarse entre ellos). */
    public static run(creep: GuardCreep, partners: GuardCreep[]): void {
        if (creep.spawning) return;

        const hostiles = hostilesIn(creep.room);
        const core = creep.room.name === creep.memory.home ? undefined : attackableCores(creep.room)[0];
        act(creep, hostiles, core);

        if (this.retreat(creep, hostiles)) return;

        const mission = creep.memory.mission;
        if (!mission) {
            this.goHome(creep);
        } else if (creep.room.name !== mission) {
            this.travel(creep, mission);
        } else {
            this.engage(creep, hostiles, core, partners);
        }
    }

    // -----------------------------------------------------------------------
    // Estados
    // -----------------------------------------------------------------------

    /** Histeresis: se va bajo RETREAT_BELOW y vuelve recién sobre RETURN_ABOVE. */
    private static retreat(creep: GuardCreep, hostiles: Creep[]): boolean {
        const ratio = creep.hits / creep.hitsMax;
        if (!creep.memory.retreat && ratio < COMBAT.RETREAT_BELOW) creep.memory.retreat = true;
        else if (creep.memory.retreat && ratio >= COMBAT.RETURN_ABOVE) creep.memory.retreat = false;
        if (!creep.memory.retreat) return false;

        this.setState(creep, "retreat");
        const armed = hostiles.filter(h => !isHarmless(h));
        const close = armed.filter(h => creep.pos.inRangeTo(h, 6));
        if (close.length > 0 && flee(creep, armed, 7)) return true;

        // Sin HEAL propio (o sin escapatoria): a casa, ahí curan las torres.
        if (creep.getActiveBodyparts(HEAL) === 0 || close.length > 0) {
            moveTo(creep, postOf(creep.memory.home), 5, COLORS.HOME);
        }
        return true;
    }

    private static travel(creep: GuardCreep, mission: string): void {
        this.setState(creep, "travel");
        const threat = ThreatManager.get(mission);
        if (threat) {
            moveTo(creep, new RoomPosition(threat.x, threat.y, mission), 3, COLORS.TRAVEL);
        } else {
            moveTo(creep, roomCenter(mission), 20, COLORS.TRAVEL);
        }
    }

    private static engage(
        creep: GuardCreep,
        hostiles: Creep[],
        core: StructureInvaderCore | undefined,
        partners: GuardCreep[]
    ): void {
        if (hostiles.length > 0) {
            if (this.rally(creep, hostiles, partners)) return;

            const target = focusTarget(creep.room) ?? hostiles[0];
            if (this.shouldKite(creep, hostiles)) {
                this.setState(creep, "kite");
                const melee = hostiles.filter(h => meleePower(h) > 0);
                const tooClose = melee.some(h => creep.pos.inRangeTo(h, COMBAT.KITE_RANGE - 1));
                if (tooClose && flee(creep, melee, COMBAT.KITE_RANGE)) return;
                if (!creep.pos.inRangeTo(target, COMBAT.KITE_RANGE)) moveTo(creep, target, COMBAT.KITE_RANGE, COLORS.FIGHT);
            } else {
                this.setState(creep, "fight");
                moveTo(creep, target, 1, COLORS.FIGHT);
            }
            return;
        }

        if (core) {
            this.setState(creep, "fight");
            moveTo(creep, core, creep.getActiveBodyparts(ATTACK) > 0 ? 1 : 3, COLORS.FIGHT);
            return;
        }

        // Sin enemigos: el ThreatManager lo da por despejado y el despacho lo manda a casa.
        this.goHome(creep);
    }

    /** Sin misión: curar heridos del room (fuera de casa) y volver a estacionarse. */
    private static goHome(creep: GuardCreep): void {
        const home = creep.memory.home;

        if (creep.room.name !== home) {
            if (creep.getActiveBodyparts(HEAL) > 0 && hostilesIn(creep.room).length === 0) {
                const hurt = hurtFriends(creep.room).filter(c => c.id !== creep.id);
                const closest = creep.pos.findClosestByRange(hurt);
                if (closest) {
                    this.setState(creep, "heal");
                    moveTo(creep, closest, 1, COLORS.HEAL);
                    return;
                }
            }
            this.setState(creep, "return");
            const flag = this.postFlag(creep);
            if (flag) moveTo(creep, flag, 0, COLORS.HOME);
            else moveTo(creep, postOf(home), GUARD_CONFIG.IDLE.PARK_MAX_RANGE, COLORS.HOME);
            return;
        }

        this.setState(creep, "idle");
        this.park(creep);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Si el enemigo es más fuerte que los vigilantes que ya llegaron y faltan
     * compañeros en camino, espera fuera de su alcance (máx. RALLY_MAX_WAIT ticks
     * por misión) en vez de entrar y morir de a uno.
     */
    private static rally(creep: GuardCreep, hostiles: Creep[], partners: GuardCreep[]): boolean {
        const waited = creep.memory.rally ?? 0;
        if (waited >= COMBAT.RALLY_MAX_WAIT) return false;

        const here = partners.filter(p => p.room.name === creep.room.name);
        if (here.length >= partners.length) return false;
        if (totalPower(here) >= totalPower(hostiles)) return false;

        creep.memory.rally = waited + 1;
        this.setState(creep, "rally");
        const close = hostiles.filter(h => creep.pos.inRangeTo(h, COMBAT.RALLY_DISTANCE));
        if (close.length > 0) flee(creep, hostiles, COMBAT.RALLY_DISTANCE + 1);
        return true;
    }

    /** Kiting: tengo RANGED y cuerpo a cuerpo pierdo (su melee pega más que el mío). */
    private static shouldKite(creep: GuardCreep, hostiles: Creep[]): boolean {
        if (creep.getActiveBodyparts(RANGED_ATTACK) === 0) return false;
        const mine = meleePower(creep);
        const theirs = Math.max(0, ...hostiles.map(h => meleePower(h)));
        return theirs > 0 && theirs > mine;
    }

    /** Su bandera Guard_N (PostManager), si tiene una en su home. */
    private static postFlag(creep: GuardCreep): Flag | undefined {
        const flag = creep.memory.post ? Game.flags[creep.memory.post] : undefined;
        return flag && flag.pos.roomName === creep.memory.home ? flag : undefined;
    }

    /** Parado encima de su bandera Guard_N; sin bandera, fuera de las roads cerca del storage/spawn. */
    private static park(creep: GuardCreep): void {
        const flag = this.postFlag(creep);
        if (flag) {
            if (!creep.pos.isEqualTo(flag.pos)) moveTo(creep, flag, 0, COLORS.HOME);
            return;
        }

        const home = creep.memory.home;
        let park = creep.memory.park;

        // Alguien se paró en mi lugar: buscar otro.
        if (park && park.room === home && creep.pos.getRangeTo(park.x, park.y) <= 1) {
            const occupant = creep.room.lookForAt(LOOK_CREEPS, park.x, park.y)[0];
            if (occupant && occupant.id !== creep.id) park = undefined;
        }

        if (!park || park.room !== home) {
            const spot = findParkingSpot(creep, postOf(home));
            park = spot ? { x: spot.x, y: spot.y, room: spot.roomName } : undefined;
            creep.memory.park = park;
        }

        if (park) {
            if (creep.pos.x !== park.x || creep.pos.y !== park.y) {
                moveTo(creep, new RoomPosition(park.x, park.y, park.room), 0, COLORS.HOME);
            }
        } else {
            moveTo(creep, postOf(home), 3, COLORS.HOME);
        }
    }

    private static setState(creep: GuardCreep, state: GuardState): void {
        if (creep.memory.state === state) return;
        creep.memory.state = state;
        creep.say(SAY[state]);
    }
}
