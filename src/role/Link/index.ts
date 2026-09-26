import LinkUtils from "./utils/getLinks";
import ReservationCreep from "./managers/ReservationCreep"; // <-- Lo importamos aquí

export default class LinkManager {
    public static run(): void {
        // Iteramos el mundo UNA SOLA VEZ
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];

            // Filtro global: Solo nuestros cuartos con Storage
            if (!room.controller || !room.controller.my || !room.storage) continue;

            // 1. Verificamos si hace falta crear operadores (Le pasamos el room ya filtrado)
            ReservationCreep.run(room);

            // 2. Ejecutamos la lógica de transferencia de los Links
            const receiver = LinkUtils.getReceiver(room);
            if (!receiver) continue;

            const senders = LinkUtils.getSenders(room);

            for (const sender of senders) {
                if (sender.cooldown > 0) continue;

                const energyInSender = sender.store.getUsedCapacity(RESOURCE_ENERGY);
                const freeSpaceInReceiver = receiver.store.getFreeCapacity(RESOURCE_ENERGY);

                if (energyInSender >= 400 && freeSpaceInReceiver >= energyInSender) {
                    const result = sender.transferEnergy(receiver);
                    if (result === OK) {
                        break; // Un disparo por tick
                    }
                }
            }
        }
    }
}
