export default class LinkUtils {
    /**
     * Encuentra el Link receptor (el que está cerca del Storage).
     */
    public static getReceiver(room: Room): StructureLink | undefined {
        const storage = room.storage; // Lo guardamos en una constante local

        if (!storage) return undefined;
        return room.find(FIND_MY_STRUCTURES, {
            filter: (s): s is StructureLink =>
                s.structureType === STRUCTURE_LINK &&
                s.pos.inRangeTo(storage, 2)
        })[0];
    }

    /**
     * Encuentra todos los Links emisores (los de las minas).
     */
    public static getSenders(room: Room): StructureLink[] {
        const receiverId = this.getReceiver(room)?.id;

        return room.find(FIND_MY_STRUCTURES, {
            filter: (s): s is StructureLink =>
                s.structureType === STRUCTURE_LINK &&
                s.id !== receiverId
        });
    }
}
