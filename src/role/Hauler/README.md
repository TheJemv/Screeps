# 🚚 Hauler Role Module (`roles/Hauler/`)

Este módulo gestiona la logística y el transporte autónomo de energía en la colonia. Los **Haulers** son responsables de recolectar recursos de fuentes primarias (contenedores mineros, ruinas, tumbas y energía tirada) y distribuirlos de forma jerárquica a las estructuras clave de la base.

---

## 📁 Arquitectura del Módulo

El rol está diseñado bajo la arquitectura modular en servicios especializados y consume utilitarios compartidos desde `utils/`:

```text
roles/Hauler/
├── index.ts               # Orquestador (Máquina de estados del creep)
├── types.ts               # Tipos e interfaces de memoria locales
├── README.md              # Documentación del módulo
└── services/
    ├── reservations.ts    # Modo de histéresis del Controller Container
    ├── parking.ts         # Estacionamiento exclusivo para creeps ociosos
    ├── collect.ts         # Búsqueda, filtrado y recolección de energía
    └── deliver.ts         # Algoritmo de distribución jerárquica de recursos
```

---

## ⚙️ Flujo de Estados (`index.ts`)

Cada Hauler opera mediante una máquina de estados binaria basada en su capacidad de carga:

```
                  ┌───────────────────────────┐
                  │   Estado: RECOLECTANDO    │
                  │   (delivering = false)    │
                  └─────────────┬─────────────┘
                                │
                  Mochila Llena │ Mochila Vacía
           (freeCapacity == 0) │ (store[ENERGY] == 0)
                                │
                  ┌─────────────▼─────────────┐
                  │     Estado: ENTREGANDO    │
                  │    (delivering = true)    │
                  └───────────────────────────┘
```

> **Nota:** Al cambiar de estado, la propiedad `targetContainerId` se elimina de la memoria del creep para liberar la reserva del contenedor de forma inmediata.

---

## 🔒 Sistema de Reservas Compartido (`utils/energyReservations.ts`)

Los Haulers utilizan la utilidad compartida `withdrawFromPowerBank()` para calcular la **Energía Efectiva**:

$$\text{Energía Disponible} = \text{Energía del Contenedor} - \sum (\text{Capacidad Libre de Creeps en Camino})$$

* **Locking:** Al seleccionar un contenedor, guarda su `id` en `creep.memory.targetContainerId`.
* **Sincronización:** Evita que múltiples Haulers o Repairers viajen al mismo nodo si las reservas actuales cubrirán toda la energía física del contenedor.

---

## 🔁 Modo de Histéresis del Controller (`services/reservations.ts`)

Previene recargas ineficientes de poco volumen utilizando un estado a nivel de habitación (`room.memory.fillControllerContainer`):

* **Encendido (`true`):** Se activa cuando el contenedor del Controller cae por debajo de **200 de energía**.
* **Apagado (`false`):** Se desactiva automáticamente cuando el contenedor alcanza los **1800 de energía**.

---

## 🎯 Jerarquía de Prioridades

### Recolección (`services/collect.ts`)
1. **Tumbas y Ruinas:** ($\ge 50$ de energía) Para evitar pérdidas por degradación (*decay*).
2. **Pilas Grandes de Energía Tirada:** ($\ge 200$ de energía) Excluye casillas marcadas con banderas `Miner_`.
3. **Contenedores Mineros (`GetPowersBank`):** Selección por reserva dinámica ($\ge 100$ de energía disponible).
4. **Energía Residual Tirada:** ($\ge 30$ de energía) Excluye casillas marcadas con banderas `Miner_`.

### Entrega (`services/deliver.ts`)
1. **Spawns y Extensions:** Prioridad máxima para la reproducción de creeps.
2. **Contenedor del Controller:** Si el modo de histéresis está activo.
3. **Trabajadores Cercanos:** Upgraders o Builders adyacentes (rango 1) que necesiten energía.
4. **Torres de Defensa (`StructureTower`):** Para mantener la defensa y reparaciones defensivas activas ($\ge 100$ de capacidad libre).
5. **Storage:** Almacén central global para excedentes.
6. **Parking:** Estacionamiento en banderas `Parking_` si la colonia está satisfecha.

---

## 🏎️ Navegación (`utils/MoveToRoads.ts`)
* ⚪ **Blanco (`#ffffff`):** Ruta de entrega.
* 🟠 **Naranja (`#ffaa00`):** Ruta de recolección.
* 🔘 **Gris (`#777777`):** Desplazamiento a estacionamiento.
