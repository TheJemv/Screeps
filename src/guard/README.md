# 🛡️ Vigilantes (`src/guard/`)

**3 vigilantes** (`COUNT`) viven estacionados en cada home room. Si aparece un enemigo
en el home, en una **reserva** o en un **remoto**, o si atacan a un creep mío cerca, salen
**rápido** a matarlo y después vuelven a casa.

No es `war/`: war ataca bases enemigas con pelotones y banderas `Attack_`. Esto es
**defensa** y funciona solo, sin banderas.

## 🔌 Activarlo (una línea en `main.ts`)

```ts
import GuardSystem from "./guard";

// dentro del loop, DESPUÉS de Spawner() (la economía spawnea primero)
GuardSystem.run();
```

`main.ts` no conoce el rol `Guardian`, así que no lo corre dos veces: `GuardSystem.run()`
spawnea y mueve a los suyos.

---

## 📁 Arquitectura

```text
guard/
├── index.ts                  # GuardSystem.run(): el flujo del tick
├── config.ts                 # Todos los números afinables
├── types.ts                  # GuardCreepMemory, ThreatMemory, Memory.guard
├── managers/
│   ├── RoomManager.ts        # Home rooms + rooms vigilados (en Memory, sobreviven sin visión)
│   ├── ThreatManager.ts      # Detecta amenazas y las recuerda aunque se pierda la visión
│   ├── GuardSpawn.ts         # Mantiene COUNT vigilantes por home (con reemplazo antes de morir)
│   ├── PostManager.ts        # Una bandera Guard_N por vigilante (su puesto en casa)
│   └── DispatchManager.ts    # Reparte vigilantes entre amenazas
├── roles/Guardian/
│   ├── index.ts              # Decide: retirarse, viajar, esperar compañeros, pelear, estacionarse
│   └── actions.ts            # attack / rangedAttack / rangedMassAttack / heal del tick
└── utils/
    ├── body.ts               # Cuerpo según energía (1 MOVE por parte = velocidad completa)
    ├── combat.ts             # Enemigos, poder de combate (con boosts), blanco común
    ├── move.ts               # AdvancedMove para ir, flee de PathFinder para escapar
    ├── parking.ts            # Sin bandera libre: casilla fuera de las roads
    ├── spawnHook.ts          # Sabe qué spawns ya usó otro este tick (no se los pisa)
    └── debug.ts              # guardInfo() para la consola
```

## 🔁 Cada tick

1. **RoomManager**: home rooms (mis rooms con spawn y RCL ≥ 3) y rooms vigilados.
2. **ThreatManager**: revisa cada room que se ve y registra amenazas.
3. **GuardSpawn**: si faltan vigilantes, spawnea uno. **PostManager**: le da a cada uno su bandera `Guard_N`.
4. **DispatchManager**: asigna una misión (room) a cada vigilante.
5. **Guardian**: cada vigilante actúa.

## 👁️ Qué rooms se vigilan

| Room | Cómo se detecta | Cuándo es amenaza |
|---|---|---|
| **Home** | Mis rooms con spawn y RCL ≥ `MIN_HOME_RCL` (o `HOME_ROOMS`) | Cualquier enemigo |
| **Reserva / remoto** | Reservado por mí (se ve), o con bandera `Claim`, `Miner_` o `Watch_xxx` | Cualquier enemigo, o un invader core nivel 0 |
| **SOS** | Cualquier otro room a ≤ 2 rooms de casa | Un creep mío **herido** + enemigos armados |

- Los vigilados quedan en `Memory.guard.watched`. Si los invaders matan al miner y se
  pierde la visión, la amenaza **sigue activa** (`MEMORY_TICKS` = 1500, la vida de un
  invader) hasta que llega un vigilante y ve el room vacío.
- Nunca entra a rooms con dueño ajeno (torres). Ignora aliados (`Memory.allies`, de
  `utils/Attack`) y Source Keepers.
- Para vigilar un room a mano: bandera `Watch_loquesea` en ese room.

## 🚨 Despacho

- Orden: **home primero**, después las más peligrosas y las más cercanas.
- Cada amenaza necesita `poder_enemigo × 1.5 / poder_vigilante` (mínimo 1).
- El que ya tiene misión la conserva mientras haga falta (no cambia de idea cada tick).
- Los que sobran también van (`SEND_EXTRA`): con una sola amenaza salen **los 3**.
- Sin amenazas: todos a casa, a estacionarse.

## ⚔️ Combate

- **Cuerpo** (1:1 MOVE, velocidad completa en plano): 1300e → 3 RANGED, 3 ATTACK, 1 HEAL;
  1800e → 4 RANGED, 3 ATTACK, 2 HEAL. HEAL al final del cuerpo (lo último en romperse).
- **Fuego concentrado**: todos los vigilantes del room van al mismo blanco (primero el que
  más cura, después el de menos vida).
- Cada tick, aunque esté viajando: `attack` al lado, `rangedAttack` a 3 (o
  `rangedMassAttack` si hay varios y no hay aliados cerca), `heal` a sí mismo o a un creep
  mío herido.
- **Kiting**: si el melee enemigo pega más que el suyo, se queda a rango 3 disparando.
- **Esperar compañeros**: si el enemigo es más fuerte que los que ya llegaron, los primeros
  esperan fuera de su alcance (máx. 25 ticks) en vez de morir de a uno.
- **Retirada**: bajo 40% de vida se aleja y se cura; vuelve al 85%. Sin HEAL, se cura en
  casa con las torres.
- **Después de la pelea**: cura a los creeps míos heridos del room y vuelve a casa.

## 🏠 En casa

Pon banderas **`Guard_1`, `Guard_2`, `Guard_3`...** en el home room: cada vigilante recibe
una (en orden) y se para **encima**. Es siempre la misma: la conserva mientras está de
misión y al volver va directo a ella.

- Si borras una bandera, su vigilante toma otra libre.
- Si hay más vigilantes que banderas (ej: el reemplazo nace antes de que muera el viejo),
  el que sobra se estaciona fuera de las roads cerca del storage/spawn hasta que se libere una.
- Solo cuentan las banderas `Guard_` del **home room**.

## 🍼 Spawn

- La economía va primero: si el Spawner ya usó el spawn este tick (aunque le falte
  energía), el vigilante espera. `spawnHook` lo sabe porque envuelve `spawnCreep` (solo
  observa, no cambia nada).
- **Emergencia**: hay amenaza y no queda ningún vigilante → sale uno con la energía que
  haya (mínimo `MIN_COST`), sin esperar a llenar las extensions.
- El reemplazo nace antes de que el viejo muera de viejo.

## 🔍 Consola

```js
guardInfo()                         // vigilantes, rooms vigilados y amenazas
Memory.guard                        // lo mismo, crudo
Memory.guard.watched['W1N2'] = Game.time   // vigilar un room a mano (o bandera Watch_xxx)
```

## ⚙️ Afinar (`config.ts`)

- `COUNT`: vigilantes por home.
- `SPAWN.PART_CYCLE`, `MAX_COST`: cuerpo.
- `IDLE.FLAG_PREFIX`: prefijo de las banderas de puesto (`Guard_`).
- `ROOMS.WATCH_FLAG_PREFIXES`: qué banderas marcan rooms a vigilar.
- `THREAT.IGNORE_HARMLESS`: `true` = no salir por scouts sin partes peligrosas.
- `THREAT.MAX_CORE_LEVEL`: `-1` = no atacar invader cores.
- `THREAT.SEND_EXTRA`: `false` = mandar solo los que hacen falta.
- `COMBAT.*`: retirada, kiting y espera de compañeros.
