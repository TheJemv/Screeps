

import { CLAIM_FLAG_PREFIX, CREEPS_CONFIG, LINKKEEPER_FLAG_PREFIX } from "config";
import { GetPowersBankRemotes } from "./GetPowerBank";
import { LocalHaulerMemory } from "role/Hauler/types";
import { RemoteHaulerMemory } from "role/RemoteHauler/types";
import { getSpawnEnergyAvailable } from "./FillSpawn";
import { remoteHaulerBodyFor } from "./RemoteHaulerSizing";
import trySpawn from "./TrySpawn";
import { CreepHaulerCoreMemory } from "role/HaulerCore/types";
import { CreepHaulerLocal, CreepHaulerLocalMemory } from "role/HaulerLocal/types";

export function Spawner() {
  //  Workers Memory
  const spawn = Game.spawns.Spawn1;
  if (spawn.spawning) return
  if (spawn.memory.workers === undefined) {
    spawn.memory.workers = _.filter(Game.creeps, creep => creep.name.startsWith("Worker")).length;
  }

  //    Miners
  const livingMiners = _.filter(Game.creeps, (c: Creep) => c.memory.role === "miner");
  const flagsMiner = _.filter(Game.flags, (f: Flag) => f.name.startsWith("Miner_"));
  const takenMinerFlagNames = livingMiners.map((c: Creep) => c.memory.minerFlag).filter((flagName): flagName is string => Boolean(flagName));
  const freeMinersFlags = flagsMiner.filter((f: Flag) => !takenMinerFlagNames.includes(f.name));

  //    Upgraders
  const livingRepairer = _.filter(Game.creeps, (c: Creep) => c.memory.role === "repairer")

  //    Hauler
  const livingHauler = _.filter(Game.creeps, (c: Creep) => c.memory.role === "hauler")

  //    UpgraderControler
  const livingControllerUpgraders = _.filter(Game.creeps, (c: Creep) => c.memory.role === "controllercreep")
  const flagsControllerUpgrader = _.filter(Game.flags, (f: Flag) => f.name.startsWith("ControllerCreep_"));
  const takenControllerUpgraderFlagNames = livingControllerUpgraders.map((c: Creep) => c.memory.controllerCreepFlag).filter((flagName): flagName is string => Boolean(flagName));
  const freeControllerUpgraderFlags = flagsControllerUpgrader.filter((f: Flag) => !takenControllerUpgraderFlagNames.includes(f.name));

  //    Hauler
  const livingRemoteHauler = _.filter(Game.creeps, (c: Creep) => c.memory.role === "remoteHauler")

  //    Builder
  const livingBuilder = _.filter(Game.creeps, (c: Creep) => c.memory.role === "builder")

  //    Claim
  const livingClaim = _.filter(Game.creeps, (c: Creep) => c.memory.role === "claim")
  const flagsClaim = _.filter(Game.flags, (f: Flag) => f.name.startsWith(CLAIM_FLAG_PREFIX))
  const takenClaimFlagNames = livingClaim.map((c: Creep) => c.memory.claimFlag).filter((flagName): flagName is string => Boolean(flagName))
  const freeClaimFlags = flagsClaim.filter((f: Flag) => !takenClaimFlagNames.includes(f.name))

  //    LinkKeeper
  const livingLinkKeeper = _.filter(Game.creeps, (c: Creep) => c.memory.role === "linkKeeper")
  const flagsLinkKeeper = _.filter(Game.flags, (f: Flag) => f.name.startsWith(LINKKEEPER_FLAG_PREFIX))
  const takenLinkKeeperFlagNames = livingLinkKeeper.map((c: Creep) => c.memory.linkKeeperFlag).filter((flagName): flagName is string => Boolean(flagName))
  const freeLinkKeeperFlags = flagsLinkKeeper.filter((f: Flag) => !takenLinkKeeperFlagNames.includes(f.name))

  const livingHaulerCoreRule = _.filter(Game.creeps, (c: Creep) => c.memory.role === CREEPS_CONFIG.haulerCore.role).length < CREEPS_CONFIG.haulerCore.count
  const livingHaulerLocalRule = _.filter(Game.creeps, (c: Creep) => c.memory.role === CREEPS_CONFIG.haulerLocal.role).length < CREEPS_CONFIG.haulerLocal.count

  //    If exists flags
  if (livingHaulerCoreRule) {
    const role = CREEPS_CONFIG.haulerCore.role
    if (!role) return
    const result = spawn.spawnCreep(CREEPS_CONFIG.haulerCore.body, `${role}_${Game.time}`, {
        memory: {
            role,
            state: "COLLECTING",
            targets: []
        } as CreepHaulerCoreMemory
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con código: ${result}`)
  } else if (freeMinersFlags.length > 0) {
    const roleName = "miner"
    const targetFlag: Flag = freeMinersFlags[0]
    let hasContainer = false;

    if (targetFlag.room) {
        // Solo cuenta el container YA CONSTRUIDO -- un construction site a
        // medias no sirve: si el miner que lo empezó muere antes de terminarlo,
        // el reemplazo necesita seguir naciendo con CARRY para completarlo.
        const containerOnPos = targetFlag.pos.lookFor(LOOK_STRUCTURES)
            .find(s => s.structureType === STRUCTURE_CONTAINER);

        if (containerOnPos) {
            hasContainer = true;
        }
    }

    let bodyToSpawn = CREEPS_CONFIG.miner.body;
    if (!hasContainer) {
        bodyToSpawn = [CARRY, ...bodyToSpawn];
    }

    const cost = bodyToSpawn.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    if (spawn.spawning) return;
    if (getSpawnEnergyAvailable(spawn) < cost) return;

    const name = `${roleName}${spawn.memory.workers + 1}`;
    const result = spawn.spawnCreep(bodyToSpawn, name, {
        memory: {
            role: roleName.toLowerCase(),
            room: spawn.room.name,
            minerFlag: targetFlag.name,
        }
    });

    if (result === OK) {
        spawn.memory.workers++;
        console.log(`Creando nuevo creep: ${name}`);
        return;
    } else if (result !== ERR_NOT_ENOUGH_ENERGY) {
        console.log(`No se pudo crear ${name}, código de error: ${result}`);
    } else {
        console.log(result)
    }
  } else if (livingHaulerLocalRule) {
    const CONFIG_CREEP = CREEPS_CONFIG.haulerLocal
    const role = CONFIG_CREEP.role
    if (!role) return
    const result = spawn.spawnCreep(CONFIG_CREEP.body, `${role}_${Game.time}`, {
        memory: {
            role,
            state: "COLLECTING",
        } as CreepHaulerLocalMemory
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con código: ${result}`)
  } else if (livingRepairer.length < CREEPS_CONFIG.repairer.count) {
    trySpawn(spawn, "repairer", CREEPS_CONFIG.repairer.body)
  } else if (livingBuilder.length < CREEPS_CONFIG.builder.count) {
    const role = "builder"
    const result = spawn.spawnCreep(CREEPS_CONFIG.builder.body, `${role}_${Game.time}`, {
        memory: {
            role,
            room: spawn.room.name,
            building: false
        }
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con: ${result}`)
  } else if (freeControllerUpgraderFlags.length > 0) {
    const flag = freeControllerUpgraderFlags[0]
    const role = "controllercreep"
    const result = spawn.spawnCreep(CREEPS_CONFIG.controllercreep.body, `${role}_${Game.time}`, {
        memory: {
            role,
            room: spawn.room.name,
            controllerCreepFlag: flag.name
        }
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con: ${result}`)
  } else if (livingRemoteHauler.length < GetPowersBankRemotes().length) {
    const role = "remoteHauler"; // Usa el casing exacto de tus types

    // No asignar un container que ya tenga un remoteHauler vivo apuntándole --
    // cada power bank remoto necesita el suyo propio, nunca compartido.
    const claimedContainerIds = new Set(
        livingRemoteHauler.map((c: Creep) => c.memory.targetContainerId).filter(Boolean)
    );
    const freeContainer = GetPowersBankRemotes().find(c => !claimedContainerIds.has(c.id));
    if (!freeContainer) return;

    // Body a medida para ESTA mina en particular: justo lo que hace falta
    // para mover toda su producción en su propio ciclo de ida y vuelta, más
    // 10% de margen -- no el mismo body fijo para todas.
    const bodyToSpawn = remoteHaulerBodyFor(spawn.pos, freeContainer.pos, freeContainer.room);
    const cost = bodyToSpawn.reduce((sum, part) => sum + BODYPART_COST[part], 0);
    if (getSpawnEnergyAvailable(spawn) < cost) return;

    const result = spawn.spawnCreep(
        bodyToSpawn,
        `${role}_${Game.time}`,
        {
            memory: {
                role,
                room: spawn.room.name,
                targetContainerId: freeContainer.id,
                homeRoom: spawn.room.name // <-- Importante: .name, no el objeto
            } as RemoteHaulerMemory
        }
    );

    if (result !== OK) console.log(`Error al spawnear el ${role} con: ${result}`)
  } else if (freeClaimFlags.length > 0) {
    const role = "claim"
    const targetFlag: Flag = freeClaimFlags[0]
    if (!targetFlag) return

    const result = spawn.spawnCreep(CREEPS_CONFIG.claim.body, `${role}_${Game.time}`, {
        memory: {
            role,
            room: spawn.room.name,
            claimFlag: targetFlag.name
        }
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con: ${result}`)
  } else if (freeLinkKeeperFlags.length > 0) {
    const role = "linkKeeper"
    const targetFlag: Flag = freeLinkKeeperFlags[0]

    const result = spawn.spawnCreep(CREEPS_CONFIG.linkKeeper.body, `${role}_${Game.time}`, {
        memory: {
            role,
            room: spawn.room.name,
            linkKeeperFlag: targetFlag.name
        }
    })

    if (result !== OK) console.log(`Error al spawnear el ${role} con: ${result}`)
  }
}
