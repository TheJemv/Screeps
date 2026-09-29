# 🛠️ Repairer Role Module (`role/Repairer/`)

Mantenimiento de la infraestructura de **casa** (el room donde nació) y de los **remotos
de minería** (rooms con bandera `Miner_`), con una regla de oro:

> **Nunca sale de casa si no es para un trabajo concreto, y al terminarlo vuelve.**

---

## 📁 Arquitectura del Módulo

```text
role/Repairer/
├── index.ts                    # Máquina de estados (CARGAR / REPARAR / STANDBY)
├── config.ts                   # Todos los números afinables
├── types.ts                    # Memoria del creep
├── README.md
├── managers/
│   ├── TargetManager.ts        # Qué reparar: candidatos por tick + prioridades
│   ├── ReservationManager.ts   # Quién repara qué (un objetivo = un repairer)
│   └── StandbyManager.ts       # Sin trabajo: volver a casa y estacionarse
├── services/
│   ├── collect.ts              # De dónde cargar energía
│   └── repair.ts               # Reparar el objetivo (+ reparar de pasada)
└── utils/
    ├── rooms.ts                # Remotos permitidos y seguros
    ├── repairPassing.ts        # Reparar la road que pisa mientras camina
    └── findParkingSpot.ts      # Casilla de espera fuera de las roads
```

---

## ⚙️ Flujo de Estados (`index.ts`)

```
        ┌──────────────┐  mochila llena   ┌──────────────┐
        │   CARGAR     │ ───────────────▶ │   REPARAR    │
        │ working=false│ ◀─────────────── │ working=true │
        └──────┬───────┘  mochila vacía   └──────┬───────┘
               │ (el objetivo sigue reservado)   │
               │                                 │
   sin de dónde cargar                  nada que reparar
   (si trae ≥ 50, sale a trabajar)               │
               └──────────────┬──────────────────┘
                              ▼
                     ┌─────────────────┐
                     │    STANDBY      │  vuelve a casa y se estaciona
                     │ (park en memoria)│  cerca del storage, fuera de roads
                     └─────────────────┘
```

* **Casa (`homeRoom`)**: el Spawner guarda `memory.room`; `index.ts` lo copia a `homeRoom`
  la primera vez. Antes `homeRoom` nunca se llenaba y "casa" era el room donde estuviera parado.
* Al vaciarse **no suelta su objetivo**: queda reservado y al volver lo termina.

---

## 🎯 Prioridades (`managers/TargetManager.ts`)

Una estructura se vuelve **trabajo** al bajar de un umbral, y una vez tomada se repara
**hasta el 100%** (muros/ramparts hasta `WALL_TARGET_HITS`), así no vuelve cada rato por 1%.

| Prioridad | Qué | Dónde | Empieza cuando |
|---|---|---|---|
| 5 CRÍTICO | Rampart por caerse | casa | `< 10k hits` |
| 5 CRÍTICO | Container / estructura propia | casa y remotos | `< 25%` |
| 4 PROPIAS | Spawn, extensions, torres, storage, links, terminal, labs... | casa | `< 50%` |
| 3 CONTAINERS | Containers | casa y remotos | `< 50%` |
| 2 ROADS | Roads | casa (`< 70%`) y remotos (`< 50%`) | |
| 1 MUROS | Muros y ramparts propios | casa | `< 70%` de 100k |

Dentro de la misma prioridad gana **la más cercana** (otro room cuenta como 50 casillas
por room de distancia, así que siempre prefiere lo que tiene en su room).

**Nunca toma:** estructuras sin vida (muros indestructibles de zona novice, controller),
estructuras de otro jugador o de NPC, y en los remotos nada que no sea container o road
(antes podía irse a reparar un muro viejo de otro jugador en un remoto).

### Remotos permitidos (`utils/rooms.ts`)
Solo rooms con bandera `Miner_`, a `≤ 2` rooms de casa, con visión, sin dueño ajeno y
**sin enemigos armados**. Si aparece un invader, suelta el trabajo remoto y vuelve.

### De pasada (`utils/repairPassing.ts`)
Mientras camina con energía, repara la road que pisa si bajó del 80%.
`repair()` y `move()` van en el mismo tick: no cuesta tiempo.

---

## 🔋 Energía (`services/collect.ts`)

1. **Trabajando en un remoto** (y ya está ahí): la energía tirada de ese room (se pudre)
   o su container minero. Si no hay y trae ≥ 50, gasta lo que trae en vez de ir a casa.
2. **Storage de casa**, solo lo que pase de `STORAGE_RESERVE` (5000).
3. **Containers mineros de casa**, respetando las reservas de `utils/EnergyReservations`.

Nunca cruza a otro room *solo* para buscar energía. Antes usaba `withdrawFromPowerBank()`,
que como último recurso lo mandaba a cualquier container minero del imperio: con los
containers de casa vaciados por los HaulerLocal, terminaba en el container remoto lleno
(el que tiene energía tirada alrededor) y se quedaba a vivir ahí.

---

## 🅿️ Standby (`managers/StandbyManager.ts`)

Sin trabajo o sin energía: vuelve a casa y se estaciona a 3–8 casillas del storage (o del
spawn), fuera de las roads y sin pegarse a donde trabajan otros. Guarda el lugar en
`memory.park`, el mismo campo que usa HaulerLocal, así que no se pisan entre ellos.

---

## 🎨 Colores de ruta
* 🟢 **Verde (`#00ff00`):** va a reparar.
* 🟠 **Naranja (`#ffaa00`):** va a cargar energía.
* 🔘 **Gris (`#777777`):** vuelve a casa / va a estacionarse.

---

## ⚙️ Afinar (`config.ts`)

`CONTAINER_START_BELOW`, `OWNED_START_BELOW`, `START_BELOW`, `REMOTE_START_BELOW`, `CRITICAL_BELOW`, `WALL_TARGET_HITS`,
`RAMPART_CRITICAL_HITS`, `PASSING_BELOW`, `REMOTE_MAX_DISTANCE`, `STORAGE_RESERVE`,
`MIN_CONTAINER_ENERGY`, `MIN_ENERGY_TO_WORK`, `PARK_MIN_RANGE`/`PARK_MAX_RANGE`.
