import { ClaimCreep } from "./types";
import { assignedFlag } from "./services/flags";
import { doClaimWork } from "./services/claimWork";

export default {
    run(creep: Creep): void {
        const claimCreep = creep as ClaimCreep;
        const flag = assignedFlag(claimCreep);
        if (!flag) return;

        doClaimWork(claimCreep, flag);
    }
};
