import { CreepHaulerCore } from "../types";
import { GetPowersBank } from "utils/GetPowerBank";

export default function(creep: CreepHaulerCore): StructureContainer[] {
  const powerBankIds = GetPowersBank();

  return creep.room.find(FIND_STRUCTURES, {
    filter: (s): s is StructureContainer => {
      if (s.structureType !== STRUCTURE_CONTAINER) return false;
      return powerBankIds.has(s.id);
    }
  });
}
