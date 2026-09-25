import { EnergyStructure } from "../types"

export default function(targets: EnergyStructure[], availableEnergy: number, creepCapacity: number) {
const result: EnergyStructure[] = []
    let currentEnergy = availableEnergy

    for (const t of targets) {
        if (currentEnergy <= 0) break

        const freeCapacity = t.store.getFreeCapacity(RESOURCE_ENERGY)
        if (freeCapacity <= 0) continue

        if (freeCapacity <= creepCapacity) {
            if (currentEnergy >= freeCapacity) {
                result.push(t)
                currentEnergy -= freeCapacity
            }
        } else {
            result.push(t)
            currentEnergy -= freeCapacity
        }
    }

    return result
}
