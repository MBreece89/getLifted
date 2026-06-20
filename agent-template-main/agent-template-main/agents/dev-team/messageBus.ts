import type { BusMessage } from "./types";

type Listener = (message: BusMessage) => void;

/** A message minus its server-stamped timestamp; the bus fills `ts` in. */
type BusMessageInput = BusMessage extends infer T
  ? T extends BusMessage
    ? Omit<T, "ts">
    : never
  : never;

/**
 * Tiny in-process, typed pub/sub. It is the explicit two-way channel between
 * supervisor and developer: messages flow `down` (assign/steer), `up`
 * (progress/result/scope-flag), and `system` (retry/escalation/outcome).
 *
 * Every message is also retained in `history()` so the eval can assert on the
 * exact conversation that took place.
 */
export class MessageBus {
  private readonly listeners = new Set<Listener>();
  private readonly log: BusMessage[] = [];

  /** Publish a message; `ts` is stamped here. */
  publish(input: BusMessageInput): BusMessage {
    const message = { ...input, ts: Date.now() } as BusMessage;
    this.log.push(message);
    // Snapshot listeners so a handler that unsubscribes mid-dispatch is safe.
    for (const listener of [...this.listeners]) listener(message);
    return message;
  }

  /** Subscribe to all messages. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Full message history (optionally filtered by task), newest last. */
  history(taskId?: string): BusMessage[] {
    return taskId ? this.log.filter((m) => m.taskId === taskId) : [...this.log];
  }

  /** All messages of a given `type` (optionally scoped to one task). */
  ofType<T extends BusMessage["type"]>(
    type: T,
    taskId?: string,
  ): Extract<BusMessage, { type: T }>[] {
    return this.history(taskId).filter(
      (m): m is Extract<BusMessage, { type: T }> => m.type === type,
    );
  }
}
