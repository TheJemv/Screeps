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
