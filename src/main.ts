// import { CREEPS_CONFIG } from "config";

import Attacker from "role/Attacker";
import Builder from "role/Builder";
import Claim from "role/Claim";
import ControllerCreep from "role/ControllerCreep";
import Harvester, { spawnHarvester } from "role/Harvester";
import Miner from "role/Miner";
import Upgrader from "role/Upgrader";

//  Roles
import Hauler from "role/Hauler";
import Repairer from "role/Repairer";

import { ErrorMapper } from "utils/ErrorMapper";
import { Spawner } from "utils/Spawner";
import RemoteHauler from "role/RemoteHauler";
import Tower from "role/Tower";
import { stats } from "utils/Stats";
import { assignBuilderTargets } from "role/Builder/services/dispatch";
import { runLinks } from "utils/Links";
import LinkKeeper from "role/LinkKeeper";
import HaulerCore from "role/HaulerCore";
import HaulerLocal from "role/HaulerLocal";
// import trySpawn from "utils/TrySpawn";

global.spawnHarvester = spawnHarvester
global.stats = stats

interface Role {
  run(creep: Creep): void;
}

const ROLES: Record<string, Role> = {
  upgrader: Upgrader,
  miner: Miner,
  hauler: Hauler,
  controllercreep: ControllerCreep,
  builder: Builder,
  repairer: Repairer,
  attacker: Attacker,
  claim: Claim,
  harvester: Harvester,
  remoteHauler: RemoteHauler,
  linkKeeper: LinkKeeper,

  HaulerCore,
  HaulerLocal
};



//  Loop
export const loop = ErrorMapper.wrapLoop(() => {
  Spawner()

  Tower.run();
  assignBuilderTargets();
  runLinks();

  //  Creeps
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const role = creep.memory.role && ROLES[creep.memory.role];
    if (role) role.run(creep);
  }

  // Limpia la memoria de creeps que ya murieron
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
});
