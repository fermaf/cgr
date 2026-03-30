export interface AgentMemoryEvent {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

const memoryStore = new Map<string, AgentMemoryEvent[]>();

export function storeEvent(sessionId: string, event: AgentMemoryEvent): void {
  const events = memoryStore.get(sessionId) ?? [];
  events.push(event);
  memoryStore.set(sessionId, events);
}

export function getRecentEvents(sessionId: string, limit = 10): AgentMemoryEvent[] {
  if (limit <= 0) {
    return [];
  }

  const events = memoryStore.get(sessionId) ?? [];
  return events.slice(-limit);
}
