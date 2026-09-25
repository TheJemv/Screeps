export {};

declare global {
  interface Memory {
    uuid: number;
    log: any;
    /** Aliados, editable desde consola. Sembrado desde DEFAULT_ALLIES la primera vez. */
    allies?: string[];
    /** Modo emergencia: todos los Builder rellenan spawn/extensions en vez de construir. */
    builderFillSpawn?: boolean;
  }

  interface RoomMemory {
    fillControllerContainer?: boolean
  }

  interface CreepMemory {
    role?: string;
    room?: string;
    working?: boolean;
    empty?: boolean;
    saveFlag?: string
    claimFlag?: string
    minerFlag?: string
    upgraderFlag?: string
    controllerCreepFlag?: string
    linkKeeperFlag?: string
    sourceId?: Id<Source> | ""
    haulSource?: Id<StructureContainer>
    haulTarget?: Id<StructureContainer>
    targetId?: Id<ConstructionSite | AnyStoreStructure | StructureContainer | StructureExtension | StructureRoad | StructureSpawn | Source | Ruin> | "";
    targetType?: "ruin" | "source" | "build" | "spawn" | "upgrade";
    building?: boolean,
    targetContainerId?: string
    deliverTargetId?: string
    targetSiteId?: string

    containerId?: Id<StructureContainer> | "";

    moveTracking?: { pos: string; stuckTicks: number };
    _move?: unknown;
  }

  interface SpawnMemory {
    workers: number;
  }

  /** Colgada del global en main.ts para poder llamarla directo desde la consola. */
  function builderToggleFillSpawn(): boolean;
  function spawnHarvester(): void;
  function spawnMiner(): void;
  function stats(): void;
}


