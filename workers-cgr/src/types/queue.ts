// Tipos de mensajes de la cola.

export type QueueMessage =
  | { type: 'crawl'; cursor?: string }
  | { type: 'enrich'; dictamenId: string }
  | { type: 'vectorize'; dictamenId: string }
  | { type: 'fuentes'; dictamenId: string };
