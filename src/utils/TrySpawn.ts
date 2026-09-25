import { getSpawnEnergyAvailable } from "utils/FillSpawn";

// Devuelve si realmente logró crear el creep -- así quien llama sabe si tiene que
// probar con otro rol más barato en vez de asumir que ya "gastó" el tick en esto.
export default function trySpawn(spawn: StructureSpawn, roleName: string, body: BodyPartConstant[]): boolean {
  const cost = body.reduce((sum, part) => sum + BODYPART_COST[part], 0);

  if (spawn.spawning) return false;
  if (getSpawnEnergyAvailable(spawn) < cost) return false;

  const name = `${roleName}${spawn.memory.workers + 1}`;
  const result = spawn.spawnCreep(body, name, {
    memory: { role: roleName.toLowerCase(), room: spawn.room.name }
  });

  if (result === OK) {
    spawn.memory.workers++;
    console.log(`Creando nuevo creep: ${name}`);
    return true;
  } else if (result !== ERR_NOT_ENOUGH_ENERGY) {
    console.log(`No se pudo crear ${name}, código de error: ${result}`);
  } else {
    console.log(result)
  }
  return false;
}
