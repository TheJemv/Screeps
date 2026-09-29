# 🧭 AdvancedMove (`utils/AdvancedMove/`)

Movimiento con **camino exacto precalculado** + **gestor de tráfico por tick**.

```ts
import { AdvancedMove } from "utils/AdvancedMove";

AdvancedMove.travel(creep, target, { range: 1, visualizePathStyle: { stroke: "#ffaa00" } });

// ¿Vale la pena ir? Pasos REALES rodeando muros (Infinity si no hay camino corto).
AdvancedMove.stepsTo(creep, pila, 1);
```

**Quién lo usa:** toda la economía. Builder, HaulerLocal, Harvester, HaulerCore,
LinkOperator, Repairer y `utils/EnergyReservations` llaman a `travel()` directo, y los
roles que usan `moveToRoad` (Hauler, RemoteHauler, Upgrader, Miner, ControllerCreep,
LinkKeeper, Claim, parkings) pasan por él, porque `moveToRoad` es un envoltorio.
**War** sigue con su `moveTo` propio (formaciones y `ignoreDestructibleStructures`).

**Rango:** `travel()` usa 1 por defecto. `moveToRoad` usa 0, igual que `moveTo`: se para
encima del objetivo si se puede pisar (banderas, containers) y al lado si no (spawn,
storage, controller). Un creep que llega con rango 0 nunca es empujado.

---

## 📁 Arquitectura

```text
utils/AdvancedMove/
├── index.ts                  # Fachada: travel(), getPath(), forget()
├── config.ts                 # Todos los números afinables
├── types.ts                  # TravelOptions, TravelMemory (creep.memory.travel)
├── managers/
│   ├── StateManager.ts       # Memoria del creep: avance sobre el path, atascos, ancla
│   ├── PathManager.ts        # PathFinder -> camino exacto serializado ("3334445...")
│   ├── LaneManager.ts        # Carriles: con roads paralelas, cada uno por su derecha
│   ├── RouteManager.ts       # Rooms permitidos (findRoute) + cruce por portales
│   ├── CostMatrixManager.ts  # CostMatrix de estructuras cacheada en heap
│   ├── PortalManager.ts      # Baja de los portales a quien no quiere cruzar (anti ping-pong)
│   └── TrafficManager.ts     # Reservas del tick: swap, empujar, rodear, esperar
└── utils/
    ├── position.ts           # Coordenadas crudas, direcciones, bordes/espejos
    ├── body.ts               # Costos de terreno según cuerpo y carga reales
    └── moveHook.ts           # Registra TODOS los move() del tick (solo observa)
```

## 🔁 Qué pasa en cada `travel()`

1. **StateManager**: compara dónde quedó el creep con el paso que pidió el tick anterior.
   Llegó → consume el paso. Sigue igual → atasco +1. Está en otro lado → path inválido.
2. **¿En rango?** → libera el path. Si alguien necesita su casilla, se corre sin salir de rango.
3. **PathManager** (solo si hace falta): no hay path, cambió el destino, o lleva ticks atascado.
4. **TrafficManager**: negocia el próximo paso contra lo que ya pidieron los demás creeps
   **en este mismo tick**.
5. `creep.move()`.

El camino queda en `creep.memory.travel.path` como una dirección por carácter.
`AdvancedMove.getPath(creep)` lo devuelve como `RoomPosition[]`, casilla por casilla.

## 🚦 Reglas de tráfico

| Situación en la casilla siguiente | Qué hace |
|---|---|
| Libre | Avanza |
| Un creep que ya pidió moverse | Avanza (tren detrás de él, o **swap** si viene a mi casilla) |
| Un creep esperando **mi** casilla | **Swap** inmediato: mueve a los dos |
| Un creep mío en viaje que aún no se procesó | Avanza (va a liberar la casilla) |
| Un creep quieto **con ancla** (trabajando cerca de su destino) | Lo **empuja** a un costado sin sacarlo de rango, prefiriendo salir de la road |
| Otro creep ya reservó la casilla, un creep cansado, o uno sin ancla | **Rodeo** por una casilla lateral que conecta con el paso siguiente (no pierde distancia), o espera |

- **Una sola road**: los que van en sentido contrario hacen swap sin frenar; el que
  está trabajando parado en la road se corre al costado y la deja libre.
- **3-4 roads paralelas**: el rodeo es un cambio de carril gratis.
- **Carriles**: con 2 o más roads paralelas, cada creep va por el carril de **su derecha**
  (ver abajo), así que la ida y la vuelta casi nunca se cruzan de frente.
- **Nunca se empujan** los creeps sin ancla (war), los que llegaron con rango 0 (miner sobre
  su bandera, upgrader sobre su container) ni los que ya se movieron ese tick: el hook de
  `move()` evita pisar el movimiento que otro código ya decidió.

## 🧠 Otras decisiones

- **Costos por cuerpo + prioridad de roads**: replica la fórmula de fatiga del motor
  (ticks reales por casilla según cuerpo y carga) y además cada casilla fuera de la road
  cuesta `ROAD_PREFERENCE` más (30% por defecto). Resultado: los creeps van por las roads,
  los empates siempre van por la road, y solo se sale si el atajo ahorra de verdad (un
  cargado casi nunca; uno vacío si la road es más de 30% más larga).
- **Caminos óptimos**: la heurística de PathFinder es distancia × `heuristicWeight`
  (default 1.2 en el motor), y con road = 1 eso sobreestima y A* a veces devuelve caminos
  más largos que el mejor. Acá una road vale 10 y el peso es 9: nunca sobreestima, así que
  A* siempre devuelve el óptimo.
- **Carriles (circular por la derecha)**: con 2 o más roads paralelas, cada creep usa el
  carril de su derecha según hacia dónde camina: hacia el este el de abajo, hacia el oeste
  el de arriba, hacia el sur el de la izquierda, hacia el norte el de la derecha (y lo
  mismo con roads diagonales). Con 3-4 carriles, el de más a la derecha. En una road en U,
  a la ida va por el carril de afuera y a la vuelta por el de adentro. `PathManager` busca
  el camino normal y, si pisa un carril equivocado, `LaneManager` le pone recargo a los
  carriles equivocados y descuento al de la derecha a lo largo del camino, y busca otra vez.
  Reglas:
  - Hacia dónde corre cada road sale de su forma (su eje más largo: horizontal, vertical o
    diagonal). El camino solo dice hacia qué lado va el creep. Así las curvas y las
    diagonales que unen dos tramos rectos se leen bien.
  - Un carril tiene que seguir derecho (`LANES.FULL_RUN` casillas). El costado de una plaza
    o de un cruce que se corta enseguida no cuenta: no se mete en la plaza para volver.
  - Un hueco de 1 casilla sin road en un carril recto no lo corta.
  - Pegarse a la derecha puede costar pasos: el carril de afuera de una curva es más largo
    (ej: W48N6, la ida por afuera tarda 1-2 ticks más). Doblar a la izquierda sí corta la
    esquina (cruza el otro carril, como un auto): pegarse afuera costaría 2 pasos más.
  - El recargo nunca iguala al plano: prefiere el carril equivocado antes que salir de la
    road. En carriles **diagonales** entrar y salir del carril propio cuesta 1 paso cada uno.
  - El carril de al lado cuenta si sigue `LANES.MIN_RUN` casillas (3) para adelante: si
    arriba hay road que sigue, sube; y no baja y vuelve a subir (zigzag).
  - Con una sola road no cambia nada, y no hay segunda búsqueda. Con carriles, la segunda
    búsqueda solo se hace cuando el primer camino pisa el carril equivocado.
- **Sin zigzags**: PathFinder elige al azar entre casillas que cuestan lo mismo (dos
  carriles, un campo de extensiones con roads cruzadas). Al final, `PathManager` alisa el
  camino: si una casilla se puede cambiar por otra del mismo costo (o menos) que lo deja
  más derecho, la cambia. Nunca lo alarga ni elige algo más caro.
- **Atascos**: recalcula en stuck = 2, 5, 8, 14, 26… penalizando a los creeps cercanos con
  un costo que crece con el atasco. Nunca 255, así que nunca deja al creep sin camino en
  un pasillo.
- **Bordes**: entiende que pisar un exit te transporta a la casilla espejo del room
  vecino (y el rebote si no sale del borde). Los viajes dentro del mismo room no usan
  exits de atajo.
- **Portales**: si no hay ruta normal, camina hasta el portal que sirve de puente
  (`utils/PortalRoute`) y recalcula del otro lado. Nunca usa un portal "de paso"
  (valen 255 en la CostMatrix).
- **Ping-pong en portales**: el motor teletransporta a cualquier creep que *termine el
  tick* sobre un portal, se haya movido o no. Al cruzar, el creep aparece sobre el portal
  gemelo, y si su rol no lo mueve (ej: el Builder ya queda en rango y solo llama a
  `build()`), el portal lo devuelve una y otra vez. `PortalManager` revisa una vez por tick
  a los creeps de AdvancedMove y baja del portal a los que no quieren cruzar, dejándolos lo
  más cerca posible de su destino. El `build()` del rol sigue funcionando ese mismo tick.
  Si alrededor hay creeps míos, usa las reglas del tráfico (swap o empujón) para hacerse
  lugar. Si de verdad no hay dónde bajarse, lo avisa en consola:
  `[AdvancedMove] <creep> está sobre un portal ... y no puede bajarse`.
- **Recalcular al entrar a un room**: un camino armado sin visión de un room no conoce sus
  portales, muros ni estructuras (y pisar un portal teletransporta). Al entrar a un room
  distinto del de la búsqueda, se recalcula con lo que ahora sí se ve. Cuesta una búsqueda
  por room cruzado.
- **CPU**: sin búsquedas mientras el path siga sirviendo. Si no hay camino, backoff
  exponencial (5, 10, 20… ticks). CostMatrix y rutas cacheadas en heap.

## ⚙️ Afinar

Todo está en `config.ts`. Lo más útil:

- `PATH.ROAD_PREFERENCE`: qué tanto se prefieren las roads (0 = solo tiempo, 0.3 = default,
  1 = acepta hasta el doble de ticks por ir por la road).
- `TRAFFIC.SHOVE_MAX_ANCHOR_RANGE` / `ANCHOR_TTL`: quién cuenta como "trabajando" y se
  puede empujar.
- `STUCK.*`: cuándo y cuánto esquivar.
- `LANES.ENABLED`: circular por la derecha con roads paralelas (`false` = como antes).
- `DEBUG: true`: loguea los paths incompletos.

## 🔍 Diagnóstico desde la consola

```js
moveInfo()                          // quién camina, a dónde, atasco y casillas (R road, . plano, S pantano)
moveCompare('builder_123')          // camino de AdvancedMove vs el más corto, en ticks reales
moveCompare('builder_123', 20, 24)  // lo mismo, pero desde otra casilla del room
```

`moveCompare` usa el cuerpo y la carga actuales del creep: un builder lleno y uno vacío
pueden dar resultados distintos.

## ⏱️ Trabajo por tick y `AdvancedMove.run()` (opcional)

El guardia de portales corre solo, con el primer `move()` o `travel()` de **cualquier**
creep en el tick (en una colonia activa, todos los ticks). Para **garantizarlo** también en
ticks donde ningún creep se mueve, agregar una línea en `main.ts`, antes del loop de creeps:

```ts
AdvancedMove.run();
```

## ⚠️ Límites conocidos

- Si el creep llega al portal **cansado** (pisar la casilla genera fatiga), no puede bajarse
  en ese tick: rebota una vez y se baja al volver. Es 1 rebote, no un ping-pong infinito.
- Si todas las casillas alrededor del portal de llegada son muro, portal, estructura o
  creeps que no se pueden mover, no hay dónde bajarlo (sale el aviso en consola).
- El guardia solo cuida a los creeps que usan AdvancedMove (toda la economía). Los de war,
  con su `moveTo` propio, no.
- AdvancedMove no rompe muros para abrirse paso (no hay `ignoreDestructibleStructures`):
  por eso war no lo usa.

- El empujón solo conoce el **último destino** que se pidió con `travel()`. Un creep que
  después se mueve con `moveTo`/`moveToRoad` deja un ancla vieja, que vence a los
  `ANCHOR_TTL` ticks y solo aplica si sigue a ≤3 casillas de ese destino.
- Dos trenes **pegados** en una road de 1 de ancho se cruzan de a pares (es física del
  motor): se pierden unos pocos ticks en el encuentro, sin trabarse.
