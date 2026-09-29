import { AdvancedMove } from 'utils/AdvancedMove';
import CacheManager from './CacheManager';
import ContainerAssigner from './ContainerAssigner';
import { CreepHaulerLocal } from '../types';
import findParkingSpot from '../utils/findParkingSpot';
import getSortedContainers from '../utils/getSortedContainers';

/**
 * STANDBY: el HaulerLocal no tiene nada que hacer (antes decía "💤 Idle").
 *
 *   1. Si aparece trabajo, vuelve enseguida:
 *        - la caché de los builders está baja y él trae energía -> va a llenarla;
 *        - hay un container/pila con carga completa -> primero devuelve lo que
 *          trae al storage (lo tiene al lado) y sale a recogerla.
 *   2. Si no, se llena en el storage: queda listo para salir apenas haga falta.
 *   3. Y se estaciona cerca del storage donde no estorbe (ver findParkingSpot).
 */
export default class StandbyManager {
  public static enter(creep: CreepHaulerLocal): void {
    creep.memory.state = 'STANDBY';
    creep.say('💤 Standby');
  }

  public static run(creep: CreepHaulerLocal): void {
    const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    // 1a. La caché de los builders necesita energía (y nadie más fue).
    if (energy > 0 && CacheManager.hasDuty(creep)) {
      this.leave(creep, 'DEPOSITING');
      CacheManager.deliver(creep);
      return;
    }

    // 1b. Hay algo para recoger: si trae energía, primero la devuelve.
    const capacity = creep.store.getCapacity(RESOURCE_ENERGY);
    if (ContainerAssigner.hasAvailable(creep, getSortedContainers(creep), capacity)) {
      this.leave(creep, energy > 0 ? 'DEPOSITING' : 'COLLECTING');
      return;
    }

    // 2. Llenarse en el storage.
    const storage = creep.room.storage;
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        AdvancedMove.travel(creep, storage, { range: 1, visualizePathStyle: { stroke: '#777777' } });
      }
      return;
    }

    // 3. Estacionarse fuera de las roads.
    this.park(creep, storage ? storage.pos : creep.pos);
  }

  private static leave(creep: CreepHaulerLocal, state: 'COLLECTING' | 'DEPOSITING'): void {
    creep.memory.state = state;
    delete creep.memory.park;
  }

  private static park(creep: CreepHaulerLocal, anchor: RoomPosition): void {
    const spot = this.parkingSpot(creep, anchor);
    if (!spot || creep.pos.isEqualTo(spot)) return;

    AdvancedMove.travel(creep, spot, { range: 0, visualizePathStyle: { stroke: '#777777' } });
  }

  /** El lugar guardado, si sigue libre; si no, busca otro. */
  private static parkingSpot(creep: CreepHaulerLocal, anchor: RoomPosition): RoomPosition | null {
    const park = creep.memory.park;
    if (park && park.room === creep.room.name) {
      const pos = new RoomPosition(park.x, park.y, park.room);
      if (!pos.lookFor(LOOK_CREEPS).some((c) => c.name !== creep.name)) return pos;
    }

    const spot = findParkingSpot(creep, anchor);
    if (spot) creep.memory.park = { x: spot.x, y: spot.y, room: spot.roomName };
    else delete creep.memory.park;
    return spot;
  }
}
