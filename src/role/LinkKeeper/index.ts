import { LinkKeeperCreep } from "./types";
import { assignedFlag } from "./services/flags";
import { keepLink } from "./services/keepLink";
import { moveToRoad } from "utils/MoveToRoad";

export default {
    run(creep: Creep): void {
        const linkKeeper = creep as LinkKeeperCreep;
        const flag = assignedFlag(linkKeeper);
        if (!flag) return;

        // Ir hacia su flag -- puede cruzar de sala -- y quedarse ahí para siempre.
        if (!linkKeeper.pos.isEqualTo(flag.pos)) {
            moveToRoad(linkKeeper, flag);
            return;
        }

        keepLink(linkKeeper);
    }
};
