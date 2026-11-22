import { nextRandom } from "./rng";

export type Priority = 1 | 2 | 3 | 4;
export type DataType = "emergency" | "health" | "navigation" | "science" | "image";
export type TxStatus = "queued" | "transmitting" | "awaiting-ack" | "retry";

export const PRIORITY_LABEL: Record<Priority, string> = { 1: "CRITICAL", 2: "HIGH", 3: "MEDIUM", 4: "LOW" };

export const DATA_TYPES: Record<DataType, { label: string; priority: Priority; minKB: number; maxKB: number }> = {
  emergency: { label: "Emergency alert", priority: 1, minKB: 2, maxKB: 6 },
  health: { label: "Rover health telemetry", priority: 1, minKB: 8, maxKB: 24 },
  navigation: { label: "Navigation telemetry", priority: 2, minKB: 16, maxKB: 64 },
  science: { label: "Scientific measurement", priority: 3, minKB: 120, maxKB: 480 },
  image: { label: "Image file", priority: 4, minKB: 1200, maxKB: 3200 },
};

export interface DataItem {
  id: string;
  seq: number;
  type: DataType;
  priority: Priority;
  sizeKB: number;
  createdAt: number; // sim seconds
  status: TxStatus;
  sentKB: number;
  attempts: number;
  ackedAt?: number;
}

export function createItem(type: DataType, seq: number, createdAt: number, rand: number): DataItem {
  const spec = DATA_TYPES[type];
  return {
    id: `${type.slice(0, 3).toUpperCase()}-${String(seq).padStart(5, "0")}`,
    seq,
    type,
    priority: spec.priority,
    sizeKB: Math.round(spec.minKB + (spec.maxKB - spec.minKB) * rand),
    createdAt,
    status: "queued",
    sentKB: 0,
    attempts: 0,
  };
}

/** Priority first (1 = critical), FIFO (sequence) within the same priority. */
export function orderQueue(q: DataItem[]): DataItem[] {
  return [...q].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
}

export const queueKB = (q: DataItem[]) => q.reduce((a, i) => a + i.sizeKB, 0);

export function canStore(q: DataItem[], item: DataItem, capacityKB: number) {
  return queueKB(q) + item.sizeKB <= capacityKB;
}

export interface TxEvent {
  level: "info" | "success" | "warn";
  msg: string;
}

export interface TxResult {
  queue: DataItem[];
  delivered: DataItem[];
  events: TxEvent[];
  rngState: number;
  sentKB: number;
}

/**
 * One transmission step. Items are only removed from the queue after a successful simulated
 * acknowledgement; failed ACKs reset the item for retry. When the link is down nothing is sent.
 */
export function transmitStep(queue: DataItem[], budgetKB: number, linkClear: boolean, rngState: number, ackFailRate: number, now: number): TxResult {
  const events: TxEvent[] = [];
  let rng = rngState;
  if (!linkClear) {
    const q = queue.map((i) =>
      i.status === "transmitting" || i.status === "awaiting-ack" ? { ...i, status: "retry" as const, sentKB: 0, attempts: i.attempts + 1 } : i,
    );
    return { queue: q, delivered: [], events, rngState: rng, sentKB: 0 };
  }
  const delivered: DataItem[] = [];
  let q: DataItem[] = [];
  for (const i of queue) {
    if (i.status !== "awaiting-ack") { q.push(i); continue; }
    const [r, n] = nextRandom(rng);
    rng = n;
    if (r < ackFailRate) {
      q.push({ ...i, status: "retry", sentKB: 0, attempts: i.attempts + 1 });
      events.push({ level: "warn", msg: `ACK missing for ${i.id} — scheduled for retry` });
    } else {
      delivered.push({ ...i, ackedAt: now });
      if (i.priority === 1) events.push({ level: "success", msg: `Critical data ${i.id} acknowledged` });
    }
  }
  let budget = budgetKB;
  let sent = 0;
  q = orderQueue(q);
  for (let k = 0; k < q.length && budget > 0; k++) {
    const i = q[k];
    if (!i) continue;
    if (i.status === "awaiting-ack") continue;
    const chunk = Math.min(budget, i.sizeKB - i.sentKB);
    budget -= chunk;
    sent += chunk;
    const sentKB = i.sentKB + chunk;
    q[k] = { ...i, sentKB, status: sentKB >= i.sizeKB ? "awaiting-ack" : "transmitting" };
  }
  return { queue: q, delivered, events, rngState: rng, sentKB: sent };
}
