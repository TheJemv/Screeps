# ⚔️ Pelotones de guerra (`src/war/`)

Pelotones de **6** que se mueven y pelean **en formación**, con movimiento propio
(no usa `utils/AdvancedMove`: ni `travel()` ni `moveTo`).

```ts
// main.ts (ya está)
import WarSystem from "./war";
WarSystem.run();
```

Para reclutar: `WAR_CONFIG.SPAWN_ACTIVE = true` en `config.ts`.

---

## 🪖 Composición y formación

| Rol | Cant. | Cuerpo (1800e, RCL5) | Casilla |
| :-- | :-: | :-- | :-- |
| `Leader` | 1 | 5 TOUGH · 10 ATTACK · 15 MOVE | Frente, en medio (`L`) |
| `Tank` | 2 | 5 TOUGH · 10 ATTACK · 15 MOVE | A los lados (`TL`, `TR`) |
| `Healer` | 1 | 6 HEAL · 6 MOVE | En medio, protegido (`H`) |
| `Ranged` | 2 | 9 RANGED_ATTACK · 9 MOVE | Atrás (`RL`, `RR`) |

Los cuerpos escalan con la energía del room (`SPAWN.BODIES`, patrón que se repite).
Todos van 1:1 con MOVE.

```text
   marcha (mirando ↑)        asalto (quietos pegándole a algo de enfrente)
      .  L  .                    TL L  TR
      TL H  TR                   .  H  .
      RL .  RR                   RL .  RR
```

- El bloque ocupa 3x3. El **ancla** es el centro (el healer).
- Gira en 4 direcciones (el líder siempre hacia donde van o hacia el objetivo) y
  avanza en las 8.
- Los dos tanques y los dos ranged se reparten izquierda/derecha según quién está más
  cerca, así al girar nadie cruza la formación.
- Si muere el líder, el tanque más cercano pasa al frente.
- **Asalto**: frente a una estructura (objetivo o muro que tapa el paso) los tanques dan
  un paso al frente y le pegan los tres melee. Al volver a moverse regresan a los lados.

## 🚶 Movimiento: todos juntos

1. **Formar**: cada uno camina a su casilla. Los que ya están, esperan.
2. **Avanzar**: SOLO si los 6 están en su casilla y **nadie tiene fatiga**, todos dan el
   mismo paso a la vez. Si uno se atrasó (pantano, MOVE rotos, un creep en el medio), los
   demás lo esperan formados y después siguen juntos.
3. El camino se calcula para el **bloque entero** (tiene que caber el 3x3). Prefiere
   roads y evita pantanos. Antes de cada paso revisa las casillas nuevas:
   - creep ajeno → espera (y a los 3 ticks recalcula esquivando creeps);
   - estructura enemiga → la rompe (brecha) y sigue.

### Cruzar de room (bordes y portales)

Quedarse parado en un borde te rebota al room vecino, así que el bloque nunca toca los
bordes. Para cruzar:

1. El bloque va a una casilla **pre** pegada a la salida (o al portal).
2. Cada uno cruza y va directo a su casilla alrededor de un ancla **post** del otro lado.
3. Ya formados, siguen.

Los portales salen de `RouteManager` (se recuerdan en `Memory.war.portals`, aunque se
pierda la visión) y se usan si no hay camino normal o si ahorran rooms.

### Modo tren (pasillos angostos)

Donde el 3x3 no cabe (un pasillo de 2, una compuerta de 1) van **en fila**: líder,
tanque, healer, tanque, ranged, ranged (el healer en medio alcanza a todos). El de
adelante solo avanza si nadie tiene fatiga y la fila está unida. Terminan en el primer
lugar donde el bloque vuelve a caber y desde el que sí llega al objetivo, y ahí se forman.

En el room atacado el tren también **abre brecha**: el de adelante se para frente al
rampart y le pegan todos. Si abrir paso para el bloque obliga a romper mucho más que un
hueco de 1 (ej: una línea de ramparts), prefiere el hueco y pasar en fila.

## 🚩 Banderas

| Bandera | Qué hace |
| :-- | :-- |
| **`Save`** | Punto de reunión. Los pelotones nacen, van ahí y **esperan a estar los 6 y formados** aunque ya exista `Attack`. |
| **`Attack`** | **Una sola.** Su **room** se ataca entero; la posición exacta no importa (no van a la bandera). Quitarla = todos vuelven a `Save`. Moverla a otro room = van para allá. |

Las banderas viejas `Attack_Alpha`, `Attack_charlie`… ya no se usan: bórralas y pon una
sola `Attack`.

## 🔁 Ciclo de un pelotón

```text
rally ──(6 vivos + formados + hay Attack)──▶ march ──(entra al room)──▶ siege
  ▲                                             ▲                         │
  │                                             └──(curados)── retreat ◀──┤ (muy heridos / safe mode)
  └────────────── return ◀──────────── (se quitó Attack) ─────────────────┘
```

Reclutamiento (`WarSpawn`): **uno a la vez**. Ejemplo con `Attack` puesta:

1. **Charlie** está atacando el room.
2. **Alpha** se recluta y espera en `Save` hasta que nace el último.
3. Alpha completo y formado → sale hacia el room de `Attack`.
4. Recién ahí empieza a reclutarse el siguiente (Beta) y espera en `Save`.

- Todos los spawns libres del home trabajan a la vez. La economía va primero: si el
  Spawner ya usó un spawn este tick, war no lo toca (`utils/spawnHook.ts`).
- Anti-goteo: un pelotón que ya salió nunca recibe refuerzos sueltos.
- `SPAWN.MAX_SQUADS` (3): tope de pelotones vivos. Sin `Attack` se recluta como mucho
  uno para que espere listo en `Save`.

## 🎯 Prioridades en el room atacado (`TargetManager`)

1. **Torres** (lo que hace daño; primero las que tienen energía)
2. **Extensions y spawns**
3. **Creeps con daño** (ATTACK / RANGED / HEAL)
4. **Economía**: storage, terminal, links, labs, factory, power spawn, nuker, observer, extractor, containers
5. Cualquier creep que quede

Dentro de un nivel elige el más barato: distancia + ticks para romperlo (contando el
rampart que lo cubre). Si hay varios pelotones en el mismo room, se reparten objetivos.

Aparte, **cada creep le pega a lo que se le ponga enfrente** en cualquier momento:

- Líder y tanques (`attack`): el objetivo, un creep enemigo pegado, o la estructura enemiga pegada más importante.
- Ranged: el objetivo, un creep, o una estructura en rango 3; `rangedMassAttack` cuando rinde más (nunca con aliados cerca).
- Healer: cura al que más lo necesita (pegado cura x3). En territorio enemigo, si nadie está herido, **pre-cura** al líder.

No se ataca nada de `ALLIES` ni de `Memory.allies`. Fuera del room atacado solo se pelea con creeps.

## 🩹 Retirada, safe mode y torres

- Algún miembro < 45% o el pelotón < 60% (y hay healer) → vuelven formados al room
  anterior (**staging**), se curan hasta 90% y vuelven a entrar.
- Safe mode enemigo → se retiran y esperan a que termine (`Memory.war.safeMode`).
- `SIEGE.HOLD_IF_OUTGUNNED`: si en la última visita el room tenía más torres con energía
  de las que el pelotón puede curar (150 de daño mínimo por torre), esperan afuera y lo
  avisan en consola en vez de entrar a morir.

## 📁 Arquitectura

```text
war/
├── index.ts                  # WarSystem.run(): portales, pelotones, reclutamiento, cada pelotón
├── config.ts                 # Todos los números afinables
├── types.ts                  # SquadMemory, WarCreepMemory, Memory.war
├── managers/
│   ├── WarSpawn.ts           # Recluta un pelotón a la vez (cuerpos según energía)
│   ├── SquadManager.ts       # Fases: rally / march / siege / retreat / return
│   ├── TargetManager.ts      # Prioridades del room atacado
│   └── RouteManager.ts       # Ruta entre rooms (bordes + portales recordados)
├── movement/
│   ├── Formation.ts          # Geometría: casillas, giros, quién va dónde (sin API del juego)
│   ├── Grid.ts               # Dónde cabe el 3x3, búsquedas de ancla (sin API del juego)
│   ├── RoomGrid.ts           # Costos por room y tick (terreno, estructuras, rompibles, portales)
│   ├── FormationMove.ts      # Formar, esperar fatiga, avanzar juntos, detectar brechas
│   ├── Train.ts              # Modo tren (en fila) con brecha
│   ├── Travel.ts             # Movimiento de un creep suelto (PathFinder propio de war)
│   └── Navigator.ts          # Cruces de room/portal, puentes, cuándo bloque y cuándo tren
├── roles/
│   ├── Melee/ Ranged/ Healer/  # Solo combate: el movimiento es del pelotón
│   └── context.ts
└── utils/                    # combat, flags, geometry, memory, roles, spawnHook, debug
```

## 🖥️ Consola

```js
warInfo()   // pelotones: fase, ancla y dirección, objetivo; cada creep con su casilla, vida y fatiga
```

`DEBUG.VISUALS`: dibuja el bloque, la casilla de cada uno (`L`, `TL`, `H`…) y el objetivo.

## ⚠️ A tener en cuenta

- **Tiempo de vida**: el primero en nacer espera a los otros 5 en `Save`. Con un solo
  spawn eso son ~400 ticks de sus 1500. Con 2-3 spawns en el home se reduce mucho.
- **Torres**: un healer de 6 HEAL cura 72/tick; una torre pega entre 150 y 600. Contra
  bases con varias torres hacen falta más HEAL o boosts (no implementados).
- Creeps y pelotones viejos (roles `Escort` / `Follower`) se adoptan solos.
