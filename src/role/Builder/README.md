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
    ├── collect.ts         # Recolección con reserva dinámica compartida
    └── build.ts           # Algoritmo de prioridad estricta de construcción
