// src/war/utils/flags.ts
import { WAR_CONFIG } from "../config";

export function saveFlag(): Flag | undefined {
    return Game.flags[WAR_CONFIG.FLAGS.SAVE];
}

/** Room que se ataca: el de la bandera Attack (la posición exacta no importa). */
export function attackRoom(): string | undefined {
    return Game.flags[WAR_CONFIG.FLAGS.ATTACK]?.pos.roomName;
}

/** Safe mode conocido (visto antes) todavía activo en ese room. */
export function safeModeActive(room: string | undefined): boolean {
    if (!room) return false;
    const until = Memory.war?.safeMode[room];
    return until !== undefined && until > Game.time;
}
