export interface LinkOperatorMemory extends CreepMemory {
    role: 'LinkOperator';
    linkId: string; // Guardamos el ID del Link al que está asignado
    linkType: 'sender' | 'receiver'; // Para saber qué lógica ejecutar
}
