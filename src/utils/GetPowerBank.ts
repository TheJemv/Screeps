import { MINER_FLAG_PREFIX } from "config";

export function GetPowersBank(): Set<string> {
  const minerFlags = _.filter(Game.flags, (f: Flag) => f.name.startsWith("Miner_"));
  const containerIds = new Set<string>();

  for (const flag of minerFlags) {
    if (!flag.room) continue;

    const container = flag.pos.lookFor(LOOK_STRUCTURES).find(
      (s) => s.structureType === STRUCTURE_CONTAINER
    );

    if (container) {
      containerIds.add(container.id);
    }
  }

  return containerIds;
}

export function GetPowerBankContainers(): StructureContainer[] {
  const containers: StructureContainer[] = [];

  for (const id of GetPowersBank()) {
    const container = Game.getObjectById<StructureContainer>(id);
    if (container) containers.push(container);
  }

  return containers;
}


export function GetPowersBankRemotes(): StructureContainer[] {
    const minerFlags = _.filter(Game.flags, (f: Flag) => f.name.startsWith("Miner_"));
    const remoteContainers: StructureContainer[] = [];

    for (const flag of minerFlags) {
        if (!flag.room) continue;
        const isRemote = !flag.room.controller || !flag.room.controller.my;

        if (isRemote) {
            const container = flag.pos.lookFor(LOOK_STRUCTURES).find(
                (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER
            );

            if (container) {
                remoteContainers.push(container);
            }
        }
    }

    return remoteContainers;
}

// Casillas con bandera Miner_ ("room:x:y"), recalculadas una vez por tick.
let minerTilesTick = -1;
let minerTiles = new Set<string>();

function minerFlagTiles(): Set<string> {
    if (minerTilesTick !== Game.time) {
        minerTiles = new Set(
            _.filter(Game.flags, (f: Flag) => f.name.startsWith(MINER_FLAG_PREFIX)).map(
                (f: Flag) => `${f.pos.roomName}:${f.pos.x}:${f.pos.y}`
            )
        );
        minerTilesTick = Game.time;
    }
    return minerTiles;
}

/**
 * ¿Es la obra de un futuro PowerBank? (container sobre una bandera Miner_).
 * Esos los construye su propio Miner: los builders no deben ayudar.
 * Usa las banderas y no lookFor, así funciona aunque no haya visión del room.
 */
export function isPowerBankSite(site: ConstructionSite): boolean {
    return (
        site.structureType === STRUCTURE_CONTAINER &&
        minerFlagTiles().has(`${site.pos.roomName}:${site.pos.x}:${site.pos.y}`)
    );
}
