# 🔨 Builder Role Module (`roles/Builder/`)

Este módulo gestiona la construcción estratégica de la colonia y el desarrollo de infraestructura tanto local como inter-habitaciones.

---

## 📁 Arquitectura del Módulo

El Builder está estructurado bajo la arquitectura modular de servicios especializados, consumiendo utilitarios compartidos desde `utils/`:

```text
roles/Builder/
├── index.ts               # Orquestador (Máquina de estados)
├── types.ts               # Interfaces y tipos de memoria locales
├── README.md              # Documentación del módulo
└── services/
    ├── parking.ts         # Estacionamiento en banderas ParkingBuilder_
    ├── collect.ts         # Recolección: si ya trae energía y hay obra a ≤3, construye ahí;
    │                      # energía tirada solo a ≤3 casillas y ≤4 pasos reales; si no, storage/containers de casa
    ├── assign.ts          # Reparto de obras (1 vez por tick): cupo por energía comprometida, nunca
    │                      # saca al que ya trabaja, obras empezadas primero, el par builder-obra más cercano
    └── build.ts           # Construye la obra asignada; si no hay, repara o se estaciona
