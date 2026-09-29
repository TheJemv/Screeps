// src/guard/roles/Guardian/actions.ts
//
// Lo que el vigilante hace con las manos este tick, sin moverse (el movimiento
// lo decide index.ts). Se llama SIEMPRE: aunque esté viajando o escapando,
// dispara a lo que tenga en rango.
//
// Reglas del motor (acciones en el mismo tick):
//   - attack y heal se pisan (gana heal)       -> se elige uno.
//   - rangedAttack y rangedHeal se pisan        -> se elige uno.
//   - attack + rangedAttack, heal + rangedAttack -> se pueden juntar.
import { GUARD_CONFIG } from "../../config";
import { alliesNear, bestTarget, hurtFriends } from "../../utils/combat";

/** Daño de rangedMassAttack por parte según distancia (1, 2, 3). */
const MASS_DAMAGE = [10, 10, 4, 1];

export function act(creep: Creep, hostiles: Creep[], core: StructureInvaderCore | undefined): void {
    const canMelee = creep.getActiveBodyparts(ATTACK) > 0;
    const canShoot = creep.getActiveBodyparts(RANGED_ATTACK) > 0;
    const canHeal = creep.getActiveBodyparts(HEAL) > 0;
    const coreReady = core && !core.ticksToDeploy ? core : undefined;

    const adjacent = hostiles.filter(h => creep.pos.isNearTo(h));
    const inRange = hostiles.filter(h => creep.pos.inRangeTo(h, 3));

    // --- melee o curación (mismo pipeline) ---
    let meleeTarget: Creep | Structure | undefined;
    if (canMelee) {
        meleeTarget = bestTarget(adjacent, creep.pos);
        if (!meleeTarget && hostiles.length === 0 && coreReady && creep.pos.isNearTo(coreReady)) meleeTarget = coreReady;
    }

    const hurt = creep.hits < creep.hitsMax;
    const badlyHurt = creep.hits < creep.hitsMax * GUARD_CONFIG.COMBAT.SELF_HEAL_BELOW;
    let usedRangedHeal = false;

    if (canHeal && (badlyHurt || (hurt && !meleeTarget))) {
        creep.heal(creep);
    } else if (meleeTarget) {
        creep.attack(meleeTarget);
    } else if (canHeal) {
        const friends = hurtFriends(creep.room).filter(c => c.id !== creep.id);
        const near = friends.find(c => creep.pos.isNearTo(c));
        if (near) {
            creep.heal(near);
        } else if (inRange.length === 0) {
            // rangedHeal pisa al rangedAttack: solo si no hay a quién disparar.
            const far = friends.find(c => creep.pos.inRangeTo(c, 3));
            if (far) {
                creep.rangedHeal(far);
                usedRangedHeal = true;
            }
        }
    }

    // --- disparo ---
    if (!canShoot || usedRangedHeal) return;

    if (inRange.length > 0) {
        const mass = inRange.reduce((sum, h) => sum + MASS_DAMAGE[creep.pos.getRangeTo(h)], 0);
        if (mass > MASS_DAMAGE[1] && !alliesNear(creep.pos, 3)) {
            creep.rangedMassAttack();
        } else {
            const target = bestTarget(inRange, creep.pos);
            if (target) creep.rangedAttack(target);
        }
    } else if (hostiles.length === 0 && coreReady && creep.pos.inRangeTo(coreReady, 3)) {
        creep.rangedAttack(coreReady);
    }
}
