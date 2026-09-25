# 🛠️ Repairer Role Module (`roles/Repairer/`)

Este módulo controla las tareas de mantenimiento preventivo y reparación de la infraestructura dentro de la habitación.

---

## 📁 Arquitectura del Módulo

El rol está estructurado de forma ligera en servicios dedicados que consumen las funciones utilitarias compartidas en `utils/`:

```text
roles/Repairer/
├── index.ts               # Orquestador y máquina de estados
├── types.ts               # Interfaces y tipos de memoria locales
├── README.md              # Documentación del módulo
└── services/
    ├── collect.ts         # Recolección delegada a utils/energyReservations.ts
    └── repair.ts          # Algoritmo de reparación por prioridad y stand-by
```

---

## ⚙️ Flujo de Estados (`index.ts`)

El Repairer alterna entre dos estados en función de los recursos almacenados en su mochila:

```
                  ┌───────────────────────────┐
                  │   Estado: RECOLECTANDO    │
                  │     (working = false)     │
                  └─────────────┬─────────────┘
                                │
                  Mochila Llena │ Mochila Vacía
           (freeCapacity == 0) │ (store[ENERGY] == 0)
                                │
                  ┌─────────────▼─────────────┐
                  │     Estado: REPARANDO     │
                  │      (working = true)     │
                  └───────────────────────────┘
```

---

## 🔒 Integración con el Sistema de Reservas (`utils/energyReservations.ts`)

El servicio `collect.ts` ejecuta `withdrawFromPowerBank()`, integrándose perfectamente al ecosistema global de energía:

* **Sincronización:** Los Repairers respetan las reservas de los Haulers y viceversa, evitando competir por contenedores a punto de vaciarse.
* **Distancia Restringida (`range: 1`):** Mantiene un rango mínimo de 1 casilla alrededor del contenedor minero para nunca bloquear al minero que trabaja encima.

---

## 🎯 Jerarquía de Reparación (`services/repair.ts`)

Cuando entra en estado de reparación (`working = true`), busca la estructura más dañada ordenando por porcentaje de puntos de golpe ($\le 75\%$ de `hitsMax`) según el siguiente orden de importancia:

1. **Contenedores (`StructureContainer`)**
2. **Extensiones (`StructureExtension`)**
3. **Carreteras (`StructureRoad`)**

### Modos de Espera (Stand-by)
Si todas las estructuras de la habitación están por encima del 75% de vida, el Repairer se desplazará a **rango 1 del contenedor minero más cercano** para esperar sin estorbar el tráfico.

---

## 🎨 Identificación Visual de Rutas (`utils/moveToRoad.ts`)
* 🟢 **Verde (`#00ff00`):** Desplazamiento a reparar una estructura.
* 🟠 **Naranja (`#ffaa00`):** Desplazamiento a recolectar energía a un contenedor minero.
* 🔘 **Gris (`#777777`):** En espera cerca de una mina (base totalmente reparada).