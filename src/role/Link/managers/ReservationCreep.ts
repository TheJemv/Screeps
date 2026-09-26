import { LinkOperatorMemory } from "../types";
import LinkUtils from "../utils/getLinks";

export default class ReservationCreep {
    public static run(room: Room): void {
        const receiver = LinkUtils.getReceiver(room);
        const senders = LinkUtils.getSenders(room);

        // Obtenemos todos los operadores de esta room
        const linkOperators = room.find(FIND_MY_CREEPS, {
            filter: (c) => c.memory.role === 'LinkOperator'
        });

        // Hacemos un Set con los IDs de los links que YA tienen un creep
        const assignedLinks = new Set(linkOperators.map(c => (c.memory as LinkOperatorMemory).linkId));

        const spawn = room.find(FIND_MY_SPAWNS)[0]; // Tomamos el primer spawn disponible
        if (!spawn || spawn.spawning) return; // Si no hay spawn o está ocupado, salimos

        // 1. Revisar el Receptor (Prioridad Alta)
        if (receiver && !assignedLinks.has(receiver.id)) {
            this.spawnOperator(spawn, receiver.id, 'receiver');
            return; // Solo pedimos 1 por tick
        }

        // 2. Revisar los Emisores
        for (const sender of senders) {
            if (!assignedLinks.has(sender.id)) {
                this.spawnOperator(spawn, sender.id, 'sender');
                return;
            }
        }
    }

    private static spawnOperator(spawn: StructureSpawn, linkId: string, type: 'sender' | 'receiver'): void {
        const body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE];
        const name = `LinkOp_${type}_${Game.time.toString().slice(-4)}`;

        spawn.spawnCreep(body, name, {
            memory: {
                role: 'LinkOperator',
                linkType: type,
                linkId,
            } as LinkOperatorMemory
        });
    }
}
